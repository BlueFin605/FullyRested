import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ValidateResponseService } from 'src/app/services/validate-response/validate-response.service';
import { ActionRepositoryService } from 'src/app/services/action-repository/action-repository.service';
import { CreateEmptyAction } from '@fullyrested/core';
import { RestAction, Collection } from '@fullyrested/core';
import {
  EmptyActionResult,
  ExecuteRestCallsService,
} from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { RestActionResult, ExecuteRestAction } from '@fullyrested/core';

@Component({
  selector: 'app-rest-action',
  templateUrl: './rest-action.component.html',
  styleUrls: ['./rest-action.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class RestActionComponent implements OnInit {
  _action: RestAction = CreateEmptyAction();
  _laststate: string = '';
  _fullFilename: string = '';
  _originalSource: string = '';

  @Input()
  set action(action: RestAction) {
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
    if (this._fullFilename == fullFlename) return;

    this._fullFilename = fullFlename;
    this.repository.loadRequest(fullFlename).then((a) => {
      this._originalSource = JSON.stringify(a);
      var currentstate = JSON.stringify(this._action);
      this.dirtyChange.emit(currentstate != this._originalSource);
    });
  }

  @Input()
  collection: Collection | undefined;

  @Input()
  runId: string | undefined;

  response: RestActionResult = EmptyActionResult;

  constructor(
    private era: ExecuteRestCallsService,
    private repository: ActionRepositoryService,
    public validateResponse: ValidateResponseService,
  ) {}

  ngOnInit(): void {}

  async executeAction(action: ExecuteRestAction) {
    this.response = EmptyActionResult;
    this.response = await this.era.executeTest(action, this.collection);
    this.response.validated = await this.validateResponse.validateResponse(
      action,
      this.response,
      this.collection,
    );
  }

  onActionChange(event: RestAction) {
    var currentstate = JSON.stringify(this._action);

    if (currentstate == this._laststate) return;

    this._laststate = currentstate;

    this.dirtyChange.emit(currentstate != this._originalSource);

    //TODO need to store oigin state in @Input nd then do a deep compare and only emit change when they re different
    this.actionChange.emit(this._action);
  }

  onNameChange(name: string) {
    this.nameChange.emit(name);
  }
}
