import { Injectable } from '@angular/core';
import { RestActionResult } from '../execute-rest-calls/execute-rest-calls.service';

export interface RestAction {
  verb: string;
  protocol: string;
  url: string;
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
      url: "jsonplaceholder.typicode.com/todos/1"
    };  //see https://jsonplaceholder.typicode.com/

    return action;
  }
}
