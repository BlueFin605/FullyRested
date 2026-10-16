import { ChangeDetectionStrategy, Component, DestroyRef, Input, OnChanges, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  BodyResult, Collection, DEFAULT_BODY_CAP, RUNS_FOLDER, RunListing, RunRecord, ValidationCheck, caseBody, caseRequest,
  caseResponse, isAppRunId, listingOf, summary
} from '@fullyrested/core';
import { bodyKind, editorLanguage } from '../rest-action/response/display-response-body/body-format';
import { CodeLanguage } from '../code-editor/code-editor.component';
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

  record: RunRecord | undefined;
  caseIndex = 1;
  detailError: string | undefined;

  private readonly history = inject(RunHistoryService);

  // bumped by every refresh() and select(), so a slow earlier answer cannot overwrite a newer one
  private listToken = 0;
  private selectToken = 0;

  constructor() {
    // a send writes a record: an open pane adds it to the top of the list, keeping the selection and
    // the open detail. Nothing is re-listed, so a hidden pane costs nothing per send.
    this.history.saved$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(record => {
      if (this.root == undefined || record.collection != this.collection?.filename) return;
      this.runs = [listingOf(record), ...this.runs.filter(r => r.runId != record.runId)];
    });
  }

  ngOnChanges() {
    void this.refresh();
  }

  // The folder runs are listed from; an unsaved collection (no file yet) has none, so it counts as no collection
  private get root(): string | undefined {
    return this.collection?.filename ? this.collection.path : undefined;
  }

  get hasCollection(): boolean {
    return this.root != undefined;
  }

  // Shown in the heading so it is obvious what to add to .gitignore: the app never edits it. It lives
  // inside the collection folder, so the name alone is what matters.
  readonly runsFolder = RUNS_FOLDER;

  async refresh(): Promise<void> {
    const token = ++this.listToken;
    this.selectToken++;
    this.selected = undefined;
    this.record = undefined;
    this.detailError = undefined;
    const root = this.root;
    if (root == undefined) {
      this.runs = [];
      this.loading = false;
      this.error = undefined;
      return;
    }
    this.loading = true;
    this.error = undefined;
    try {
      const runs = await this.history.list(root);
      if (token != this.listToken) return;
      this.runs = runs;
    } catch (error) {
      if (token != this.listToken) return;
      this.error = (error as Error).message;
      this.runs = [];
    } finally {
      if (token == this.listToken) this.loading = false;
    }
  }

  async select(run: RunListing): Promise<void> {
    const root = this.root;
    if (root == undefined) return;
    const token = ++this.selectToken;
    this.selected = run;
    this.record = undefined;
    this.detailError = undefined;
    try {
      const record = await this.history.load(root, run.runId);
      if (token != this.selectToken) return;
      this.record = record;
      this.caseIndex = 1;
    } catch (error) {
      if (token != this.selectToken) return;
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

  readonly bodyCap = DEFAULT_BODY_CAP;

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
