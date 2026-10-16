import { provideZoneChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { RunListing } from '@fullyrested/core';
import { RunTimePipe } from '../../pipes/run-time.pipe';
import { RunHistoryService } from '../../services/run-history/run-history.service';
import { RunHistoryComponent } from './run-history.component';

function listing(over: Partial<RunListing>): RunListing {
  return { runId: 'r1-app', startedAt: new Date().toISOString(), selection: 'request:a.frreq', passed: 1, failed: 0, errored: 0, ms: 5, ...over };
}

describe('RunHistoryComponent', () => {
  let changed = signal(0);
  let list: jasmine.Spy;

  function create(runs: RunListing[]) {
    changed = signal(0);
    list = jasmine.createSpy('list').and.resolveTo(runs);
    TestBed.configureTestingModule({
      declarations: [RunHistoryComponent, RunTimePipe],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [provideZoneChangeDetection(), { provide: RunHistoryService, useValue: { list, changed } }],
    });
    const fixture = TestBed.createComponent(RunHistoryComponent);
    fixture.componentInstance.collection = { name: 'Test', path: '/c', filename: '/c/t.frcol', config: {} as any };
    fixture.detectChanges();
    fixture.componentInstance.ngOnChanges();
    return fixture;
  }

  // the first effect run is scheduled by change detection, so let it and the load it starts finish
  async function settle(f: { detectChanges(): void }) {
    for (let i = 0; i < 3; i++) {
      f.detectChanges();
      await new Promise(r => setTimeout(r));
    }
    f.detectChanges();
  }

  it('lists the collection runs and classifies the outcome', async () => {
    const f = create([listing({ runId: 'a-app' }), listing({ runId: 'b', failed: 1 }), listing({ runId: 'c-app', errored: 1, failed: 1 })]);
    await settle(f);
    const c = f.componentInstance;
    expect(c.runs.length).toBe(3);
    expect(c.outcome(c.runs[0])).toBe('pass');
    expect(c.outcome(c.runs[1])).toBe('fail');
    expect(c.outcome(c.runs[2])).toBe('error');
    expect(f.nativeElement.querySelectorAll('.run-row').length).toBe(3);
    expect(f.nativeElement.querySelectorAll('.run-chip').length).toBe(1);
  });

  it('labels with the status when present, otherwise the case count', async () => {
    const f = create([]);
    const c = f.componentInstance;
    expect(c.label(listing({ status: 422 }))).toBe('422');
    expect(c.label(listing({ passed: 4, failed: 1, errored: 1 }))).toBe('6 cases');
    expect(c.label(listing({}))).toBe('1 case');
  });

  it('reloads when a send bumps changed, and on manual refresh', async () => {
    const f = create([]);
    await f.whenStable();
    const before = list.calls.count();
    changed.update(n => n + 1);
    f.detectChanges();
    await f.whenStable();
    expect(list.calls.count()).toBeGreaterThan(before);
    const after = list.calls.count();
    await f.componentInstance.refresh();
    expect(list.calls.count()).toBe(after + 1);
  });

  it('shows the empty state with the runs folder', async () => {
    const f = create([]);
    await settle(f);
    expect(f.nativeElement.textContent).toContain('No runs recorded yet');
    expect(f.nativeElement.textContent).toContain('/c/.fullyrested-runs');
  });
});
