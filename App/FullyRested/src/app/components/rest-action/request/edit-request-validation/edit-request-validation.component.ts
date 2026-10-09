import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ValidateResponseService } from 'src/app/services/validate-response/validate-response.service';
import { CreateEmptyRestActionValidation } from '@fullyrested/core';
import {
  ValidationType,
  ValidationTypeBody,
  RestActionValidation,
  HeaderTable,
} from '@fullyrested/core';

@Component({
  selector: 'app-edit-request-validation',
  templateUrl: './edit-request-validation.component.html',
  styleUrls: ['./edit-request-validation.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class EditRequestValidationComponent {
  public get validationType(): typeof ValidationType {
    return ValidationType;
  }
  public get validationTypePayload(): typeof ValidationTypeBody {
    return ValidationTypeBody;
  }
  visibleSchema: RestActionValidation =
    CreateEmptyRestActionValidation(undefined);
  // the JSON schema, edited as text so formatting survives
  schemaText = '';

  @Input()
  showInherit: boolean = false;

  @Input() set validation(validation: RestActionValidation) {
    if (this.visibleSchema == validation) return;

    this.visibleSchema = validation;
    this.schemaText = validation?.jsonSchema?.schema ?? '{}';
  }

  @Output()
  validationChange = new EventEmitter<RestActionValidation>();

  constructor(public validateResponse: ValidateResponseService) {}

  onPayloadTypeChange(event: { value: ValidationTypeBody }) {
    this.visibleSchema.body = event.value;

    if (
      this.visibleSchema.body == ValidationTypeBody.JsonSchema &&
      this.visibleSchema?.jsonSchema?.schema == undefined
    ) {
      this.visibleSchema.jsonSchema = {
        schema: JSON.stringify(
          {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
            properties: {},
            required: [],
          },
          null,
          2,
        ),
      };
    }
    this.schemaText = this.visibleSchema.jsonSchema?.schema ?? '{}';

    this.validationChange.emit(this.visibleSchema);
  }

  onTypeChange(event: { value: ValidationType }) {
    this.visibleSchema.type = event.value;
    this.validationChange.emit(this.visibleSchema);
  }

  onHeadersChange(event: HeaderTable[]) {
    this.validationChange.emit(this.visibleSchema);
  }

  updateData(text: string) {
    if (this.visibleSchema.jsonSchema == undefined) return;

    this.schemaText = text;
    this.visibleSchema.jsonSchema.schema = text;
    this.validationChange.emit(this.visibleSchema);
  }

  public get headers(): boolean {
    return this.visibleSchema.type.includes(ValidationType.Headers);
  }

  public get body(): boolean {
    return this.visibleSchema.type.includes(ValidationType.Body);
  }

  public get responsecode(): boolean {
    return (
      this.visibleSchema.type != ValidationType.None &&
      this.visibleSchema.type != ValidationType.Inherit
    );
  }

  buildDescription(code: { code: number; desc: string }) {
    if (code.code < 1) return code.desc;

    return `${code.code} - ${code.desc}`;
  }

  onResponseCodeChange($event: any) {
    this.validationChange.emit(this.visibleSchema);
  }
}
