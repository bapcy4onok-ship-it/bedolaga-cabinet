import { describe, expect, it } from 'vitest';

import en from '../../locales/en.json';
import ru from '../../locales/ru.json';
import { findTreeLocation, SETTINGS_TREE } from './constants';
import { formatSettingKey } from './utils';

/**
 * Настройки бэкенда видны в кабинете только в тех разделах дерева, куда привязана их
 * категория (иначе — лишь через поиск). REWARD_TASKS_FOR_ALL_USERS бэкенд кладёт в
 * категорию REWARD_TASKS (system_settings_service: CATEGORY_TITLES «🎁 Задания»,
 * префикс REWARD_TASKS_) — владелец включает «Задания» всем пользователям здесь:
 * Настройки → Пользователи → Задания.
 */

function localeText(dict: unknown, path: string[]): unknown {
  return path.reduce<unknown>(
    (node, part) =>
      node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
    dict,
  );
}

describe('раздел «Задания» в дереве настроек', () => {
  it('категория REWARD_TASKS — Пользователи → Задания', () => {
    expect(findTreeLocation('REWARD_TASKS')).toEqual({
      groupId: 'users',
      subItemId: 'users_reward_tasks',
    });
    const owners = SETTINGS_TREE.groups.flatMap((group) =>
      group.children.filter((child) => child.categories.includes('REWARD_TASKS')),
    );
    expect(owners).toHaveLength(1);
  });

  it('подписи раздела и настройки по-русски, раздел — и по-английски', () => {
    expect(localeText(ru, ['admin', 'settings', 'tree', 'users_reward_tasks'])).toBe('Задания');
    expect(localeText(en, ['admin', 'settings', 'tree', 'users_reward_tasks'])).toBe('Tasks');
    expect(localeText(ru, ['admin', 'settings', 'categories', 'REWARD_TASKS'])).toBe('Задания');
    // Имя строки настройки: бэкенд отдаёт name «Reward Tasks For All Users»
    // (_title_from_key), кабинет ищет перевод по formatSettingKey(name)
    const name = formatSettingKey('Reward Tasks For All Users');
    expect(localeText(ru, ['admin', 'settings', 'settingNames', name])).toBe('Задания для всех');
  });
});
