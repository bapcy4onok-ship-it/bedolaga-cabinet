import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/primitives/Dialog';

/** Смена суффикса покажет окно всем ещё раз. */
const SEEN_STORAGE_KEY = 'torrent_warning_v1_seen';

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_STORAGE_KEY) === 'true';
  } catch {
    // Хранилище недоступно (приватный режим, запрет в WebView) — запомнить показ
    // нельзя, а показывать окно на каждом заходе хуже, чем не показать вовсе.
    return true;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_STORAGE_KEY, 'true');
  } catch {
    // Не запомнилось — покажем ещё раз при следующем заходе, не страшно.
  }
}

/**
 * Одноразовое окно «торренты запрещены» — аналог окна в боте. Любое закрытие
 * («Понятно», крестик, Esc, клик мимо) отмечает показ, и окно больше не
 * появляется. Отметка живёт в localStorage этого браузера. `enabled`
 * придерживает окно, пока на экране онбординг или блокирующий экран.
 */
export default function TorrentWarningDialog({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const [seen, setSeen] = useState(readSeen);

  const close = () => {
    markSeen();
    setSeen(true);
  };

  return (
    <Dialog
      open={enabled && !seen}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-1 flex h-16 w-16 items-center justify-center rounded-full bg-error-500/15 text-3xl">
            🚫
          </div>
          <DialogTitle className="text-center text-xl">
            {t('torrentWarning.dialog.title')}
          </DialogTitle>
          <DialogDescription className="whitespace-pre-line pt-2 text-center text-[15px] leading-relaxed text-dark-300">
            {t('torrentWarning.dialog.description')}
          </DialogDescription>
        </DialogHeader>
        <button
          type="button"
          onClick={close}
          className="h-12 w-full rounded-2xl bg-error-500 text-base font-bold text-white transition-colors hover:bg-error-600"
        >
          {t('torrentWarning.dialog.ok')}
        </button>
      </DialogContent>
    </Dialog>
  );
}
