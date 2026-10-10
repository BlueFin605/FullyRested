import { Injectable } from '@angular/core';
import { RequestNode, RunNode, validateResponse } from '@fullyrested/core';
import type { RestActionResult } from '@fullyrested/core';
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

  constructor() { }

  getIpcRenderer() {
    return (<any>window).ipc;
  }

  // Resolves the node through its folders, environment and collection, sends it and checks the response:
  // the same steps the CLI runs
  async executeNode(node: RequestNode | RunNode, environmentId?: string): Promise<TimedActionResult> {
    const request = node.resolve({ environmentId }).replaceVariables();

    const started = performance.now();
    const response: RestActionResult = this.getIpcRenderer() == undefined
      ? await mockRestResult(request)
      : await this.getIpcRenderer().invoke('testRest', request);

    return {
      ...response,
      validated: validateResponse(request, response),
      durationMs: Math.round(performance.now() - started),
      sizeBytes: response.body?.body?.byteLength,
    };
  }
}
