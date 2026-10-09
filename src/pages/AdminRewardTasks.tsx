import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { adminRewardTasksApi } from '../api/rewardTasks';
import { AdminBackButton } from '../components/admin/AdminBackButton';
import { ReviewQueue, SubmissionHistory, TasksManager } from '../components/admin/rewardTasks';
import { CalendarStarIcon, CheckCircleIcon, ClockIcon } from '../components/icons';
import { StatCard } from '../components/stats';
import { usePermissionStore } from '../store/permissions';
import {
  ADMIN_TASK_TABS,
  parseAdminTaskTab,
  summarizeAdminTasks,
  type AdminTaskTab,
} from '../utils/rewardTasks';

export default function AdminRewardTasks() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseAdminTaskTab(searchParams.get('tab'));

  const hasPermission = usePermissionStore((state) => state.hasPermission);
  const canEdit = hasPermission('tasks:edit');
  const canApprove = hasPermission('tasks:approve');
  const canReject = hasPermission('tasks:reject');
  const canOpenUser = hasPermission('users:read');

  const {
    data: tasks = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin-reward-tasks'],
    queryFn: adminRewardTasksApi.getTasks,
  });

  const summary = useMemo(() => summarizeAdminTasks(tasks), [tasks]);

  // Вкладка живёт в URL (?tab=), чтобы на неё можно было сослаться; replace — не
  // засоряем историю, иначе нативная «Назад» в Telegram ходила бы по вкладкам
  const selectTab = (next: AdminTaskTab) =>
    setSearchParams(next === 'review' ? {} : { tab: next }, { replace: true });

  const tabLabel = (value: AdminTaskTab) =>
    value === 'review' && summary.pending > 0
      ? `${t('admin.rewardTasks.tabs.review')} (${summary.pending})`
      : t(`admin.rewardTasks.tabs.${value}`);

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center gap-3">
        <AdminBackButton />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-dark-100 sm:text-2xl">
            {t('admin.rewardTasks.title')}
          </h1>
          <p className="text-sm text-dark-400">{t('admin.rewardTasks.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label={t('admin.rewardTasks.stats.pending')}
          value={summary.pending}
          icon={<ClockIcon className="h-5 w-5" />}
          tone="warning"
          loading={isLoading}
        />
        <StatCard
          label={t('admin.rewardTasks.stats.activeTasks')}
          value={summary.active}
          icon={<CalendarStarIcon className="h-5 w-5" />}
          tone="accent"
          loading={isLoading}
        />
        <div className="col-span-2 sm:col-span-1">
          <StatCard
            label={t('admin.rewardTasks.stats.approved')}
            value={summary.approved}
            icon={<CheckCircleIcon className="h-5 w-5" />}
            tone="success"
            loading={isLoading}
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto" role="tablist">
        {ADMIN_TASK_TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => selectTab(value)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === value
                ? 'bg-accent-500 text-on-accent'
                : 'bg-dark-800/40 text-dark-400 hover:bg-dark-700/50 hover:text-dark-200'
            }`}
          >
            {tabLabel(value)}
          </button>
        ))}
      </div>

      {tab === 'review' && (
        <ReviewQueue
          tasks={tasks}
          canApprove={canApprove}
          canReject={canReject}
          canOpenUser={canOpenUser}
        />
      )}
      {tab === 'tasks' && (
        <TasksManager tasks={tasks} isLoading={isLoading} isError={isError} canEdit={canEdit} />
      )}
      {tab === 'history' && <SubmissionHistory tasks={tasks} canOpenUser={canOpenUser} />}
    </div>
  );
}
