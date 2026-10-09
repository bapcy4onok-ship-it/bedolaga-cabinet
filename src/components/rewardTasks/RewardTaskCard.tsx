import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ExternalLinkIcon, PhotoIcon, RocketIcon } from '@/components/icons';
import { Button } from '@/components/primitives';

import type { RewardTask } from '../../api/rewardTasks';
import { formatShortDate } from '../../utils/format';
import {
  canAttemptTask,
  taskStatusView,
  type IneligibleNoticeReason,
} from '../../utils/rewardTasks';
import { BoostTaskActions } from './BoostTaskActions';
import { PhotoReportForm } from './PhotoReportForm';
import { TaskLinkButton } from './TaskLinkButton';

interface RewardTaskCardProps {
  task: RewardTask;
  /** false — задания видны, но выполнять их нельзя (нет подписки, ограничение и т.п.). */
  eligible: boolean;
  /** Почему нельзя (для подсказки на карточке); null, пока задания доступны. */
  ineligibleReason?: IneligibleNoticeReason | null;
  /** К аккаунту не привязан Telegram: буст проверить нельзя, сразу просим привязать. */
  needsTelegram?: boolean;
}

export function RewardTaskCard({
  task,
  eligible,
  ineligibleReason = null,
  needsTelegram = false,
}: RewardTaskCardProps) {
  const { t } = useTranslation();
  const [formOpen, setFormOpen] = useState(false);

  const isBoost = task.kind === 'channel_boost';
  const KindIcon = isBoost ? RocketIcon : PhotoIcon;
  const canAttempt = canAttemptTask(task, eligible);
  const reward = `+${t('rewardTasks.days', { count: task.reward_days })}`;
  const badge = taskStatusView(task.status, eligible);

  // Отчёт ушёл на проверку (или список обновился) — форму сворачиваем, чтобы после
  // возможного отказа снова показать кнопку, а не старую открытую форму
  useEffect(() => {
    if (!canAttempt) setFormOpen(false);
  }, [canAttempt]);

  return (
    <div className="card space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-400">
          <KindIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-base font-semibold text-dark-100">{task.title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={badge.className}>{t(badge.labelKey, task.status)}</span>
            <span className="text-xs text-dark-500">
              {t(`rewardTasks.kind.${task.kind}`, task.kind)}
            </span>
          </div>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-accent-500/15 px-2.5 py-1 text-sm font-semibold text-accent-400">
          {reward}
        </span>
      </div>

      {task.description && (
        <p className="whitespace-pre-line break-words text-sm text-dark-300">{task.description}</p>
      )}

      {task.status === 'completed' && (
        <div className="rounded-xl border border-success-500/30 bg-success-500/10 p-3 text-sm text-success-400">
          {task.completed_at
            ? t('rewardTasks.completedAt', { date: formatShortDate(task.completed_at) })
            : t('rewardTasks.completedInfo')}
        </div>
      )}

      {task.status === 'pending' && (
        <div className="rounded-xl border border-warning-500/30 bg-warning-500/10 p-3 text-sm text-warning-400">
          {t('rewardTasks.pendingInfo')}
        </div>
      )}

      {task.status === 'rejected' && (
        <div className="rounded-xl border border-error-500/30 bg-error-500/10 p-3 text-sm text-error-400">
          <p className="whitespace-pre-line break-words">
            {task.reject_reason
              ? t('rewardTasks.rejectedInfo', { reason: task.reject_reason })
              : t('rewardTasks.rejectedNoReason')}
          </p>
          {eligible && <p className="mt-1 text-xs text-error-300">{t('rewardTasks.retryHint')}</p>}
        </div>
      )}

      {canAttempt && isBoost && <BoostTaskActions task={task} needsTelegram={needsTelegram} />}

      {/* Неизвестный (будущий) тип задания не уводим в фотоотчёт — только описание */}
      {canAttempt && task.kind === 'photo_report' && (
        <div className="space-y-2">
          <TaskLinkButton
            url={task.action_url}
            label={t('rewardTasks.openLink')}
            icon={<ExternalLinkIcon className="h-5 w-5" />}
          />
          {formOpen ? (
            <PhotoReportForm task={task} onClose={() => setFormOpen(false)} />
          ) : (
            <Button
              fullWidth
              size="lg"
              leftIcon={<PhotoIcon className="h-5 w-5" />}
              onClick={() => setFormOpen(true)}
            >
              {task.status === 'rejected'
                ? t('rewardTasks.photo.resubmit')
                : t('rewardTasks.photo.start')}
            </Button>
          )}
        </div>
      )}

      {!eligible && (task.status === 'available' || task.status === 'rejected') && (
        <p className="text-xs text-dark-500">
          {t(`rewardTasks.ineligible.${ineligibleReason ?? 'no_subscription'}.hint`)}
        </p>
      )}
    </div>
  );
}
