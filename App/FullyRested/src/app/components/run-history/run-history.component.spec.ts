import { provideZoneChangeDetection } from '@angular/core';
import { Subject } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { RUNS_FOLDER, RunListing, RunRecord } from '@fullyrested/core';
import { RunTimePipe } from '../../pipes/run-time.pipe';
import { RunHistoryService } from '../../services/run-history/run-history.service';
import { RunHistoryComponent } from './run-history.component';

function listing(over: Partial<RunListing>): RunListing {
  return { runId: 'r1-app', startedAt: new Date().toISOString(), selection: 'request:a.frreq', passed: 1, failed: 0, errored: 0, ms: 5, ...over };
}

describe('RunHistoryComponent', () => {
  let saved$: Subject<RunRecord>;
  let list: jasmine.Spy;
  let load: jasmine.Spy;

  function create(runs: RunListing[], collection: any = { name: 'Test', path: '/c', filename: '/c/t.frcol', config: {} as any }) {
    saved$ = new Subject<RunRecord>();
    list = jasmine.createSpy('list').and.resolveTo(runs);
    load = jasmine.createSpy('load').and.resolveTo(undefined);
    TestBed.configureTestingModule({
      declarations: [RunHistoryComponent, RunTimePipe],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [provideZoneChangeDetection(), { provide: RunHistoryService, useValue: { list, load, saved$: saved$.asObservable() } }],
    });
    const fixture = TestBed.createComponent(RunHistoryComponent);
    fixture.componentInstance.collection = collection;
    fixture.componentInstance.ngOnChanges();
    return fixture;
  }

  async function settle(f: { detectChanges(): void }) {
    await new Promise(r => setTimeout(r));
    f.detectChanges();
  }

  function appRecord(runId: string): RunRecord {
    return {
      runId, startedAt: new Date().toISOString(), collection: '/c/t.frcol', selection: 'request:new.frreq', redacted: true,
      cases: [{ index: 1, name: 'new', requestFile: 'new.frreq', outcome: 'pass', ms: 7, request: { method: 'GET', url: 'x', headers: {} } }]
    };
  }

  it('lists the collection runs by its folder and classifies the outcome', async () => {
    const f = create([listing({ runId: 'a-app' }), listing({ runId: 'b', failed: 1 }), listing({ runId: 'c-app', errored: 1, failed: 1 })]);
    await settle(f);
    const c = f.componentInstance;
    expect(list).toHaveBeenCalledOnceWith('/c');
    expect(c.runs.length).toBe(3);
    expect(c.outcome(c.runs[0])).toBe('pass');
    expect(c.outcome(c.runs[1])).toBe('fail');
    expect(c.outcome(c.runs[2])).toBe('error');
    expect(f.nativeElement.querySelectorAll('.run-row').length).toBe(3);
    expect(f.nativeElement.querySelectorAll('.run-chip').length).toBe(1);
  });

  it('treats an unsaved collection as no collection', async () => {
    const f = create([listing({})], { name: 'New', path: '', filename: '', config: {} as any });
    await settle(f);
    expect(list).not.toHaveBeenCalled();
    expect(f.componentInstance.runs).toEqual([]);
    expect(f.componentInstance.hasCollection).toBeFalse();
    expect(f.nativeElement.textContent).toContain('Open a saved collection');
    await f.componentInstance.select(listing({}));
    expect(load).not.toHaveBeenCalled();
  });

  it('labels with the status when present, otherwise the case count', async () => {
    const f = create([]);
    const c = f.componentInstance;
    expect(c.label(listing({ status: 422 }))).toBe('422');
    expect(c.label(listing({ passed: 4, failed: 1, errored: 1 }))).toBe('6 cases');
    expect(c.label(listing({}))).toBe('1 case');
  });

  it('adds a saved record to the top without re-listing', async () => {
    const f = create([listing({ runId: 'old-app' })]);
    await settle(f);
    saved$.next(appRecord('new-app'));
    saved$.next(appRecord('new-app'));
    expect(list).toHaveBeenCalledTimes(1);
    expect(f.componentInstance.runs.map(r => r.runId)).toEqual(['new-app', 'old-app']);
  });

  it('keeps the selection and the open detail when a send is saved', async () => {
    const f = create([listing({ runId: 'old-app' })]);
    await settle(f);
    const c = f.componentInstance;
    const rec = appRecord('old-app');
    load.and.resolveTo(rec);
    await c.select(c.runs[0]);
    saved$.next(appRecord('new-app'));
    expect(c.selected?.runId).toBe('old-app');
    expect(c.record).toBe(rec);
  });

  it('ignores a record saved for another collection', async () => {
    const f = create([]);
    await settle(f);
    saved$.next({ ...appRecord('x-app'), collection: '/other/o.frcol' });
    expect(f.componentInstance.runs).toEqual([]);
  });

  it('re-lists on manual refresh', async () => {
    const f = create([]);
    await settle(f);
    await f.componentInstance.refresh();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('lets a newer refresh win over a slower earlier one', async () => {
    const f = create([]);
    await settle(f);
    let slow!: (r: RunListing[]) => void;
    list.and.returnValues(new Promise<RunListing[]>(r => (slow = r)), Promise.resolve([listing({ runId: 'fresh' })]));
    const first = f.componentInstance.refresh();
    await f.componentInstance.refresh();
    slow([listing({ runId: 'stale' })]);
    await first;
    expect(f.componentInstance.runs.map(r => r.runId)).toEqual(['fresh']);
    expect(f.componentInstance.loading).toBeFalse();
  });

  it('lets the latest selection win over a slower earlier one', async () => {
    const f = create([]);
    await settle(f);
    const c = f.componentInstance;
    let slow!: (r: RunRecord) => void;
    const newer = appRecord('b-app');
    load.and.returnValues(new Promise<RunRecord>(r => (slow = r)), Promise.resolve(newer));
    const first = c.select(listing({ runId: 'a-app' }));
    await c.select(listing({ runId: 'b-app' }));
    slow(appRecord('a-app'));
    await first;
    expect(c.record).toBe(newer);
    expect(c.selected?.runId).toBe('b-app');
  });

  it('shows the empty state with the runs folder name', async () => {
    const f = create([]);
    await settle(f);
    expect(f.nativeElement.textContent).toContain('No runs recorded yet');
    expect(f.nativeElement.textContent).toContain('.fullyrested-runs');
    expect(f.componentInstance.runsFolder).toBe(RUNS_FOLDER);
  });
});

describe('RunHistoryComponent case detail', () => {
  const body = (text: string, contentType = 'application/json') => ({ contentType, bytes: text.length, text });
  const record: RunRecord = {
    runId: 'r1-app', startedAt: new Date().toISOString(), collection: 'c.frcol', selection: 'request:a.frreq', redacted: true,
    cases: [
      {
        index: 1, name: 'create', requestFile: 'a.frreq', outcome: 'fail', ms: 12,
        request: { method: 'POST', url: 'https://x.test/u', headers: { a: 'b' }, body: body('{"n":1}') },
        response: { status: 422, statusText: 'Unprocessable', headers: { 'set-cookie': 'k=v', 'content-type': 'application/json' }, body: body('{"e":1}') },
        validation: { valid: false, checks: [{ check: 'body', passed: true, errors: [] }, { check: 'status', passed: false, errors: ['expected 200'] }] }
      },
      {
        index: 2, name: 'broken', requestFile: 'b.frreq', outcome: 'error', ms: 3, error: 'ECONNREFUSED',
        request: { method: 'GET', url: 'https://y.test', headers: {} }
      }
    ]
  };

  function create() {
    const history = { list: jasmine.createSpy('list').and.resolveTo([]), load: jasmine.createSpy('load').and.resolveTo(record), saved$: new Subject<RunRecord>() };
    TestBed.configureTestingModule({
      declarations: [RunHistoryComponent, RunTimePipe],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [provideZoneChangeDetection(), { provide: RunHistoryService, useValue: history }],
    });
    const c = TestBed.createComponent(RunHistoryComponent).componentInstance;
    c.collection = { name: 'Test', path: '/c', filename: '/c/t.frcol', config: {} as any };
    return { c, history };
  }

  it('loads the record and shows its first case', async () => {
    const { c, history } = create();
    await c.select(listing({ runId: 'r1-app' }));
    expect(history.load).toHaveBeenCalledWith('/c', 'r1-app');
    expect(c.caseIndex).toBe(1);
    expect(c.cases.map(x => x.index)).toEqual([1, 2]);
    expect(c.currentCase?.name).toBe('create');
  });

  it('answers through the query functions, with every response header', async () => {
    const { c } = create();
    await c.select(listing({}));
    expect(c.requestView.value?.method).toBe('POST');
    expect(c.responseView.value?.status).toBe(422);
    expect(c.responseView.value?.headers['set-cookie']).toBe('k=v');
    expect(c.requestBody.value?.content).toBe('{"n":1}');
    expect(c.responseBody.value?.encoding).toBe('text');
  });

  it('reports a case with no response or body as a message, not a failure', async () => {
    const { c } = create();
    await c.select(listing({}));
    c.caseIndex = 2;
    expect(c.responseView.value).toBeUndefined();
    expect(c.responseView.message).toContain('got no response');
    expect(c.requestBody.message).toContain('no request body');
    expect(c.currentCase?.error).toBe('ECONNREFUSED');
  });

  it('puts failed checks first', async () => {
    const { c } = create();
    await c.select(listing({}));
    expect(c.checks.map(k => k.check)).toEqual(['status', 'body']);
  });

  it('shows a load failure', async () => {
    const { c, history } = create();
    history.load.and.rejectWith(new Error('corrupt run'));
    await c.select(listing({}));
    expect(c.detailError).toBe('corrupt run');
  });
});
