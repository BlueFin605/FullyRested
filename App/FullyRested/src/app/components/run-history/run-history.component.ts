import { ChangeDetectionStrategy, Component, Input, OnChanges, effect, inject } from '@angular/core';
import { Collection, RunListing, isAppRunId } from '@fullyrested/core';
import { RunHistoryService } from '../../services/run-history/run-history.service';

@Component({
  selector: 'app-run-history',
  templateUrl: './run-history.component.html',
  styleUrls: ['./run-history.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class RunHistoryComponent implements OnChanges {
  @Input() collection: Collection | undefined;

  runs: RunListing[] = [];
  selected: RunListing | undefined;
  loading = false;
  error: string | undefined;

  private readonly history = inject(RunHistoryService);

  constructor() {
    // a send writes a record and bumps changed: an open pane picks it up without a file watcher.
    // 0 is the initial value (ngOnChanges loads then), and the reload runs in a microtask so it never
    // writes component state in the middle of change detection.
    effect(() => {
      if (this.history.changed() == 0) return;
      void Promise.resolve().then(() => this.refresh());
    });
  }

  ngOnChanges() {
    void this.refresh();
  }

  // Shown in the heading so it is obvious what to add to .gitignore: the app never edits it
  get runsFolder(): string {
    return this.collection == undefined ? '' : `${this.collection.path}/.fullyrested-runs`;
  }

  async refresh(): Promise<void> {
    this.selected = undefined;
    if (this.collection == undefined) {
      this.runs = [];
      return;
    }
    this.loading = true;
    this.error = undefined;
    try {
      this.runs = await this.history.list();
    } catch (error) {
      this.error = (error as Error).message;
      this.runs = [];
    } finally {
      this.loading = false;
    }
  }

  select(run: RunListing) {
    this.selected = run;
  }

  isApp(run: RunListing): boolean {
    return isAppRunId(run.runId);
  }

  outcome(run: RunListing): 'pass' | 'fail' | 'error' {
    if (run.errored > 0) return 'error';
    return run.failed > 0 ? 'fail' : 'pass';
  }

  label(run: RunListing): string {
    const cases = run.passed + run.failed + run.errored;
    return run.status != undefined ? String(run.status) : `${cases} ${cases == 1 ? 'case' : 'cases'}`;
  }
}
