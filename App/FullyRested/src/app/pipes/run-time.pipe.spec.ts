import { RunTimePipe } from './run-time.pipe';

describe('RunTimePipe', () => {
  const pipe = new RunTimePipe();
  const now = new Date(2026, 9, 16, 15, 0, 0);

  it('shows just the local time for today', () => {
    const iso = new Date(2026, 9, 16, 9, 5, 7).toISOString();
    expect(pipe.transform(iso, now)).toBe('09:05:07');
  });

  it('prefixes the date for any other day', () => {
    const iso = new Date(2026, 9, 3, 14, 32, 7).toISOString();
    expect(pipe.transform(iso, now)).toBe('3 Oct 14:32:07');
  });

  it('is empty for a missing or invalid time', () => {
    expect(pipe.transform(undefined, now)).toBe('');
    expect(pipe.transform('nope', now)).toBe('');
  });
});
