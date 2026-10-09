import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { REJECT_PROMPT_OPTIONS } from './rejectPrompt';

/**
 * Многострочная причина отказа: админ пишет её в textarea промпта, а пользователь (карточка
 * задания) и админ (история проверок) видят её с переносами строк. Клавиши самого
 * промпта проверяют utils/promptDialog.test.ts и components/PromptDialogHost.test.tsx.
 */

describe('REJECT_PROMPT_OPTIONS', () => {
  it('многострочное поле и красная кнопка', () => {
    expect(REJECT_PROMPT_OPTIONS).toEqual({ multiline: true, tone: 'danger' });
  });
});

// ReviewQueue и карточки читаем как текст (merge guard): для рендера им нужны API-клиент,
// роутер, тосты и алиасы '@/…', которых в node-окружении vitest нет
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

/** Объект-аргумент вызова, который начинается в `at`: от первой `{` до парной `}`. */
function objectArgument(code: string, at: number): string {
  const open = code.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return code.slice(open, i + 1);
  }
  throw new Error(`объект с позиции ${open} не закрыт`);
}

/** Открывающий тег абзаца <p>, внутри которого стоит `marker` (маркер — один на файл). */
function enclosingParagraph(code: string, marker: string): string {
  const at = code.indexOf(marker);
  expect(at, `нет ${marker}`).toBeGreaterThanOrEqual(0);
  expect(code.indexOf(marker, at + 1), `${marker} встречается дважды`).toBe(-1);
  // Абзацы до маркера: открытые <p …> без парного </p>; <p … /> ничего не открывает
  const open: string[] = [];
  for (const [tag] of code.slice(0, at).matchAll(/<p(?:\s[^>]*)?>|<\/p>/g)) {
    if (tag === '</p>') open.pop();
    else if (!tag.endsWith('/>')) open.push(tag);
  }
  expect(open, `${marker} не внутри <p>`).toHaveLength(1);
  return open[0];
}

const PRE_LINE = /\bclassName="[^"]*\bwhitespace-pre-line\b[^"]*"/;

describe('ReviewQueue: промпт причины отказа (merge guard)', () => {
  const queue = source('./ReviewQueue.tsx');

  it('единственный prompt({…}) очереди берёт REJECT_PROMPT_OPTIONS и ничего в них не меняет', () => {
    const calls = [...queue.matchAll(/\bprompt\(\{/g)];
    expect(calls).toHaveLength(1);
    const options = objectArgument(queue, calls[0].index ?? 0);
    expect(options).toMatch(/^\{\s*\.\.\.REJECT_PROMPT_OPTIONS,/);
    expect(options).not.toMatch(/\b(multiline|tone)\b/);
    expect(queue).toMatch(/^import \{ REJECT_PROMPT_OPTIONS \} from '\.\/rejectPrompt';$/m);
  });
});

describe('причина отказа — с переносами строк (merge guard)', () => {
  it('RewardTaskCard: абзац «Отчёт отклонён…» у пользователя', () => {
    const card = source('../../rewardTasks/RewardTaskCard.tsx');
    for (const marker of ["'rewardTasks.rejectedInfo'", "'rewardTasks.rejectedNoReason'"]) {
      expect(enclosingParagraph(card, marker), marker).toMatch(PRE_LINE);
    }
  });

  it('SubmissionCard: причина в истории проверок и комментарий к отчёту', () => {
    const card = source('./SubmissionCard.tsx');
    for (const marker of ["'admin.rewardTasks.history.reason'", '{submission.comment}']) {
      expect(enclosingParagraph(card, marker), marker).toMatch(PRE_LINE);
    }
  });
});
