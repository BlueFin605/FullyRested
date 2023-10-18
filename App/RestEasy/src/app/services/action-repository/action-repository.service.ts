import { Injectable } from '@angular/core';
import { RestActionResult } from '../execute-rest-calls/execute-rest-calls.service';

export interface RestAction {
  verb: string;
  protocol: string;
  url: string;
  headers: { [header: string]: string };
}

@Injectable({
  providedIn: 'root'
})

export class ActionRepositoryService {
  constructor() { }

  getActionDetails(): RestAction {
    var action: RestAction = {
      verb: "get",
      protocol: "https",
      url: "jsonplaceholder.typicode.com/todos/1",
      headers: {
        "accept": "*/*",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "RestEasy1.0",
        "accept-encoding": "gzip, deflate, br",
        "host": "jsonplaceholder.typicode.com"
      }
    };  //see https://jsonplaceholder.typicode.com/

    return action;
  }
}
