import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';

import type { RewardTasksCountResponse } from '../../api/rewardTasks';

/**
 * Раздел «Задания» от пользователя скрыт (см. shouldLeaveTasksPage): уходим на
 * главную, заменяя /tasks в истории — «Назад» не вернёт на страницу, которой для
 * него нет. Без тоста: пользователю нечего объяснять.
 *
 * Пункт меню и баннер на главной прячем сразу (count = 0), не дожидаясь повторного
 * запроса счётчика, — иначе по ним можно снова попасть сюда. Кэш списка удаляем:
 * повторный заход по старой ссылке не покажет прежние карточки, пока идёт запрос.
 */
export function useLeaveTasksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.setQueryData<RewardTasksCountResponse>(['reward-tasks-count'], { count: 0 });
    queryClient.removeQueries({ queryKey: ['reward-tasks'], exact: true });
    navigate('/', { replace: true });
  }, [navigate, queryClient]);
}
