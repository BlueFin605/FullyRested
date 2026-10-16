import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { ExecuteRestCallsService, ScopeProgress } from '../../services/execute-rest-calls/execute-rest-calls.service';
import { ScopeRunStatusComponent } from './scope-run-status.component';

describe('ScopeRunStatusComponent', () => {
  let progress$: BehaviorSubject<ScopeProgress | undefined>;
  let cancelScope: jasmine.Spy;
  let fixture: ComponentFixture<ScopeRunStatusComponent>;

  beforeEach(() => {
    progress$ = new BehaviorSubject<ScopeProgress | undefined>(undefined);
    cancelScope = jasmine.createSpy('cancelScope');
    TestBed.configureTestingModule({
      imports: [ScopeRunStatusComponent],
      providers: [{ provide: ExecuteRestCallsService, useValue: { scopeProgress$: progress$.asObservable(), cancelScope } }],
    });
    fixture = TestBed.createComponent(ScopeRunStatusComponent);
    fixture.detectChanges();
  });

  const text = () => (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ').trim();

  it('renders nothing when idle', () => {
    expect(text()).toBe('');
  });

  it('shows progress with counts', () => {
    progress$.next({ done: 2, total: 5, passed: 1, failed: 1 });
    fixture.detectChanges();
    expect(text()).toContain('Running 2 of 5');
    expect(text()).toContain('1 passed');
    expect(text()).toContain('1 failed');
  });

  it('cancels the scope from the Cancel button', () => {
    progress$.next({ done: 2, total: 5, passed: 2, failed: 0 });
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button.cancel') as HTMLButtonElement).click();
    expect(cancelScope).toHaveBeenCalled();
  });

  it('shows the summary when the run finishes, then clears it', fakeAsync(() => {
    progress$.next({ done: 5, total: 5, passed: 4, failed: 1 });
    progress$.next(undefined);
    fixture.detectChanges();
    expect(text()).toContain('Run finished: 4 passed, 1 failed');
    tick(10000);
    fixture.detectChanges();
    expect(text()).toBe('');
  }));

  it('emits viewHistory from the View link', () => {
    const emitted = jasmine.createSpy('viewHistory');
    fixture.componentInstance.viewHistory.subscribe(emitted);
    progress$.next({ done: 1, total: 1, passed: 1, failed: 0 });
    progress$.next(undefined);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button.view') as HTMLButtonElement).click();
    expect(emitted).toHaveBeenCalled();
  });
});
