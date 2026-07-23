import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';

import { useHaptic } from '@/platform';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/primitives/Dialog';

export default function SupportProjectButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const haptic = useHaptic();
  const [open, setOpen] = useState(false);

  const startDonation = () => {
    haptic.impact('medium');
    setOpen(false);
    // Тот же флоу, что и пополнение (те же активные платёжные системы), но с
    // пометкой purpose=donation: бэкенд не зачисляет сумму на баланс, а
    // учитывает её отдельной статистикой.
    navigate('/balance/top-up?purpose=donation&returnTo=/balance');
  };

  return (
    <>
      {/* Крупная «плавающая» кнопка в углу — видна на всех страницах кабинета.
          Тёплый rose→pink градиент намеренно не зависит от акцентной темы
          оператора: это отдельный «сердечный» CTA. */}
      <motion.button
        type="button"
        onClick={() => {
          haptic.impact('light');
          setOpen(true);
        }}
        aria-label={t('supportProject.button')}
        className="fixed bottom-[calc(96px+env(safe-area-inset-bottom,0px))] right-4 z-40 flex items-center gap-2.5 rounded-full px-5 py-4 font-bold text-white lg:bottom-8 lg:right-8"
        style={{
          background: 'linear-gradient(135deg, #f43f5e 0%, #ec4899 100%)',
          boxShadow: '0 10px 34px rgba(244, 63, 94, 0.4)',
        }}
        initial={{ opacity: 0, scale: 0.8, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.4, type: 'spring', stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.94 }}
      >
        <motion.span
          className="text-2xl leading-none"
          animate={{ scale: [1, 1.18, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          ❤️
        </motion.span>
        <span className="hidden text-[15px] sm:inline">{t('supportProject.button')}</span>
      </motion.button>

      <Dialog open={open} onOpenChange={setOpen}>
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
            <DialogTitle className="text-center text-xl">{t('supportProject.title')}</DialogTitle>
            <div className="flex justify-center pt-1">
              <span className="badge-donation">{t('supportProject.badge')}</span>
            </div>
            <DialogDescription className="pt-2 text-center text-[15px] leading-relaxed text-dark-300">
              {t('supportProject.description')}
            </DialogDescription>
          </DialogHeader>

          <button
            type="button"
            onClick={startDonation}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold text-white transition-transform active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #f43f5e 0%, #ec4899 100%)',
              boxShadow: '0 8px 24px rgba(244, 63, 94, 0.3)',
            }}
          >
            <span className="text-xl leading-none">⚡</span>
            <span>{t('supportProject.cta')}</span>
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
