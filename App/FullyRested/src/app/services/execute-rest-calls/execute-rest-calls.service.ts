import { Injectable } from '@angular/core';
import { Collection, applyEnvironment } from '@fullyrested/core';
import { ExecuteRestAction } from '@fullyrested/core';
import type { RestActionResult, IExecuteRestAction } from '@fullyrested/core';
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

  async executeTest(action: ExecuteRestAction, collection: Collection | undefined): Promise<TimedActionResult> {
    var replaced: IExecuteRestAction = applyEnvironment(action, collection?.config).replaceVariables();

    const started = performance.now();
    const response: RestActionResult = this.getIpcRenderer() == undefined
      ? await mockRestResult(replaced)
      : await this.getIpcRenderer().invoke('testRest', replaced);

    return {
      ...response,
      durationMs: Math.round(performance.now() - started),
      sizeBytes: response.body?.body?.byteLength,
    };
  }
}
