import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { cn } from '@/lib/utils';

import type { AdminRewardSubmission } from '../../../api/rewardTasks';
import {
  submissionStatusBadge,
  submissionUserLabel,
  submissionUserStatusKey,
  type RewardTaskErrorText,
} from '../../../utils/rewardTasks';
import { uiLocale } from '../../../utils/uiLocale';
import { useTaskErrorText } from '../../rewardTasks/useTaskErrorText';
import { MessageMediaGrid, type MediaItem } from '../../tickets/MessageMediaGrid';
import { SelectBox } from './ListControls';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(uiLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface SubmissionCardProps {
  submission: AdminRewardSubmission;
  /** Очередь проверки: карточку можно выбрать для одобрения/отклонения. */
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (id: number) => void;
  /** Выбор заморожен, пока идёт массовое действие над выбранными отчётами. */
  selectionLocked?: boolean;
  /** Ошибка последнего действия с этим отчётом (отчёт остался на проверке). */
  error?: RewardTaskErrorText | null;
  canOpenUser?: boolean;
}

export function SubmissionCard({
  submission,
  selectable = false,
  selected = false,
  onToggle,
  selectionLocked = false,
  error,
  canOpenUser = false,
}: SubmissionCardProps) {
  const { t } = useTranslation();
  const errorText = useTaskErrorText();
  const { user, task } = submission;
  const userLabel = submissionUserLabel(user);
  const userStatusKey = submissionUserStatusKey(user);

  // Превью в ленте берём из thumb_*, полноэкранный просмотр — оригинал
  const mediaItems: MediaItem[] = submission.media_items.map((item) => ({
    type: 'photo',
    file_id: item.file_id,
    token: item.token,
    thumb_file_id: item.thumb_file_id,
    thumb_token: item.thumb_token,
  }));

  const summary = (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {selectable && (
        <span className="pt-0.5">
          <SelectBox checked={selected} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="min-w-0 break-words font-medium text-dark-100">{userLabel}</span>
          {user.username && !userLabel.startsWith('@') && (
            <span className="text-xs text-dark-500">@{user.username}</span>
          )}
          {/* Дни такому пользователю бэкенд не начислит (user_blocked) — отчёт только отклонить */}
          {userStatusKey && <span className="badge-error">{t(userStatusKey)}</span>}
        </div>
        <div className="mt-0.5 break-words text-sm text-accent-400">{task.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dark-500">
          <span>#{submission.id}</span>
          <span>{formatDateTime(submission.created_at)}</span>
          <span className="rounded bg-dark-700/60 px-1.5 py-0.5 text-dark-300">
            {t(`admin.rewardTasks.source.${submission.source}`, submission.source)}
          </span>
          {user.telegram_id && <span>TG {user.telegram_id}</span>}
          {submission.boost_count != null && (
            <span>{t('admin.rewardTasks.review.boosts', { value: submission.boost_count })}</span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-colors',
        selected ? 'border-accent-500/50 bg-accent-500/5' : 'border-dark-700/50 bg-dark-800/40',
      )}
    >
      <div className="flex items-start gap-3">
        {selectable ? (
          <button
            type="button"
            onClick={() => onToggle?.(submission.id)}
            disabled={selectionLocked}
            aria-pressed={selected}
            aria-label={t(
              selected ? 'admin.rewardTasks.review.deselect' : 'admin.rewardTasks.review.select',
              { id: submission.id },
            )}
            className="flex min-w-0 flex-1 text-left disabled:cursor-default"
          >
            {summary}
          </button>
        ) : (
          summary
        )}
        {canOpenUser && (
          <Link
            to={`/admin/users/${user.id}`}
            className="inline-flex min-h-[40px] shrink-0 items-center rounded-lg border border-accent-500/30 bg-accent-500/10 px-3 text-xs font-medium text-accent-400 transition-colors hover:bg-accent-500/20"
          >
            {t('admin.rewardTasks.review.openUser')}
          </Link>
        )}
      </div>

      {/* Итог проверки и ошибка — над скриншотами, чтобы их было видно без прокрутки */}
      {submission.status !== 'pending' && (
        <div className="mt-3 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={submissionStatusBadge(submission.status)}>
              {t(`admin.rewardTasks.status.${submission.status}`, submission.status)}
            </span>
            {submission.status === 'approved' && submission.reward_days != null && (
              <span className="font-medium text-success-400">
                +{t('rewardTasks.days', { count: submission.reward_days })}
              </span>
            )}
            {submission.reviewed_at && (
              <span className="text-dark-500">{formatDateTime(submission.reviewed_at)}</span>
            )}
            {submission.reviewer_name && (
              <span className="text-dark-500">
                {t('admin.rewardTasks.history.reviewer', { name: submission.reviewer_name })}
              </span>
            )}
          </div>
          {submission.status === 'rejected' && submission.reject_reason && (
            <p className="whitespace-pre-line break-words text-sm text-error-400">
              {t('admin.rewardTasks.history.reason', { reason: submission.reject_reason })}
            </p>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-error-500/30 bg-error-500/10 px-3 py-2 text-sm text-error-400"
        >
          {errorText(error)}
        </div>
      )}

      {submission.comment && (
        <p className="mt-3 whitespace-pre-line break-words rounded-lg bg-dark-900/50 px-3 py-2 text-sm text-dark-200">
          {submission.comment}
        </p>
      )}

      {mediaItems.length > 0 && (
        <MessageMediaGrid
          message={{ media_items: mediaItems }}
          translateError={t('support.imageLoadFailed')}
          layout="strip"
        />
      )}
    </div>
  );
}
