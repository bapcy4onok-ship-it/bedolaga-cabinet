import type { PromptOptions } from '../../../store/promptDialog';

/**
 * Постоянные опции промпта причины отказа в очереди проверки (askRejectReason в
 * ReviewQueue). Причину получает пользователь, поэтому:
 * - multiline — textarea, где Enter переносит строку, а отправляет только Ctrl/Cmd+Enter:
 *   случайный Enter не уйдёт пользователю недописанной причиной;
 * - tone 'danger' — красная кнопка, как у любого необратимого действия.
 */
export const REJECT_PROMPT_OPTIONS = {
  multiline: true,
  tone: 'danger',
} as const satisfies Pick<PromptOptions, 'multiline' | 'tone'>;
