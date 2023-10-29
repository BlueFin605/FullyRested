import { Injectable } from '@angular/core';
import { RestActionResult } from '../execute-rest-calls/execute-rest-calls.service';

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

export const EmptyAction: RestAction = { name: "<unnamed>", verb: 'get', protocol: 'https', url: '', headers: [], parameters: [], body: '{}' };

export const EmptyLocalAction = { action: EmptyAction, dirty: false };

@Injectable({
  providedIn: 'root'
})

export class ActionRepositoryService {
  constructor() { }

  getCurrentState(): CurrentState {
    return {
      actions: [
        { action: this.getActionDetails1(), dirty: false },
        { action: this.getActionDetails2(), dirty: false },
        { action: this.getActionDetails3(), dirty: false }
      ]
    };
  }

  getActionDetails1(): RestAction {
    var action: RestAction = {
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

  getActionDetails2(): RestAction {
    var action: RestAction = {
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

  getActionDetails3(): RestAction {
    var action: RestAction = {
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
