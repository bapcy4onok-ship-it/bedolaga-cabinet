import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { brandingApi } from '@/api/branding';
import { referralApi } from '@/api/referral';
import { wheelApi } from '@/api/wheel';
import { contestsApi } from '@/api/contests';
import { pollsApi } from '@/api/polls';
import { rewardTasksApi } from '@/api/rewardTasks';

// Последние известные значения флагов. Пока запросы в полёте, флаги были
// undefined -> табы «Рефералы»/«Колесо» появлялись с задержкой и нижняя
// навигация прыгала на каждом холодном старте. Кэш убирает layout shift;
// при изменении флага на бэке UI догонит после ответа запроса.
const FLAGS_CACHE_KEY = 'cabinet-feature-flags';

type CachedFlags = {
  referralEnabled?: boolean;
  wheelEnabled?: boolean;
  hasContests?: boolean;
  hasPolls?: boolean;
  giftEnabled?: boolean;
  hasRewardTasks?: boolean;
};

function readFlagsCache(): CachedFlags {
  try {
    return JSON.parse(localStorage.getItem(FLAGS_CACHE_KEY) || '{}') as CachedFlags;
  } catch {
    return {};
  }
}

export function useFeatureFlags() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const cached = readFlagsCache();

  const { data: referralTerms } = useQuery({
    queryKey: ['referral-terms'],
    queryFn: referralApi.getReferralTerms,
    enabled: isAuthenticated,
    staleTime: 60000,
    retry: false,
  });

  const { data: wheelConfig } = useQuery({
    queryKey: ['wheel-config'],
    queryFn: wheelApi.getConfig,
    enabled: isAuthenticated,
    staleTime: 60000,
    retry: false,
  });

  const { data: contestsCount } = useQuery({
    queryKey: ['contests-count'],
    queryFn: contestsApi.getCount,
    enabled: isAuthenticated,
    staleTime: 60000,
    retry: false,
  });

  const { data: pollsCount } = useQuery({
    queryKey: ['polls-count'],
    queryFn: pollsApi.getCount,
    enabled: isAuthenticated,
    staleTime: 60000,
    retry: false,
  });

  const { data: giftConfig } = useQuery({
    queryKey: ['gift-enabled'],
    queryFn: brandingApi.getGiftEnabled,
    enabled: isAuthenticated,
    staleTime: 60000,
    retry: false,
  });

  const { data: rewardTasksCount } = useQuery({
    queryKey: ['reward-tasks-count'],
    queryFn: rewardTasksApi.getCount,
    enabled: isAuthenticated,
    staleTime: 60000,
    retry: false,
  });

  const flags = {
    referralEnabled: referralTerms ? referralTerms.is_enabled : cached.referralEnabled,
    wheelEnabled: wheelConfig ? wheelConfig.is_enabled : cached.wheelEnabled,
    hasContests: contestsCount ? contestsCount.count > 0 : cached.hasContests,
    hasPolls: pollsCount ? pollsCount.count > 0 : cached.hasPolls,
    giftEnabled: giftConfig ? giftConfig.enabled : cached.giftEnabled,
    // Без кэша из localStorage: раздел могли скрыть (подписку отключили, задания
    // оставили только админам), и баннер с пунктом меню мелькнули бы до ответа счётчика.
    hasRewardTasks: rewardTasksCount ? rewardTasksCount.count > 0 : false,
  };

  // Пишем кэш, только когда пришёл хотя бы один ответ, и только при смене
  // значений флагов: зависимость — сериализованные флаги, а не объект.
  const anyLoaded = Boolean(
    referralTerms || wheelConfig || contestsCount || pollsCount || giftConfig || rewardTasksCount,
  );
  const serializedFlags = JSON.stringify(flags);

  useEffect(() => {
    if (!anyLoaded) return;
    try {
      localStorage.setItem(FLAGS_CACHE_KEY, serializedFlags);
    } catch {
      // квоты/приватный режим — некритично
    }
  }, [anyLoaded, serializedFlags]);

  return flags;
}
