import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../api/admin';
import { AdminBackButton } from '../components/admin';
import { SettingsIcon } from '@/components/icons';
import { toNumber } from '../utils/inputHelpers';
import { usePermissionStore } from '../store/permissions';

type NumberOrEmpty = number | '';

export default function AdminTicketSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManageModerators = usePermissionStore((state) =>
    state.hasPermission('tickets:moderators'),
  );
  const [newModeratorId, setNewModeratorId] = useState('');

  const {
    data: settings,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['ticket-settings'],
    queryFn: adminApi.getTicketSettings,
  });

  const { data: moderators } = useQuery({
    queryKey: ['ticket-moderators'],
    queryFn: adminApi.getTicketModerators,
    enabled: canManageModerators,
  });

  const { data: leaderboard } = useQuery({
    queryKey: ['ticket-leaderboard'],
    queryFn: () => adminApi.getTicketLeaderboard(15),
  });

  const addModeratorMutation = useMutation({
    mutationFn: (telegramId: number) => adminApi.addTicketModerator(telegramId),
    onSuccess: () => {
      setNewModeratorId('');
      queryClient.invalidateQueries({ queryKey: ['ticket-moderators'] });
    },
  });

  const removeModeratorMutation = useMutation({
    mutationFn: (telegramId: number) => adminApi.removeTicketModerator(telegramId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-moderators'] });
    },
  });

  const [formData, setFormData] = useState<{
    sla_enabled: boolean;
    sla_minutes: NumberOrEmpty;
    sla_check_interval_seconds: NumberOrEmpty;
    sla_reminder_cooldown_minutes: NumberOrEmpty;
    support_system_mode: string;
    cabinet_user_notifications_enabled: boolean;
    cabinet_admin_notifications_enabled: boolean;
  }>({
    sla_enabled: true,
    sla_minutes: 5,
    sla_check_interval_seconds: 60,
    sla_reminder_cooldown_minutes: 15,
    support_system_mode: 'both',
    cabinet_user_notifications_enabled: true,
    cabinet_admin_notifications_enabled: true,
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        sla_enabled: settings.sla_enabled,
        sla_minutes: settings.sla_minutes,
        sla_check_interval_seconds: settings.sla_check_interval_seconds,
        sla_reminder_cooldown_minutes: settings.sla_reminder_cooldown_minutes,
        support_system_mode: settings.support_system_mode,
        cabinet_user_notifications_enabled: settings.cabinet_user_notifications_enabled ?? true,
        cabinet_admin_notifications_enabled: settings.cabinet_admin_notifications_enabled ?? true,
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: adminApi.updateTicketSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-settings'] });
      navigate('/admin/tickets');
    },
  });

  // Validation
  const isSlaMinutesValid =
    formData.sla_minutes !== '' && formData.sla_minutes >= 1 && formData.sla_minutes <= 1440;
  const isCheckIntervalValid =
    formData.sla_check_interval_seconds !== '' &&
    formData.sla_check_interval_seconds >= 30 &&
    formData.sla_check_interval_seconds <= 600;
  const isReminderCooldownValid =
    formData.sla_reminder_cooldown_minutes !== '' &&
    formData.sla_reminder_cooldown_minutes >= 1 &&
    formData.sla_reminder_cooldown_minutes <= 120;
  const isValid =
    !formData.sla_enabled || (isSlaMinutesValid && isCheckIntervalValid && isReminderCooldownValid);

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!isValid) return;
    updateMutation.mutate({
      ...formData,
      sla_minutes: toNumber(formData.sla_minutes, 5),
      sla_check_interval_seconds: toNumber(formData.sla_check_interval_seconds, 60),
      sla_reminder_cooldown_minutes: toNumber(formData.sla_reminder_cooldown_minutes, 15),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-fade-in">
        <div className="mb-6 flex items-center gap-3">
          <AdminBackButton to="/admin/tickets" />
          <h1 className="text-xl font-semibold text-dark-100">{t('admin.tickets.settings')}</h1>
        </div>
        <div className="rounded-xl border border-error-500/30 bg-error-500/10 p-6 text-center">
          <p className="text-error-400">{t('admin.tickets.settingsLoadError')}</p>
          <button
            onClick={() => navigate('/admin/tickets')}
            className="mt-4 text-sm text-dark-400 hover:text-dark-200"
          >
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <AdminBackButton to="/admin/tickets" />
        <div className="rounded-lg bg-accent-500/20 p-2 text-accent-400">
          <SettingsIcon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-dark-100">{t('admin.tickets.settings')}</h1>
          <p className="text-sm text-dark-400">{t('admin.tickets.settingsSubtitle')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Support System Mode */}
        <div className="card">
          <h3 className="mb-4 text-lg font-semibold text-dark-100">
            {t('admin.tickets.supportMode')}
          </h3>
          <select
            value={formData.support_system_mode}
            onChange={(e) => setFormData({ ...formData, support_system_mode: e.target.value })}
            className="input"
          >
            <option value="both">{t('admin.tickets.modeBoth')}</option>
            <option value="tickets">{t('admin.tickets.modeTickets')}</option>
            <option value="contact">{t('admin.tickets.modeContact')}</option>
          </select>
          <p className="mt-2 text-sm text-dark-500">{t('admin.tickets.supportModeDesc')}</p>
        </div>

        {/* Cabinet Notifications */}
        <div className="card">
          <h3 className="mb-4 text-lg font-semibold text-dark-100">
            {t('admin.tickets.cabinetNotifications')}
          </h3>

          {/* User Notifications */}
          <div className="mb-4">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={formData.cabinet_user_notifications_enabled}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    cabinet_user_notifications_enabled: e.target.checked,
                  })
                }
                className="h-5 w-5 rounded border-dark-700 bg-dark-800 text-accent-500 focus:ring-2 focus:ring-accent-500 focus:ring-offset-0"
              />
              <div>
                <div className="font-medium text-dark-100">
                  {t('admin.tickets.userNotificationsEnabled')}
                </div>
                <div className="text-sm text-dark-500">
                  {t('admin.tickets.userNotificationsEnabledDesc')}
                </div>
              </div>
            </label>
          </div>

          {/* Admin Notifications */}
          <div>
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={formData.cabinet_admin_notifications_enabled}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    cabinet_admin_notifications_enabled: e.target.checked,
                  })
                }
                className="h-5 w-5 rounded border-dark-700 bg-dark-800 text-accent-500 focus:ring-2 focus:ring-accent-500 focus:ring-offset-0"
              />
              <div>
                <div className="font-medium text-dark-100">
                  {t('admin.tickets.adminNotificationsEnabled')}
                </div>
                <div className="text-sm text-dark-500">
                  {t('admin.tickets.adminNotificationsEnabledDesc')}
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* SLA Settings */}
        <div className="card">
          <h3 className="mb-4 text-lg font-semibold text-dark-100">
            {t('admin.tickets.slaSettings')}
          </h3>

          {/* SLA Enabled */}
          <div className="mb-6">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={formData.sla_enabled}
                onChange={(e) => setFormData({ ...formData, sla_enabled: e.target.checked })}
                className="h-5 w-5 rounded border-dark-700 bg-dark-800 text-accent-500 focus:ring-2 focus:ring-accent-500 focus:ring-offset-0"
              />
              <div>
                <div className="font-medium text-dark-100">{t('admin.tickets.slaEnabled')}</div>
                <div className="text-sm text-dark-500">{t('admin.tickets.slaEnabledDesc')}</div>
              </div>
            </label>
          </div>

          {/* SLA Minutes */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-dark-300">
              {t('admin.tickets.slaMinutes')}
            </label>
            <input
              type="number"
              min={1}
              max={1440}
              value={formData.sla_minutes}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') return setFormData({ ...formData, sla_minutes: '' });
                const num = parseInt(val);
                if (!isNaN(num)) setFormData({ ...formData, sla_minutes: num });
              }}
              className={`input ${formData.sla_enabled && !isSlaMinutesValid && formData.sla_minutes !== '' ? 'border-error-500/50' : ''}`}
              disabled={!formData.sla_enabled}
            />
            {formData.sla_enabled && formData.sla_minutes !== '' && !isSlaMinutesValid && (
              <p className="mt-1 text-xs text-error-400">
                {t('admin.tickets.validation.slaMinutesRange')}
              </p>
            )}
            <p className="mt-1 text-xs text-dark-500">{t('admin.tickets.slaMinutesDesc')}</p>
          </div>

          {/* Check Interval */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-dark-300">
              {t('admin.tickets.checkInterval')}
            </label>
            <input
              type="number"
              min={30}
              max={600}
              value={formData.sla_check_interval_seconds}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') return setFormData({ ...formData, sla_check_interval_seconds: '' });
                const num = parseInt(val);
                if (!isNaN(num)) setFormData({ ...formData, sla_check_interval_seconds: num });
              }}
              className={`input ${formData.sla_enabled && !isCheckIntervalValid && formData.sla_check_interval_seconds !== '' ? 'border-error-500/50' : ''}`}
              disabled={!formData.sla_enabled}
            />
            {formData.sla_enabled &&
              formData.sla_check_interval_seconds !== '' &&
              !isCheckIntervalValid && (
                <p className="mt-1 text-xs text-error-400">
                  {t('admin.tickets.validation.checkIntervalRange')}
                </p>
              )}
            <p className="mt-1 text-xs text-dark-500">{t('admin.tickets.checkIntervalDesc')}</p>
          </div>

          {/* Reminder Cooldown */}
          <div>
            <label className="mb-2 block text-sm font-medium text-dark-300">
              {t('admin.tickets.reminderCooldown')}
            </label>
            <input
              type="number"
              min={1}
              max={120}
              value={formData.sla_reminder_cooldown_minutes}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '')
                  return setFormData({ ...formData, sla_reminder_cooldown_minutes: '' });
                const num = parseInt(val);
                if (!isNaN(num)) setFormData({ ...formData, sla_reminder_cooldown_minutes: num });
              }}
              className={`input ${formData.sla_enabled && !isReminderCooldownValid && formData.sla_reminder_cooldown_minutes !== '' ? 'border-error-500/50' : ''}`}
              disabled={!formData.sla_enabled}
            />
            {formData.sla_enabled &&
              formData.sla_reminder_cooldown_minutes !== '' &&
              !isReminderCooldownValid && (
                <p className="mt-1 text-xs text-error-400">
                  {t('admin.tickets.validation.reminderCooldownRange')}
                </p>
              )}
            <p className="mt-1 text-xs text-dark-500">{t('admin.tickets.reminderCooldownDesc')}</p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin/tickets')}
            className="btn-secondary"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={!isValid || updateMutation.isPending}
            className="btn-primary"
          >
            {updateMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                {t('common.saving')}
              </span>
            ) : (
              t('common.save')
            )}
          </button>
        </div>

        {updateMutation.isError && (
          <div className="rounded-lg border border-error-500/30 bg-error-500/10 p-3 text-sm text-error-400">
            {t('admin.tickets.settingsUpdateError')}
          </div>
        )}
      </form>

      {/* Модераторы поддержки (только с правом tickets:moderators) */}
      {canManageModerators && (
        <div className="card mt-6">
          <h3 className="mb-2 text-lg font-semibold text-dark-100">
            {t('admin.tickets.moderatorsTitle', '🧑‍⚖️ Модераторы поддержки')}
          </h3>
          <p className="mb-4 text-sm text-dark-500">
            {t(
              'admin.tickets.moderatorsDesc',
              'Модераторы видят тикеты в боте и получают личные уведомления о новых обращениях.',
            )}
          </p>

          <div className="mb-4 flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={newModeratorId}
              onChange={(e) => setNewModeratorId(e.target.value.replace(/\D/g, ''))}
              placeholder={t('admin.tickets.moderatorIdPlaceholder', 'Telegram ID')}
              className="input flex-1"
            />
            <button
              type="button"
              onClick={() => {
                const id = parseInt(newModeratorId, 10);
                if (id > 0) addModeratorMutation.mutate(id);
              }}
              disabled={!newModeratorId || addModeratorMutation.isPending}
              className="btn-primary"
            >
              {t('admin.tickets.addModerator', 'Добавить')}
            </button>
          </div>

          {addModeratorMutation.isError && (
            <div className="mb-3 rounded-lg border border-error-500/30 bg-error-500/10 p-3 text-sm text-error-400">
              {t('admin.tickets.moderatorAddError', 'Не удалось добавить модератора')}
            </div>
          )}

          {!moderators?.length ? (
            <div className="py-4 text-center text-sm text-dark-500">
              {t('admin.tickets.noModerators', 'Модераторов пока нет')}
            </div>
          ) : (
            <div className="space-y-2">
              {moderators.map((mod) => (
                <div
                  key={mod.telegram_id}
                  className="flex items-center justify-between rounded-xl border border-dark-700/50 bg-dark-800/30 px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-medium text-dark-100">
                      {mod.user
                        ? `${mod.user.first_name || ''} ${mod.user.last_name || ''}`.trim() ||
                          (mod.user.username ? `@${mod.user.username}` : mod.telegram_id)
                        : mod.telegram_id}
                      <span className="ml-2 text-xs text-dark-500">({mod.telegram_id})</span>
                    </div>
                    <div className="text-xs text-dark-500">
                      {t('admin.tickets.moderatorClosed', 'Закрыто тикетов')}: {mod.closed_count}
                      {mod.rank ? ` · ${mod.rank}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeModeratorMutation.mutate(mod.telegram_id)}
                    disabled={removeModeratorMutation.isPending}
                    className="rounded-lg border border-error-500/30 px-3 py-1.5 text-xs text-error-400 transition-colors hover:bg-error-500/10 disabled:opacity-50"
                  >
                    {t('common.delete', 'Удалить')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Рейтинг модераторов */}
      <div className="card mt-6">
        <h3 className="mb-4 text-lg font-semibold text-dark-100">
          {t('admin.tickets.leaderboardTitle', '🏆 Рейтинг модераторов')}
        </h3>
        {!leaderboard?.length ? (
          <div className="py-4 text-center text-sm text-dark-500">
            {t('admin.tickets.leaderboardEmpty', 'Пока никто не закрыл ни одного тикета')}
          </div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, idx) => (
              <div
                key={`${entry.telegram_id ?? 'u'}_${idx}`}
                className="flex items-center justify-between rounded-xl border border-dark-700/50 bg-dark-800/30 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 text-center text-lg">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-dark-100">{entry.display}</div>
                    <div className="text-xs text-dark-500">{entry.rank}</div>
                  </div>
                </div>
                <span className="text-sm font-semibold text-accent-400">{entry.closed}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
