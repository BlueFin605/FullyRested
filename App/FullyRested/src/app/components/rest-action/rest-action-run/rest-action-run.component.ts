import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { ValidateResponseService } from 'src/app/services/validate-response/validate-response.service';
import { Collection, RestAction, RestActionRun, ValidationType } from '@fullyrested/core';
import { ActionRepositoryService } from 'src/app/services/action-repository/action-repository.service';
import { CreateEmptyRestActionRun, CreateEmptyAction } from '@fullyrested/core';
import { SystemSupportService } from 'src/app/services/system-support/system-support.service';
import { EmptyActionResult, ExecuteRestCallsService } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { ExecuteRestAction, RestActionResult } from '@fullyrested/core';

@Component({
    selector: 'app-rest-action-run',
    templateUrl: './rest-action-run.component.html',
    styleUrls: ['./rest-action-run.component.css'],
    standalone: false
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
    this.actionChange.emit(this.action);
  }

  onNameChange(name: string) {
    this.nameChange.emit(name);
  }

  async executeAction(action: ExecuteRestAction) {
    this.response = EmptyActionResult;
    this.response = await this.era.executeTest(action, this.collection);
    this.response.validated = await this.validateResponse.validateResponse(action, this.response, this.collection);
  }

  activeRun(id: string): RestActionRun
  {
    var active = this.action.runs.find(r => r.id == id);
    if (active != undefined) {
       return active;
    }

    return CreateEmptyRestActionRun(this.systemSupport, ValidationType.Inherit);
  }
}
