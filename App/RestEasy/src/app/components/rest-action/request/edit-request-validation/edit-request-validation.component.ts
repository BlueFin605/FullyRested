import { Component, OnInit, Input, Output, ViewChild, EventEmitter } from '@angular/core';
import { MatRadioChange } from '@angular/material/radio';
import { ValidationTypeBody, RestActionValidation, CreateEmptyRestActionValidation, ValidationType } from 'src/app/services/action-repository/action-repository.service';
import { JsonEditorOptions, JsonEditorComponent } from '@maaxgr/ang-jsoneditor'
import { ValidateResponseService } from 'src/app/services/validate-response/validate-response.service';

@Component({
  selector: 'app-edit-request-validation',
  templateUrl: './edit-request-validation.component.html',
  styleUrls: ['./edit-request-validation.component.css']
})
export class EditRequestValidationComponent implements OnInit {
  public get validationType(): typeof ValidationType {
    return ValidationType;
  }
  public get validationTypePayload(): typeof ValidationTypeBody {
    return ValidationTypeBody;
  }
  // private initialData: string;
  visibleSchema: RestActionValidation = CreateEmptyRestActionValidation(undefined);
  jsonObj: object = {};
  public editorOptions: JsonEditorOptions;

  @ViewChild('editor') schemaChild: JsonEditorComponent | undefined;

  @Input()
  showInherit: boolean = false;

  @Input() set validation(validation: RestActionValidation) {
    // this.initialData = schema;
    if (this.visibleSchema == validation)
      return;

    this.visibleSchema = validation;

    switch (validation?.body) {
      case ValidationTypeBody.JsonSchema:
        {
          const str = validation?.jsonSchema?.schema ?? '{}';
          console.log(`set schema[${str}]`);
          this.jsonObj = JSON.parse(str);
          console.log(this.jsonObj);
        }
    }
  }

  @Output()
  validationChange = new EventEmitter<RestActionValidation>();

  constructor(public validateResponse: ValidateResponseService) {
    this.editorOptions = new JsonEditorOptions()
    this.editorOptions.enableTransform = true;
    this.editorOptions.mode = 'code';
    this.editorOptions.modes = ['code', 'text', 'tree', 'view']; // set all allowed modes
    this.editorOptions.mainMenuBar = false;
  }

  ngOnInit(): void {
  }

  onPayloadTypeChange(event: any) {
    console.log(event);
    this.visibleSchema.body = event.value;
    console.log(this.visibleSchema);

    switch (this.visibleSchema.body) {
      case ValidationTypeBody.JsonSchema:
        {
          if (this.visibleSchema?.jsonSchema?.schema == undefined) {
            this.visibleSchema.jsonSchema = { schema: `{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{},"required":[]}` };
          }

          this.jsonObj = JSON.parse(this.visibleSchema?.jsonSchema.schema ?? {});
        }
    }

    this.validationChange.emit(this.visibleSchema);
  }

  onTypeChange(event: any) {
    console.log(event);
    this.visibleSchema.type = event.value;
    this.validationChange.emit(this.visibleSchema);
  }

  updateData(d: Event) {
    console.log('updateData');
    console.log(this.jsonObj);
    console.log(JSON.stringify(d));
    console.log(`[u]valid json:${this.schemaChild?.isValidJson()}`);

    //I have no idea what this is, but lets ignore it since it causes us issues as I do not want the schema to be set to this, you are kind of stuffed if this is what you want your payload to be 
    if (d.isTrusted == true || this.visibleSchema.jsonSchema == undefined)
      return;

    this.visibleSchema.jsonSchema.schema = this.schemaChild?.getText() ?? '{}';
    console.log(JSON.stringify(this.visibleSchema));
    this.validationChange.emit(this.visibleSchema);
  }

  public get headers(): boolean {
    return this.visibleSchema.type.includes(ValidationType.Headers);
  }

  public get body(): boolean {
    return this.visibleSchema.type.includes(ValidationType.Body);
  }

  public get responsecode(): boolean {
    return this.visibleSchema.type != ValidationType.None && this.visibleSchema.type != ValidationType.Inherit;
  }

  buildDescription(code: { code: number; desc: string; }) {
    if (code.code < 1)
      return code.desc;

    return `${code.code} - ${code.desc}`
  }

  onResponseCodeChange($event: any) {
    this.validationChange.emit(this.visibleSchema);
  }
}