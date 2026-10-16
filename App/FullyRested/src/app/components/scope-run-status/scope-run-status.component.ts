import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, EventEmitter, Output, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ExecuteRestCallsService, ScopeProgress } from '../../services/execute-rest-calls/execute-rest-calls.service';

const FINISHED_SHOWN_MS = 8000;

// Status line for a folder/collection run: progress with Cancel while it runs, then a short summary
@Component({
  selector: 'app-scope-run-status',
  templateUrl: './scope-run-status.component.html',
  styleUrls: ['./scope-run-status.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ScopeRunStatusComponent {
  // the history pane lists newest first and updates live, so opening it shows the run just finished
  @Output() viewHistory = new EventEmitter<void>();

  progress: ScopeProgress | undefined;
  finished: { passed: number; failed: number; ran: number; total: number; cancelled: boolean; recorded: boolean } | undefined;

  private readonly era = inject(ExecuteRestCallsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearTimer());
    this.era.scopeProgress$.pipe(takeUntilDestroyed()).subscribe(p => {
      const last = this.progress;
      this.cdr.markForCheck();
      this.progress = p;
      this.clearTimer();
      if (p != undefined) {
        this.finished = undefined;
      } else if (last != undefined) {
        const outcome = this.era.lastScope;
        this.finished = {
          passed: last.passed,
          failed: last.failed,
          ran: outcome?.ran ?? last.done,
          total: outcome?.total ?? last.total,
          cancelled: outcome?.cancelled ?? false,
          recorded: outcome?.recorded ?? true,
        };
        this.timer = setTimeout(() => {
          this.finished = undefined;
          this.cdr.markForCheck();
        }, FINISHED_SHOWN_MS);
      }
    });
  }

  cancel(): void {
    this.era.cancelScope();
  }

  private clearTimer(): void {
    if (this.timer != undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
