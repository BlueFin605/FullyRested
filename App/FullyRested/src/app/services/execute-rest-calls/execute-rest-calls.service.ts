import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { RequestNode, RunNode, normaliseTrigger, buildAppRunRecord, buildAppWebSocketRunRecord, buildScopeRunRecord, casesForScope, prepareRequest, addCaptured, captureFromResponse, substituteDeep, validateResponse } from '@fullyrested/core';
import type { Captured, RestAction, TriggerCall, AppScopeCase, AppSendNode, Collection, ContainerNode, ExecuteRestAction, RestActionResult, RunRecord, SecretTable, WebSocketTestResult } from '@fullyrested/core';
import { LatestResultsService, resultKey } from '../latest-results/latest-results.service';
import { CollectionTreeService } from '../collection-tree/collection-tree.service';
import { RunHistoryService } from '../run-history/run-history.service';
import { mockRestResult } from '../mocks/mock-rest-result';


//export const EmptyActionResultBody: RestActionResultBody = {contentType: undefined, body: undefined };
export const EmptyActionResult: RestActionResult = { status: "", statusText: undefined, headers: {}, headersSent: {}, body: undefined, validated: undefined };

// What the UI shows about a response beyond what core returns: how long it took and how big it was
export interface TimedActionResult extends RestActionResult {
  // the trigger requests a websocket test fired, in order
  triggerCalls?: TriggerCall[];
  durationMs?: number;
  sizeBytes?: number;
}

export interface ScopeProgress { done: number; total: number; passed: number; failed: number; }

// How the last batch ended: `total` is how many cases the scope held (0 = nothing to run), `ran` how many were
// sent, `recorded` whether a history record was saved (an unsaved collection runs but writes none)
export interface ScopeOutcome { total: number; ran: number; cancelled: boolean; recorded: boolean; }

interface SentWebSocket {
  resolved?: ExecuteRestAction; url: string; headers: { [header: string]: string }; message?: string;
  result?: WebSocketTestResult; error?: string; ms: number; shown: TimedActionResult;
  /** The websocket request's secrets plus its trigger request's, for redacting the record. */
  secrets?: SecretTable[];
}

interface SentCase {
  resolved?: ExecuteRestAction; substituted?: ExecuteRestAction; result?: TimedActionResult; error?: string; thrown?: unknown; ms: number;
}

// An errored send still gives the tabs something to show, in the shape of a response
const errorResult = (message: string, ms: number): TimedActionResult =>
  ({ ...EmptyActionResult, status: 'error', statusText: message, durationMs: ms });

const runIdOf = (node: RequestNode | RunNode): string | undefined => node instanceof RunNode ? node.run.id : undefined;

// A websocket test shown in the response panel: PASS or FAIL, the received messages as the body
export const webSocketResult = (test: WebSocketTestResult, ms: number): TimedActionResult => {
  const bytes = new TextEncoder().encode(test.messages.map(m => m.text).join('\n'));
  return {
    status: test.passed ? 'PASS' : 'FAIL',
    statusText: test.passed ? `${test.messages.length} message(s) received` : test.errors.join('; '),
    headers: {},
    headersSent: {},
    body: { contentType: 'text/plain', body: bytes.buffer as ArrayBuffer },
    validated: { valid: test.passed, errors: test.errors, information: [] },
    durationMs: ms,
    sizeBytes: bytes.byteLength,
    ...(test.triggerCalls?.length ? { triggerCalls: test.triggerCalls } : {})
  };
};

const isWebSocketNode =(node: RequestNode | RunNode): boolean =>
  (node instanceof RunNode ? node.request : node).action.type == 'websocket';

const sendNodeOf = (node: RequestNode | RunNode): AppSendNode => node instanceof RunNode
  ? { kind: 'run', name: node.name, path: node.path, runName: node.run.name }
  : { kind: 'request', name: node.name, path: node.path };

@Injectable({
  providedIn: 'root'
})
export class ExecuteRestCallsService {

  private readonly trees = inject(CollectionTreeService);
  private readonly history = inject(RunHistoryService);

  getIpcRenderer() {
    return (<any>window).ipc;
  }

  private readonly latest = inject(LatestResultsService);
  private readonly progress = new BehaviorSubject<ScopeProgress | undefined>(undefined);
  private running = false;
  private cancelled = false;

  // The batch's progress; undefined when no batch is running
  readonly scopeProgress$: Observable<ScopeProgress | undefined> = this.progress.asObservable();

  // Emits whenever a single request or run is sent
  private readonly sent = new Subject<void>();
  readonly sent$: Observable<void> = this.sent.asObservable();

  // How the most recent batch ended; set before scopeProgress$ goes idle
  lastScope: ScopeOutcome | undefined;

  private keyOf(node: RequestNode | RunNode): string {
    const collection = this.trees.openCollection;
    return resultKey(collection?.filename || collection?.path, node.path, runIdOf(node));
  }

  // The http request a websocket request's trigger names, resolved like any send (folders, environment, variables),
  // with its timing, ready for the runWsTest payload. In a batch, `captured` holds the values earlier cases
  // captured. undefined when there is no trigger; throws, naming the locator, when it cannot be resolved.
  resolveTrigger(action: RestAction, environmentId: string | undefined, captured?: Captured) {
    if (action.trigger == undefined) return undefined;
    const trigger = normaliseTrigger(action.trigger);
    const target = this.trees.tree.value?.find(trigger.request);
    if (!(target instanceof RequestNode)) throw new Error(`Trigger request '${trigger.request}' not found in the collection`);
    if ((target.action.type ?? 'http') != 'http') throw new Error(`Trigger request '${trigger.request}' is a websocket request; a trigger must be http`);
    let node: RequestNode | RunNode = target;
    if (trigger.run != undefined) {
      const run = target.runs().find(r => r.run.id == trigger.run || r.run.name == trigger.run);
      if (run == undefined) throw new Error(`Trigger run '${trigger.run}' not found in '${trigger.request}'`);
      node = run;
    }
    const request = node.resolve({ environmentId, captured }).replaceVariables();
    return { request, repeat: trigger.repeat, interval: trigger.interval, delay: trigger.delay };
  }

  // Sends one http request of the open collection (optionally one of its runs) through the normal send
  // path; used by the live panel's Fire request. Throws when it cannot be found or sent.
  async fireRequest(path: string, runId: string | undefined, environmentId: string | undefined): Promise<TimedActionResult> {
    const target = this.trees.tree.value?.find(path);
    if (!(target instanceof RequestNode)) throw new Error(`Request '${path}' not found in the collection`);
    return this.executeNode(runId ? target.run(runId) : target, environmentId);
  }

  // Resolves the node through its folders, environment and collection, sends it and checks the response:
  // the same steps the CLI runs
  async executeNode(node: RequestNode | RunNode, environmentId?: string): Promise<TimedActionResult> {
    this.sent.next();
    if (isWebSocketNode(node)) return this.executeWebSocket(node, environmentId);
    const sent = await this.sendNode(node, environmentId);
    void this.record(node, environmentId, sent);
    if (sent.result == undefined) {
      this.latest.set(this.keyOf(node), errorResult(sent.error ?? 'The request failed', sent.ms));
      throw sent.thrown;
    }
    this.latest.set(this.keyOf(node), sent.result);
    return sent.result;
  }

  // Runs a websocket request as a test: the main process owns the socket and adds any query-placed token,
  // so this only resolves the request and sends it over IPC. Never throws; a failure is shown as an error
  // result. Recorded in run history like an HTTP send.
  private async executeWebSocket(node: RequestNode | RunNode, environmentId: string | undefined): Promise<TimedActionResult> {
    const sent = await this.sendWebSocket(node, environmentId);
    this.latest.set(this.keyOf(node), sent.shown);
    void this.recordWebSocket(node, environmentId, sent);
    return sent.shown;
  }

  // The one websocket run, shared by a single Run and by a folder or collection run. Never throws.
  // In a batch, `captured` (read, never added to: a websocket case does not capture) reaches the url,
  // headers, message, expect and the trigger request.
  private async sendWebSocket(node: RequestNode | RunNode, environmentId: string | undefined, captured?: Captured): Promise<SentWebSocket> {
    const started = performance.now();
    const action = (node instanceof RunNode ? node.request : node).action;
    let resolved: ExecuteRestAction | undefined;
    let url = '';
    let headers: { [header: string]: string } = {};
    let message: string | undefined;
    let result: WebSocketTestResult | undefined;
    let error: string | undefined;
    let secrets: SecretTable[] | undefined;
    try {
      resolved = node.resolve({ environmentId, captured });
      secrets = resolved.secrets;
      const request = resolved.replaceVariables();
      url = request.url;
      headers = request.headers;
      message = substituteDeep(action.message ?? '', request.variables, request.secrets);
      const expect = substituteDeep(action.expect, request.variables, request.secrets);
      const trigger = this.resolveTrigger(action, environmentId, captured);
      if (trigger != undefined) secrets = [...(secrets ?? []), ...(trigger.request.secrets ?? [])];
      const ipc = this.getIpcRenderer();
      if (ipc == undefined) throw new Error('Websocket requests can only be run in the desktop app');
      result = await ipc.invoke('runWsTest', {
        root: this.trees.openCollection?.path,
        request: { url, headers, authentication: request.authentication },
        message,
        expect,
        ...(trigger == undefined ? {} : { trigger })
      });
    } catch (e) {
      error = (e as Error)?.message ?? String(e);
    }

    const ms = Math.round(performance.now() - started);
    const shown = result == undefined ? errorResult(error ?? 'The websocket test failed', ms) : webSocketResult(result, ms);
    return { resolved, url, headers, message, result, error, ms, shown, secrets };
  }

  private async recordWebSocket(node: RequestNode | RunNode, environmentId: string | undefined, outcome: {
    resolved?: ExecuteRestAction; url: string; headers: { [header: string]: string }; message?: string;
    result?: WebSocketTestResult; error?: string; ms: number; secrets?: SecretTable[];
  }): Promise<void> {
    try {
      const collection = this.trees.openCollection;
      if (collection == undefined || !collection.filename) return;
      await this.history.save(collection.path, buildAppWebSocketRunRecord({
        collection: collection.filename,
        environment: this.environmentNameOf(collection, environmentId),
        node: sendNodeOf(node),
        url: outcome.url,
        headers: outcome.headers,
        message: outcome.message,
        result: outcome.result,
        error: outcome.error,
        ms: outcome.ms,
        secrets: outcome.secrets ?? outcome.resolved?.secrets
      }));
    } catch (error) {
      console.warn(`[FullyRested] the websocket run was not recorded: ${(error as Error).message}`);
    }
  }

  // Runs every case under a folder or the collection, in tree order, and saves ONE record for the batch.
  // A failed or errored case never stops the batch. Returns undefined when there is nothing to run or a batch is already running.
  async executeScope(scope: ContainerNode, environmentId?: string, selection = 'collection'): Promise<RunRecord | undefined> {
    if (this.running) return undefined;
    const cases = casesForScope(scope);
    if (cases.length == 0) {
      this.lastScope = { total: 0, ran: 0, cancelled: false, recorded: false };
      return undefined;
    }

    this.running = true;
    this.cancelled = false;
    const done: AppScopeCase[] = [];
    // Values captured by one case, for the cases after it in this batch only
    const captured: Captured = [];
    let passed = 0;
    let failed = 0;
    let recorded = false;
    try {
      this.progress.next({ done: 0, total: cases.length, passed, failed });
      for (const c of cases) {
        if (this.cancelled) break;
        if (isWebSocketNode(c.node)) {
          const ws = await this.sendWebSocket(c.node, environmentId, captured);
          this.latest.set(this.keyOf(c.node), ws.shown);
          if (ws.result?.passed === true) passed++; else failed++;
          done.push({
            node: sendNodeOf(c.node),
            webSocket: { url: ws.url, headers: ws.headers, message: ws.message, result: ws.result },
            error: ws.error,
            ms: ws.ms,
            secrets: ws.secrets ?? ws.resolved?.secrets
          });
          this.progress.next({ done: done.length, total: cases.length, passed, failed });
          continue;
        }
        const sent = await this.sendNode(c.node, environmentId, captured);
        this.latest.set(this.keyOf(c.node), sent.result ?? errorResult(sent.error ?? 'The request failed', sent.ms));
        const ok = sent.error == undefined && sent.result?.validated?.valid !== false;
        if (ok) passed++; else failed++;
        done.push({
          node: sendNodeOf(c.node),
          request: sent.substituted == undefined ? undefined : prepareRequest(sent.substituted),
          result: sent.result,
          validation: sent.result?.validated,
          error: sent.error,
          ms: sent.ms,
          secrets: sent.resolved?.secrets
        });
        this.progress.next({ done: done.length, total: cases.length, passed, failed });
      }

      const collection = this.trees.openCollection;
      if (done.length == 0 || collection == undefined || !collection.filename) return undefined;
      const record = buildScopeRunRecord({
        collection: collection.filename,
        environment: this.environmentNameOf(collection, environmentId),
        selection,
        cases: done
      });
      try {
        await this.history.save(collection.path, record);
        recorded = true;
      } catch (error) {
        console.warn(`[FullyRested] the run was not recorded: ${(error as Error).message}`);
      }
      return record;
    } finally {
      this.lastScope = { total: cases.length, ran: done.length, cancelled: this.cancelled, recorded };
      this.running = false;
      this.progress.next(undefined);
    }
  }

  // Stops the running batch after the case in flight; the cases finished are still saved
  cancelScope(): void {
    this.cancelled = true;
  }

  // Never throws: a send that could not be resolved or sent comes back as an error
  private async sendNode(node: RequestNode | RunNode, environmentId: string | undefined, captured?: Captured): Promise<SentCase> {
    const started = performance.now();
    let resolved: ExecuteRestAction | undefined;
    try {
      resolved = node.resolve({ environmentId, captured });
      const request = resolved.replaceVariables();
      const response: RestActionResult = this.getIpcRenderer() == undefined
        ? await mockRestResult(request)
        : await this.getIpcRenderer().invoke('testRest', request);
      const result: TimedActionResult = {
        ...response,
        validated: validateResponse(request, response),
        durationMs: Math.round(performance.now() - started),
        sizeBytes: response.body?.body?.byteLength,
      };
      // A value captured here is for the cases after this one; one that finds nothing fails this case
      const rules = captured != undefined && typeof response.status == 'number' && response.status >= 0 ? node.captureRules() : [];
      if (captured != undefined && rules.length > 0) {
        const outcome = captureFromResponse(rules, response);
        addCaptured(captured, outcome.values);
        if (outcome.errors.length > 0)
          return { resolved, substituted: request, result, error: outcome.errors.join('; '), ms: result.durationMs ?? 0 };
      }
      return { resolved, substituted: request, result, ms: result.durationMs ?? 0 };
    } catch (error) {
      return { error: (error as Error)?.message ?? String(error), thrown: error, ms: Math.round(performance.now() - started) };
    }
  }

  // A send is one run of one case. Failing to record must never fail the send (and the disk write is
  // not awaited), so everything here is best-effort: no or unsaved collection, a read-only folder or a
  // full disk all just warn.
  private async record(node: RequestNode | RunNode, environmentId: string | undefined, outcome: {
    resolved?: ExecuteRestAction; substituted?: ExecuteRestAction; result?: TimedActionResult; error?: string; ms: number;
  }): Promise<void> {
    try {
      const collection = this.trees.openCollection;
      // an unsaved collection has no folder to hold runs
      if (collection == undefined || !collection.filename) return;

      const sent: AppSendNode = node instanceof RunNode
        ? { kind: 'run', name: node.name, path: node.path, runName: node.run.name }
        : { kind: 'request', name: node.name, path: node.path };

      await this.history.save(collection.path, buildAppRunRecord({
        collection: collection.filename,
        environment: this.environmentNameOf(collection, environmentId),
        node: sent,
        request: outcome.substituted == undefined ? undefined : prepareRequest(outcome.substituted),
        result: outcome.result,
        validation: outcome.result?.validated,
        error: outcome.error,
        ms: outcome.ms,
        secrets: outcome.resolved?.secrets
      }));
    } catch (error) {
      console.warn(`[FullyRested] the send was not recorded: ${(error as Error).message}`);
    }
  }

  // The environment the send was made with, by name; none when it was sent without one
  private environmentNameOf(collection: Collection, id: string | undefined): string | undefined {
    return collection.config?.environments?.find(e => e.id == id)?.name;
  }
}
