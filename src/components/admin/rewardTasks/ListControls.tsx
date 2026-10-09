import { useTranslation } from 'react-i18next';

import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

import type { AdminRewardTask } from '../../../api/rewardTasks';

/** Квадратный чекбокс в стиле массовых действий; indeterminate — «выбрана часть». */
export function SelectBox({
  checked,
  indeterminate,
}: {
  checked: boolean;
  indeterminate?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-150',
        checked
          ? 'border-accent-500 bg-accent-500 text-on-accent'
          : indeterminate
            ? 'border-accent-500 bg-accent-500/30'
            : 'border-dark-500 bg-dark-700/60',
      )}
    >
      {checked && <CheckIcon className="h-3 w-3" />}
      {!checked && indeterminate && <span className="h-0.5 w-2 rounded-full bg-white" />}
    </span>
  );
}

interface TaskFilterSelectProps {
  tasks: AdminRewardTask[];
  value: number | null;
  onChange: (taskId: number | null) => void;
}

export function TaskFilterSelect({ tasks, value, onChange }: TaskFilterSelectProps) {
  const { t } = useTranslation();
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      aria-label={t('admin.rewardTasks.filter.task')}
      className="input w-full min-w-0 px-3 py-2 text-sm sm:w-auto sm:max-w-xs"
    >
      <option value="">{t('admin.rewardTasks.filter.allTasks')}</option>
      {tasks.map((task) => (
        <option key={task.id} value={task.id}>
          {task.is_active ? task.title : `${task.title} (${t('admin.rewardTasks.tasks.inactive')})`}
        </option>
      ))}
    </select>
  );
}

interface PagerProps {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}

export function Pager({ page, pages, onChange }: PagerProps) {
  const { t } = useTranslation();
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-2">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        aria-label={t('common.back')}
        className="btn-secondary px-3 py-1.5"
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </button>
      <span className="text-sm text-dark-400">
        {page + 1} / {pages}
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= pages - 1}
        aria-label={t('common.next')}
        className="btn-secondary px-3 py-1.5"
      >
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
