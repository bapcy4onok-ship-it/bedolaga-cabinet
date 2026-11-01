import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import type { AdminRewardTask, RewardBulkResponse, RewardTask } from '../api/rewardTasks';
import en from '../locales/en.json';
import ru from '../locales/ru.json';
import {
  BULK_ERROR_CODES,
  canAttemptTask,
  chunkIds,
  describeBulkError,
  describeBulkRequestError,
  describeUserTaskError,
  formToTaskPayload,
  getIneligibleNotice,
  getSelectionState,
  mergeBulkResults,
  normalizeAdminTaskList,
  pageCount,
  parseAdminTaskTab,
  parseRewardTaskError,
  planPhotoUpload,
  pruneItemErrors,
  pruneSelected,
  resolveTaskActionLink,
  retryRewardTasksOverview,
  REWARD_BULK_CHUNK_SIZE,
  REWARD_BULK_TIMEOUT_MS,
  REWARD_PHOTO_ACCEPT,
  REWARD_PHOTO_MAX_BYTES,
  rewardTaskErrorMessage,
  runChunkedBulk,
  shouldLeaveTasksPage,
  splitBulkResults,
  STALE_TASK_ERROR_CODES,
  submissionStatusBadge,
  submissionUserLabel,
  submissionUserStatusKey,
  summarizeAdminTasks,
  switchTaskKind,
  TASKS_UNAVAILABLE_CODE,
  taskStatusBadge,
  taskStatusView,
  taskToForm,
  toggleAllSelected,
  toggleSelected,
  toSubmissionMedia,
  USER_TASK_ERROR_CODES,
  validateTaskForm,
  withTaskStatus,
  type BulkProgress,
  type RewardTaskError,
  type RewardTaskFormState,
} from './rewardTasks';

/**
 * «Задания» общаются с бэкендом стабильными кодами ошибок (`detail: {code,
 * message}`), которые кабинет переводит сам. Тесты фиксируют разбор этих
 * ответов, выбор отчётов в админке, проверки скриншотов и форму задания.
 */

function axiosError(status: number, data: unknown): AxiosError {
  const headers = new AxiosHeaders();
  const config = { headers };
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    config,
    {},
    {
      status,
      statusText: '',
      headers,
      config,
      data,
    },
  );
}

const noError: RewardTaskError = {
  status: 400,
  code: null,
  message: null,
  found: null,
  required: null,
};

const adminTask = (overrides: Partial<AdminRewardTask> = {}): AdminRewardTask => ({
  id: 7,
  kind: 'channel_boost',
  title: 'Буст канала',
  description: 'Забустите канал',
  reward_days: 3,
  action_url: 'https://t.me/boost/ledokol',
  channel_id: '-1003822976183',
  min_boosts: 1,
  max_photos: 3,
  is_active: true,
  sort_order: 0,
  pending_count: 0,
  approved_count: 0,
  ...overrides,
});

describe('parseRewardTaskError', () => {
  it('достаёт код, текст и счётчики бустов из detail-объекта', () => {
    const err = axiosError(400, {
      detail: { code: 'not_enough_boosts', message: 'Мало бустов', found: 0, required: 1 },
    });
    expect(parseRewardTaskError(err)).toEqual({
      status: 400,
      code: 'not_enough_boosts',
      message: 'Мало бустов',
      found: 0,
      required: 1,
    });
  });

  it('строковый detail — это текст без кода', () => {
    const parsed = parseRewardTaskError(axiosError(404, { detail: 'Not Found' }));
    expect(parsed.code).toBeNull();
    expect(parsed.message).toBe('Not Found');
  });

  it('склеивает 422 от pydantic в читаемый текст', () => {
    const err = axiosError(422, {
      detail: [{ loc: ['body', 'comment'], msg: 'String should have at most 500 characters' }],
    });
    expect(parseRewardTaskError(err).message).toBe(
      'comment: String should have at most 500 characters',
    );
  });

  it('429 без нашего кода считается rate_limited', () => {
    expect(parseRewardTaskError(axiosError(429, { detail: 'Too many requests' })).code).toBe(
      'rate_limited',
    );
  });

  it('не-axios ошибка и сетевой сбой не ломают разбор', () => {
    expect(parseRewardTaskError(new Error('boom'))).toEqual({ ...noError, status: null });
    const network = new AxiosError('Network Error', 'ERR_NETWORK');
    expect(parseRewardTaskError(network).status).toBeNull();
  });

  it('счётчики не-числа игнорируются', () => {
    const err = axiosError(400, {
      detail: { code: 'not_enough_boosts', found: '2', required: null },
    });
    const parsed = parseRewardTaskError(err);
    expect(parsed.found).toBeNull();
    expect(parsed.required).toBeNull();
  });

  it('rewardTaskErrorMessage берёт текст бэкенда или запасной', () => {
    expect(
      rewardTaskErrorMessage(
        axiosError(409, { detail: { code: 'x', message: 'Есть отчёты' } }),
        'fb',
      ),
    ).toBe('Есть отчёты');
    expect(rewardTaskErrorMessage(axiosError(500, {}), 'fb')).toBe('fb');
  });
});

describe('describeUserTaskError', () => {
  it('not_enough_boosts с числами — текст с found/required', () => {
    expect(
      describeUserTaskError({ ...noError, code: 'not_enough_boosts', found: 0, required: 2 }),
    ).toEqual({ key: 'rewardTasks.errors.not_enough_boosts', values: { found: 0, required: 2 } });
  });

  it('not_enough_boosts без чисел — общий текст без плейсхолдеров', () => {
    expect(describeUserTaskError({ ...noError, code: 'not_enough_boosts' })).toEqual({
      key: 'rewardTasks.errors.no_boosts',
    });
  });

  it('известный код переводится локалью, а не текстом бэкенда', () => {
    expect(
      describeUserTaskError({ ...noError, code: 'telegram_required', message: 'Нужен Telegram' }),
    ).toEqual({ key: 'rewardTasks.errors.telegram_required' });
  });

  it('неизвестный код — текст бэкенда, без него — общий текст', () => {
    expect(describeUserTaskError({ ...noError, code: 'weird', message: 'Что-то' })).toEqual({
      text: 'Что-то',
    });
    expect(describeUserTaskError({ ...noError, code: 'weird' })).toEqual({
      key: 'rewardTasks.errors.generic',
    });
  });
});

describe('describeBulkError', () => {
  it('известный код — свой текст, неизвестный — с кодом', () => {
    expect(describeBulkError('panel_sync_failed')).toEqual({
      key: 'admin.rewardTasks.errors.panel_sync_failed',
    });
    expect(describeBulkError('boom')).toEqual({
      key: 'admin.rewardTasks.errors.unknown',
      values: { code: 'boom' },
    });
    expect(describeBulkError(null)).toEqual({
      key: 'admin.rewardTasks.errors.unknown',
      values: { code: '—' },
    });
  });
});

describe('статусы', () => {
  it('бейджи статусов, неизвестный статус — нейтральный', () => {
    expect(taskStatusBadge('completed')).toBe('badge-success');
    expect(taskStatusBadge('pending')).toBe('badge-warning');
    expect(taskStatusBadge('rejected')).toBe('badge-error');
    expect(taskStatusBadge('available')).toBe('badge-info');
    expect(taskStatusBadge('archived')).toBe('badge-neutral');
    expect(submissionStatusBadge('approved')).toBe('badge-success');
    expect(submissionStatusBadge('???')).toBe('badge-neutral');
  });

  it('выполнять можно доступное или отклонённое задание и только с подпиской', () => {
    expect(canAttemptTask({ status: 'available' }, true)).toBe(true);
    expect(canAttemptTask({ status: 'rejected' }, true)).toBe(true);
    expect(canAttemptTask({ status: 'pending' }, true)).toBe(false);
    expect(canAttemptTask({ status: 'completed' }, true)).toBe(false);
    expect(canAttemptTask({ status: 'available' }, false)).toBe(false);
  });
});

describe('withTaskStatus', () => {
  const task = (id: number, overrides: Partial<RewardTask> = {}): RewardTask => ({
    id,
    kind: 'photo_report',
    title: `t${id}`,
    description: '',
    reward_days: 1,
    action_url: null,
    min_boosts: 1,
    max_photos: 3,
    status: 'rejected',
    reject_reason: 'плохо видно',
    completed_at: null,
    ...overrides,
  });

  it('меняет статус только нужного задания и стирает старую причину отказа', () => {
    const data = { eligible: true, ineligible_reason: null, tasks: [task(1), task(2)] };
    const next = withTaskStatus(data, 2, 'pending');
    expect(next?.tasks[1]).toMatchObject({ id: 2, status: 'pending', reject_reason: null });
    expect(next?.tasks[0]).toBe(data.tasks[0]);
    expect(data.tasks[1].status).toBe('rejected');
  });

  it('пустой кэш остаётся пустым', () => {
    expect(withTaskStatus(undefined, 1, 'completed')).toBeUndefined();
  });
});

describe('resolveTaskActionLink', () => {
  it('t.me открывается как telegram-ссылка', () => {
    expect(resolveTaskActionLink(' https://t.me/boost/ledokol ')).toEqual({
      kind: 'telegram',
      url: 'https://t.me/boost/ledokol',
    });
  });

  it('прочие http(s) — внешняя ссылка, включая поддомены t.me', () => {
    expect(resolveTaskActionLink('https://example.com/a')?.kind).toBe('external');
    expect(resolveTaskActionLink('https://user.t.me')?.kind).toBe('external');
  });

  it('пустое, битое и чужие схемы не открываем', () => {
    expect(resolveTaskActionLink(null)).toBeNull();
    expect(resolveTaskActionLink('   ')).toBeNull();
    expect(resolveTaskActionLink('not a url')).toBeNull();
    expect(resolveTaskActionLink('javascript:alert(1)')).toBeNull();
    expect(resolveTaskActionLink('tg://resolve?domain=x')).toBeNull();
  });
});

describe('planPhotoUpload', () => {
  const file = (name: string, type = 'image/png', size = 1000) => ({ name, type, size });

  it('отбрасывает чужой тип и большие файлы, остальное берёт до лимита', () => {
    const files = [
      file('a.png'),
      file('b.heic', 'image/heic'),
      file('c.jpg', 'image/jpeg', REWARD_PHOTO_MAX_BYTES + 1),
      file('d.webp', 'image/webp'),
      file('e.png'),
    ];
    const plan = planPhotoUpload(files, 1, 3);
    expect(plan.accepted.map((f) => f.name)).toEqual(['a.png', 'd.webp']);
    expect(plan.rejected.map((r) => [r.file.name, r.reason])).toEqual([
      ['b.heic', 'type'],
      ['c.jpg', 'size'],
      ['e.png', 'limit'],
    ]);
  });

  it('ровно 10 МБ проходит, лимит уже исчерпан — всё в limit', () => {
    expect(
      planPhotoUpload([file('a', 'image/png', REWARD_PHOTO_MAX_BYTES)], 0, 1).accepted,
    ).toHaveLength(1);
    const full = planPhotoUpload([file('a'), file('b')], 5, 3);
    expect(full.accepted).toEqual([]);
    expect(full.rejected.every((r) => r.reason === 'limit')).toBe(true);
  });
});

describe('toSubmissionMedia', () => {
  it('thumbnail_file_id загрузки становится thumb_file_id отчёта', () => {
    expect(
      toSubmissionMedia({ file_id: 'big', file_unique_id: 'u1', thumbnail_file_id: 'small' }),
    ).toEqual({ file_id: 'big', file_unique_id: 'u1', thumb_file_id: 'small' });
  });

  it('пустые поля старого бэкенда не отправляются', () => {
    expect(toSubmissionMedia({ file_id: 'big', file_unique_id: null })).toEqual({
      file_id: 'big',
    });
  });
});

describe('выбор отчётов', () => {
  it('toggleSelected добавляет и убирает id, не мутируя исходный набор', () => {
    const start = new Set([1]);
    expect([...toggleSelected(start, 2)]).toEqual([1, 2]);
    expect([...toggleSelected(start, 1)]).toEqual([]);
    expect([...start]).toEqual([1]);
  });

  it('getSelectionState: none / some / all, пустой список — none', () => {
    expect(getSelectionState(new Set(), [1, 2])).toBe('none');
    expect(getSelectionState(new Set([1]), [1, 2])).toBe('some');
    expect(getSelectionState(new Set([1, 2]), [1, 2])).toBe('all');
    expect(getSelectionState(new Set([5]), [])).toBe('none');
  });

  it('«Выбрать все» выбирает видимые, повторное нажатие снимает выбор', () => {
    expect([...toggleAllSelected(new Set([1]), [1, 2, 3])]).toEqual([1, 2, 3]);
    expect([...toggleAllSelected(new Set([1, 2, 3]), [1, 2, 3])]).toEqual([]);
  });

  it('pruneSelected убирает пропавшие отчёты и не пересоздаёт набор без нужды', () => {
    const selected = new Set([1, 2, 3]);
    expect([...pruneSelected(selected, [1, 3, 4])]).toEqual([1, 3]);
    expect(pruneSelected(selected, [1, 2, 3, 4])).toBe(selected);
  });

  it('pruneItemErrors работает так же для ошибок', () => {
    const errors = new Map<number, string | null>([
      [1, 'panel_sync_failed'],
      [2, null],
    ]);
    expect([...pruneItemErrors(errors, [2]).keys()]).toEqual([2]);
    expect(pruneItemErrors(errors, [1, 2])).toBe(errors);
  });

  it('splitBulkResults делит результаты на успешные и ошибки', () => {
    const { okIds, errors } = splitBulkResults([
      { id: 1, ok: true, error_code: null },
      { id: 2, ok: false, error_code: 'already_completed' },
      { id: 3, ok: false, error_code: null },
    ]);
    expect(okIds).toEqual([1]);
    expect([...errors]).toEqual([
      [2, 'already_completed'],
      [3, null],
    ]);
  });
});

describe('списки админки', () => {
  it('normalizeAdminTaskList принимает массив и обёртку {items}', () => {
    const task = adminTask();
    expect(normalizeAdminTaskList([task])).toEqual([task]);
    expect(normalizeAdminTaskList({ items: [task], total: 1 })).toEqual([task]);
    expect(normalizeAdminTaskList(null)).toEqual([]);
    expect(normalizeAdminTaskList({ detail: 'x' })).toEqual([]);
  });

  it('summarizeAdminTasks суммирует счётчики и активные задания', () => {
    expect(
      summarizeAdminTasks([
        adminTask({ pending_count: 2, approved_count: 5 }),
        adminTask({ id: 8, is_active: false, pending_count: 1, approved_count: 0 }),
      ]),
    ).toEqual({ pending: 3, approved: 5, active: 1 });
  });

  it('pageCount — минимум одна страница', () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
  });

  it('submissionUserLabel: ФИО → @username → TG id → #id', () => {
    const user = { id: 3, telegram_id: 42, username: 'nick', full_name: ' Иван ' };
    expect(submissionUserLabel(user)).toBe('Иван');
    expect(submissionUserLabel({ ...user, full_name: null })).toBe('@nick');
    expect(submissionUserLabel({ ...user, full_name: '', username: null })).toBe('TG 42');
    expect(submissionUserLabel({ id: 3, telegram_id: null, username: null, full_name: null })).toBe(
      '#3',
    );
  });

  it('parseAdminTaskTab: неизвестная вкладка — очередь проверки', () => {
    expect(parseAdminTaskTab('history')).toBe('history');
    expect(parseAdminTaskTab('tasks')).toBe('tasks');
    expect(parseAdminTaskTab('nope')).toBe('review');
    expect(parseAdminTaskTab(null)).toBe('review');
  });
});

describe('форма задания', () => {
  const validPhoto = (): RewardTaskFormState => ({
    ...taskToForm(null),
    title: 'Лайки',
    maxPhotos: '5',
  });

  it('новое задание — фотоотчёт с дефолтами спеки', () => {
    expect(taskToForm(null)).toMatchObject({
      kind: 'photo_report',
      rewardDays: '1',
      minBoosts: '1',
      maxPhotos: '3',
      isActive: true,
      sortOrder: '0',
    });
  });

  it('taskToForm → formToTaskPayload сохраняет задание как есть', () => {
    const task = adminTask({ sort_order: -2, reward_days: 30, min_boosts: 2 });
    expect(formToTaskPayload(taskToForm(task))).toEqual({
      title: task.title,
      description: task.description,
      reward_days: 30,
      action_url: task.action_url,
      channel_id: task.channel_id,
      min_boosts: 2,
      max_photos: 3,
      is_active: true,
      sort_order: -2,
    });
  });

  it('смена типа подменяет только нетронутую награду', () => {
    const switched = switchTaskKind(taskToForm(null), 'channel_boost');
    expect(switched.kind).toBe('channel_boost');
    expect(switched.rewardDays).toBe('3');
    const custom = switchTaskKind({ ...taskToForm(null), rewardDays: '7' }, 'channel_boost');
    expect(custom.rewardDays).toBe('7');
    const form = taskToForm(null);
    expect(switchTaskKind(form, 'photo_report')).toBe(form);
  });

  it('валидная форма фотоотчёта без ошибок', () => {
    expect(validateTaskForm(validPhoto())).toEqual({});
  });

  it('ловит пустое название, дробные дни, плохую ссылку и порядок', () => {
    expect(
      validateTaskForm({
        ...validPhoto(),
        title: '   ',
        rewardDays: '1.5',
        actionUrl: 'javascript:alert(1)',
        maxPhotos: '11',
        sortOrder: 'abc',
      }),
    ).toEqual({ title: true, rewardDays: true, actionUrl: true, maxPhotos: true, sortOrder: true });
    expect(validateTaskForm({ ...validPhoto(), rewardDays: '366' })).toEqual({ rewardDays: true });
    expect(validateTaskForm({ ...validPhoto(), title: 'x'.repeat(201) })).toEqual({ title: true });
  });

  it('для буста обязателен канал и число бустов, лимит фото не проверяется', () => {
    const boost: RewardTaskFormState = {
      ...validPhoto(),
      kind: 'channel_boost',
      maxPhotos: 'мусор',
      channelId: '',
      minBoosts: '0',
    };
    expect(validateTaskForm(boost)).toEqual({ channelId: true, minBoosts: true });
    expect(validateTaskForm({ ...boost, channelId: '-1003822976183', minBoosts: '1' })).toEqual({});
    expect(validateTaskForm({ ...boost, channelId: '@ledokol_vpn', minBoosts: '2' })).toEqual({});
    expect(validateTaskForm({ ...boost, channelId: 'https://t.me/x', minBoosts: '1' })).toEqual({
      channelId: true,
    });
  });

  it('скрытое поле чужого типа с мусором уходит дефолтом, канал фотоотчёта — null', () => {
    const boostPayload = formToTaskPayload({
      ...validPhoto(),
      kind: 'channel_boost',
      channelId: ' -100123456 ',
      minBoosts: '2',
      maxPhotos: '99',
    });
    expect(boostPayload).toMatchObject({ channel_id: '-100123456', min_boosts: 2, max_photos: 3 });

    const photoPayload = formToTaskPayload({
      ...validPhoto(),
      channelId: '-100123456',
      actionUrl: '  ',
    });
    expect(photoPayload).toMatchObject({ channel_id: null, action_url: null, max_photos: 5 });
  });
});

// ─── Исправления по итогам проверки ───

/** Строка по пути «a.b.c» из словаря локали; undefined — ключа нет. */
function localeText(dict: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      dict,
    );
}

describe('причины недоступности заданий', () => {
  it('доступны — баннера нет (eligible true или поле не пришло)', () => {
    expect(getIneligibleNotice({ eligible: true, ineligible_reason: null })).toBeNull();
    expect(
      getIneligibleNotice({ eligible: undefined as unknown as boolean, ineligible_reason: null }),
    ).toBeNull();
  });

  it('нет подписки — кнопки триала и покупки; null от старого бэкенда — так же', () => {
    expect(getIneligibleNotice({ eligible: false, ineligible_reason: 'no_subscription' })).toEqual({
      reason: 'no_subscription',
      action: 'subscribe',
    });
    expect(getIneligibleNotice({ eligible: false, ineligible_reason: null })).toEqual({
      reason: 'no_subscription',
      action: 'subscribe',
    });
  });

  it('ограничение и отключённая подписка — только поддержка, без покупки', () => {
    expect(getIneligibleNotice({ eligible: false, ineligible_reason: 'restricted' })).toEqual({
      reason: 'restricted',
      action: 'support',
    });
    expect(
      getIneligibleNotice({ eligible: false, ineligible_reason: 'subscription_disabled' }),
    ).toEqual({ reason: 'subscription_disabled', action: 'support' });
  });

  it('неизвестная (более новая) причина — общий текст и поддержка', () => {
    expect(
      getIneligibleNotice({
        eligible: false,
        ineligible_reason: 'frozen' as unknown as 'restricted',
      }),
    ).toEqual({ reason: 'unknown', action: 'support' });
  });

  it('у каждой причины есть заголовок, текст и подсказка в ru и en', () => {
    for (const reason of ['no_subscription', 'restricted', 'subscription_disabled', 'unknown']) {
      for (const part of ['title', 'text', 'hint']) {
        const key = `rewardTasks.ineligible.${reason}.${part}`;
        expect(typeof localeText(ru, key), key).toBe('string');
        expect(typeof localeText(en, key), key).toBe('string');
      }
    }
  });

  it('текст отключённой подписки — из контракта', () => {
    expect(localeText(ru, 'rewardTasks.ineligible.subscription_disabled.text')).toBe(
      'Ваша подписка сейчас отключена. Задания станут доступны, когда она снова будет активна. Если это ошибка — напишите в поддержку.',
    );
    expect(localeText(ru, 'rewardTasks.errors.subscription_disabled')).toBe(
      localeText(ru, 'rewardTasks.ineligible.subscription_disabled.text'),
    );
  });
});

describe('бейдж статуса задания', () => {
  it('без права выполнять «Доступно» превращается в нейтральное «Недоступно»', () => {
    expect(taskStatusView('available', false)).toEqual({
      labelKey: 'rewardTasks.status.unavailable',
      className: 'badge-neutral',
    });
    expect(taskStatusView('available', true)).toEqual({
      labelKey: 'rewardTasks.status.available',
      className: 'badge-info',
    });
  });

  it('прочие статусы — как есть, независимо от доступности', () => {
    expect(taskStatusView('rejected', false)).toEqual({
      labelKey: 'rewardTasks.status.rejected',
      className: 'badge-error',
    });
    expect(taskStatusView('completed', false).className).toBe('badge-success');
    expect(taskStatusView('archived', true)).toEqual({
      labelKey: 'rewardTasks.status.archived',
      className: 'badge-neutral',
    });
  });
});

describe('новые коды ошибок', () => {
  it('ограничение, отключённая подписка и блокировка — свои тексты для пользователя', () => {
    for (const code of ['restricted', 'subscription_disabled', 'user_blocked']) {
      expect(describeUserTaskError({ ...noError, status: 403, code, message: 'x' })).toEqual({
        key: `rewardTasks.errors.${code}`,
      });
    }
  });

  it('после ограничения или отключения список заданий перезапрашивается (покажет баннер)', () => {
    expect(STALE_TASK_ERROR_CODES).toEqual(
      expect.arrayContaining(['restricted', 'subscription_disabled', 'no_subscription']),
    );
  });

  it('массовые коды из контракта переводятся, а не показываются сырыми', () => {
    for (const code of [
      'restricted',
      'internal_error',
      'task_not_found',
      'user_blocked',
      'subscription_disabled',
    ]) {
      expect(describeBulkError(code)).toEqual({ key: `admin.rewardTasks.errors.${code}` });
    }
  });

  it('у каждого известного кода есть текст в ru и en', () => {
    for (const code of USER_TASK_ERROR_CODES) {
      for (const dict of [ru, en]) {
        expect(typeof localeText(dict, `rewardTasks.errors.${code}`), code).toBe('string');
      }
    }
    for (const code of BULK_ERROR_CODES) {
      for (const dict of [ru, en]) {
        expect(typeof localeText(dict, `admin.rewardTasks.errors.${code}`), code).toBe('string');
      }
    }
  });

  it('«Забустите», а не «Забустьте»', () => {
    const texts = [
      localeText(ru, 'rewardTasks.errors.not_enough_boosts'),
      localeText(ru, 'rewardTasks.errors.no_boosts'),
    ];
    for (const text of texts) {
      expect(text).toContain('Забустите');
      expect(text).not.toContain('Забустьте');
    }
  });
});

describe('describeBulkRequestError', () => {
  it('нет ответа (таймаут/сеть) — «сервер не ответил»', () => {
    const timeout = new AxiosError('timeout of 120000ms exceeded', 'ECONNABORTED');
    expect(describeBulkRequestError(timeout)).toEqual({
      key: 'admin.rewardTasks.review.noResponse',
    });
  });

  it('текст бэкенда, 5xx без текста — внутренняя ошибка, прочее — общая ошибка', () => {
    expect(describeBulkRequestError(axiosError(403, { detail: 'Недостаточно прав' }))).toEqual({
      text: 'Недостаточно прав',
    });
    expect(describeBulkRequestError(axiosError(500, 'Internal Server Error'))).toEqual({
      key: 'admin.rewardTasks.errors.internal_error',
    });
    expect(describeBulkRequestError(new Error('boom'))).toEqual({ key: 'common.error' });
  });
});

describe('массовые действия пачками', () => {
  const ok = (id: number) => ({ id, ok: true, error_code: null });
  const fail = (id: number, code: string) => ({ id, ok: false, error_code: code });
  const echo = (chunk: number[]): Promise<RewardBulkResponse> =>
    Promise.resolve({ results: chunk.map(ok) });

  it('пачки по 4 и 120 с на запрос — как в контракте', () => {
    expect(REWARD_BULK_CHUNK_SIZE).toBe(4);
    expect(REWARD_BULK_TIMEOUT_MS).toBe(120_000);
  });

  it('chunkIds режет по порядку, хвост — короче; пустой список — без пачек', () => {
    expect(chunkIds([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([[1, 2, 3, 4], [5, 6, 7, 8], [9]]);
    expect(chunkIds([1, 2, 3, 4])).toEqual([[1, 2, 3, 4]]);
    expect(chunkIds([])).toEqual([]);
    expect(chunkIds([1, 2, 3], 0)).toEqual([[1], [2], [3]]);
  });

  it('mergeBulkResults: поздний ответ заменяет ранний, чужие id отбрасываются', () => {
    const merged = mergeBulkResults([fail(1, 'panel_sync_failed'), ok(2)], [ok(1), ok(99)], [1, 3]);
    expect(merged).toEqual([ok(1), ok(2)]);
    expect(mergeBulkResults([ok(1)], undefined, [2])).toEqual([ok(1)]);
  });

  it('шлёт пачки строго по очереди и сообщает прогресс', async () => {
    const calls: number[][] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const send = async (chunk: number[]): Promise<RewardBulkResponse> => {
      calls.push(chunk);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return { results: chunk.map((id) => (id === 6 ? fail(id, 'panel_sync_failed') : ok(id))) };
    };
    const progress: BulkProgress[] = [];
    const ids = Array.from({ length: 10 }, (_, i) => i + 1);

    const outcome = await runChunkedBulk(ids, send, (p) => progress.push(p));

    expect(calls).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10],
    ]);
    expect(maxInFlight).toBe(1);
    expect(progress).toEqual([
      { done: 0, total: 10 },
      { done: 4, total: 10 },
      { done: 8, total: 10 },
      { done: 10, total: 10 },
    ]);
    expect(outcome.failure).toBeNull();
    expect(outcome.processed).toBe(10);
    expect(outcome.results).toHaveLength(10);
    const { okIds, errors } = splitBulkResults(outcome.results);
    expect(okIds).toHaveLength(9);
    expect([...errors]).toEqual([[6, 'panel_sync_failed']]);
  });

  it('на ошибке запроса останавливается и говорит, сколько обработано', async () => {
    const timeout = new AxiosError('timeout of 120000ms exceeded', 'ECONNABORTED');
    const calls: number[][] = [];
    const send = (chunk: number[]): Promise<RewardBulkResponse> => {
      calls.push(chunk);
      return calls.length === 2 ? Promise.reject(timeout) : echo(chunk);
    };
    const progress: BulkProgress[] = [];

    const outcome = await runChunkedBulk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], send, (p) =>
      progress.push(p),
    );

    expect(calls).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
    expect(outcome.processed).toBe(4);
    expect(outcome.total).toBe(10);
    expect(outcome.results).toEqual([ok(1), ok(2), ok(3), ok(4)]);
    expect(outcome.failure?.error).toBe(timeout);
    expect(outcome.failure?.unprocessedIds).toEqual([5, 6, 7, 8, 9, 10]);
    expect(progress[progress.length - 1]).toEqual({ done: 4, total: 10 });
  });

  it('ошибка первой же пачки — ничего не обработано, но и не бросает', async () => {
    const outcome = await runChunkedBulk([1, 2], () => Promise.reject(new Error('boom')));
    expect(outcome).toMatchObject({ processed: 0, total: 2, results: [] });
    expect(outcome.failure?.unprocessedIds).toEqual([1, 2]);
  });

  it('повторы id отправляются один раз, пустой выбор — без запросов', async () => {
    const calls: number[][] = [];
    const send = (chunk: number[]) => {
      calls.push(chunk);
      return echo(chunk);
    };
    const outcome = await runChunkedBulk([3, 3, 1, 3], send);
    expect(calls).toEqual([[3, 1]]);
    expect(outcome.total).toBe(2);

    const empty = await runChunkedBulk([], send);
    expect(calls).toHaveLength(1);
    expect(empty).toEqual({ results: [], processed: 0, total: 0, failure: null });
  });
});

describe('статус пользователя в отчёте', () => {
  const user = { id: 1, telegram_id: 5, username: 'u', full_name: 'U' };

  it('активный или без статуса (старый бэкенд) — без бейджа', () => {
    expect(submissionUserStatusKey(user)).toBeNull();
    expect(submissionUserStatusKey({ ...user, status: 'active' })).toBeNull();
    expect(submissionUserStatusKey({ ...user, status: '' })).toBeNull();
  });

  it('заблокирован или удалён — красный бейдж', () => {
    expect(submissionUserStatusKey({ ...user, status: 'blocked' })).toBe(
      'admin.rewardTasks.userStatus.blocked',
    );
    expect(submissionUserStatusKey({ ...user, status: 'BLOCKED' })).toBe(
      'admin.rewardTasks.userStatus.blocked',
    );
    expect(submissionUserStatusKey({ ...user, status: 'deleted' })).toBe(
      'admin.rewardTasks.userStatus.deleted',
    );
    // Любой другой не-active статус тоже не получит дни — помечаем как блокировку
    expect(submissionUserStatusKey({ ...user, status: 'banned' })).toBe(
      'admin.rewardTasks.userStatus.blocked',
    );
  });
});

describe('выбор скриншотов', () => {
  it('accept="image/*": Android-WebView Telegram берёт только первый тип из списка', () => {
    expect(REWARD_PHOTO_ACCEPT).toBe('image/*');
  });

  it('форматы всё равно проверяются на клиенте', () => {
    const plan = planPhotoUpload(
      [
        { name: 'a.png', type: 'image/png', size: 10 },
        { name: 'b.heic', type: 'image/heic', size: 10 },
        { name: 'c.svg', type: 'image/svg+xml', size: 10 },
      ],
      0,
      3,
    );
    expect(plan.accepted.map((f) => f.name)).toEqual(['a.png']);
    expect(plan.rejected.map((r) => r.reason)).toEqual(['type', 'type']);
  });
});

describe('скрытый раздел заданий', () => {
  // Контракт с бэкендом: пользователю, от которого раздел скрыт (только админы или
  // подписка отключена), пользовательские эндпоинты отвечают 404 с этим кодом
  const hidden = axiosError(404, {
    detail: { code: 'tasks_unavailable', message: 'Раздел недоступен' },
  });
  const plain404 = axiosError(404, { detail: 'Not Found' });
  const taskNotFound = axiosError(404, { detail: { code: 'task_not_found', message: 'x' } });
  const taskInactive = axiosError(404, { detail: { code: 'task_inactive', message: 'x' } });
  const leaves = (err: unknown, request: 'overview' | 'action') =>
    shouldLeaveTasksPage(parseRewardTaskError(err), request);

  it('код — из контракта с бэкендом', () => {
    expect(TASKS_UNAVAILABLE_CODE).toBe('tasks_unavailable');
  });

  it('tasks_unavailable — уходим и со списка, и из отчёта/проверки буста', () => {
    expect(leaves(hidden, 'overview')).toBe(true);
    expect(leaves(hidden, 'action')).toBe(true);
    // Решает код, а не статус
    expect(
      leaves(axiosError(403, { detail: { code: 'tasks_unavailable', message: 'x' } }), 'action'),
    ).toBe(true);
  });

  it('«голый» 404 списка (бэкенд без заданий) — уходим; у действия — остаёмся', () => {
    expect(leaves(plain404, 'overview')).toBe(true);
    expect(leaves(plain404, 'action')).toBe(false);
  });

  it('выключенное задание в отчёте/бусте — не уход: список перезапросится', () => {
    for (const err of [taskNotFound, taskInactive]) {
      expect(leaves(err, 'action')).toBe(false);
      expect(STALE_TASK_ERROR_CODES).toContain(parseRewardTaskError(err).code);
    }
  });

  it('прочие ошибки — экран ошибки или текст в карточке, как раньше', () => {
    const others = [
      axiosError(403, { detail: { code: 'subscription_disabled', message: 'x' } }),
      axiosError(403, { detail: { code: 'restricted', message: 'x' } }),
      axiosError(403, { detail: 'User account is not active' }),
      axiosError(400, {
        detail: { code: 'not_enough_boosts', message: 'x', found: 0, required: 1 },
      }),
      axiosError(429, { detail: 'Too many requests' }),
      axiosError(500, { detail: 'boom' }),
      new AxiosError('Network Error', 'ERR_NETWORK'),
      new Error('boom'),
    ];
    for (const err of others) {
      expect(leaves(err, 'overview')).toBe(false);
      expect(leaves(err, 'action')).toBe(false);
    }
  });

  it('retry списка: скрытый раздел не переспрашиваем, прочее — один раз, как везде в кабинете', () => {
    expect(retryRewardTasksOverview(0, hidden)).toBe(false);
    expect(retryRewardTasksOverview(0, plain404)).toBe(false);
    const server = axiosError(500, { detail: 'boom' });
    expect(retryRewardTasksOverview(0, server)).toBe(true);
    expect(retryRewardTasksOverview(1, server)).toBe(false);
    const network = new AxiosError('Network Error', 'ERR_NETWORK');
    expect(retryRewardTasksOverview(0, network)).toBe(true);
    expect(retryRewardTasksOverview(1, network)).toBe(false);
  });
});

describe('channel subscription task', () => {
  it('grants one day by default and preserves the channel in the admin payload', () => {
    const form = switchTaskKind(taskToForm(null), 'channel_subscription');
    form.title = 'Подписка на канал';
    form.channelId = '-1003822976183';
    form.actionUrl = 'https://t.me/LEDOKOL_CHANNEL';
    expect(form.rewardDays).toBe('1');
    expect(validateTaskForm(form)).toEqual({});
    expect(formToTaskPayload(form).channel_id).toBe('-1003822976183');
  });

  it('shows an actionable membership error', () => {
    expect(describeUserTaskError({ status: 400, code: 'channel_not_subscribed', message: null, found: null, required: null }))
      .toEqual({ key: 'rewardTasks.errors.channel_not_subscribed' });
  });
});
