import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptOptions } from '../store/promptDialog';
import { REJECT_PROMPT_OPTIONS } from './admin/rewardTasks/rejectPrompt';
import { PromptDialogHost } from './PromptDialogHost';

/**
 * PromptDialogHost's own wiring; utils/promptDialog.test.ts covers the helpers it calls.
 * Which field gets the key handler, what the handler passes on (the IME flag above all),
 * and the submit button's class. The suite runs in the node environment without a DOM:
 * the dialog is rendered with react-dom/server, and its handlers are called on the
 * element tree the host hands to createPortal. The server renderer leaves the field
 * empty; host.typed seeds it with what an admin typed.
 */

const host = vi.hoisted(() => ({
  state: {
    request: null as (PromptOptions & { resolve: (value: string | null) => void }) | null,
    submit: vi.fn(),
    cancel: vi.fn(),
  },
  // What the host passed to createPortal on its last render
  portal: undefined as unknown,
  // The field's starting value (the host's only useState); undefined keeps it empty
  typed: undefined as string | undefined,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => actual.useState(host.typed ?? initial),
  };
});

// The server renderer has no portals: the dialog renders in place, and its element tree
// is kept for the handler checks
vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  createPortal: (children: ReactNode) => {
    host.portal = children;
    return children;
  },
}));

// The real zustand store hands a server render its initial state, i.e. no request
vi.mock('../store/promptDialog', () => ({
  usePromptStore: (selector: (state: typeof host.state) => unknown) => selector(host.state),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

type ElementProps = Record<string, unknown> & { children?: ReactNode };

function findElement(node: unknown, type: string): ReactElement<ElementProps> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object' || node === null || !isValidElement<ElementProps>(node)) {
    return null;
  }
  if (node.type === type) return node;
  return findElement(node.props.children, type);
}

interface Press {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
}

/** Opens the prompt, renders the host and returns its markup and its fields' handlers. */
function renderPrompt(options: Partial<PromptOptions> = {}) {
  host.state.request = { label: 'Причина', ...options, resolve: () => {} };
  host.portal = undefined;
  const html = renderToStaticMarkup(<PromptDialogHost />);
  const element = (type: string) => {
    const found = findElement(host.portal, type);
    if (!found) throw new Error(`no <${type}> in the dialog`);
    return found;
  };

  // A key press in the field; returns its preventDefault spy
  const press = (type: 'textarea' | 'input', { key, ...flags }: Press) => {
    const onKeyDown = element(type).props.onKeyDown;
    expect(onKeyDown, `<${type}> onKeyDown`).toBeTypeOf('function');
    const preventDefault = vi.fn();
    (onKeyDown as (event: unknown) => void)({
      key,
      ctrlKey: flags.ctrlKey ?? false,
      metaKey: flags.metaKey ?? false,
      nativeEvent: { isComposing: flags.isComposing ?? false },
      preventDefault,
    });
    return preventDefault;
  };

  // The form's own submit, i.e. the submit button
  const submitForm = () => {
    const preventDefault = vi.fn();
    (element('form').props.onSubmit as (event: unknown) => void)({ preventDefault });
    return preventDefault;
  };

  return { html, press, submitForm };
}

/** What the store was told: the prompt is still open, submitted (with what), or cancelled. */
function outcome() {
  return {
    submit: host.state.submit.mock.calls.map((args) => [...args]),
    cancel: host.state.cancel.mock.calls.length,
  };
}

function resetStore() {
  host.state.submit.mockClear();
  host.state.cancel.mockClear();
}

const STILL_OPEN = { submit: [], cancel: 0 };

beforeEach(() => {
  // Only evaluated as createPortal's container, which the mock ignores
  vi.stubGlobal('document', { body: {} });
  resetStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
  host.state.request = null;
  host.typed = undefined;
});

describe('PromptDialogHost: multi-line prompt (the reject reason)', () => {
  // The review queue's own options: { multiline: true, tone: 'danger' }
  const REJECT = REJECT_PROMPT_OPTIONS;

  it('renders a textarea and the destructive submit button', () => {
    const { html } = renderPrompt(REJECT);
    expect(html).toContain('<textarea');
    expect(html).not.toContain('<input');
    expect(html).toMatch(/<button type="submit" class="btn-danger">/);
  });

  it('Ctrl+Enter and Cmd+Enter do what the submit button does', () => {
    // Under the server renderer the field stays empty, and the form resolves an empty
    // prompt as a cancel: that is the button's outcome, and each shortcut must match it
    const button = renderPrompt(REJECT).submitForm();
    expect(button).toHaveBeenCalledTimes(1);
    const buttonOutcome = outcome();
    expect(buttonOutcome).toEqual({ submit: [], cancel: 1 });

    for (const shortcut of [{ ctrlKey: true }, { metaKey: true }]) {
      resetStore();
      const preventDefault = renderPrompt(REJECT).press('textarea', { key: 'Enter', ...shortcut });
      expect(preventDefault, JSON.stringify(shortcut)).toHaveBeenCalledTimes(1);
      expect(outcome(), JSON.stringify(shortcut)).toEqual(buttonOutcome);
    }
  });

  it('a typed reason: the button and Ctrl/Cmd+Enter both send it trimmed, nothing is cancelled', () => {
    host.typed = '  Фото не того канала\nпереснимите  ';
    const sent = { submit: [['Фото не того канала\nпереснимите']], cancel: 0 };

    renderPrompt(REJECT).submitForm();
    expect(outcome()).toEqual(sent);

    for (const shortcut of [{ ctrlKey: true }, { metaKey: true }]) {
      resetStore();
      const preventDefault = renderPrompt(REJECT).press('textarea', { key: 'Enter', ...shortcut });
      expect(preventDefault, JSON.stringify(shortcut)).toHaveBeenCalledTimes(1);
      expect(outcome(), JSON.stringify(shortcut)).toEqual(sent);
    }
  });

  it('a plain Enter is a line break: nothing is sent', () => {
    const preventDefault = renderPrompt(REJECT).press('textarea', { key: 'Enter' });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(outcome()).toEqual(STILL_OPEN);
  });

  it("the event's isComposing reaches the helper: Ctrl/Cmd+Enter inside an IME composition sends nothing", () => {
    for (const shortcut of [{ ctrlKey: true }, { metaKey: true }]) {
      const preventDefault = renderPrompt(REJECT).press('textarea', {
        key: 'Enter',
        isComposing: true,
        ...shortcut,
      });
      expect(preventDefault, JSON.stringify(shortcut)).not.toHaveBeenCalled();
      expect(outcome(), JSON.stringify(shortcut)).toEqual(STILL_OPEN);
    }
  });
});

describe('PromptDialogHost: single-line prompt', () => {
  it('renders an input of the requested type and the primary submit button', () => {
    const { html } = renderPrompt({ inputType: 'url' });
    expect(html).toMatch(/<input type="url"/);
    expect(html).not.toContain('<textarea');
    expect(html).toMatch(/<button type="submit" class="btn-primary">/);
  });

  it('its key handler sends nothing itself: Enter submits the form natively', () => {
    for (const press of [{ key: 'Enter' }, { key: 'Enter', ctrlKey: true }]) {
      const preventDefault = renderPrompt().press('input', press);
      expect(preventDefault, JSON.stringify(press)).not.toHaveBeenCalled();
      expect(outcome(), JSON.stringify(press)).toEqual(STILL_OPEN);
    }
  });
});
