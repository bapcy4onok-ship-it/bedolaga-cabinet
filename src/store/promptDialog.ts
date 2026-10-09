import { create } from 'zustand';

export interface PromptOptions {
  /** Field label shown above the input. */
  label: string;
  /** Optional heading. */
  title?: string;
  initialValue?: string;
  placeholder?: string;
  submitLabel?: string;
  cancelLabel?: string;
  /** Input type, e.g. 'text' (default) or 'url'. Ignored when `multiline` is set. */
  inputType?: string;
  /** Multi-line text (a textarea): Enter inserts a line break, Ctrl/Cmd+Enter submits. */
  multiline?: boolean;
  /** 'danger' styles the submit button as a destructive action (e.g. a rejection). */
  tone?: 'danger';
}

interface PromptRequest extends PromptOptions {
  resolve: (value: string | null) => void;
}

interface PromptState {
  request: PromptRequest | null;
  /**
   * Open a prompt dialog and resolve with the entered value, or null if cancelled.
   * Cross-platform replacement for window.prompt (which is unavailable in the Telegram WebView).
   */
  prompt: (options: PromptOptions) => Promise<string | null>;
  submit: (value: string) => void;
  cancel: () => void;
}

export const usePromptStore = create<PromptState>((set, get) => ({
  request: null,

  prompt: (options) =>
    new Promise<string | null>((resolve) => {
      // If a prompt is already open, cancel it before replacing.
      const existing = get().request;
      if (existing) existing.resolve(null);
      set({ request: { ...options, resolve } });
    }),

  submit: (value) => {
    const req = get().request;
    if (!req) return;
    req.resolve(value);
    set({ request: null });
  },

  cancel: () => {
    const req = get().request;
    if (!req) return;
    req.resolve(null);
    set({ request: null });
  },
}));

/** Returns a stable function that opens a prompt dialog and resolves with the value (or null). */
export function usePrompt() {
  return usePromptStore((s) => s.prompt);
}
