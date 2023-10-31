import { Injectable } from '@angular/core';
import { RestActionResult } from '../execute-rest-calls/execute-rest-calls.service';
import { SystemSupportService } from '../system-support/system-support.service';

export interface HeaderTable {
  key: string;
  value: string;
  active: boolean;
  id: number;
};
export interface ParamTable {
  key: string;
  value: string;
  active: boolean;
  id: number;
};

export interface RestAction {
  id: string;
  name: string;
  verb: string;
  protocol: string;
  url: string;
  headers: HeaderTable[];
  parameters: ParamTable[];
  body: string;
}
export interface LocalRestAction {
  action: RestAction;
  dirty: boolean;
}

export interface CurrentState {
  actions: LocalRestAction[];
}

const EmptyActionJSON: string = JSON.stringify({ id: '', name: '', verb: 'get', protocol: 'https', url: '', headers: [], parameters: [], body: '{}' });
const EmptyLocalActionJSON: string = JSON.stringify({ action: CreateEmptyAction(), dirty: false });

export function CreateEmptyLocalAction(): LocalRestAction {
  return JSON.parse(EmptyLocalActionJSON);
}
export function CreateEmptyAction(): RestAction {
  return JSON.parse(EmptyActionJSON);
}


@Injectable({
  providedIn: 'root'
})

export class ActionRepositoryService {
  constructor(private systemSupport: SystemSupportService) { }

  private getIpcRenderer() {
    return (<any>window).ipc;
  }

  createNewAction(): LocalRestAction {
  var action = JSON.parse(EmptyLocalActionJSON);
  action.action.id = this.systemSupport.generateGUID();
  action.action.name = "<unnamed>"
  return action;

  }

  async getCurrentState(): Promise<CurrentState> {
    if (this.getIpcRenderer() == undefined)
      return this.mockCurrentState();

     var state: CurrentState = await this.getIpcRenderer().invoke('readState','');
    //  if (state.actions.length == 0)
    //     state.actions.push(CreateEmptyLocalAction());

     console.log(state);
     return state;
  }

  private mockCurrentState(): CurrentState {
    return {
      actions: [
        { action: this.getActionDetails1(), dirty: false },
        { action: this.getActionDetails2(), dirty: false },
        { action: this.getActionDetails3(), dirty: false }
      ]
    };
  }

  async saveCurrentState(state: CurrentState) {
    if (this.getIpcRenderer() == undefined)
      return;

    await this.getIpcRenderer().send('saveState', state);
  }

  private getActionDetails1(): RestAction {
    var action: RestAction = {
      id: this.systemSupport.generateGUID(),
      name: "Image (trademe)",
      body: JSON.stringify({ "products": [{ "name": "car", "product": [{ "name": "honda", "model": [{ "id": "civic", "name": "civic" }, { "id": "accord", "name": "accord" }, { "id": "crv", "name": "crv" }, { "id": "pilot", "name": "pilot" }, { "id": "odyssey", "name": "odyssey" }] }] }] }),
      verb: "get",
      protocol: "https",
      url: "www.trademe.co.nz/images/frend/trademe-logo-no-tagline.png",
      headers: [
        { key: "accept", value: "*/*", active: true, id: 1 },
        { key: "content-type", value: "application/x-www-form-urlencoded", active: true, id: 2 },
        { key: "user-agent", value: "RestEasy1.0", active: true, id: 3 },
        { key: "accept-encoding", value: "gzip, deflate, br", active: true, id: 4 },
        // {key: "host", value: "jsonplaceholder.typicode.com", active: true, id: 5}
      ],
      parameters: []
    };  //see https://jsonplaceholder.typicode.com/

    return action;
  }

  private getActionDetails2(): RestAction {
    var action: RestAction = {
      id: this.systemSupport.generateGUID(),
      name: "XML Result",
      body: "{}",
      verb: "get",
      protocol: "https",
      url: "cdn.animenewsnetwork.com/encyclopedia/api.xml?title=4658",
      headers: [
        { key: "accept", value: "*/*", active: true, id: 1 },
        { key: "content-type", value: "application/x-www-form-urlencoded", active: true, id: 2 },
        { key: "user-agent", value: "RestEasy1.1", active: true, id: 3 },
        { key: "accept-encoding", value: "gzip, deflate, br", active: true, id: 4 },
      ],
      parameters: [
        { key: "userid", value: "1", active: false, id: 1 }
      ]
    };  //see https://jsonplaceholder.typicode.com/

    return action;
  }

  private getActionDetails3(): RestAction {
    var action: RestAction = {
      id: this.systemSupport.generateGUID(),
      name: "JSON Result",
      body: "{}",
      verb: "get",
      protocol: "https",
      url: "jsonplaceholder.typicode.com/todos/1",
      headers: [
        { key: "accept", value: "*/*", active: true, id: 1 },
        { key: "content-type", value: "application/x-www-form-urlencoded", active: true, id: 2 },
        { key: "user-agent", value: "RestEasy1.2", active: true, id: 3 },
        { key: "accept-encoding", value: "gzip, deflate, br", active: true, id: 4 },
      ],
      parameters: [
        { key: "userid", value: "1", active: true, id: 1 },
        { key: "sort", value: "firstname", active: true, id: 1 }
      ]
    };  //see https://jsonplaceholder.typicode.com/

    return action;
  }
}
