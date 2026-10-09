import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.removeItem('fr.theme');
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.removeItem('fr.theme');
    document.documentElement.style.colorScheme = '';
  });

  it('follows the OS by default', () => {
    const service = TestBed.inject(ThemeService);

    expect(service.mode()).toBe('system');
    expect(document.documentElement.style.colorScheme).toBe('light dark');
  });

  it('pins a scheme and remembers it', () => {
    TestBed.inject(ThemeService).set('dark');

    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(localStorage.getItem('fr.theme')).toBe('dark');
  });

  it('restores the stored choice', () => {
    localStorage.setItem('fr.theme', 'light');

    expect(TestBed.inject(ThemeService).mode()).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('cycles system, light, dark and back', () => {
    const service = TestBed.inject(ThemeService);
    const seen = [1, 2, 3].map(() => (service.cycle(), service.mode()));

    expect(seen).toEqual(['light', 'dark', 'system']);
  });
});
