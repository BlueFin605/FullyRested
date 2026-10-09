import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'fr.theme';
const ORDER: ThemeMode[] = ['system', 'light', 'dark'];

// Light and dark are equal: 'system' follows the OS, the others pin one.
// Every color in the app comes from light-dark(), so setting color-scheme is enough.
@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.load());

  constructor() {
    this.apply(this.mode());
  }

  set(mode: ThemeMode) {
    this.mode.set(mode);
    this.apply(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // storage unavailable: the choice lasts for this session only
    }
  }

  cycle() {
    this.set(ORDER[(ORDER.indexOf(this.mode()) + 1) % ORDER.length]);
  }

  icon(): string {
    switch (this.mode()) {
      case 'light':
        return 'light_mode';
      case 'dark':
        return 'dark_mode';
      default:
        return 'brightness_auto';
    }
  }

  private apply(mode: ThemeMode) {
    document.documentElement.style.colorScheme =
      mode == 'system' ? 'light dark' : mode;
  }

  private load(): ThemeMode {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (stored != null && ORDER.includes(stored)) return stored;
    } catch {
      // fall through to the default
    }
    return 'system';
  }
}
