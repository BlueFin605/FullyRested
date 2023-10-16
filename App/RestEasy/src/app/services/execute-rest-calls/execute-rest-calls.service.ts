import { Injectable } from '@angular/core';
import { RestActionComponent } from 'src/app/components/rest-action/rest-action.component';

export interface ExecuteRestAction {
  verb: string;
  protocol: string;
  url: string;
};

export interface RestActionResult {
  status:      number | string;
  statusText:  string | undefined;
  headers:     { [header: string]: number };
  headersSent: { [header: string]: number };
  data:        any;
}

export const EmptyActionResult: RestActionResult = {status: "", statusText: undefined, headers: {}, headersSent: {}, data: {}};

@Injectable({
  providedIn: 'root'
})
export class ExecuteRestCallsService {

  constructor() { }

  getIpcRenderer(){
    return (<any>window).ipc;
  }

  async executeTest(verb: string, protocol: string, url: string, headers: any): Promise<RestActionResult> {
    var response = await this.getIpcRenderer().invoke('testRest', { verb: verb, protocol: protocol, url: url, headers: headers });
    console.log(response);
    return response;
  }
}
