import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { RestActionResult, ExecuteRestCallsService, EmptyActionResult, ExecuteRestAction } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { RestAction, ActionRepositoryService, CreateEmptyAction, CreateEmptyRestActionRun, Solution, RestActionRun } from 'src/app/services/action-repository/action-repository.service'

@Component({
  selector: 'app-rest-action-run',
  templateUrl: './rest-action-run.component.html',
  styleUrls: ['./rest-action-run.component.css']
})
export class RestActionRunComponent implements OnInit {
  _runId: String = ''
  run: RestActionRun = CreateEmptyRestActionRun();

  @Input()
  action: RestAction = CreateEmptyAction();

  @Output()
  actionChange = new EventEmitter<RestAction>();

  @Input()
  set runId(id: string) {
    this._runId = id;
    this.run = this.activeRun(id);
  }
  
  @Input()
  solution: Solution | undefined;

  response: RestActionResult = EmptyActionResult;

  constructor(private era: ExecuteRestCallsService, private repository: ActionRepositoryService) {
  }

  ngOnInit(): void {
  }

  onRunChange(event: RestActionRun) {
    console.log(event);
    this.actionChange.emit(this.action);
  }

  async executeAction(action: ExecuteRestAction) {
    this.response = EmptyActionResult;
    console.log(`executeAction[${action}][${this.solution}]`)
    this.response = await this.era.executeTest(action, this.solution);
    console.log(`response data type:[${typeof (this.response.body)}][${this.response.body}]`);
  }

  activeRun(id: string): RestActionRun
  {
    var active = this.action.runs.find(r => r.id == id);
    if (active != undefined)
       return active;

    return CreateEmptyRestActionRun();
  }
}
