import { useTranslation } from 'react-i18next';

import { XIcon } from '@/components/icons';
import { Button } from '@/components/primitives';
import { cn } from '@/lib/utils';

import type { BulkProgress } from '../../../utils/rewardTasks';

interface ReviewActionBarProps {
  count: number;
  canApprove: boolean;
  canReject: boolean;
  approving: boolean;
  rejecting: boolean;
  /** Сколько отчётов уже обработано пачками из скольких; null — действие не идёт. */
  progress?: BulkProgress | null;
  onApprove: () => void;
  onReject: () => void;
  onClear: () => void;
}

/**
 * Липкая панель действий над выбранными отчётами. На мобильных висит над
 * нижней навигацией (она fixed, 16px + safe-area от низа), на десктопе — у края.
 * z-30: ниже шапки, меню и диалогов (промпт причины отказа должен быть сверху).
 */
export function ReviewActionBar({
  count,
  canApprove,
  canReject,
  approving,
  rejecting,
  progress = null,
  onApprove,
  onReject,
  onClear,
}: ReviewActionBarProps) {
  const { t } = useTranslation();
  const busy = approving || rejecting;
  // Пока идут пачки, панель с прогрессом не прячем, даже если выбор на экране сменился
  if (count === 0 && !busy) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom,0px))] z-30 flex justify-center px-4 lg:bottom-6">
      <div className="pointer-events-auto flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-dark-700/60 bg-dark-900/95 p-2 shadow-2xl backdrop-blur-xl">
        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          aria-label={t('admin.rewardTasks.review.clearSelection')}
          title={t('admin.rewardTasks.review.clearSelection')}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-accent-400 transition-colors hover:bg-dark-800 disabled:opacity-50"
        >
          <span className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg bg-accent-500/20 px-1.5">
            {count}
          </span>
          <XIcon className="h-4 w-4 text-dark-400" />
        </button>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {busy ? (
            // Пачки уходят по очереди и могут идти минуты — показываем, сколько готово.
            // Вместо обеих кнопок: на телефоне «Отклоняю… 8/20» рядом с ещё одной кнопкой не влезает
            <div
              role="status"
              aria-live="polite"
              className={cn(
                'flex h-10 min-w-0 items-center gap-2 rounded-linear px-4 text-sm font-medium',
                rejecting ? 'bg-error-500/10 text-error-400' : 'bg-accent-500/15 text-accent-400',
              )}
            >
              <span
                aria-hidden="true"
                className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              <span className="truncate">
                {t(
                  rejecting
                    ? 'admin.rewardTasks.review.rejecting'
                    : 'admin.rewardTasks.review.approving',
                  { done: progress?.done ?? 0, total: progress?.total ?? count },
                )}
              </span>
            </div>
          ) : (
            <>
              {canReject && (
                <Button variant="destructive" onClick={onReject}>
                  {t('admin.rewardTasks.review.reject')}
                </Button>
              )}
              {canApprove && (
                <Button onClick={onApprove}>
                  <span className="sm:hidden">
                    {t('admin.rewardTasks.review.approveShort', { value: count })}
                  </span>
                  <span className="hidden sm:inline">
                    {t('admin.rewardTasks.review.approveSelected', { value: count })}
                  </span>
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
