import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useHaptic } from '@/platform';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/primitives/Dialog';
import { useCurrency } from '../hooks/useCurrency';

interface DonationUpsellDialogProps {
  open: boolean;
  /** Сумма пополнения в копейках — надбавка добавляется к ней. */
  topupKopeks: number;
  tipKopeks: number;
  presetsKopeks: number[];
  maxTipKopeks: number;
  /** tipKopeks = 0 — пользователь отказался. Диалог всегда завершает оплату. */
  onDecide: (tipKopeks: number) => void;
}

/**
 * «Добавить к платежу N ₽ в пользу проекта?» — показывается между вводом суммы
 * и созданием платежа. Стиль намеренно повторяет попап SupportProjectButton:
 * тот же rose→pink градиент и бейдж badge-donation, чтобы оба обращения за
 * поддержкой читались как одно и то же.
 *
 * Диалог нельзя «закрыть в никуда»: любой выход — это решение, и оплата
 * продолжается в любом случае (закрытие = отказ).
 */
export default function DonationUpsellDialog({
  open,
  topupKopeks,
  tipKopeks,
  presetsKopeks,
  maxTipKopeks,
  onDecide,
}: DonationUpsellDialogProps) {
  const { t } = useTranslation();
  const haptic = useHaptic();
  const { formatWithCurrency } = useCurrency();
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  const rub = (kopeks: number) => formatWithCurrency(kopeks / 100);

  const decide = (tip: number) => {
    haptic.impact(tip > 0 ? 'medium' : 'light');
    onDecide(tip);
  };

  const submitCustom = () => {
    const parsed = Math.round(parseFloat(customValue.replace(',', '.')) * 100);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > maxTipKopeks) {
      setCustomError(t('donationUpsell.customInvalid', { max: rub(maxTipKopeks) }));
      return;
    }
    decide(parsed);
  };

  const availablePresets = presetsKopeks.filter((preset) => preset <= maxTipKopeks);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && decide(0)}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-center sm:text-center">
          <div
            className="mx-auto mb-1 flex h-16 w-16 items-center justify-center rounded-full text-3xl"
            style={{
              background:
                'linear-gradient(135deg, rgba(244,63,94,0.18) 0%, rgba(236,72,153,0.18) 100%)',
            }}
          >
            ⚡
          </div>
          <DialogTitle className="text-center text-xl">{t('donationUpsell.title')}</DialogTitle>
          <div className="flex justify-center pt-1">
            <span className="badge-donation">{t('donationUpsell.badge')}</span>
          </div>
          <DialogDescription className="pt-2 text-center text-[15px] leading-relaxed text-dark-300">
            {t('donationUpsell.description', { tip: rub(tipKopeks) })}
          </DialogDescription>
        </DialogHeader>

        {customOpen ? (
          <div className="space-y-3">
            {availablePresets.length > 0 && (
              <div className="flex gap-2">
                {availablePresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => decide(preset)}
                    className="flex-1 rounded-xl border border-dark-700/40 bg-dark-800/40 py-3 text-sm font-semibold"
                  >
                    {rub(preset)}
                  </button>
                ))}
              </div>
            )}
            <input
              type="number"
              inputMode="decimal"
              value={customValue}
              onChange={(event) => {
                setCustomValue(event.target.value);
                setCustomError(null);
              }}
              placeholder={t('donationUpsell.customPlaceholder')}
              className="w-full rounded-xl border border-dark-700/40 bg-dark-800/40 px-4 py-3 text-base"
            />
            {customError && <div className="text-sm text-error-400">{customError}</div>}
            <button
              type="button"
              onClick={submitCustom}
              className="h-12 w-full rounded-2xl text-base font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #f43f5e 0%, #ec4899 100%)' }}
            >
              {t('donationUpsell.confirmCustom')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => decide(tipKopeks)}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold text-white transition-transform active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #f43f5e 0%, #ec4899 100%)',
              boxShadow: '0 8px 24px rgba(244, 63, 94, 0.3)',
            }}
          >
            <span className="text-xl leading-none">⚡</span>
            <span>{t('donationUpsell.accept', { total: rub(topupKopeks + tipKopeks) })}</span>
          </button>
        )}

        <div className="flex items-center justify-between pt-1 text-sm">
          <button
            type="button"
            onClick={() => setCustomOpen((value) => !value)}
            className="text-dark-300 underline-offset-2 hover:underline"
          >
            {t('donationUpsell.otherAmount')}
          </button>
          <button type="button" onClick={() => decide(0)} className="text-dark-300 hover:underline">
            {t('donationUpsell.decline')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
