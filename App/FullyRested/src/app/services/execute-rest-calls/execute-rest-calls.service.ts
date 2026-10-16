import { Injectable, inject } from '@angular/core';
import { RequestNode, RunNode, buildAppRunRecord, prepareRequest, validateResponse } from '@fullyrested/core';
import type { AppSendNode, Collection, ExecuteRestAction, RestActionResult } from '@fullyrested/core';
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

@Injectable({
  providedIn: 'root'
})
export class ExecuteRestCallsService {

  private readonly trees = inject(CollectionTreeService);
  private readonly history = inject(RunHistoryService);

  getIpcRenderer() {
    return (<any>window).ipc;
  }

  // Resolves the node through its folders, environment and collection, sends it and checks the response:
  // the same steps the CLI runs
  async executeNode(node: RequestNode | RunNode, environmentId?: string): Promise<TimedActionResult> {
    const started = performance.now();
    let resolved: ExecuteRestAction;
    let request: ExecuteRestAction;
    let response: RestActionResult;
    try {
      resolved = node.resolve({ environmentId });
      request = resolved.replaceVariables();
      response = this.getIpcRenderer() == undefined
        ? await mockRestResult(request)
        : await this.getIpcRenderer().invoke('testRest', request);
    } catch (error) {
      // a send that could not be resolved or sent is still a run, recorded as an error
      void this.record(node, environmentId, { error: (error as Error)?.message ?? String(error), ms: Math.round(performance.now() - started) });
      throw error;
    }

    const result: TimedActionResult = {
      ...response,
      validated: validateResponse(request, response),
      durationMs: Math.round(performance.now() - started),
      sizeBytes: response.body?.body?.byteLength,
    };

    void this.record(node, environmentId, { resolved, substituted: request, result, ms: result.durationMs ?? 0 });
    return result;
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
