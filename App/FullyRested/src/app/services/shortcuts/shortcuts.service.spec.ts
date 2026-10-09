import { TestBed } from '@angular/core/testing';

import { ShortcutCommand, ShortcutsService, commandFor } from './shortcuts.service';

describe('ShortcutsService', () => {
  const key = (key: string, mods: Partial<KeyboardEventInit> = {}) =>
    ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

  it('maps Ctrl (or Cmd) combinations to commands', () => {
    expect(commandFor(key('Enter', { ctrlKey: true }))).toBe('send');
    expect(commandFor(key('s', { ctrlKey: true }))).toBe('save');
    expect(commandFor(key('S', { metaKey: true }))).toBe('save');
    expect(commandFor(key('n', { ctrlKey: true }))).toBe('newRequest');
    expect(commandFor(key('w', { ctrlKey: true }))).toBe('closeTab');
    expect(commandFor(key('Tab', { ctrlKey: true }))).toBe('nextTab');
    expect(commandFor(key('Tab', { ctrlKey: true, shiftKey: true }))).toBe('previousTab');
    expect(commandFor(key('b', { ctrlKey: true }))).toBe('toggleSidebar');
    expect(commandFor(key('l', { ctrlKey: true }))).toBe('focusUrl');
    expect(commandFor(key('k', { ctrlKey: true }))).toBe('commandPalette');
  });

  it('leaves plain typing and other combinations alone', () => {
    expect(commandFor(key('s'))).toBeUndefined();
    expect(commandFor(key('Enter'))).toBeUndefined();
    expect(commandFor(key('c', { ctrlKey: true }))).toBeUndefined();
    expect(commandFor(key('s', { ctrlKey: true, altKey: true }))).toBeUndefined();
  });

  it('publishes a command and stops the browser default', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ShortcutsService);
    const seen: ShortcutCommand[] = [];
    const sub = service.commands.subscribe((c) => seen.push(c));

    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true, bubbles: true });
    document.body.dispatchEvent(event);
    sub.unsubscribe();

    expect(seen).toEqual(['save']);
    expect(event.defaultPrevented).toBeTrue();
  });
});
