import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { RestActionResult, ExecuteRestCallsService, EmptyActionResult, ExecuteRestAction } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { RestAction, ActionRepositoryService, CreateEmptyAction } from 'src/app/services/action-repository/action-repository.service'

@Component({
  selector: 'app-rest-action',
  templateUrl: './rest-action.component.html',
  styleUrls: ['./rest-action.component.css']
})
export class RestActionComponent implements OnInit {
  @Input()
  action: RestAction = CreateEmptyAction();

  @Output()
  actionChange = new EventEmitter<RestAction>();

  response: RestActionResult = EmptyActionResult;

  constructor(private era: ExecuteRestCallsService, private repository: ActionRepositoryService) { 
  }

  ngOnInit(): void {
  }

  async executeAction(action: ExecuteRestAction) {
    console.log(`executeAction[${action}]`)
    this.response = await this.era.executeTest(action);
    console.log(`response data type:[${typeof (this.response.body)}][${this.response.body}]`);
  }

  onActionChange(event: any) {
    // console.log(event)
    this.actionChange.emit(this.action);
  }

}
