import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Скрытый раздел «Задания» (решение владельца: функцию не объяснять, а прятать от
 * пользователей с отключённой подпиской и, пока REWARD_TASKS_FOR_ALL_USERS выключена,
 * от всех, кроме админов). Решение «уходить ли со страницы» — чистая функция
 * shouldLeaveTasksPage (utils/rewardTasks.test.ts); здесь — что страница и карточки
 * ею пользуются. Компоненты читаем как текст (merge guard): для рендера им нужны
 * API-клиент, роутер, тосты и алиасы '@/…', которых в node-окружении vitest нет.
 */

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

/** Блок `{…}`, открытый последней `{` маркера: от неё до парной `}`. */
function blockAfter(code: string, marker: string): string {
  const at = code.indexOf(marker);
  expect(at, `нет ${marker}`).toBeGreaterThanOrEqual(0);
  expect(code.indexOf(marker, at + 1), `${marker} встречается дважды`).toBe(-1);
  const open = at + marker.lastIndexOf('{');
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return code.slice(open, i + 1);
  }
  throw new Error(`блок после ${marker} не закрыт`);
}

/** Первая строка блока после `{` — проверка раздела идёт до всего остального. */
const LEAVE_FIRST = (parsed: string) =>
  new RegExp(
    String.raw`^\{\s*const parsed = parseRewardTaskError\(err\);\s*(?://[^\n]*\s*)*` +
      String.raw`if \(shouldLeaveTasksPage\(${parsed}, 'action'\)\) \{\s*leavePage\(\);\s*return;\s*\}`,
  );

describe('страница /tasks: скрытый раздел — уход на главную (merge guard)', () => {
  const page = source('../../pages/RewardTasks.tsx');

  it('список не переспрашивает скрытый раздел (retryRewardTasksOverview)', () => {
    const query = blockAfter(page, "useQuery({\n    queryKey: ['reward-tasks'],");
    expect(query).toMatch(/\bretry: retryRewardTasksOverview,/);
  });

  it("ошибка списка проверяется как 'overview', уход — через useLeaveTasksPage", () => {
    expect(page).toContain(
      "const hidden = isError && shouldLeaveTasksPage(parseRewardTaskError(error), 'overview');",
    );
    expect(page).toMatch(
      /useEffect\(\(\) => \{\s*if \(hidden\) leavePage\(\);\s*\}, \[hidden, leavePage\]\);/,
    );
    expect(page).toContain('const leavePage = useLeaveTasksPage();');
  });

  it('пока уходим — спиннер загрузки, а не карточка ошибки и не задания', () => {
    const spinner = page.indexOf('if (isLoading || hidden) {');
    const errorCard = page.indexOf('if (isError || !data) {');
    expect(spinner, 'нет ветки спиннера с hidden').toBeGreaterThanOrEqual(0);
    expect(errorCard, 'нет ветки ошибки').toBeGreaterThan(spinner);
  });
});

describe('действия в карточке: tasks_unavailable — тот же уход (merge guard)', () => {
  it('проверка буста: до текста ошибки и кулдауна', () => {
    const boost = source('./BoostTaskActions.tsx');
    expect(blockAfter(boost, 'onError: (err: unknown) => {')).toMatch(LEAVE_FIRST('parsed'));
    expect(boost).toContain('const leavePage = useLeaveTasksPage();');
  });

  it('отправка фотоотчёта: до текста ошибки', () => {
    const form = source('./PhotoReportForm.tsx');
    expect(blockAfter(form, 'onError: (err: unknown) => {')).toMatch(LEAVE_FIRST('parsed'));
    expect(form).toContain('const leavePage = useLeaveTasksPage();');
  });

  it('загрузка скриншота: до пометки «не загрузилось»', () => {
    const form = source('./PhotoReportForm.tsx');
    const caught = blockAfter(form, '} catch (err) {');
    expect(caught).toMatch(
      /^\{\s*if \(uploadIdRef\.current !== uploadToken\) return;\s*(?:\/\/[^\n]*\s*)*if \(shouldLeaveTasksPage\(parseRewardTaskError\(err\), 'action'\)\) \{\s*leavePage\(\);\s*return;\s*\}\s*setAttachments/,
    );
  });
});

describe('useLeaveTasksPage: куда и как уходим (merge guard)', () => {
  const hook = source('./useLeaveTasksPage.ts');

  it('на главную с заменой записи истории', () => {
    expect(hook).toContain("navigate('/', { replace: true });");
  });

  it('пункт меню и баннер гаснут сразу: счётчик флага — 0', () => {
    expect(hook).toContain(
      "queryClient.setQueryData<RewardTasksCountResponse>(['reward-tasks-count'], { count: 0 });",
    );
    // Тот же ключ, что у флага в useFeatureFlags, и флаг — «count > 0»
    const flags = source('../../hooks/useFeatureFlags.ts');
    expect(flags).toContain("queryKey: ['reward-tasks-count'],");
    // До ответа счётчика — false, а не кэш из localStorage: скрытому пользователю
    // баннер и пункт меню не мелькают при запуске
    expect(flags).toContain(
      'hasRewardTasks: rewardTasksCount ? rewardTasksCount.count > 0 : false,',
    );
    expect(flags).not.toContain('cached.hasRewardTasks');
  });

  it('кэш списка удаляется: старая ссылка не покажет прежние карточки', () => {
    expect(hook).toContain(
      "queryClient.removeQueries({ queryKey: ['reward-tasks'], exact: true });",
    );
  });
});

describe('пункт меню и баннер — только при count > 0 (merge guard)', () => {
  it('меню (AppHeader) и баннер на главной завязаны на hasRewardTasks', () => {
    const header = source('../layout/AppShell/AppHeader.tsx');
    expect(header).toContain(
      "...(hasRewardTasks ? [{ path: '/tasks', label: t('nav.tasks'), icon: CalendarStarIcon }] : []),",
    );
    const dashboard = source('../../pages/Dashboard.tsx');
    expect(dashboard).toMatch(/\{hasRewardTasks && \(\s*<Link to="\/tasks"/);
  });
});
