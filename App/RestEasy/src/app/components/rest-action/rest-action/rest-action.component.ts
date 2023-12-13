import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { RestActionResult, ExecuteRestCallsService, EmptyActionResult, ExecuteRestAction } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { RestAction, ActionRepositoryService, CreateEmptyAction, Solution, RestActionRun } from 'src/app/services/action-repository/action-repository.service'

@Component({
  selector: 'app-rest-action',
  templateUrl: './rest-action.component.html',
  styleUrls: ['./rest-action.component.css']
})
export class RestActionComponent implements OnInit {
  _action: RestAction = CreateEmptyAction();
  _laststate: string = "";
  _fullFilename: string = "";
  _originalSource: string = "";

  @Input()
  set action(action: RestAction) {
    console.log(`set action[${JSON.stringify(action)}]`)
    this._action = action;
    this._laststate = JSON.stringify(action);
    this.dirtyChange.emit(this._laststate != this._originalSource);
  }

  @Output()
  actionChange = new EventEmitter<RestAction>();

  @Output()
  nameChange = new EventEmitter<string>();

  @Output()
  dirtyChange = new EventEmitter<boolean>();

  @Input()
  set fullFilename(fullFlename: string) {
    console.log(`set fullFilename[${fullFlename}]`)

    if (this._fullFilename == fullFlename)
      return;

    this._fullFilename = fullFlename;
    this.repository.loadRequest(fullFlename).then(a => {
      console.log(a);
      this._originalSource = JSON.stringify(a)
      var currentstate = JSON.stringify(this._action);
      console.log(`[A]currentstate:[${currentstate}]`);
      console.log(`[A]_originalSource:[${this._originalSource}]`);
      this.dirtyChange.emit(currentstate != this._originalSource);
    });
  }

  @Input()
  solution: Solution | undefined;

  @Input()
  runId: string | undefined;

  response: RestActionResult = EmptyActionResult;

  constructor(private era: ExecuteRestCallsService, private repository: ActionRepositoryService) {
  }

  ngOnInit(): void {
  }

  async executeAction(action: ExecuteRestAction) {
    this.response = EmptyActionResult;
    console.log(`executeAction[${action}][${this.solution}]`)
    this.response = await this.era.executeTest(action, this.solution);
    await this.validateResponse(action, this.response);
    console.log(`response data type:[${typeof (this.response.body)}][${this.response.body}]`);
  }

  async validateResponse(action: ExecuteRestAction, response: RestActionResult): Promise<boolean> {
    console.log('validating response json schema')
    return true;
  }

  onActionChange(event: RestAction) {
    console.log(event)
    console.log(this._action)

    var currentstate = JSON.stringify(this._action);


    if (currentstate == this._laststate)
      return;

    this._laststate = currentstate;

    console.log(`currentstate:[${currentstate}]`);
    console.log(`_originalSource:[${this._originalSource}]`);

    this.dirtyChange.emit(currentstate != this._originalSource);

    //TODO need to store oigin state in @Input nd then do a deep compare and only emit change when they re different
    this.actionChange.emit(this._action);
  }

  onNameChange(name: string) {
    this.nameChange.emit(name);
  }
}
