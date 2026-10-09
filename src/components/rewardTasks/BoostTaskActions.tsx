import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { CheckIcon, ClockIcon, RestartIcon, RocketIcon } from '@/components/icons';
import { Button } from '@/components/primitives';
import { useToast } from '@/components/Toast';

import { rewardTasksApi, type RewardTask, type RewardTasksResponse } from '../../api/rewardTasks';
import {
  describeUserTaskError,
  parseRewardTaskError,
  shouldLeaveTasksPage,
  STALE_TASK_ERROR_CODES,
  withTaskStatus,
  type RewardTaskError,
} from '../../utils/rewardTasks';
import { TaskLinkButton } from './TaskLinkButton';
import { useLeaveTasksPage } from './useLeaveTasksPage';
import { useTaskErrorText } from './useTaskErrorText';

// Бэкенд пускает 5 проверок в минуту; 15 с между нажатиями держат нас под лимитом
const CHECK_COOLDOWN_SECONDS = 15;
const RATE_LIMITED_COOLDOWN_SECONDS = 60;

export function BoostTaskActions({ task }: { task: RewardTask }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const errorText = useTaskErrorText();
  const leavePage = useLeaveTasksPage();
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<RewardTaskError | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const checkMutation = useMutation({
    mutationFn: () => rewardTasksApi.checkBoost(task.id),
    onSuccess: (result) => {
      setCooldown(CHECK_COOLDOWN_SECONDS);
      // По контракту успех — всегда completed: true; иначе не обещаем дни зря
      if (!result.completed) {
        setError({
          status: 200,
          code: 'not_enough_boosts',
          message: null,
          found: null,
          required: null,
        });
        return;
      }
      setError(null);
      showToast({
        type: 'success',
        message: t('rewardTasks.boost.success', {
          days: t('rewardTasks.days', { count: result.reward_days || task.reward_days }),
        }),
      });
      queryClient.setQueryData<RewardTasksResponse>(['reward-tasks'], (prev) =>
        withTaskStatus(prev, task.id, 'completed'),
      );
      queryClient.invalidateQueries({ queryKey: ['reward-tasks'] });
      // Дни уже на подписке — главная и список подписок должны это показать
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
    },
    onError: (err: unknown) => {
      const parsed = parseRewardTaskError(err);
      // Раздел скрыли, пока страница была открыта, — уходим, как и со списка
      if (shouldLeaveTasksPage(parsed, 'action')) {
        leavePage();
        return;
      }
      setError(parsed);
      setCooldown(
        parsed.code === 'rate_limited' ? RATE_LIMITED_COOLDOWN_SECONDS : CHECK_COOLDOWN_SECONDS,
      );
      if (parsed.code && STALE_TASK_ERROR_CODES.includes(parsed.code)) {
        queryClient.invalidateQueries({ queryKey: ['reward-tasks'] });
      }
    },
  });

  // Кнопка проверки — 3 состояния, как на экране обязательной подписки на канал
  let checkIcon: ReactNode;
  let checkLabel: string;
  if (checkMutation.isPending) {
    checkIcon = <RestartIcon className="h-5 w-5 animate-spin" />;
    checkLabel = t('rewardTasks.boost.checking');
  } else if (cooldown > 0) {
    checkIcon = <ClockIcon className="h-5 w-5" />;
    checkLabel = t('rewardTasks.boost.wait', { seconds: cooldown });
  } else {
    checkIcon = <CheckIcon className="h-5 w-5" />;
    checkLabel = t('rewardTasks.boost.check');
  }

  return (
    <div className="space-y-2">
      <TaskLinkButton
        url={task.action_url}
        label={t('rewardTasks.boost.open')}
        icon={<RocketIcon className="h-5 w-5" />}
      />
      <Button
        fullWidth
        size="lg"
        onClick={() => checkMutation.mutate()}
        disabled={checkMutation.isPending || cooldown > 0}
        leftIcon={checkIcon}
      >
        {checkLabel}
      </Button>
      <p className="text-xs text-dark-500">
        {t('rewardTasks.boost.hint', { required: task.min_boosts })}
      </p>
      {error && (
        <div
          role="alert"
          className="space-y-2 rounded-xl border border-error-500/30 bg-error-500/10 p-3 text-sm text-error-400"
        >
          <p>{errorText(describeUserTaskError(error))}</p>
          {error.code === 'telegram_required' && (
            <Link to="/profile/accounts" className="inline-block font-medium underline">
              {t('rewardTasks.linkTelegram')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
