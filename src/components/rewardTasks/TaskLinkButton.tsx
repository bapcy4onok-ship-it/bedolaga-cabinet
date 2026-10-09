import type { ReactNode } from 'react';

import { Button } from '@/components/primitives';
import { usePlatform } from '@/platform';

import { resolveTaskActionLink } from '../../utils/rewardTasks';

interface TaskLinkButtonProps {
  url: string | null;
  label: string;
  icon?: ReactNode;
}

/**
 * Кнопка-ссылка задания (канал, пост, буст). Открываем через платформенный
 * адаптер: в Telegram WebView прямой window.open перехватывается клиентом.
 */
export function TaskLinkButton({ url, label, icon }: TaskLinkButtonProps) {
  const { openLink, openTelegramLink } = usePlatform();
  const link = resolveTaskActionLink(url);
  if (!link) return null;

  return (
    <Button
      variant="secondary"
      fullWidth
      leftIcon={icon}
      onClick={() => (link.kind === 'telegram' ? openTelegramLink(link.url) : openLink(link.url))}
    >
      {label}
    </Button>
  );
}
