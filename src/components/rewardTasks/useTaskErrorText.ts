import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { RewardTaskErrorText } from '../../utils/rewardTasks';

/** Переводит описание ошибки заданий: ключ локали или готовый текст бэкенда. */
export function useTaskErrorText() {
  const { t } = useTranslation();
  return useCallback(
    (error: RewardTaskErrorText): string =>
      'text' in error ? error.text : t(error.key, error.values),
    [t],
  );
}
