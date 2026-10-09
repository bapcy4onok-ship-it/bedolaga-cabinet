import axios from 'axios';

import type {
  AdminRewardSubmission,
  AdminRewardTask,
  AdminRewardTaskUpdate,
  RewardBulkResponse,
  RewardBulkResultItem,
  RewardSubmissionStatus,
  RewardTask,
  RewardTaskIneligibleReason,
  RewardTaskKind,
  RewardTaskMediaInput,
  RewardTaskStatus,
  RewardTasksResponse,
  RewardTaskUploadResult,
} from '../api/rewardTasks';
import { getApiErrorMessage } from './api-error';

/**
 * Чистая логика «Заданий» (reward tasks): разбор ошибок API, выбор отчётов в
 * админке, проверка скриншотов перед загрузкой и форма задания. Без React и
 * i18n — компоненты получают ключи локалей и сами их переводят.
 */

// ─── Лимиты (зеркалят валидацию бэкенда) ───

export const REWARD_TASK_LIMITS = {
  titleMax: 200,
  rewardDaysMin: 1,
  rewardDaysMax: 365,
  actionUrlMax: 500,
  channelIdMax: 100,
  minBoostsMin: 1,
  minBoostsMax: 100,
  maxPhotosMin: 1,
  maxPhotosMax: 10,
  sortOrderAbsMax: 1_000_000,
  commentMax: 500,
  rejectReasonMax: 500,
  bulkMax: 100,
} as const;

/**
 * Массовое одобрение/отклонение. Бэкенд обрабатывает id строго по очереди, и
 * каждое начисление может ждать панель до ~13 с (проверка, есть ли пользователь в
 * панели, — до 3 с, затем синхронизация — до 10 с), поэтому кабинет шлёт отчёты
 * пачками по 4 последовательными запросами с таймаутом 120 с вместо общих 30 с:
 * пачка (4 × 13 ≈ 52 с) укладывается в него с запасом даже при зависшей панели,
 * а прогресс виден после каждой.
 */
export const REWARD_BULK_CHUNK_SIZE = 4;
export const REWARD_BULK_TIMEOUT_MS = 120_000;

// ─── Ошибки API ───

/** Ошибка эндпоинтов заданий: бэкенд отдаёт `detail: {code, message, found?, required?}`. */
export interface RewardTaskError {
  status: number | null;
  code: string | null;
  message: string | null;
  /** Только для not_enough_boosts: сколько бустов нашлось и сколько нужно. */
  found: number | null;
  required: number | null;
}

/** Текст ошибки для UI: ключ локали (с параметрами) или готовая строка от бэкенда. */
export type RewardTaskErrorText =
  | { key: string; values?: Record<string, string | number> }
  | { text: string };

function toCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parseRewardTaskError(err: unknown): RewardTaskError {
  const result: RewardTaskError = {
    status: null,
    code: null,
    message: null,
    found: null,
    required: null,
  };
  if (!axios.isAxiosError(err)) return result;

  result.status = err.response?.status ?? null;
  const detail: unknown = err.response?.data?.detail;
  if (typeof detail === 'string') {
    result.message = detail;
  } else if (Array.isArray(detail)) {
    // 422 от pydantic — склеиваем «поле: причина», как везде в кабинете
    result.message = getApiErrorMessage(err, '') || null;
  } else if (detail && typeof detail === 'object') {
    const data = detail as Record<string, unknown>;
    result.code = typeof data.code === 'string' ? data.code : null;
    result.message = typeof data.message === 'string' ? data.message : null;
    result.found = toCount(data.found);
    result.required = toCount(data.required);
  }
  // Лимит частоты может прилететь от общего мидлвара без нашего detail.code
  if (!result.code && result.status === 429) result.code = 'rate_limited';
  return result;
}

/** Коды, у которых есть свой текст в rewardTasks.errors.* */
export const USER_TASK_ERROR_CODES: readonly string[] = [
  'no_subscription',
  'restricted',
  'subscription_disabled',
  'user_blocked',
  'telegram_required',
  'boost_check_failed',
  'already_completed',
  'already_pending',
  'task_not_found',
  'task_inactive',
  'invalid_media',
  'panel_sync_failed',
  'rate_limited',
];

/**
 * Ответы, после которых список заданий на экране устарел (задание уже
 * выполнено, отчёт уже ждёт проверки, задание выключили, подписку отключили
 * или ограничили) — его надо перезапросить, тогда страница покажет нужный баннер.
 */
export const STALE_TASK_ERROR_CODES: readonly string[] = [
  'already_completed',
  'already_pending',
  'task_not_found',
  'task_inactive',
  'no_subscription',
  'restricted',
  'subscription_disabled',
];

export function describeUserTaskError(error: RewardTaskError): RewardTaskErrorText {
  if (error.code === 'not_enough_boosts') {
    if (error.found !== null && error.required !== null) {
      return {
        key: 'rewardTasks.errors.not_enough_boosts',
        values: { found: error.found, required: error.required },
      };
    }
    return { key: 'rewardTasks.errors.no_boosts' };
  }
  if (error.code && USER_TASK_ERROR_CODES.includes(error.code)) {
    return { key: `rewardTasks.errors.${error.code}` };
  }
  // Неизвестный код — показываем текст бэкенда, он лучше общего «что-то пошло не так»
  if (error.message) return { text: error.message };
  return { key: 'rewardTasks.errors.generic' };
}

/** Коды из результатов массового одобрения/отклонения с текстом в admin.rewardTasks.errors.* */
export const BULK_ERROR_CODES: readonly string[] = [
  'already_completed',
  'not_pending',
  'not_found',
  'task_not_found',
  'no_subscription',
  'subscription_disabled',
  'restricted',
  'user_blocked',
  'panel_sync_failed',
  'internal_error',
];

export function describeBulkError(code: string | null): RewardTaskErrorText {
  if (code && BULK_ERROR_CODES.includes(code)) {
    return { key: `admin.rewardTasks.errors.${code}` };
  }
  return { key: 'admin.rewardTasks.errors.unknown', values: { code: code || '—' } };
}

/**
 * Почему не прошёл сам запрос пачки (а не отдельный отчёт): ответа нет вовсе
 * (таймаут, сеть) — свой текст; иначе текст бэкенда или общий.
 */
export function describeBulkRequestError(err: unknown): RewardTaskErrorText {
  if (axios.isAxiosError(err) && !err.response) {
    return { key: 'admin.rewardTasks.review.noResponse' };
  }
  const parsed = parseRewardTaskError(err);
  if (parsed.message) return { text: parsed.message };
  if (parsed.status !== null && parsed.status >= 500) {
    return { key: 'admin.rewardTasks.errors.internal_error' };
  }
  return { key: 'common.error' };
}

/** Для форм админки: текст бэкенда из любого формата detail или запасной текст. */
export function rewardTaskErrorMessage(err: unknown, fallback: string): string {
  return parseRewardTaskError(err).message || fallback;
}

// ─── Скрытый раздел ───

/**
 * Ответ пользовательских эндпоинтов заданий (HTTP 404, тот же `detail: {code,
 * message}`) тому, от кого раздел скрыт: «Задания» пока открыты только админам
 * (настройка REWARD_TASKS_FOR_ALL_USERS выключена) или подписка отключена. Для
 * такого пользователя раздела «нет»: ни пункта меню, ни баннера (count = 0), ни страницы.
 */
export const TASKS_UNAVAILABLE_CODE = 'tasks_unavailable';

/** Какой запрос не прошёл: список заданий (сама страница) или действие в карточке. */
export type RewardTaskRequest = 'overview' | 'action';

/**
 * Уводить ли пользователя со страницы заданий на главную (replace, без тоста и
 * без экрана ошибки):
 * - tasks_unavailable — с любого пользовательского эндпоинта заданий;
 * - любой 404 списка заданий: кроме tasks_unavailable это «голый» 404 бэкенда,
 *   у которого заданий нет вовсе.
 * 404 действия с другим кодом (task_not_found, task_inactive) — не повод уходить:
 * выключено одно задание, список перезапрашивается (STALE_TASK_ERROR_CODES).
 */
export function shouldLeaveTasksPage(error: RewardTaskError, request: RewardTaskRequest): boolean {
  if (error.code === TASKS_UNAVAILABLE_CODE) return true;
  return request === 'overview' && error.status === 404;
}

/**
 * retry запроса списка заданий: как общий по кабинету (одна повторная попытка),
 * но скрытый раздел не переспрашиваем — иначе уход на главную ждал бы ещё секунду
 * под спиннером.
 */
export function retryRewardTasksOverview(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && !shouldLeaveTasksPage(parseRewardTaskError(error), 'overview');
}

// ─── Статусы ───

const TASK_STATUS_BADGES: Record<RewardTaskStatus, string> = {
  available: 'badge-info',
  pending: 'badge-warning',
  completed: 'badge-success',
  rejected: 'badge-error',
};

const SUBMISSION_STATUS_BADGES: Record<RewardSubmissionStatus, string> = {
  pending: 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-error',
};

export function taskStatusBadge(status: string): string {
  return TASK_STATUS_BADGES[status as RewardTaskStatus] ?? 'badge-neutral';
}

export function submissionStatusBadge(status: string): string {
  return SUBMISSION_STATUS_BADGES[status as RewardSubmissionStatus] ?? 'badge-neutral';
}

/**
 * Бейдж статуса на карточке задания. Пока задания пользователю недоступны,
 * синее «Доступно» спорило бы с подсказкой под ним — показываем нейтральное «Недоступно».
 */
export function taskStatusView(
  status: string,
  eligible: boolean,
): { labelKey: string; className: string } {
  if (!eligible && status === 'available') {
    return { labelKey: 'rewardTasks.status.unavailable', className: 'badge-neutral' };
  }
  return { labelKey: `rewardTasks.status.${status}`, className: taskStatusBadge(status) };
}

/** Тексты баннера и подсказок лежат в rewardTasks.ineligible.<reason>.* */
export type IneligibleNoticeReason = RewardTaskIneligibleReason | 'unknown';

export interface IneligibleNotice {
  reason: IneligibleNoticeReason;
  /**
   * subscribe — помогут триал или покупка; support — покупка не поможет
   * (продление ограничено админом, подписка отключена), остаётся поддержка.
   */
  action: 'subscribe' | 'support';
}

/** Что показать пользователю, которому задания сейчас недоступны; null — доступны. */
export function getIneligibleNotice(
  data: Pick<RewardTasksResponse, 'eligible' | 'ineligible_reason'>,
): IneligibleNotice | null {
  if (data.eligible !== false) return null;
  const reason: unknown = data.ineligible_reason;
  if (reason === 'restricted' || reason === 'subscription_disabled') {
    return { reason, action: 'support' };
  }
  // null присылал бэкенд, у которого «нет подписки» было единственной причиной
  if (reason === 'no_subscription' || reason === null || reason === undefined) {
    return { reason: 'no_subscription', action: 'subscribe' };
  }
  // Причина новее этого кабинета: обещать, что поможет покупка, нельзя
  return { reason: 'unknown', action: 'support' };
}

/**
 * Можно ли сейчас выполнять задание: оно доступно или прошлый отчёт отклонён
 * (повторная попытка разрешена). Без подписки — нельзя.
 */
export function canAttemptTask(task: Pick<RewardTask, 'status'>, eligible: boolean): boolean {
  return eligible && (task.status === 'available' || task.status === 'rejected');
}

/**
 * Нужно ли сначала привязать Telegram, чтобы проверить буст: бот смотрит бусты
 * привязанного Telegram-аккаунта, а у зарегистрированных по почте его может не быть.
 * Только явное `telegram_linked: false` — бэкенд без этого поля оставляет кнопку.
 */
export function needsTelegramForBoost(
  response: Pick<RewardTasksResponse, 'telegram_linked'> | null | undefined,
): boolean {
  return response?.telegram_linked === false;
}

/**
 * Оптимистично меняет статус задания в кэше списка, пока не пришёл свежий
 * ответ: кнопка «Отправить отчёт» / «Проверить буст» пропадает сразу.
 */
export function withTaskStatus(
  data: RewardTasksResponse | undefined,
  taskId: number,
  status: RewardTaskStatus,
): RewardTasksResponse | undefined {
  if (!data) return data;
  return {
    ...data,
    tasks: data.tasks.map((task) =>
      task.id === taskId ? { ...task, status, reject_reason: null } : task,
    ),
  };
}

// ─── Ссылка из задания ───

export type TaskActionLink = { kind: 'telegram' | 'external'; url: string };

/**
 * Куда ведёт кнопка задания. t.me открываем через openTelegramLink (Mini App
 * при этом не закрывается), остальное — обычным openLink. Чужие схемы
 * (`javascript:` и т.п.) не открываем вовсе.
 */
export function resolveTaskActionLink(url: string | null | undefined): TaskActionLink | null {
  const raw = url?.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  // SDK openTelegramLink принимает только хост t.me
  const kind = parsed.hostname.toLowerCase() === 't.me' ? 'telegram' : 'external';
  return { kind, url: raw };
}

// ─── Скриншоты ───

export const REWARD_PHOTO_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];
/**
 * accept поля выбора скриншотов. Android-WebView Telegram передаёт системному
 * выбору файлов только первый тип из списка: с «image/jpeg,image/png,…» не были
 * бы видны PNG — а скриншоты на Android именно PNG. Форматы и размер всё равно
 * проверяет planPhotoUpload (REWARD_PHOTO_TYPES), лишнее отсеивается с пояснением.
 */
export const REWARD_PHOTO_ACCEPT = 'image/*';
export const REWARD_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export type PhotoRejectReason = 'type' | 'size' | 'limit';

export interface PhotoUploadPlan<F> {
  accepted: F[];
  rejected: Array<{ file: F; reason: PhotoRejectReason }>;
}

/**
 * Какие из выбранных файлов загружать: те же проверки, что у бэкенда
 * (тип, 10 МБ), плюс лимит max_photos с учётом уже прикреплённых.
 * В отличие от тикетов, отброшенные файлы возвращаются — пользователь видит почему.
 */
export function planPhotoUpload<F extends { type: string; size: number }>(
  files: readonly F[],
  currentCount: number,
  maxPhotos: number,
): PhotoUploadPlan<F> {
  const plan: PhotoUploadPlan<F> = { accepted: [], rejected: [] };
  let free = Math.max(0, maxPhotos - currentCount);
  for (const file of files) {
    if (!REWARD_PHOTO_TYPES.includes(file.type)) {
      plan.rejected.push({ file, reason: 'type' });
    } else if (file.size > REWARD_PHOTO_MAX_BYTES) {
      plan.rejected.push({ file, reason: 'size' });
    } else if (free <= 0) {
      plan.rejected.push({ file, reason: 'limit' });
    } else {
      plan.accepted.push(file);
      free -= 1;
    }
  }
  return plan;
}

/** Ответ загрузки → элемент `media` отчёта (thumbnail_file_id у API отчёта зовётся thumb_file_id). */
export function toSubmissionMedia(upload: RewardTaskUploadResult): RewardTaskMediaInput {
  const media: RewardTaskMediaInput = { file_id: upload.file_id };
  if (upload.file_unique_id) media.file_unique_id = upload.file_unique_id;
  if (upload.thumbnail_file_id) media.thumb_file_id = upload.thumbnail_file_id;
  return media;
}

// ─── Выбор отчётов в админке ───

export type SelectionState = 'none' | 'some' | 'all';

export function toggleSelected(selected: ReadonlySet<number>, id: number): Set<number> {
  const next = new Set(selected);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export function getSelectionState(
  selected: ReadonlySet<number>,
  visibleIds: readonly number[],
): SelectionState {
  const count = visibleIds.filter((id) => selected.has(id)).length;
  if (count === 0) return 'none';
  return count === visibleIds.length ? 'all' : 'some';
}

/** «Выбрать все»: когда выбраны все видимые — снимаем выбор, иначе выбираем все видимые. */
export function toggleAllSelected(
  selected: ReadonlySet<number>,
  visibleIds: readonly number[],
): Set<number> {
  return getSelectionState(selected, visibleIds) === 'all' ? new Set() : new Set(visibleIds);
}

/**
 * Оставляет в выборе только отчёты, которые ещё на экране (после одобрения они
 * пропадают из очереди). Возвращает тот же Set, если менять нечего, — без лишнего ререндера.
 */
export function pruneSelected(selected: Set<number>, visibleIds: readonly number[]): Set<number> {
  const visible = new Set(visibleIds);
  const next = new Set([...selected].filter((id) => visible.has(id)));
  return next.size === selected.size ? selected : next;
}

/** То же для ошибок по отчётам: id → error_code. */
export function pruneItemErrors(
  errors: Map<number, string | null>,
  visibleIds: readonly number[],
): Map<number, string | null> {
  const visible = new Set(visibleIds);
  const next = new Map([...errors].filter(([id]) => visible.has(id)));
  return next.size === errors.size ? errors : next;
}

export function splitBulkResults(results: readonly RewardBulkResultItem[]): {
  okIds: number[];
  errors: Map<number, string | null>;
} {
  const okIds: number[] = [];
  const errors = new Map<number, string | null>();
  for (const item of results) {
    if (item.ok) {
      okIds.push(item.id);
    } else {
      errors.set(item.id, item.error_code);
    }
  }
  return { okIds, errors };
}

// ─── Массовые действия пачками ───

/** Делит id на последовательные пачки не больше size (порядок сохраняется). */
export function chunkIds(
  ids: readonly number[],
  size: number = REWARD_BULK_CHUNK_SIZE,
): number[][] {
  const step = Math.max(1, Math.floor(size) || 1);
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += step) {
    chunks.push(ids.slice(i, i + step));
  }
  return chunks;
}

/**
 * Добавляет ответ пачки к накопленным результатам: один результат на id,
 * более поздний ответ заменяет прежний. Берём только id из отправленной пачки —
 * чужой id в ответе не должен снять выбор или повесить ошибку на другую карточку.
 */
export function mergeBulkResults(
  merged: readonly RewardBulkResultItem[],
  incoming: unknown,
  sentIds: readonly number[],
): RewardBulkResultItem[] {
  if (!Array.isArray(incoming)) return [...merged];
  const sent = new Set(sentIds);
  const byId = new Map(merged.map((item) => [item.id, item]));
  for (const item of incoming as RewardBulkResultItem[]) {
    if (item && typeof item.id === 'number' && sent.has(item.id)) {
      byId.set(item.id, {
        id: item.id,
        ok: item.ok === true,
        error_code: typeof item.error_code === 'string' ? item.error_code : null,
      });
    }
  }
  return [...byId.values()];
}

export interface BulkProgress {
  /** Сколько отчётов ушло в запросах, на которые уже пришёл ответ. */
  done: number;
  total: number;
}

export interface ChunkedBulkOutcome {
  /** Результаты по всем отчётам из отвеченных пачек. */
  results: RewardBulkResultItem[];
  processed: number;
  total: number;
  /**
   * Запрос пачки не прошёл (таймаут, сеть, 4xx/5xx) — прогон остановлен.
   * unprocessedIds — отчёты без ответа: эта пачка и все после неё.
   */
  failure: { error: unknown; unprocessedIds: number[] } | null;
}

/**
 * Одобряет/отклоняет отчёты пачками по chunkSize строго по очереди: следующая
 * пачка уходит только после ответа на предыдущую. На первой же ошибке запроса
 * останавливается — сколько обработано, видно по processed. Сам не бросает.
 */
export async function runChunkedBulk(
  ids: readonly number[],
  send: (chunk: number[]) => Promise<RewardBulkResponse>,
  onProgress?: (progress: BulkProgress) => void,
  chunkSize: number = REWARD_BULK_CHUNK_SIZE,
): Promise<ChunkedBulkOutcome> {
  const unique = [...new Set(ids)];
  const total = unique.length;
  let results: RewardBulkResultItem[] = [];
  let processed = 0;
  onProgress?.({ done: 0, total });
  for (const chunk of chunkIds(unique, chunkSize)) {
    let response: RewardBulkResponse;
    try {
      response = await send(chunk);
    } catch (error) {
      return {
        results,
        processed,
        total,
        failure: { error, unprocessedIds: unique.slice(processed) },
      };
    }
    results = mergeBulkResults(results, response?.results, chunk);
    processed += chunk.length;
    onProgress?.({ done: processed, total });
  }
  return { results, processed, total, failure: null };
}

// ─── Списки админки ───

/** Список заданий админки: голый массив или обёртка `{items}` — принимаем оба. */
export function normalizeAdminTaskList(data: unknown): AdminRewardTask[] {
  if (Array.isArray(data)) return data as AdminRewardTask[];
  if (data && typeof data === 'object') {
    const items = (data as { items?: unknown }).items;
    if (Array.isArray(items)) return items as AdminRewardTask[];
  }
  return [];
}

export function summarizeAdminTasks(tasks: readonly AdminRewardTask[]): {
  pending: number;
  approved: number;
  active: number;
} {
  return tasks.reduce(
    (acc, task) => ({
      pending: acc.pending + (task.pending_count || 0),
      approved: acc.approved + (task.approved_count || 0),
      active: acc.active + (task.is_active ? 1 : 0),
    }),
    { pending: 0, approved: 0, active: 0 },
  );
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Имя пользователя в карточке отчёта: ФИО → @username → TG id → #id. */
export function submissionUserLabel(user: AdminRewardSubmission['user']): string {
  const fullName = user.full_name?.trim();
  if (fullName) return fullName;
  if (user.username) return `@${user.username}`;
  if (user.telegram_id) return `TG ${user.telegram_id}`;
  return `#${user.id}`;
}

/**
 * Красный бейдж на отчёте заблокированного/удалённого пользователя: бэкенд не
 * начислит ему дни (user_blocked), такой отчёт остаётся только отклонить.
 * null — пользователь активен или старый бэкенд не прислал статус.
 */
export function submissionUserStatusKey(user: AdminRewardSubmission['user']): string | null {
  const status = typeof user.status === 'string' ? user.status.trim().toLowerCase() : '';
  if (!status || status === 'active') return null;
  return status === 'deleted'
    ? 'admin.rewardTasks.userStatus.deleted'
    : 'admin.rewardTasks.userStatus.blocked';
}

export const ADMIN_TASK_TABS = ['review', 'tasks', 'history'] as const;
export type AdminTaskTab = (typeof ADMIN_TASK_TABS)[number];

export function parseAdminTaskTab(value: string | null): AdminTaskTab {
  return (ADMIN_TASK_TABS as readonly string[]).includes(value ?? '')
    ? (value as AdminTaskTab)
    : 'review';
}

// ─── Форма задания ───

export interface RewardTaskFormState {
  kind: RewardTaskKind;
  title: string;
  description: string;
  rewardDays: string;
  actionUrl: string;
  channelId: string;
  minBoosts: string;
  maxPhotos: string;
  isActive: boolean;
  sortOrder: string;
}

export type RewardTaskFormField =
  | 'title'
  | 'rewardDays'
  | 'actionUrl'
  | 'channelId'
  | 'minBoosts'
  | 'maxPhotos'
  | 'sortOrder';

export type RewardTaskFormErrors = Partial<Record<RewardTaskFormField, true>>;

/** Награда по умолчанию: владелец решил «1 буст → 3 дня»; за фотоотчёт — 1 день. */
export const DEFAULT_REWARD_DAYS: Record<RewardTaskKind, number> = {
  photo_report: 1,
  channel_boost: 3,
};
const DEFAULT_MIN_BOOSTS = 1;
const DEFAULT_MAX_PHOTOS = 3;

export function taskToForm(task: AdminRewardTask | null): RewardTaskFormState {
  if (!task) {
    return {
      kind: 'photo_report',
      title: '',
      description: '',
      rewardDays: String(DEFAULT_REWARD_DAYS.photo_report),
      actionUrl: '',
      channelId: '',
      minBoosts: String(DEFAULT_MIN_BOOSTS),
      maxPhotos: String(DEFAULT_MAX_PHOTOS),
      isActive: true,
      sortOrder: '0',
    };
  }
  return {
    kind: task.kind,
    title: task.title,
    description: task.description ?? '',
    rewardDays: String(task.reward_days),
    actionUrl: task.action_url ?? '',
    channelId: task.channel_id ?? '',
    minBoosts: String(task.min_boosts),
    maxPhotos: String(task.max_photos),
    isActive: task.is_active,
    sortOrder: String(task.sort_order),
  };
}

/** Смена типа при создании: нетронутую награду по умолчанию подменяем на дефолт нового типа. */
export function switchTaskKind(
  form: RewardTaskFormState,
  kind: RewardTaskKind,
): RewardTaskFormState {
  if (form.kind === kind) return form;
  const untouchedReward = form.rewardDays.trim() === String(DEFAULT_REWARD_DAYS[form.kind]);
  return {
    ...form,
    kind,
    rewardDays: untouchedReward ? String(DEFAULT_REWARD_DAYS[kind]) : form.rewardDays,
  };
}

const INT_RE = /^-?\d+$/;

function parseIntStrict(value: string): number | null {
  const trimmed = value.trim();
  if (!INT_RE.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function intInRange(value: string, min: number, max: number): number | null {
  const parsed = parseIntStrict(value);
  return parsed !== null && parsed >= min && parsed <= max ? parsed : null;
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** ID канала: -100… (или голые цифры — бэкенд нормализует) либо @username. */
const CHANNEL_ID_RE = /^(-?\d{5,20}|@[A-Za-z][A-Za-z0-9_]{3,31})$/;

export function validateTaskForm(form: RewardTaskFormState): RewardTaskFormErrors {
  const limits = REWARD_TASK_LIMITS;
  const errors: RewardTaskFormErrors = {};
  const title = form.title.trim();
  if (!title || title.length > limits.titleMax) errors.title = true;
  if (intInRange(form.rewardDays, limits.rewardDaysMin, limits.rewardDaysMax) === null) {
    errors.rewardDays = true;
  }
  const actionUrl = form.actionUrl.trim();
  if (actionUrl && (actionUrl.length > limits.actionUrlMax || !isHttpUrl(actionUrl))) {
    errors.actionUrl = true;
  }
  if (form.kind === 'channel_boost') {
    const channelId = form.channelId.trim();
    if (channelId.length > limits.channelIdMax || !CHANNEL_ID_RE.test(channelId)) {
      errors.channelId = true;
    }
    if (intInRange(form.minBoosts, limits.minBoostsMin, limits.minBoostsMax) === null) {
      errors.minBoosts = true;
    }
  } else if (intInRange(form.maxPhotos, limits.maxPhotosMin, limits.maxPhotosMax) === null) {
    errors.maxPhotos = true;
  }
  if (intInRange(form.sortOrder, -limits.sortOrderAbsMax, limits.sortOrderAbsMax) === null) {
    errors.sortOrder = true;
  }
  return errors;
}

/**
 * Тело PATCH/POST из формы (вызывать после validateTaskForm). Поле чужого типа
 * скрыто в форме — если там мусор, шлём значение по умолчанию, чтобы бэкенд не
 * отверг задание из-за невидимого поля.
 */
export function formToTaskPayload(form: RewardTaskFormState): AdminRewardTaskUpdate {
  const limits = REWARD_TASK_LIMITS;
  const isBoost = form.kind === 'channel_boost';
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    reward_days:
      intInRange(form.rewardDays, limits.rewardDaysMin, limits.rewardDaysMax) ??
      DEFAULT_REWARD_DAYS[form.kind],
    action_url: form.actionUrl.trim() || null,
    channel_id: isBoost ? form.channelId.trim() : null,
    min_boosts:
      intInRange(form.minBoosts, limits.minBoostsMin, limits.minBoostsMax) ?? DEFAULT_MIN_BOOSTS,
    max_photos:
      intInRange(form.maxPhotos, limits.maxPhotosMin, limits.maxPhotosMax) ?? DEFAULT_MAX_PHOTOS,
    is_active: form.isActive,
    sort_order: intInRange(form.sortOrder, -limits.sortOrderAbsMax, limits.sortOrderAbsMax) ?? 0,
  };
}
