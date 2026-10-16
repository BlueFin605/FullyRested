import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { RequestNode, RunNode, buildAppRunRecord, buildScopeRunRecord, casesForScope, prepareRequest, validateResponse } from '@fullyrested/core';
import type { AppScopeCase, AppSendNode, Collection, ContainerNode, ExecuteRestAction, RestActionResult, RunRecord } from '@fullyrested/core';
import { LatestResultsService, resultKey } from '../latest-results/latest-results.service';
import { CollectionTreeService } from '../collection-tree/collection-tree.service';
import { RunHistoryService } from '../run-history/run-history.service';
import { mockRestResult } from '../mocks/mock-rest-result';


//export const EmptyActionResultBody: RestActionResultBody = {contentType: undefined, body: undefined };
export const EmptyActionResult: RestActionResult = { status: "", statusText: undefined, headers: {}, headersSent: {}, body: undefined, validated: undefined };

// What the UI shows about a response beyond what core returns: how long it took and how big it was
export interface TimedActionResult extends RestActionResult {
  durationMs?: number;
  sizeBytes?: number;
}

export interface ScopeProgress { done: number; total: number; passed: number; failed: number; }

interface SentCase {
  resolved?: ExecuteRestAction; substituted?: ExecuteRestAction; result?: TimedActionResult; error?: string; thrown?: unknown; ms: number;
}

const runIdOf = (node: RequestNode | RunNode): string | undefined => node instanceof RunNode ? node.run.id : undefined;

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

  // Resolves the node through its folders, environment and collection, sends it and checks the response:
  // the same steps the CLI runs
  async executeNode(node: RequestNode | RunNode, environmentId?: string): Promise<TimedActionResult> {
    const sent = await this.sendNode(node, environmentId);
    void this.record(node, environmentId, sent);
    if (sent.result == undefined) throw sent.thrown;
    this.latest.set(resultKey(node.path, runIdOf(node)), sent.result);
    return sent.result;
  }

  // Runs every case under a folder or the collection, in tree order, and saves ONE record for the batch.
  // A failed or errored case never stops the batch. Returns undefined when there is nothing to run or a batch is already running.
  async executeScope(scope: ContainerNode, environmentId?: string, selection = 'collection'): Promise<RunRecord | undefined> {
    if (this.running) return undefined;
    const cases = casesForScope(scope);
    if (cases.length == 0) return undefined;

    this.running = true;
    this.cancelled = false;
    const done: AppScopeCase[] = [];
    let passed = 0;
    let failed = 0;
    try {
      this.progress.next({ done: 0, total: cases.length, passed, failed });
      for (const c of cases) {
        if (this.cancelled) break;
        const sent = await this.sendNode(c.node, environmentId);
        if (sent.result != undefined) this.latest.set(resultKey(c.node.path, runIdOf(c.node)), sent.result);
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
      } catch (error) {
        console.warn(`[FullyRested] the run was not recorded: ${(error as Error).message}`);
      }
      return record;
    } finally {
      this.running = false;
      this.progress.next(undefined);
    }
  }

  // Stops the running batch after the case in flight; the cases finished are still saved
  cancelScope(): void {
    this.cancelled = true;
  }

  // Never throws: a send that could not be resolved or sent comes back as an error
  private async sendNode(node: RequestNode | RunNode, environmentId: string | undefined): Promise<SentCase> {
    const started = performance.now();
    let resolved: ExecuteRestAction | undefined;
    try {
      resolved = node.resolve({ environmentId });
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
