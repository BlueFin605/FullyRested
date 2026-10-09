import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

export type ShortcutCommand =
  | 'send'
  | 'save'
  | 'newRequest'
  | 'openCollection'
  | 'closeTab'
  | 'nextTab'
  | 'previousTab'
  | 'toggleSidebar'
  | 'focusUrl'
  | 'commandPalette';

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

// The app's keyboard map (Ctrl on Windows/Linux, Cmd on macOS)
export function commandFor(event: KeyLike): ShortcutCommand | undefined {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod || event.altKey) return undefined;

  const key = event.key.toLowerCase();
  if (event.shiftKey) {
    if (key == 'tab') return 'previousTab';
    if (key == 'p') return 'commandPalette';
    return undefined;
  }

  switch (key) {
    case 'enter':
      return 'send';
    case 's':
      return 'save';
    case 'n':
      return 'newRequest';
    case 'o':
      return 'openCollection';
    case 'w':
      return 'closeTab';
    case 'tab':
      return 'nextTab';
    case 'b':
      return 'toggleSidebar';
    case 'l':
      return 'focusUrl';
    case 'k':
      return 'commandPalette';
    default:
      return undefined;
  }
}

// Listens for the app's shortcuts anywhere in the window and publishes them as commands
@Injectable({
  providedIn: 'root',
})
export class ShortcutsService implements OnDestroy {
  readonly commands = new Subject<ShortcutCommand>();

  private readonly listener = (event: KeyboardEvent) => {
    const command = commandFor(event);
    if (command == undefined) return;

    event.preventDefault();
    this.zone.run(() => this.commands.next(command));
  };

  constructor(private zone: NgZone) {
    // capture, so editors (CodeMirror) can't swallow the app's shortcuts first
    document.addEventListener('keydown', this.listener, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.listener, true);
  }
}
