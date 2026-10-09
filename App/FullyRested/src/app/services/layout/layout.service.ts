import { Injectable, signal, WritableSignal } from '@angular/core';

export type SplitOrientation = 'horizontal' | 'vertical';

// Pane sizes and layout choices, remembered per machine in localStorage
@Injectable({
  providedIn: 'root',
})
export class LayoutService {
  static readonly sidebarMin = 180;
  static readonly sidebarMax = 600;

  // storage key for each remembered signal; declared first so stored() can fill it
  private readonly keys = new Map<WritableSignal<any>, string>();

  readonly sidebarVisible = this.stored('fr.sidebarVisible', true);
  readonly sidebarWidth = this.stored('fr.sidebarWidth', 260);
  // 'horizontal' = request beside response; 'vertical' = request above response
  readonly splitOrientation = this.stored<SplitOrientation>('fr.splitOrientation', 'horizontal');
  // share of the editor area given to the request pane
  readonly splitRatio = this.stored('fr.splitRatio', 0.5);

  toggleSidebar() {
    this.update(this.sidebarVisible, !this.sidebarVisible());
  }

  resizeSidebar(width: number) {
    this.update(
      this.sidebarWidth,
      Math.round(Math.min(LayoutService.sidebarMax, Math.max(LayoutService.sidebarMin, width))),
    );
  }

  toggleOrientation() {
    this.update(
      this.splitOrientation,
      this.splitOrientation() == 'horizontal' ? 'vertical' : 'horizontal',
    );
  }

  setSplitRatio(ratio: number) {
    this.update(this.splitRatio, Math.min(0.85, Math.max(0.15, ratio)));
  }

  private update<T>(target: WritableSignal<T>, value: T) {
    target.set(value);
    try {
      localStorage.setItem(this.keys.get(target)!, JSON.stringify(value));
    } catch {
      // storage unavailable: keep the value for this session only
    }
  }

  private stored<T>(key: string, fallback: T): WritableSignal<T> {
    let value = fallback;
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) {
        const parsed = JSON.parse(raw);
        if (typeof parsed == typeof fallback) value = parsed;
      }
    } catch {
      // unreadable storage: use the default
    }
    const result = signal<T>(value);
    this.keys.set(result, key);
    return result;
  }
}
