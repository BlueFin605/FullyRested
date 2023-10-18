import { Component, OnInit } from '@angular/core';
import { RestActionResult, ExecuteRestCallsService, EmptyActionResult, ExecuteRestAction } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { RestAction, ActionRepositoryService } from 'src/app/services/action-repository/action-repository.service'

@Component({
  selector: 'app-rest-action',
  templateUrl: './rest-action.component.html',
  styleUrls: ['./rest-action.component.css']
})
export class RestActionComponent implements OnInit {
  action: RestAction = {verb: 'GET', protocol:'HTTPS', url: '', headers: {}};

  response: RestActionResult = EmptyActionResult;

  // verb = 'get';
  // protocol="https";
  // url = 'jsonplaceholder.typicode.com/todos/1';  //see https://jsonplaceholder.typicode.com/

  constructor(private era: ExecuteRestCallsService, private repository: ActionRepositoryService) { }

  ngOnInit(): void {
    this.action = this.repository.getActionDetails();
  }

  async executeAction(action: ExecuteRestAction) {
    console.log(`executeAction[${action}]`)
    this.response = await this.era.executeTest(action);
  }
}
