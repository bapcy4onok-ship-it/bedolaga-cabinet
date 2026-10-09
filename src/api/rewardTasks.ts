import apiClient from './client';
import { normalizeAdminTaskList, REWARD_BULK_TIMEOUT_MS } from '../utils/rewardTasks';

// ==================== Общие типы ====================

export type RewardTaskKind = 'photo_report' | 'channel_boost';

/** Статус задания для конкретного пользователя (считает бэкенд). */
export type RewardTaskStatus = 'available' | 'pending' | 'completed' | 'rejected';

export type RewardSubmissionStatus = 'pending' | 'approved' | 'rejected';

export type RewardSubmissionSource = 'bot' | 'cabinet' | 'auto';

// ==================== Пользователь ====================

export interface RewardTask {
  id: number;
  kind: RewardTaskKind;
  title: string;
  description: string;
  reward_days: number;
  action_url: string | null;
  min_boosts: number;
  max_photos: number;
  status: RewardTaskStatus;
  /** Причина отклонения последнего отчёта (только для status === 'rejected'). */
  reject_reason: string | null;
  completed_at: string | null;
}

/**
 * Почему задания нельзя выполнять (порядок проверки на бэкенде):
 * - restricted — админ запретил продление подписки;
 * - subscription_disabled — подписки есть, но все (кроме PENDING) отключены. Так
 *   отвечает только бэкенд до 2026-10-09: новый такому пользователю раздел не
 *   показывает вовсе (404 tasks_unavailable, см. shouldLeaveTasksPage);
 * - no_subscription — подписки не было никогда.
 */
export type RewardTaskIneligibleReason = 'no_subscription' | 'restricted' | 'subscription_disabled';

export interface RewardTasksResponse {
  eligible: boolean;
  ineligible_reason: RewardTaskIneligibleReason | null;
  tasks: RewardTask[];
}

export interface RewardTasksCountResponse {
  count: number;
}

/** Скриншот в отчёте: file_id из /cabinet/media/upload. */
export interface RewardTaskMediaInput {
  file_id: string;
  file_unique_id?: string;
  thumb_file_id?: string;
}

export interface RewardTaskSubmitPayload {
  media: RewardTaskMediaInput[];
  comment?: string;
}

export interface RewardTaskSubmissionCreated {
  id: number;
  status: RewardSubmissionStatus;
  created_at: string;
}

export interface RewardTaskBoostResult {
  completed: boolean;
  reward_days: number;
}

/** Ответ /cabinet/media/upload в части, нужной заданиям. */
export interface RewardTaskUploadResult {
  file_id: string;
  file_unique_id?: string | null;
  /** Превью ~320px; старый бэкенд его не отдаёт. */
  thumbnail_file_id?: string | null;
}

// ==================== Админка ====================

export interface AdminRewardTask {
  id: number;
  kind: RewardTaskKind;
  title: string;
  description: string;
  reward_days: number;
  action_url: string | null;
  channel_id: string | null;
  min_boosts: number;
  max_photos: number;
  is_active: boolean;
  sort_order: number;
  pending_count: number;
  approved_count: number;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Тело PATCH: тип задания после создания не меняем. */
export interface AdminRewardTaskUpdate {
  title: string;
  description: string;
  reward_days: number;
  action_url: string | null;
  channel_id: string | null;
  min_boosts: number;
  max_photos: number;
  is_active: boolean;
  sort_order: number;
}

export interface AdminRewardTaskCreate extends AdminRewardTaskUpdate {
  kind: RewardTaskKind;
}

export interface AdminRewardSubmissionMedia {
  file_id: string;
  thumb_file_id: string | null;
  token: string;
  thumb_token: string | null;
}

export interface AdminRewardSubmission {
  id: number;
  task: { id: number; title: string; kind: RewardTaskKind };
  user: {
    id: number;
    telegram_id: number | null;
    username: string | null;
    full_name: string | null;
    /** users.status: 'active' | 'blocked' | 'deleted'. Старый бэкенд поле не отдаёт. */
    status?: string;
  };
  status: RewardSubmissionStatus;
  source: RewardSubmissionSource;
  media_items: AdminRewardSubmissionMedia[];
  comment: string | null;
  boost_count: number | null;
  reward_days: number | null;
  reject_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewer_name: string | null;
}

export interface AdminRewardSubmissionsResponse {
  items: AdminRewardSubmission[];
  total: number;
  pending_count: number;
}

export interface AdminRewardSubmissionsParams {
  status?: RewardSubmissionStatus;
  task_id?: number;
  offset?: number;
  limit?: number;
}

export interface RewardBulkResultItem {
  id: number;
  ok: boolean;
  error_code: string | null;
}

export interface RewardBulkResponse {
  results: RewardBulkResultItem[];
}

export const rewardTasksApi = {
  getTasks: async (): Promise<RewardTasksResponse> => {
    const response = await apiClient.get<RewardTasksResponse>('/cabinet/tasks');
    return response.data;
  },

  // Количество активных заданий — флаг для пункта меню и баннера на главной
  getCount: async (): Promise<RewardTasksCountResponse> => {
    const response = await apiClient.get<RewardTasksCountResponse>('/cabinet/tasks/count');
    return response.data;
  },

  submitPhotoReport: async (
    taskId: number,
    payload: RewardTaskSubmitPayload,
  ): Promise<RewardTaskSubmissionCreated> => {
    const response = await apiClient.post<RewardTaskSubmissionCreated>(
      `/cabinet/tasks/${taskId}/submissions`,
      payload,
    );
    return response.data;
  },

  checkBoost: async (taskId: number): Promise<RewardTaskBoostResult> => {
    const response = await apiClient.post<RewardTaskBoostResult>(
      `/cabinet/tasks/${taskId}/check-boost`,
    );
    return response.data;
  },
};

export const adminRewardTasksApi = {
  getTasks: async (): Promise<AdminRewardTask[]> => {
    const response = await apiClient.get<unknown>('/cabinet/admin/tasks');
    return normalizeAdminTaskList(response.data);
  },

  createTask: async (data: AdminRewardTaskCreate): Promise<AdminRewardTask> => {
    const response = await apiClient.post<AdminRewardTask>('/cabinet/admin/tasks', data);
    return response.data;
  },

  updateTask: async (
    taskId: number,
    data: Partial<AdminRewardTaskUpdate>,
  ): Promise<AdminRewardTask> => {
    const response = await apiClient.patch<AdminRewardTask>(`/cabinet/admin/tasks/${taskId}`, data);
    return response.data;
  },

  // 409, если по заданию уже есть отчёты — тогда задание только выключают
  deleteTask: async (taskId: number): Promise<void> => {
    await apiClient.delete(`/cabinet/admin/tasks/${taskId}`);
  },

  getSubmissions: async (
    params: AdminRewardSubmissionsParams,
  ): Promise<AdminRewardSubmissionsResponse> => {
    const response = await apiClient.get<AdminRewardSubmissionsResponse>(
      '/cabinet/admin/tasks/submissions',
      { params },
    );
    return response.data;
  },

  // Бэкенд обрабатывает id по очереди, и каждое начисление ждёт панель: проверка, есть ли
  // пользователь в панели (до 3 с), затем синхронизация (до 10 с), всего до ~13 с. Поэтому
  // кабинет шлёт пачки по REWARD_BULK_CHUNK_SIZE и ждёт дольше общих 30 с
  approve: async (ids: number[]): Promise<RewardBulkResponse> => {
    const response = await apiClient.post<RewardBulkResponse>(
      '/cabinet/admin/tasks/submissions/approve',
      { ids },
      { timeout: REWARD_BULK_TIMEOUT_MS },
    );
    return response.data;
  },

  reject: async (ids: number[], reason: string): Promise<RewardBulkResponse> => {
    const response = await apiClient.post<RewardBulkResponse>(
      '/cabinet/admin/tasks/submissions/reject',
      { ids, reason },
      { timeout: REWARD_BULK_TIMEOUT_MS },
    );
    return response.data;
  },
};
