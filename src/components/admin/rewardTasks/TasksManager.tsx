import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

import { EditIcon, PhotoIcon, PlusIcon, RocketIcon, TrashIcon } from '@/components/icons';
import { Button } from '@/components/primitives';
import { useToast } from '@/components/Toast';
import { useDestructiveConfirm } from '@/platform';

import { adminRewardTasksApi, type AdminRewardTask } from '../../../api/rewardTasks';
import { rewardTaskErrorMessage } from '../../../utils/rewardTasks';
import { TaskFormDialog } from './TaskFormDialog';

interface TasksManagerProps {
  tasks: AdminRewardTask[];
  isLoading: boolean;
  isError: boolean;
  canEdit: boolean;
}

/** Вкладка «Задания»: список (вкл. выключенные), создание, правка, вкл/выкл, удаление. */
export function TasksManager({ tasks, isLoading, isError, canEdit }: TasksManagerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirmDelete = useDestructiveConfirm();
  // task держим и после закрытия, чтобы форма не мигала «созданием» на анимации выхода
  const [editor, setEditor] = useState<{
    open: boolean;
    task: AdminRewardTask | null;
  }>({
    open: false,
    task: null,
  });

  const refreshTasks = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-reward-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['reward-tasks-count'] });
    queryClient.invalidateQueries({ queryKey: ['reward-tasks'] });
  };

  const toggleMutation = useMutation({
    mutationFn: (task: AdminRewardTask) =>
      adminRewardTasksApi.updateTask(task.id, { is_active: !task.is_active }),
    onError: (err: unknown) =>
      showToast({
        type: 'error',
        message: rewardTaskErrorMessage(err, t('common.error')),
      }),
    onSettled: refreshTasks,
  });

  const deleteMutation = useMutation({
    mutationFn: (task: AdminRewardTask) => adminRewardTasksApi.deleteTask(task.id),
    onSuccess: () =>
      showToast({
        type: 'success',
        message: t('admin.rewardTasks.tasks.deleted'),
      }),
    onError: (err: unknown) => {
      const hasSubmissions = axios.isAxiosError(err) && err.response?.status === 409;
      showToast({
        type: 'error',
        message: hasSubmissions
          ? t('admin.rewardTasks.tasks.deleteHasSubmissions')
          : rewardTaskErrorMessage(err, t('common.error')),
      });
    },
    onSettled: refreshTasks,
  });

  const handleDelete = async (task: AdminRewardTask) => {
    // Задание с отчётами бэкенд не удалит (409) — объясняем сразу, без лишнего запроса
    if (task.pending_count + task.approved_count > 0) {
      showToast({
        type: 'error',
        message: t('admin.rewardTasks.tasks.deleteHasSubmissions'),
      });
      return;
    }
    const confirmed = await confirmDelete(
      t('admin.rewardTasks.tasks.deleteConfirm', { title: task.title }),
      t('admin.rewardTasks.tasks.delete'),
    );
    if (confirmed) deleteMutation.mutate(task);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <Button
          leftIcon={<PlusIcon className="h-5 w-5" />}
          onClick={() => setEditor({ open: true, task: null })}
        >
          {t('admin.rewardTasks.tasks.create')}
        </Button>
      )}

      {isError && (
        <div className="rounded-xl bg-error-500/10 px-4 py-3 text-sm text-error-400">
          {t('admin.rewardTasks.loadError')}
        </div>
      )}

      {!isError && tasks.length === 0 && (
        <div className="py-12 text-center text-dark-400">{t('admin.rewardTasks.tasks.empty')}</div>
      )}

      <div className="space-y-3">
        {tasks.map((task) => {
          const isBoost = task.kind === 'channel_boost';
          const KindIcon = isBoost ? RocketIcon : PhotoIcon;
          return (
            <div key={task.id} className="rounded-xl border border-dark-700/50 bg-dark-800/40 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-400">
                  <KindIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words font-medium text-dark-100">
                      {task.title}
                    </span>
                    <span className={task.is_active ? 'badge-success' : 'badge-neutral'}>
                      {task.is_active
                        ? t('admin.rewardTasks.tasks.active')
                        : t('admin.rewardTasks.tasks.inactive')}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-dark-500">
                    <span>{t(`admin.rewardTasks.kind.${task.kind}`, task.kind)}</span>
                    <span className="font-medium text-accent-400">
                      +{t('rewardTasks.days', { count: task.reward_days })}
                    </span>
                    <span>
                      {task.kind === 'channel_subscription'
                        ? t('admin.rewardTasks.kind.channel_subscription')
                        : isBoost
                          ? t('admin.rewardTasks.tasks.minBoosts', {
                              value: task.min_boosts,
                            })
                          : t('admin.rewardTasks.tasks.maxPhotos', {
                              count: task.max_photos,
                            })}
                    </span>
                    <span>
                      {t('admin.rewardTasks.tasks.pendingCount', {
                        value: task.pending_count,
                      })}
                    </span>
                    <span>
                      {t('admin.rewardTasks.tasks.approvedCount', {
                        value: task.approved_count,
                      })}
                    </span>
                    <span>
                      {t('admin.rewardTasks.tasks.sortOrder', {
                        value: task.sort_order,
                      })}
                    </span>
                  </div>
                  {isBoost && task.channel_id && (
                    <div className="mt-1 break-all text-xs text-dark-500">
                      {t('admin.rewardTasks.tasks.channel', {
                        value: task.channel_id,
                      })}
                    </div>
                  )}
                  {task.action_url && (
                    <div className="mt-1 truncate text-xs text-dark-500">{task.action_url}</div>
                  )}
                </div>
              </div>

              {canEdit && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<EditIcon className="h-4 w-4" />}
                    onClick={() => setEditor({ open: true, task })}
                  >
                    {t('admin.rewardTasks.tasks.edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => toggleMutation.mutate(task)}
                    disabled={toggleMutation.isPending}
                  >
                    {task.is_active
                      ? t('admin.rewardTasks.tasks.disable')
                      : t('admin.rewardTasks.tasks.enable')}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    leftIcon={<TrashIcon className="h-4 w-4" />}
                    onClick={() => handleDelete(task)}
                    disabled={deleteMutation.isPending}
                  >
                    {t('admin.rewardTasks.tasks.delete')}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <TaskFormDialog
        open={editor.open}
        task={editor.task}
        onClose={() => setEditor((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
