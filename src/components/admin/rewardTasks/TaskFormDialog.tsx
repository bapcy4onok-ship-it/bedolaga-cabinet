import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

import {
  adminRewardTasksApi,
  type AdminRewardTask,
  type RewardTaskKind,
} from '../../../api/rewardTasks';
import {
  formToTaskPayload,
  REWARD_TASK_LIMITS,
  rewardTaskErrorMessage,
  switchTaskKind,
  taskToForm,
  validateTaskForm,
  type RewardTaskFormField,
  type RewardTaskFormState,
} from '../../../utils/rewardTasks';

const KINDS: RewardTaskKind[] = ['photo_report', 'channel_boost'];

interface TaskFormDialogProps {
  open: boolean;
  /** null — создание нового задания. */
  task: AdminRewardTask | null;
  onClose: () => void;
}

export function TaskFormDialog({ open, task, onClose }: TaskFormDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [form, setForm] = useState<RewardTaskFormState>(() => taskToForm(task));
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Диалог не размонтируется между открытиями — форму сбрасываем явно
  useEffect(() => {
    if (open) {
      setForm(taskToForm(task));
      setShowErrors(false);
      setServerError(null);
    }
  }, [open, task]);

  const set = <K extends keyof RewardTaskFormState>(key: K, value: RewardTaskFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const errors = validateTaskForm(form);
  const isValid = Object.keys(errors).length === 0;
  const isBoost = form.kind === 'channel_boost';

  const mutation = useMutation({
    mutationFn: () => {
      const payload = formToTaskPayload(form);
      return task
        ? adminRewardTasksApi.updateTask(task.id, payload)
        : adminRewardTasksApi.createTask({ kind: form.kind, ...payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reward-tasks'] });
      // Меню и список заданий у самого админа тоже зависят от набора активных заданий
      queryClient.invalidateQueries({ queryKey: ['reward-tasks-count'] });
      queryClient.invalidateQueries({ queryKey: ['reward-tasks'] });
      showToast({ type: 'success', message: t('admin.rewardTasks.tasks.saved') });
      onClose();
    },
    onError: (err: unknown) => setServerError(rewardTaskErrorMessage(err, t('common.error'))),
  });

  const handleSubmit = () => {
    setShowErrors(true);
    if (!isValid || mutation.isPending) return;
    setServerError(null);
    mutation.mutate();
  };

  const fieldError = (field: RewardTaskFormField) =>
    showErrors && errors[field] ? (
      <p className="mt-1.5 text-xs text-error-400">{t(`admin.rewardTasks.form.errors.${field}`)}</p>
    ) : null;

  const inputClass = (field: RewardTaskFormField) =>
    showErrors && errors[field] ? 'input-error' : 'input';

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {task ? t('admin.rewardTasks.form.editTitle') : t('admin.rewardTasks.form.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('admin.rewardTasks.form.dialogHint')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {serverError && (
            <div className="rounded-xl border border-error-500/30 bg-error-500/10 p-3 text-sm text-error-400">
              {serverError}
            </div>
          )}

          {/* Тип задания: после создания не меняется */}
          <div>
            <span className="label">{t('admin.rewardTasks.form.kind')}</span>
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  disabled={!!task}
                  onClick={() => setForm((prev) => switchTaskKind(prev, kind))}
                  aria-pressed={form.kind === kind}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed',
                    form.kind === kind
                      ? 'border-accent-500/50 bg-accent-500/15 text-accent-400'
                      : 'border-dark-700/50 bg-dark-800/50 text-dark-400 hover:text-dark-200 disabled:opacity-50',
                  )}
                >
                  {t(`admin.rewardTasks.kind.${kind}`)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-dark-500">
              {task
                ? t('admin.rewardTasks.form.kindLocked')
                : t(`admin.rewardTasks.form.kindHint.${form.kind}`)}
            </p>
          </div>

          <div>
            <label className="label" htmlFor="reward-task-title">
              {t('admin.rewardTasks.form.title')}
            </label>
            <input
              id="reward-task-title"
              className={inputClass('title')}
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={REWARD_TASK_LIMITS.titleMax}
              placeholder={t('admin.rewardTasks.form.titlePlaceholder')}
            />
            {fieldError('title')}
          </div>

          <div>
            <label className="label" htmlFor="reward-task-description">
              {t('admin.rewardTasks.form.descriptionLabel')}
            </label>
            <textarea
              id="reward-task-description"
              className="input min-h-[96px] resize-y"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder={t('admin.rewardTasks.form.descriptionPlaceholder')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="reward-task-days">
                {t('admin.rewardTasks.form.rewardDays')}
              </label>
              <input
                id="reward-task-days"
                className={inputClass('rewardDays')}
                inputMode="numeric"
                value={form.rewardDays}
                onChange={(e) => set('rewardDays', e.target.value)}
              />
              {fieldError('rewardDays')}
            </div>
            {isBoost ? (
              <div>
                <label className="label" htmlFor="reward-task-boosts">
                  {t('admin.rewardTasks.form.minBoosts')}
                </label>
                <input
                  id="reward-task-boosts"
                  className={inputClass('minBoosts')}
                  inputMode="numeric"
                  value={form.minBoosts}
                  onChange={(e) => set('minBoosts', e.target.value)}
                />
                {fieldError('minBoosts')}
              </div>
            ) : (
              <div>
                <label className="label" htmlFor="reward-task-photos">
                  {t('admin.rewardTasks.form.maxPhotos')}
                </label>
                <input
                  id="reward-task-photos"
                  className={inputClass('maxPhotos')}
                  inputMode="numeric"
                  value={form.maxPhotos}
                  onChange={(e) => set('maxPhotos', e.target.value)}
                />
                {fieldError('maxPhotos')}
              </div>
            )}
          </div>

          {isBoost && (
            <div>
              <label className="label" htmlFor="reward-task-channel">
                {t('admin.rewardTasks.form.channelId')}
              </label>
              <input
                id="reward-task-channel"
                className={inputClass('channelId')}
                value={form.channelId}
                onChange={(e) => set('channelId', e.target.value)}
                maxLength={REWARD_TASK_LIMITS.channelIdMax}
                placeholder="-1001234567890"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {fieldError('channelId')}
              <p className="mt-1.5 text-xs text-dark-500">
                {t('admin.rewardTasks.form.channelIdHint')}
              </p>
            </div>
          )}

          <div>
            <label className="label" htmlFor="reward-task-url">
              {t('admin.rewardTasks.form.actionUrl')}
            </label>
            <input
              id="reward-task-url"
              type="url"
              className={inputClass('actionUrl')}
              value={form.actionUrl}
              onChange={(e) => set('actionUrl', e.target.value)}
              maxLength={REWARD_TASK_LIMITS.actionUrlMax}
              placeholder={isBoost ? 'https://t.me/boost/channel' : 'https://t.me/channel'}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {fieldError('actionUrl')}
            <p className="mt-1.5 text-xs text-dark-500">
              {t('admin.rewardTasks.form.actionUrlHint')}
            </p>
          </div>

          <div className="grid grid-cols-2 items-end gap-3">
            <div>
              <label className="label" htmlFor="reward-task-sort">
                {t('admin.rewardTasks.form.sortOrder')}
              </label>
              <input
                id="reward-task-sort"
                className={inputClass('sortOrder')}
                inputMode="numeric"
                value={form.sortOrder}
                onChange={(e) => set('sortOrder', e.target.value)}
              />
              {fieldError('sortOrder')}
            </div>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-dark-300">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set('isActive', e.target.checked)}
                className="h-4 w-4 rounded border-dark-600 bg-dark-800 accent-accent-500"
              />
              {t('admin.rewardTasks.form.isActive')}
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={handleSubmit}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
