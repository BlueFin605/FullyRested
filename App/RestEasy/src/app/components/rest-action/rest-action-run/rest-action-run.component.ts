import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { RestActionResult, ExecuteRestCallsService, EmptyActionResult, ExecuteRestAction } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { ValidateResponseService } from 'src/app/services/validate-response/validate-response.service';
import { Collection, RestAction, RestActionRun, ValidationType } from '../../../../../../shared';
import { ActionRepositoryService } from 'src/app/services/action-repository/action-repository.service';
import { CreateEmptyRestActionRun, CreateEmptyAction } from '../../../../../../shared';
import { SystemSupportService } from 'src/app/services/system-support/system-support.service';

@Component({
  selector: 'app-rest-action-run',
  templateUrl: './rest-action-run.component.html',
  styleUrls: ['./rest-action-run.component.css']
})
export class RestActionRunComponent implements OnInit {
  _runId: String = ''
  run: RestActionRun = CreateEmptyRestActionRun(this.systemSupport, ValidationType.Inherit);

  @Input()
  action: RestAction = CreateEmptyAction();

  @Output()
  actionChange = new EventEmitter<RestAction>();

  @Input()
  set runId(id: string) {
    console.log(`runId(${id})`)
    this._runId = id;
    this.run = this.activeRun(id);
  }
  
  @Input()
  collection: Collection | undefined;

  @Output()
  nameChange = new EventEmitter<string>();

  response: RestActionResult = EmptyActionResult;

  constructor(private era: ExecuteRestCallsService, 
              private repository: ActionRepositoryService,
              public validateResponse: ValidateResponseService,
              private systemSupport: SystemSupportService) {
  }

  ngOnInit(): void {
  }

  onRunChange(event: RestActionRun) {
    console.log(event);
    this.actionChange.emit(this.action);
  }

  onNameChange(name: string) {
    console.log(`onNameChange(${name})`);
    this.nameChange.emit(name);
  }

  async executeAction(action: ExecuteRestAction) {
    this.response = EmptyActionResult;
    console.log(`executeAction[${action}][${this.collection}]`)
    this.response = await this.era.executeTest(action, this.collection);
    this.response.validated = await this.validateResponse.validateResponse(action, this.response, this.collection);
    console.log(`response data type:[${typeof (this.response.body)}][${this.response.body}]`);
  }

  activeRun(id: string): RestActionRun
  {
    var active = this.action.runs.find(r => r.id == id);
    if (active != undefined) {
       console.log(active);
       return active;
    }

    console.log(`acrtive run not found[${id}]`);
    console.log(this.action);
    return CreateEmptyRestActionRun(this.systemSupport, ValidationType.Inherit);
  }
}
