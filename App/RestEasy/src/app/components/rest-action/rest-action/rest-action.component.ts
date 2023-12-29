import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { RestActionResult, ExecuteRestCallsService, EmptyActionResult, ExecuteRestAction } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { ContentTypeHelperService } from 'src/app/services/content-type-helper/content-type-helper.service';

import { OutputUnit, addSchema, validate } from "@hyperjump/json-schema/draft-2020-12";
import { ValidateResponseService } from 'src/app/services/validate-response/validate-response.service';
import { ActionRepositoryService } from 'src/app/services/action-repository/action-repository.service';
import { CreateEmptyAction } from '../../../../../../shared/runner';
import { RestAction, Collection } from '../../../../../../shared/runner';

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
  collection: Collection | undefined;

  @Input()
  runId: string | undefined;

  response: RestActionResult = EmptyActionResult;

  constructor(private era: ExecuteRestCallsService, 
              private repository: ActionRepositoryService, 
              public validateResponse: ValidateResponseService) {
  }

  ngOnInit(): void {
  }

  async executeAction(action: ExecuteRestAction) {
    this.response = EmptyActionResult;
    console.log(`executeAction[${action}][${this.collection}]`)
    this.response = await this.era.executeTest(action, this.collection);
    this.response.validated = await this.validateResponse.validateResponse(action, this.response, this.collection);
    console.log(this.response.validated);
    console.log(`response data type:[${typeof (this.response.body)}][${this.response.body}]`);
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
