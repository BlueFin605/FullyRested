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
    const resolved = node.resolve({ environmentId });
    const request = resolved.replaceVariables();

    const started = performance.now();
    const response: RestActionResult = this.getIpcRenderer() == undefined
      ? await mockRestResult(request)
      : await this.getIpcRenderer().invoke('testRest', request);

    const result: TimedActionResult = {
      ...response,
      validated: validateResponse(request, response),
      durationMs: Math.round(performance.now() - started),
      sizeBytes: response.body?.body?.byteLength,
    };

    await this.record(node, resolved, request, result);
    return result;
  }

  // A send is one run of one case. Failing to record must never fail the send, so everything here is
  // best-effort: no collection open, a read-only folder or a full disk all just warn.
  private async record(node: RequestNode | RunNode, resolved: ExecuteRestAction,
                       substituted: ExecuteRestAction, result: TimedActionResult): Promise<void> {
    try {
      const collection = this.trees.openCollection;
      if (collection == undefined) return;

      const sent: AppSendNode = node instanceof RunNode
        ? { kind: 'run', name: node.name, path: node.path, runName: node.run.name }
        : { kind: 'request', name: node.name, path: node.path };

      await this.history.save(buildAppRunRecord({
        collection: collection.filename,
        environment: this.environmentNameOf(collection),
        node: sent,
        request: prepareRequest(substituted),
        result,
        validation: result.validated,
        ms: result.durationMs ?? 0,
        secrets: resolved.secrets
      }));
    } catch (error) {
      console.warn(`[FullyRested] the send was not recorded: ${(error as Error).message}`);
    }
  }

  // The same rule as the toolbar's activeEnvironmentName, minus its 'No environment' label
  private environmentNameOf(collection: Collection): string | undefined {
    const id = collection.config?.selectedEnvironmentId;
    return collection.config?.environments?.find(e => e.id == id)?.name;
  }
}
