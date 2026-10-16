import { ChangeDetectionStrategy, Component, Input, OnChanges, effect, inject } from '@angular/core';
import {
  BodyResult, Collection, RunListing, RunRecord, ValidationCheck, caseBody, caseRequest, caseResponse, isAppRunId, summary
} from '@fullyrested/core';
import { bodyKind, editorLanguage } from '../rest-action/response/display-response-body/body-format';
import { CodeLanguage } from '../code-editor/code-editor.component';
import { RunHistoryService } from '../../services/run-history/run-history.service';

// caseBody's default cap, in characters, which is what keeps a huge recorded body out of the DOM
const BODY_CAP = 32768;

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
    this.record = undefined;
    this.detailError = undefined;
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

  record: RunRecord | undefined;
  caseIndex = 1;
  detailError: string | undefined;

  async select(run: RunListing): Promise<void> {
    this.selected = run;
    this.record = undefined;
    this.detailError = undefined;
    try {
      this.record = await this.history.load(run.runId);
      this.caseIndex = 1;
    } catch (error) {
      this.detailError = (error as Error).message;
    }
  }

  // Each view is core's answer to the question the matching MCP tool asks. A QueryError means "this
  // case has no response / no body", which is a thing to say, not a failure.
  private view<T>(fn: () => T): { value?: T; message?: string } {
    if (this.record == undefined) return {};
    try {
      return { value: fn() };
    } catch (error) {
      return { message: (error as Error).message };
    }
  }

  get requestView() { return this.view(() => caseRequest(this.record!, this.caseIndex)); }
  get responseView() { return this.view(() => caseResponse(this.record!, this.caseIndex, { headers: true })); }
  get requestBody() { return this.view(() => caseBody(this.record!, this.caseIndex, { request: true })); }
  get responseBody() { return this.view(() => caseBody(this.record!, this.caseIndex)); }
  get cases() { return this.record == undefined ? [] : summary(this.record).cases; }
  get currentCase() { return this.record?.cases.find(c => c.index == this.caseIndex); }

  // failures first, so the reason a case failed is the first thing seen
  get checks(): ValidationCheck[] {
    const checks = this.currentCase?.validation?.checks ?? [];
    return [...checks.filter(k => !k.passed), ...checks.filter(k => k.passed)];
  }

  headerRows(headers: Record<string, string> | undefined): [string, string][] {
    return Object.entries(headers ?? {});
  }

  // the editor shows the text of a text or json body; a binary one is not shown
  bodyText(body: BodyResult): string {
    return typeof body.content == "string" ? body.content : JSON.stringify(body.content, null, 2);
  }

  language(body: BodyResult): CodeLanguage {
    return editorLanguage(bodyKind(body.contentType));
  }

  readonly bodyCap = BODY_CAP;

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
