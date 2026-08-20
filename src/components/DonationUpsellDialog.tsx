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

/** Меньше рубля надбавка не имеет смысла — и ломает сверку обещания по сумме. */
const MIN_TIP_KOPEKS = 100;

interface DonationUpsellDialogProps {
  open: boolean;
  /** Сумма пополнения в копейках — надбавка добавляется к ней. */
  topupKopeks: number;
  tipKopeks: number;
  presetsKopeks: number[];
  maxTipKopeks: number;
  /** tipKopeks = 0 — пользователь отказался: оплата продолжается без надбавки. */
  onDecide: (tipKopeks: number) => void;
  /** Esc или клик вне окна: ничего не происходит — ни платежа, ни отметки отказа. */
  onCancel: () => void;
}

/**
 * «Добавить к платежу N ₽ в пользу проекта?» — показывается между вводом суммы
 * и созданием платежа. Стиль намеренно повторяет попап SupportProjectButton:
 * тот же rose→pink градиент и бейдж badge-donation, чтобы оба обращения за
 * поддержкой читались как одно и то же.
 *
 * Решение принимают только кнопки: «Поддержать» / пресет / своя сумма — согласие,
 * «Не сейчас» — отказ (оплата идёт без надбавки). Esc и клик вне окна НЕ являются
 * решением: они просто закрывают диалог и возвращают человека к вводу суммы, ничего
 * не создавая. Иначе случайный Esc молча выпускал бы реальный платёж.
 */
export default function DonationUpsellDialog({
  open,
  topupKopeks,
  tipKopeks,
  presetsKopeks,
  maxTipKopeks,
  onDecide,
  onCancel,
}: DonationUpsellDialogProps) {
  const { t } = useTranslation();
  const haptic = useHaptic();
  const { formatWithCurrency, convertToRub, currencySymbol } = useCurrency();
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  const rub = (kopeks: number) => formatWithCurrency(kopeks / 100);

  /**
   * Приводит введённое к обычному числу. В фарси-локали суммы в диалоге
   * отрисованы персидскими цифрами (formatAmount → toLocaleString('fa-IR')),
   * и человек естественно набирает или вставляет именно их. Плюс убираем
   * разделители разрядов, которые тот же toLocaleString расставляет сам.
   */
  const parseTyped = (raw: string): number => {
    const normalized = raw
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\s\u00a0\u202f\u066c\u2019']/g, '')
      .replace(',', '.');
    return parseFloat(normalized);
  };

  const decide = (tip: number) => {
    haptic.impact(tip > 0 ? 'medium' : 'light');
    onDecide(tip);
  };

  const submitCustom = () => {
    // Пользователь вводит сумму в СВОЕЙ валюте — весь диалог показан в ней же
    // (formatWithCurrency конвертирует рубли в валюту локали). Без обратной
    // конвертации ввод «50000» в фарси-локали уходил бы как 50 000 ₽ вместо ~120 ₽.
    const typed = parseTyped(customValue);
    const parsed = Number.isFinite(typed) ? Math.round(convertToRub(typed) * 100) : NaN;
    // Нижняя граница в рублях: без неё в неруб­лёвых локалях проходила надбавка
    // в одну копейку, для которой окно сверки обещания вырождается в ноль.
    if (!Number.isFinite(parsed) || parsed < MIN_TIP_KOPEKS || parsed > maxTipKopeks) {
      setCustomError(
        t('donationUpsell.customInvalid', { min: rub(MIN_TIP_KOPEKS), max: rub(maxTipKopeks) }),
      );
      return;
    }
    decide(parsed);
  };

  const availablePresets = presetsKopeks.filter((preset) => preset <= maxTipKopeks);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Esc и клик вне окна = «передумал», а не «отказался»: ничего необратимого
        // не делаем. Отказ фиксирует только явная кнопка «Не сейчас».
        if (!next) {
          haptic.impact('light');
          onCancel();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader className="text-center sm:text-center">
          <div
            className="mx-auto mb-1 flex h-16 w-16 items-center justify-center rounded-full text-3xl"
            style={{
              background:
                'linear-gradient(135deg, rgba(244,63,94,0.18) 0%, rgba(236,72,153,0.18) 100%)',
            }}
          >
            ❤️
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
              type="text"
              inputMode="decimal"
              value={customValue}
              onChange={(event) => {
                setCustomValue(event.target.value);
                setCustomError(null);
              }}
              placeholder={t('donationUpsell.customPlaceholder', { currency: currencySymbol })}
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
            <span className="text-xl leading-none">❤️</span>
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
