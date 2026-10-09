import { useEffect, useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { usePromptStore } from '../store/promptDialog';
import { promptKeyAction, promptSubmitButtonClass } from '../utils/promptDialog';

/**
 * Global host for usePrompt(). Mount once near the app root.
 * Renders an accessible text-input dialog (focus-trapped, Esc/Enter, scroll-locked)
 * as a cross-platform replacement for window.prompt, which the Telegram WebView ignores.
 * `multiline` swaps the input for a textarea (Ctrl/Cmd+Enter submits there), and
 * `tone: 'danger'` gives the submit button the destructive style.
 */
export function PromptDialogHost() {
  const request = usePromptStore((s) => s.request);
  const submit = usePromptStore((s) => s.submit);
  const cancel = usePromptStore((s) => s.cancel);
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  const open = request !== null;
  const dialogRef = useFocusTrap<HTMLFormElement>(open, { onEscape: cancel });

  useEffect(() => {
    if (request) setValue(request.initialValue ?? '');
  }, [request]);

  if (!request) return null;

  const handleSubmit = (e: SyntheticEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      cancel();
      return;
    }
    submit(trimmed);
  };

  // In the textarea Enter is a line break and Ctrl/Cmd+Enter submits; in the input
  // Enter submits natively (see promptKeyAction)
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const action = promptKeyAction({
      key: e.key,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      isComposing: e.nativeEvent.isComposing,
      multiline: Boolean(request.multiline),
    });
    if (action === 'submit') handleSubmit(e);
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-dark-950/60" onClick={cancel} aria-hidden="true" />
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={request.title ?? request.label}
        onSubmit={handleSubmit}
        className="card relative w-full max-w-sm space-y-4"
      >
        {request.title && <h2 className="text-lg font-semibold text-dark-50">{request.title}</h2>}
        <label className="block">
          <span className="label">{request.label}</span>
          {request.multiline ? (
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={request.placeholder}
              rows={4}
              className="input min-h-[96px] resize-y"
            />
          ) : (
            <input
              type={request.inputType ?? 'text'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={request.placeholder}
              className="input"
            />
          )}
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={cancel} className="btn-secondary">
            {request.cancelLabel ?? t('common.cancel')}
          </button>
          <button type="submit" className={promptSubmitButtonClass(request.tone)}>
            {request.submitLabel ?? t('common.ok', 'OK')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
