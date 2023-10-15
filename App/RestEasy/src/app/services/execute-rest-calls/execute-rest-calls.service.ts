import { Injectable } from '@angular/core';

export interface ExecuteRestAction {
  verb: string;
  protocol: string;
  url: string;
};

@Injectable({
  providedIn: 'root'
})
export class ExecuteRestCallsService {

  constructor() { }

  getIpcRenderer(){
    return (<any>window).ipc;
  }

  async executeTest(verb: string, protocol: string, url: string) {
    var response = await this.getIpcRenderer().invoke('testRest', { verb: verb, protocol: protocol, url: url });
    console.log(response);
    return response;
  }
}
