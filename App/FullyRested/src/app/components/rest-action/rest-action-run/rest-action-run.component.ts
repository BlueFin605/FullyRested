import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ViewChild,
} from '@angular/core';
import { EditRequestRunComponent } from '../request/edit-request-run/edit-request-run.component';
import { ValidateResponseService } from 'src/app/services/validate-response/validate-response.service';
import {
  Collection,
  RestAction,
  RestActionRun,
  ValidationType,
} from '@fullyrested/core';
import { ActionRepositoryService } from 'src/app/services/action-repository/action-repository.service';
import { CreateEmptyRestActionRun, CreateEmptyAction } from '@fullyrested/core';
import { SystemSupportService } from 'src/app/services/system-support/system-support.service';
import {
  EmptyActionResult,
  ExecuteRestCallsService,
  TimedActionResult,
} from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { ExecuteRestAction } from '@fullyrested/core';

@Component({
  selector: 'app-rest-action-run',
  templateUrl: './rest-action-run.component.html',
  styleUrls: ['./rest-action-run.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class RestActionRunComponent implements OnInit {
  _runId: String = '';
  run: RestActionRun = CreateEmptyRestActionRun(
    this.systemSupport,
    ValidationType.Inherit,
  );

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

  response: TimedActionResult = EmptyActionResult;
  sending = false;

  constructor(
    private era: ExecuteRestCallsService,
    private repository: ActionRepositoryService,
    public validateResponse: ValidateResponseService,
    private systemSupport: SystemSupportService,
  ) {}

  @ViewChild(EditRequestRunComponent) runEditor: EditRequestRunComponent | undefined;

  ngOnInit(): void {}

  send() {
    this.runEditor?.test();
  }

  onRunChange(event: RestActionRun) {
    this.actionChange.emit(this.action);
  }

  onNameChange(name: string) {
    this.nameChange.emit(name);
  }

  async executeAction(action: ExecuteRestAction) {
    if (this.sending) return;
    this.sending = true;
    try {
      const response = await this.era.executeTest(action, this.collection);
      response.validated = await this.validateResponse.validateResponse(
        action,
        response,
        this.collection,
      );
      this.response = response;
    } finally {
      this.sending = false;
    }
  }

  activeRun(id: string): RestActionRun {
    var active = this.action.runs.find((r) => r.id == id);
    if (active != undefined) {
      return active;
    }

    return CreateEmptyRestActionRun(this.systemSupport, ValidationType.Inherit);
  }
}
