import { TestBed } from '@angular/core/testing';
import { LatestResultsService, resultKey } from './latest-results.service';
import { TimedActionResult } from '../execute-rest-calls/execute-rest-calls.service';

const result = (status: number) => ({ status } as unknown as TimedActionResult);

describe('LatestResultsService', () => {
  let service: LatestResultsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LatestResultsService);
  });

  it('builds keys from path and optional run id', () => {
    expect(resultKey('a/b.frreq')).toBe('a/b.frreq');
    expect(resultKey('a/b.frreq', 'happy')).toBe('a/b.frreq#happy');
  });

  it('stores and returns the latest result', () => {
    expect(service.get('k')).toBeUndefined();
    service.set('k', result(200));
    service.set('k', result(404));
    expect(service.get('k')?.status).toBe(404);
  });

  it('watch emits the current value then each change for that key only', () => {
    service.set('k', result(200));
    const seen: (string | number | undefined)[] = [];
    const sub = service.watch('k').subscribe(r => seen.push(r?.status));
    service.set('other', result(500));
    service.set('k', result(201));
    sub.unsubscribe();
    expect(seen).toEqual([200, 201]);
  });

  it('watch emits undefined first when nothing is stored', () => {
    const seen: (string | number | undefined)[] = [];
    service.watch('k').subscribe(r => seen.push(r?.status));
    expect(seen).toEqual([undefined]);
  });

  it('clear drops everything and notifies watchers', () => {
    service.set('k', result(200));
    const seen: (string | number | undefined)[] = [];
    service.watch('k').subscribe(r => seen.push(r?.status));
    service.clear();
    expect(service.get('k')).toBeUndefined();
    expect(seen).toEqual([200, undefined]);
  });
});
