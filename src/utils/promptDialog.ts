import type { PromptOptions } from '../store/promptDialog';

/** A key press in the prompt dialog's field (PromptDialogHost). */
export interface PromptKeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  /** KeyboardEvent.isComposing: the key belongs to an IME composition (e.g. Enter picking a candidate). */
  isComposing: boolean;
  /** The field is the multi-line textarea, not the single-line input. */
  multiline: boolean;
}

export type PromptKeyAction = 'submit' | 'none';

/**
 * What a key press in the prompt's field does on top of the browser default.
 * - Textarea: Enter stays a line break (the default), Ctrl/Cmd+Enter submits like
 *   Enter in the input.
 * - Input: nothing, Enter already submits the form natively (implicit submission).
 * - Never during an IME composition: that Enter confirms the composed text.
 */
export function promptKeyAction({
  key,
  ctrlKey,
  metaKey,
  isComposing,
  multiline,
}: PromptKeyPress): PromptKeyAction {
  if (!multiline || isComposing || key !== 'Enter') return 'none';
  return ctrlKey || metaKey ? 'submit' : 'none';
}

/** The submit button's class: the destructive style for tone 'danger', the primary one otherwise. */
export function promptSubmitButtonClass(tone: PromptOptions['tone']): string {
  return tone === 'danger' ? 'btn-danger' : 'btn-primary';
}
