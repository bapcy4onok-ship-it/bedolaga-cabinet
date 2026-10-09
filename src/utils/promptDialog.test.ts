import { describe, expect, it } from 'vitest';
import { promptKeyAction, promptSubmitButtonClass, type PromptKeyPress } from './promptDialog';

// The admin's reject reason is typed into the multi-line prompt: a plain Enter must
// add a line, not send a half-written reason to the user.
function press(key: string, extra: Partial<PromptKeyPress> = {}): PromptKeyPress {
  return { key, ctrlKey: false, metaKey: false, isComposing: false, multiline: true, ...extra };
}

describe('promptKeyAction: textarea (multiline)', () => {
  // Shift+Enter and Alt+Enter arrive here as a plain Enter (no Ctrl/Cmd): line breaks too
  it('Enter alone is a line break, not a submit', () => {
    expect(promptKeyAction(press('Enter'))).toBe('none');
  });

  it('Ctrl+Enter and Cmd+Enter submit', () => {
    expect(promptKeyAction(press('Enter', { ctrlKey: true }))).toBe('submit');
    expect(promptKeyAction(press('Enter', { metaKey: true }))).toBe('submit');
    expect(promptKeyAction(press('Enter', { ctrlKey: true, metaKey: true }))).toBe('submit');
  });

  it('nothing during an IME composition: that Enter confirms the composed text', () => {
    expect(promptKeyAction(press('Enter', { ctrlKey: true, isComposing: true }))).toBe('none');
    expect(promptKeyAction(press('Enter', { metaKey: true, isComposing: true }))).toBe('none');
    expect(promptKeyAction(press('Enter', { isComposing: true }))).toBe('none');
  });

  it('other keys, with or without a modifier, do nothing', () => {
    for (const key of ['a', ' ', 'Tab', 'Escape', 'Backspace', 'Process', 'Unidentified']) {
      expect(promptKeyAction(press(key))).toBe('none');
      expect(promptKeyAction(press(key, { ctrlKey: true }))).toBe('none');
      expect(promptKeyAction(press(key, { metaKey: true }))).toBe('none');
    }
  });
});

describe('promptKeyAction: single-line input', () => {
  it('never submits itself: Enter already submits the form natively', () => {
    for (const extra of [{}, { ctrlKey: true }, { metaKey: true }, { isComposing: true }]) {
      expect(promptKeyAction(press('Enter', { ...extra, multiline: false }))).toBe('none');
    }
    expect(promptKeyAction(press('a', { multiline: false }))).toBe('none');
  });
});

describe('promptSubmitButtonClass', () => {
  it("tone 'danger' gets the destructive button", () => {
    expect(promptSubmitButtonClass('danger')).toBe('btn-danger');
  });

  it('every other prompt keeps the primary button', () => {
    expect(promptSubmitButtonClass(undefined)).toBe('btn-primary');
  });
});
