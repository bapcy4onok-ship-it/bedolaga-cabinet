import { useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { adminRewardTasksApi, type AdminRewardTask } from '../../../api/rewardTasks';
import { pageCount } from '../../../utils/rewardTasks';
import { Pager, TaskFilterSelect } from './ListControls';
import { SubmissionCard } from './SubmissionCard';

const PAGE_SIZE = 50;

const HISTORY_STATUSES = ['approved', 'rejected'] as const;
type HistoryStatus = (typeof HISTORY_STATUSES)[number];

interface SubmissionHistoryProps {
  tasks: AdminRewardTask[];
  canOpenUser: boolean;
}

/** Вкладка «История»: обработанные отчёты (одобренные / отклонённые), только просмотр. */
export function SubmissionHistory({ tasks, canOpenUser }: SubmissionHistoryProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<HistoryStatus>('approved');
  const [taskId, setTaskId] = useState<number | null>(null);
  const [page, setPage] = useState(0);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['admin-reward-task-submissions', status, taskId, page],
    queryFn: () =>
      adminRewardTasksApi.getSubmissions({
        status,
        task_id: taskId ?? undefined,
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const pages = pageCount(data?.total ?? 0, PAGE_SIZE);

  let content: ReactNode;
  if (isLoading) {
    content = (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    );
  } else if (isError) {
    content = (
      <div className="rounded-xl bg-error-500/10 px-4 py-3 text-sm text-error-400">
        {t('admin.rewardTasks.loadError')}
      </div>
    );
  } else if (items.length === 0) {
    content = (
      <div className="py-12 text-center text-dark-400">{t('admin.rewardTasks.history.empty')}</div>
    );
  } else {
    content = (
      <div className="space-y-3">
        {items.map((item) => (
          <SubmissionCard key={item.id} submission={item} canOpenUser={canOpenUser} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-dark-700/50 bg-dark-800/40 p-1">
          {HISTORY_STATUSES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setStatus(value);
                setPage(0);
              }}
              aria-pressed={status === value}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                status === value
                  ? 'bg-accent-500 text-on-accent'
                  : 'text-dark-400 hover:text-dark-200',
              )}
            >
              {t(`admin.rewardTasks.filter.${value}`)}
            </button>
          ))}
        </div>
        <TaskFilterSelect
          tasks={tasks}
          value={taskId}
          onChange={(next) => {
            setTaskId(next);
            setPage(0);
          }}
        />
        {isFetching && !isLoading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
        )}
      </div>

      {content}

      <Pager page={page} pages={pages} onChange={setPage} />
    </div>
  );
}
