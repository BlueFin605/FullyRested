import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { RestActionResult, ExecuteRestCallsService, EmptyActionResult, ExecuteRestAction } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { RestAction, ActionRepositoryService, CreateEmptyAction } from 'src/app/services/action-repository/action-repository.service'

@Component({
  selector: 'app-rest-action',
  templateUrl: './rest-action.component.html',
  styleUrls: ['./rest-action.component.css']
})
export class RestActionComponent implements OnInit {
  _action: RestAction = CreateEmptyAction();
  _laststate: string = "";

  @Input()
  set action(action: RestAction) {
    console.log(`set action[${JSON.stringify(action)}]`)
    this._action = action;
    this._laststate = JSON.stringify(action);
  }

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
    console.log(event)

    var currentstate = JSON.stringify(this._action);
    if (currentstate == this._laststate)
       return;

    this._laststate = currentstate;

    //TODO need to store oigin state in @Input nd then do a deep compare and only emit change when they re different
    this.actionChange.emit(this._action);
  }

}
