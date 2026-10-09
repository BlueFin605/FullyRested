import { Injectable } from '@angular/core';
import { Collection, applyEnvironment } from '@fullyrested/core';
import { RestActionResult, ExecuteRestAction, IExecuteRestAction } from '@fullyrested/core';
import { mockRestResult } from '../mocks/mock-rest-result';


//export const EmptyActionResultBody: RestActionResultBody = {contentType: undefined, body: undefined };
export const EmptyActionResult: RestActionResult = { status: "", statusText: undefined, headers: {}, headersSent: {}, body: undefined, validated: undefined };

@Injectable({
  providedIn: 'root'
})
export class ExecuteRestCallsService {

  constructor() { }

  getIpcRenderer() {
    return (<any>window).ipc;
  }

  async executeTest(action: ExecuteRestAction, collection: Collection | undefined): Promise<RestActionResult> {
    var replaced: IExecuteRestAction = applyEnvironment(action, collection?.config).replaceVariables();
  
    if (this.getIpcRenderer() == undefined)
      return mockRestResult(replaced);

    var response = await this.getIpcRenderer().invoke('testRest', replaced);
    return response;
  }
}