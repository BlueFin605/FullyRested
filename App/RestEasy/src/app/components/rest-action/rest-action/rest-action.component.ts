import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { RestActionResult, ExecuteRestCallsService, EmptyActionResult, ExecuteRestAction } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { RestAction, ActionRepositoryService, CreateEmptyAction, Solution, RestActionRun, ValidationType } from 'src/app/services/action-repository/action-repository.service'
import { ContentTypeHelperService } from 'src/app/services/content-type-helper/content-type-helper.service';

import { addSchema, validate } from "@hyperjump/json-schema/draft-2020-12";

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

  constructor(private era: ExecuteRestCallsService, private repository: ActionRepositoryService, private contentTypeHelper: ContentTypeHelperService) {
  }

  ngOnInit(): void {
  }

  async executeAction(action: ExecuteRestAction) {
    this.response = EmptyActionResult;
    console.log(`executeAction[${action}][${this.solution}]`)
    this.response = await this.era.executeTest(action, this.solution);
    var isValid = await this.validateResponse(action, this.response);
    console.log(isValid);
    console.log(`response data type:[${typeof (this.response.body)}][${this.response.body}]`);
  }

  async validateResponse(action: ExecuteRestAction, response: RestActionResult): Promise<boolean> {
    console.log('validating response json schema')
    console.log(action.validation?.jsonSchema?.schema);
    if (response.body == undefined) {
      if (action.validation == undefined || action.validation.type == ValidationType.None) {
        console.log('no response body and no validation rules');
        return true;
      }

      console.log('No response body but has validation');
      return false;
    }

    // return this.validateJsonString({name: "Alice", age: 25}, action.validation?.jsonSchema?.schema ?? "{}");
    // let schema = {
    //   type: "object",
    //   $schema: "https://json-schema.org/draft/2020-12/schema",
    //   properties: {
    //     name: {
    //       type: "string"
    //     },
    //     age: {
    //       type: "integer"
    //     }
    //   }
    // };

    // var objSchema = {
    //     $schema: "https://json-schema.org/draft/2020-12/schema",
    //     type: "string"
    //   };
    // var objValidate = "string";

    var objValidate = JSON.parse(this.contentTypeHelper.convertArrayBufferToString(response.body.contentType, response.body.body));
    var objSchema = JSON.parse(action.validation?.jsonSchema?.schema ?? "{}");
    return await this.validateJsonString(objValidate, objSchema);
  }

  async validateJsonString(jsonObject: any, schemaObject: object): Promise<boolean> {
    addSchema((schemaObject as any), "http://example.com/schemas/string");
    const output = await validate("http://example.com/schemas/string", jsonObject, "VERBOSE");
    console.log(output);
    if (output.valid) {
      console.log("Instance is valid :-)");
    } else {
      console.log("Instance is invalid :-(");
    }
    // Return the validation result
    return output.valid;
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
