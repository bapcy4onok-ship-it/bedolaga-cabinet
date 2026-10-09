import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { useToast } from '@/components/Toast';
import { useNativeDialog } from '@/platform';
import { usePrompt } from '@/store/promptDialog';

import {
  adminRewardTasksApi,
  type AdminRewardTask,
  type RewardBulkResultItem,
} from '../../../api/rewardTasks';
import {
  describeBulkError,
  describeBulkRequestError,
  getSelectionState,
  pageCount,
  pruneItemErrors,
  pruneSelected,
  REWARD_TASK_LIMITS,
  rewardTaskErrorMessage,
  runChunkedBulk,
  splitBulkResults,
  toggleAllSelected,
  toggleSelected,
  type BulkProgress,
  type ChunkedBulkOutcome,
} from '../../../utils/rewardTasks';
import { useTaskErrorText } from '../../rewardTasks/useTaskErrorText';
import { Pager, SelectBox, TaskFilterSelect } from './ListControls';
import { REJECT_PROMPT_OPTIONS } from './rejectPrompt';
import { ReviewActionBar } from './ReviewActionBar';
import { SubmissionCard } from './SubmissionCard';

// Дефолт бэкенда; выбор действует в пределах страницы, а на сервер он уходит
// пачками по REWARD_BULK_CHUNK_SIZE (см. runChunkedBulk)
const PAGE_SIZE = 50;

interface ReviewQueueProps {
  tasks: AdminRewardTask[];
  canApprove: boolean;
  canReject: boolean;
  canOpenUser: boolean;
}

/** Вкладка «На проверке»: отчёты с превью, выбор карточек, массовое одобрение/отклонение. */
export function ReviewQueue({ tasks, canApprove, canReject, canOpenUser }: ReviewQueueProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const prompt = usePrompt();
  const { confirm } = useNativeDialog();
  const errorText = useTaskErrorText();

  const [taskId, setTaskId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [itemErrors, setItemErrors] = useState<Map<number, string | null>>(() => new Map());
  const [progress, setProgress] = useState<BulkProgress | null>(null);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['admin-reward-task-submissions', 'pending', taskId, page],
    queryFn: () =>
      adminRewardTasksApi.getSubmissions({
        status: 'pending',
        task_id: taskId ?? undefined,
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const visibleIds = useMemo(() => items.map((item) => item.id), [items]);
  const pages = pageCount(data?.total ?? 0, PAGE_SIZE);

  // Одобренные/отклонённые отчёты уходят из очереди — выбор и ошибки чистим вслед за списком
  useEffect(() => {
    setSelected((prev) => pruneSelected(prev, visibleIds));
    setItemErrors((prev) => pruneItemErrors(prev, visibleIds));
  }, [visibleIds]);

  // Последняя страница опустела после действий — переходим на предыдущую
  useEffect(() => {
    if (data && page > 0 && page >= pages) setPage(pages - 1);
  }, [data, page, pages]);

  const canAct = canApprove || canReject;
  const selectedIds = visibleIds.filter((id) => selected.has(id));
  const selectionState = getSelectionState(selected, visibleIds);

  const applyResults = (results: RewardBulkResultItem[], successKey: string) => {
    const { okIds, errors } = splitBulkResults(results);
    setItemErrors((prev) => {
      const next = new Map(prev);
      for (const id of okIds) next.delete(id);
      for (const [id, code] of errors) next.set(id, code);
      return next;
    });
    // Неудачные остаются выбранными — их можно повторить одним нажатием
    setSelected((prev) => new Set([...prev].filter((id) => !okIds.includes(id))));
    if (okIds.length > 0) {
      showToast({ type: 'success', message: t(successKey, { value: okIds.length }) });
    }
    if (errors.size > 0) {
      showToast({
        type: 'error',
        message: t('admin.rewardTasks.review.failedToast', { value: errors.size }),
      });
    }
  };

  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-reward-task-submissions'] });
    queryClient.invalidateQueries({ queryKey: ['admin-reward-tasks'] });
  };

  // Ответы всех пачек разносим по карточкам; если запрос пачки не прошёл, прогон
  // остановлен — говорим, сколько успели, остальные отчёты остаются выбранными
  const finishRun = (outcome: ChunkedBulkOutcome, successKey: string) => {
    applyResults(outcome.results, successKey);
    if (outcome.failure) {
      showToast({
        type: 'error',
        duration: 10000,
        title: t('admin.rewardTasks.review.stoppedTitle', {
          done: outcome.processed,
          total: outcome.total,
        }),
        message: errorText(describeBulkRequestError(outcome.failure.error)),
      });
    }
  };

  const settleRun = () => {
    setProgress(null);
    refreshLists();
  };

  const approveMutation = useMutation({
    mutationFn: (ids: number[]) => runChunkedBulk(ids, adminRewardTasksApi.approve, setProgress),
    onSuccess: (outcome) => finishRun(outcome, 'admin.rewardTasks.review.approvedToast'),
    onError: (err: unknown) =>
      showToast({ type: 'error', message: rewardTaskErrorMessage(err, t('common.error')) }),
    onSettled: settleRun,
  });

  const rejectMutation = useMutation({
    mutationFn: ({ ids, reason }: { ids: number[]; reason: string }) =>
      runChunkedBulk(ids, (chunk) => adminRewardTasksApi.reject(chunk, reason), setProgress),
    onSuccess: (outcome) => finishRun(outcome, 'admin.rewardTasks.review.rejectedToast'),
    onError: (err: unknown) =>
      showToast({ type: 'error', message: rewardTaskErrorMessage(err, t('common.error')) }),
    onSettled: settleRun,
  });

  const busy = approveMutation.isPending || rejectMutation.isPending;

  const handleApprove = async () => {
    const ids = selectedIds;
    if (ids.length === 0 || busy) return;
    // Начисление дней не откатывается — подтверждаем явно
    const confirmed = await confirm(
      t('admin.rewardTasks.review.approveConfirm', { count: ids.length }),
    );
    if (confirmed) approveMutation.mutate(ids);
  };

  // Промпт сам обрезает пробелы и считает пустой ввод отменой; слишком длинную
  // причину возвращаем в поле, чтобы не перепечатывать. Причину видит пользователь,
  // поэтому поле многострочное, а кнопка — красная (REJECT_PROMPT_OPTIONS)
  const askRejectReason = async (count: number, initialValue = ''): Promise<string | null> => {
    const reason = await prompt({
      ...REJECT_PROMPT_OPTIONS,
      title: t('admin.rewardTasks.review.rejectTitle', { count }),
      label: t('admin.rewardTasks.review.rejectReason'),
      placeholder: t('admin.rewardTasks.review.rejectPlaceholder'),
      submitLabel: t('admin.rewardTasks.review.reject'),
      initialValue,
    });
    if (reason === null || reason.length <= REWARD_TASK_LIMITS.rejectReasonMax) return reason;
    showToast({
      type: 'error',
      message: t('admin.rewardTasks.review.reasonTooLong', {
        max: REWARD_TASK_LIMITS.rejectReasonMax,
      }),
    });
    return askRejectReason(count, reason);
  };

  const handleReject = async () => {
    const ids = selectedIds;
    if (ids.length === 0 || busy) return;
    const reason = await askRejectReason(ids.length);
    if (reason) rejectMutation.mutate({ ids, reason });
  };

  const handleTaskChange = (next: number | null) => {
    setTaskId(next);
    setPage(0);
  };

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
      <div className="py-12 text-center text-dark-400">{t('admin.rewardTasks.review.empty')}</div>
    );
  } else {
    content = (
      <div className="space-y-3">
        {items.map((item) => (
          <SubmissionCard
            key={item.id}
            submission={item}
            selectable={canAct}
            selected={selected.has(item.id)}
            onToggle={(id) => setSelected((prev) => toggleSelected(prev, id))}
            selectionLocked={busy}
            error={
              itemErrors.has(item.id) ? describeBulkError(itemErrors.get(item.id) ?? null) : null
            }
            canOpenUser={canOpenUser}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <TaskFilterSelect tasks={tasks} value={taskId} onChange={handleTaskChange} />
        {canAct && items.length > 0 && (
          <button
            type="button"
            onClick={() => setSelected((prev) => toggleAllSelected(prev, visibleIds))}
            disabled={busy}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-dark-700/50 bg-dark-800/40 px-3 text-sm text-dark-300 transition-colors hover:border-dark-600 hover:text-dark-100 disabled:opacity-50 sm:min-h-[38px]"
          >
            <SelectBox
              checked={selectionState === 'all'}
              indeterminate={selectionState === 'some'}
            />
            {selectionState === 'all'
              ? t('admin.rewardTasks.review.deselectAll')
              : t('admin.rewardTasks.review.selectAll')}
          </button>
        )}
        {isFetching && !isLoading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
        )}
      </div>

      {content}

      <Pager page={page} pages={pages} onChange={setPage} />

      {/* Запас под липкую панель, чтобы она не закрывала последнюю карточку */}
      {canAct && (selectedIds.length > 0 || busy) && <div className="h-20" />}

      {canAct &&
        createPortal(
          <ReviewActionBar
            count={selectedIds.length}
            canApprove={canApprove}
            canReject={canReject}
            approving={approveMutation.isPending}
            rejecting={rejectMutation.isPending}
            progress={progress}
            onApprove={handleApprove}
            onReject={handleReject}
            onClear={() => setSelected(new Set())}
          />,
          document.body,
        )}
    </div>
  );
}
