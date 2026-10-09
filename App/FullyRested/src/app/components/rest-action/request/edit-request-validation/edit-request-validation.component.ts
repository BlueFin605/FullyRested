import { Component, OnInit, Input, Output, ViewChild, EventEmitter } from '@angular/core';
import { MatLegacyRadioChange as MatRadioChange } from '@angular/material/legacy-radio';
import { JsonEditorOptions, JsonEditorComponent } from '../../../json-editor/json-editor.component';
import { ValidateResponseService } from 'src/app/services/validate-response/validate-response.service';
import { CreateEmptyRestActionValidation } from '@fullyrested/core';
import { ValidationType, ValidationTypeBody, RestActionValidation, HeaderTable } from '@fullyrested/core';

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
          this.jsonObj = JSON.parse(str);
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
    this.visibleSchema.body = event.value;

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
    this.visibleSchema.type = event.value;
    this.validationChange.emit(this.visibleSchema);
  }

  onHeadersChange(event: HeaderTable[]) {
    this.validationChange.emit(this.visibleSchema);
  }


  updateData(d: unknown) {

    // Native DOM change events from inside the editor also bubble out through (change); only the editor's own event carries JSON
    if (d instanceof Event || this.visibleSchema.jsonSchema == undefined)
      return;

    this.visibleSchema.jsonSchema.schema = this.schemaChild?.getText() ?? '{}';
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