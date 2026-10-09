import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { CalendarStarIcon, ChatIcon } from '@/components/icons';
import { Button } from '@/components/primitives';

import { rewardTasksApi } from '../api/rewardTasks';
import { subscriptionApi } from '../api/subscription';
import { RewardTaskCard, useLeaveTasksPage } from '../components/rewardTasks';
import {
  getIneligibleNotice,
  parseRewardTaskError,
  retryRewardTasksOverview,
  shouldLeaveTasksPage,
  needsTelegramForBoost,
} from '../utils/rewardTasks';

// Одна колонка с ограниченной шириной и на десктопе: заданий единицы, порядок
// задаёт админ (sort_order), а карточки раскрываются на месте (форма отчёта,
// ошибки). Колонки-«masonry» перекладывали бы карточки между столбцами и путали
// порядок чтения, сетка — растягивала бы соседнюю карточку под открытую форму.
const PAGE_CLASS = 'mx-auto max-w-2xl space-y-6';

export default function RewardTasks() {
  const { t } = useTranslation();
  const leavePage = useLeaveTasksPage();

  const { data, error, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['reward-tasks'],
    queryFn: rewardTasksApi.getTasks,
    retry: retryRewardTasksOverview,
  });

  // Раздел от пользователя скрыт (сюда ведут и старые ссылки, и startapp=tasks):
  // страницы для него нет — уходим на главную, не показывая ни ошибку, ни карточки
  const hidden = isError && shouldLeaveTasksPage(parseRewardTaskError(error), 'overview');
  useEffect(() => {
    if (hidden) leavePage();
  }, [hidden, leavePage]);

  const notice = data ? getIneligibleNotice(data) : null;

  // Кнопку триала показываем, только если триал реально доступен (тот же запрос,
  // что на главной). Ограниченным и отключённым покупка не поможет — не спрашиваем.
  const { data: trialInfo } = useQuery({
    queryKey: ['trial-info'],
    queryFn: () => subscriptionApi.getTrialInfo(),
    enabled: notice?.action === 'subscribe',
    retry: false,
  });

  // Пока уходим, держим тот же спиннер, что и при загрузке, — без мигания
  if (isLoading || hidden) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={PAGE_CLASS}>
        <div className="card space-y-4 border-error-500/20 bg-error-500/10 text-center">
          <p className="text-error-400">{t('rewardTasks.loadError')}</p>
          <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>
            {t('common.retry')}
          </Button>
        </div>
      </div>
    );
  }

  const trialAvailable = notice?.action === 'subscribe' && trialInfo?.is_available === true;

  return (
    <div className={PAGE_CLASS}>
      <div>
        <div className="flex items-center gap-3">
          <CalendarStarIcon className="h-6 w-6 text-accent-400" />
          <h1 className="text-2xl font-bold text-dark-50 sm:text-3xl">{t('rewardTasks.title')}</h1>
        </div>
        <p className="mt-1 text-sm text-dark-400">{t('rewardTasks.subtitle')}</p>
      </div>

      {notice && (
        <div className="rounded-2xl border border-warning-500/30 bg-warning-500/10 p-4">
          <h2 className="font-semibold text-warning-400">
            {t(`rewardTasks.ineligible.${notice.reason}.title`)}
          </h2>
          <p className="mt-1 text-sm text-dark-300">
            {t(`rewardTasks.ineligible.${notice.reason}.text`)}
          </p>
          {/* Ссылки — тот же Button, что и действия в карточках (asChild → <a> роутера) */}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {notice.action === 'support' ? (
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link to="/support">
                  <ChatIcon className="h-5 w-5 shrink-0" />
                  {t('rewardTasks.ineligible.support')}
                </Link>
              </Button>
            ) : (
              <>
                {trialAvailable && (
                  <Button asChild size="lg" className="w-full sm:w-auto">
                    <Link to="/">{t('rewardTasks.ineligible.trial')}</Link>
                  </Button>
                )}
                <Button
                  asChild
                  size="lg"
                  variant={trialAvailable ? 'secondary' : 'primary'}
                  className="w-full sm:w-auto"
                >
                  <Link to="/subscription/purchase">{t('rewardTasks.ineligible.buy')}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {data.tasks.length > 0 ? (
        <div className="space-y-4">
          {data.tasks.map((task) => (
            <RewardTaskCard
              key={task.id}
              task={task}
              eligible={data.eligible}
              ineligibleReason={notice?.reason ?? null}
              needsTelegram={needsTelegramForBoost(data)}
            />
          ))}
        </div>
      ) : (
        <div className="card py-12 text-center">
          <CalendarStarIcon className="mx-auto h-8 w-8 text-dark-500" />
          <p className="mt-4 text-dark-400">{t('rewardTasks.empty')}</p>
        </div>
      )}

      {/* Запас под плавающую кнопку «Поддержать проект» (fixed, 96px + safe-area от
          низа на мобильных, 32px на десктопе), иначе она закрывает кнопку последней
          карточки. Вместе с отступом space-y-6 и pb-28/lg:pb-8 у main контент
          кончается на ~16px выше кнопки. */}
      <div aria-hidden="true" className="h-[calc(2rem+env(safe-area-inset-bottom,0px))] lg:h-12" />
    </div>
  );
}
