import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FORM_CONTENT_TYPE, FormField, RestActionBody } from '@fullyrested/core';

@Component({
  selector: 'app-edit-request-body',
  templateUrl: './edit-request-body.component.html',
  styleUrls: ['./edit-request-body.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class EditRequestBodyComponent {
  visibleData: RestActionBody = {
    contentType: 'none',
    body: new ArrayBuffer(0),
  };
  // The JSON body is edited as text, so formatting and half-typed JSON survive
  jsonText = '';
  jsonError = '';
  formFields: FormField[] = [];

  @Input() set body(body: RestActionBody) {
    if (this.visibleData == body) return;

    this.visibleData = body;

    switch (body?.contentType) {
      case 'application/json':
        this.jsonText = typeof body.body == 'string' ? body.body : '{}';
        this.jsonError = this.validate(this.jsonText);
        break;
      case FORM_CONTENT_TYPE:
        this.formFields = Array.isArray(body.body) ? body.body : [];
        break;
    }
  }

  @Output()
  bodyChange = new EventEmitter<RestActionBody>();

  onContentTypeChange(event: { value: string }) {
    this.visibleData.contentType = event.value;

    switch (this.visibleData.contentType) {
      case 'application/json': {
        if (typeof this.visibleData.body != 'string') this.visibleData.body = '{}';
        this.jsonText = this.visibleData.body;
        this.jsonError = this.validate(this.jsonText);
        break;
      }
      case FORM_CONTENT_TYPE:
        if (!Array.isArray(this.visibleData.body)) this.visibleData.body = [];
        this.formFields = this.visibleData.body;
        break;
    }

    this.bodyChange.emit(this.visibleData);
  }

  onFormChange(fields: FormField[]) {
    this.formFields = fields;
    this.visibleData.body = fields;
    this.bodyChange.emit(this.visibleData);
  }

  updateData(text: string) {
    this.jsonText = text;
    this.jsonError = this.validate(text);
    this.visibleData.body = text;
    this.bodyChange.emit(this.visibleData);
  }

  format() {
    try {
      this.updateData(JSON.stringify(JSON.parse(this.jsonText), null, 2));
    } catch {
      // leave invalid JSON as typed; the error badge already says why
    }
  }

  private validate(text: string): string {
    if (text.trim() == '') return '';
    try {
      JSON.parse(text);
      return '';
    } catch (e) {
      return (e as Error).message;
    }
  }
}
