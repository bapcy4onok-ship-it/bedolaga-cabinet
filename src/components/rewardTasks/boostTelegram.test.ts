import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import en from '../../locales/en.json';
import ru from '../../locales/ru.json';
import { needsTelegramForBoost } from '../../utils/rewardTasks';

/**
 * Буст бот проверяет по привязанному Telegram-аккаунту. Зарегистрированному по почте
 * без Telegram кабинет сразу показывает «Нужен привязанный Telegram» и ссылку на
 * привязку — без кнопки «Проверить буст», которая всё равно ответила бы ошибкой.
 * Компоненты читаем как текст (merge guard): для рендера им нужны API-клиент, роутер,
 * тосты и алиасы '@/…', которых в node-окружении vitest нет.
 */

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('needsTelegramForBoost', () => {
  it('просит привязать Telegram только при явном telegram_linked: false', () => {
    expect(needsTelegramForBoost({ telegram_linked: false })).toBe(true);
    expect(needsTelegramForBoost({ telegram_linked: true })).toBe(false);
  });

  it('бэкенд без поля (старее) и нет данных — кнопка проверки как раньше', () => {
    expect(needsTelegramForBoost({})).toBe(false);
    expect(needsTelegramForBoost(undefined)).toBe(false);
    expect(needsTelegramForBoost(null)).toBe(false);
  });
});

describe('карточка буста без Telegram (merge guard)', () => {
  const actions = source('./BoostTaskActions.tsx');

  /** Ветка `if (needsTelegram) { return (…); }` целиком. */
  function telegramBranch(): string {
    const start = actions.indexOf('if (needsTelegram) {');
    expect(start, 'нет ветки needsTelegram').toBeGreaterThanOrEqual(0);
    const end = actions.indexOf('\n  }\n', start);
    expect(end).toBeGreaterThan(start);
    return actions.slice(start, end);
  }

  it('вместо проверки — подсказка и ссылка на привязку, ссылка на канал остаётся', () => {
    const branch = telegramBranch();
    expect(branch).toContain('return (');
    expect(branch).toContain("t('rewardTasks.boost.telegramRequired')");
    expect(branch).toMatch(/<Link\s+to="\/profile\/accounts"/);
    expect(branch).toContain("t('rewardTasks.linkTelegram')");
    expect(branch).toContain('<TaskLinkButton');
    expect(branch).not.toContain('checkMutation');
  });

  it('ветка стоит до кнопки проверки, а хуки — до неё', () => {
    const branchAt = actions.indexOf('if (needsTelegram) {');
    expect(branchAt).toBeLessThan(actions.indexOf('onClick={() => checkMutation.mutate()}'));
    expect(actions.indexOf('useMutation({')).toBeLessThan(branchAt);
  });

  it('карточка и страница передают признак до кнопки', () => {
    expect(source('./RewardTaskCard.tsx')).toContain(
      '<BoostTaskActions task={task} needsTelegram={needsTelegram} />',
    );
    expect(source('../../pages/RewardTasks.tsx')).toContain(
      'needsTelegram={needsTelegramForBoost(data)}',
    );
  });

  it('текст подсказки есть в ru и en', () => {
    expect(ru.rewardTasks.boost.telegramRequired).toMatch(/^Нужен привязанный Telegram/);
    expect(en.rewardTasks.boost.telegramRequired).toMatch(/^A linked Telegram account is required/);
  });
});
