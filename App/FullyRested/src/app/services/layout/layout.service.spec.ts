import { TestBed } from '@angular/core/testing';

import { LayoutService } from './layout.service';

describe('LayoutService', () => {
  const keys = ['fr.sidebarVisible', 'fr.sidebarWidth', 'fr.splitOrientation', 'fr.splitRatio'];

  beforeEach(() => {
    keys.forEach((k) => localStorage.removeItem(k));
    TestBed.configureTestingModule({});
  });

  afterEach(() => keys.forEach((k) => localStorage.removeItem(k)));

  it('starts with the sidebar open and request beside response', () => {
    const layout = TestBed.inject(LayoutService);

    expect(layout.sidebarVisible()).toBeTrue();
    expect(layout.sidebarWidth()).toBe(260);
    expect(layout.splitOrientation()).toBe('horizontal');
  });

  it('clamps and remembers the sidebar width', () => {
    const layout = TestBed.inject(LayoutService);

    layout.resizeSidebar(5000);
    expect(layout.sidebarWidth()).toBe(LayoutService.sidebarMax);

    layout.resizeSidebar(10);
    expect(layout.sidebarWidth()).toBe(LayoutService.sidebarMin);
    expect(localStorage.getItem('fr.sidebarWidth')).toBe(String(LayoutService.sidebarMin));
  });

  it('restores remembered choices and ignores values of the wrong type', () => {
    localStorage.setItem('fr.splitOrientation', '"vertical"');
    localStorage.setItem('fr.sidebarWidth', '"wide"');

    const layout = TestBed.inject(LayoutService);

    expect(layout.splitOrientation()).toBe('vertical');
    expect(layout.sidebarWidth()).toBe(260);
  });

  it('toggles the sidebar and the split orientation', () => {
    const layout = TestBed.inject(LayoutService);

    layout.toggleSidebar();
    layout.toggleOrientation();

    expect(layout.sidebarVisible()).toBeFalse();
    expect(layout.splitOrientation()).toBe('vertical');
  });
});
