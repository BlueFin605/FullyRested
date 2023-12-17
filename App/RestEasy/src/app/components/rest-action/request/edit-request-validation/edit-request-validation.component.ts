import { Component, OnInit, Input, Output, ViewChild, EventEmitter } from '@angular/core';
import { MatRadioChange } from '@angular/material/radio';
import { ValidationTypePayload, RestActionValidation, CreateEmptyRestActionValidation, ValidationType } from 'src/app/services/action-repository/action-repository.service';
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
  public get validationTypePayload(): typeof ValidationTypePayload {
    return ValidationTypePayload;
  }
  // private initialData: string;
  visibleData: RestActionValidation = CreateEmptyRestActionValidation();
  jsonObj: object = {};
  public editorOptions: JsonEditorOptions;

  @ViewChild('editor') schemaChild: JsonEditorComponent | undefined;

  @Input() set validation(validation: RestActionValidation) {
    // this.initialData = schema;
    if (this.visibleData == validation)
      return;

    this.visibleData = validation;

    switch (validation?.payload) {
      case ValidationTypePayload.JsonSchema:
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
    this.visibleData.payload = event.value;
    console.log(this.visibleData);

    switch (this.visibleData.payload) {
      case ValidationTypePayload.JsonSchema:
        {
          if (this.visibleData?.jsonSchema?.schema == undefined)
            this.visibleData.jsonSchema = { schema: '{}' };
          this.jsonObj = {};
        }
    }

    this.validationChange.emit(this.visibleData);
  }

  onTypeChange(event: any) {
    console.log(event);
    this.visibleData.type = event.value;
  }

  updateData(d: Event) {
    console.log('updateData');
    console.log(this.jsonObj);
    console.log(JSON.stringify(d));
    console.log(`[u]valid json:${this.schemaChild?.isValidJson()}`);

    //I have no idea what this is, but lets ignore it since it causes us issues as I do not want the schema to be set to this, you are kind of stuffed if this is what you want your payload to be 
    if (d.isTrusted == true || this.visibleData.jsonSchema == undefined)
      return;

    this.visibleData.jsonSchema.schema = this.schemaChild?.getText() ?? '{}';
    console.log(JSON.stringify(this.visibleData));
    this.validationChange.emit(this.visibleData);
  }

  public get headers(): boolean {
    return this.visibleData.type.includes(ValidationType.Headers);
  }

  public get payload(): boolean {
    return this.visibleData.type.includes(ValidationType.Payload);
  }

  public get responsecode(): boolean {
    return this.visibleData.type != ValidationType.None;
  }
}