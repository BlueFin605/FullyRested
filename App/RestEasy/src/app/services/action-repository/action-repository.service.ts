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
  verb: string;
  protocol: string;
  url: string;
  headers: HeaderTable[];
  parameters: ParamTable[];
  body: string;
}

export interface CurrentState
{
  actions: RestAction[];
}

@Injectable({
  providedIn: 'root'
})

export class ActionRepositoryService {
  constructor() { }

  getActionDetails(): RestAction {
    var action: RestAction = {
      body: JSON.stringify({"products":[{"name":"car","product":[{"name":"honda","model":[{"id":"civic","name":"civic"},{"id":"accord","name":"accord"},{"id":"crv","name":"crv"},{"id":"pilot","name":"pilot"},{"id":"odyssey","name":"odyssey"}]}]}]}),
      verb: "get",
      protocol: "https",
      // url: "jsonplaceholder.typicode.com/todos/1",
      url: "www.trademe.co.nz/images/frend/trademe-logo-no-tagline.png",
      headers: [
        {key: "accept", value: "*/*", active: true, id: 1},
        {key: "content-type", value: "application/x-www-form-urlencoded", active: true, id: 2},
        {key: "user-agent", value: "RestEasy1.0", active: true, id: 3},
        {key: "accept-encoding", value: "gzip, deflate, br", active: true, id: 4},
       // {key: "host", value: "jsonplaceholder.typicode.com", active: true, id: 5}
      ],
      parameters: [
        {key: "userid", value: "1", active: false, id: 1}
      ]
    };  //see https://jsonplaceholder.typicode.com/

    return action;
  }
}
