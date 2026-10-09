import {
  Component,
  OnInit,
  Input,
  Output,
  ViewChild,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  JsonEditorOptions,
  JsonEditorComponent,
} from '../../../json-editor/json-editor.component';
import { FORM_CONTENT_TYPE, FormField, RestActionBody } from '@fullyrested/core';

@Component({
  selector: 'app-edit-request-body',
  templateUrl: './edit-request-body.component.html',
  styleUrls: ['./edit-request-body.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class EditRequestBodyComponent implements OnInit {
  // private initialData: string;
  visibleData: RestActionBody = {
    contentType: 'none',
    body: new ArrayBuffer(0),
  };
  jsonObj: object = {};
  formFields: FormField[] = [];
  public editorOptions: JsonEditorOptions;

  @ViewChild('editor') bodyChild: JsonEditorComponent | undefined;

  @Input() set body(body: RestActionBody) {
    // this.initialData = body;
    if (this.visibleData == body) return;

    this.visibleData = body;

    switch (body?.contentType) {
      case 'application/json': {
        const str = body?.body ?? '{}';
        this.jsonObj = JSON.parse(str);
        break;
      }
      case FORM_CONTENT_TYPE:
        this.formFields = Array.isArray(body.body) ? body.body : [];
        break;
    }
  }

  @Output()
  bodyChange = new EventEmitter<RestActionBody>();

  constructor() {
    this.editorOptions = new JsonEditorOptions();
    this.editorOptions.enableTransform = true;
    this.editorOptions.mode = 'code';
    this.editorOptions.modes = ['code', 'text', 'tree', 'view']; // set all allowed modes
    this.editorOptions.mainMenuBar = false;
  }

  ngOnInit(): void {}

  onContentTypeChange(event: any) {
    this.visibleData.contentType = event.value;

    switch (this.visibleData.contentType) {
      case 'application/json': {
        if (typeof this.visibleData.body != 'string') this.visibleData.body = '{}';
        this.jsonObj = {};
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

  updateData(d: unknown) {
    // Native DOM change events from inside the editor also bubble out through (change); only the editor's own event carries JSON
    if (d instanceof Event) return;

    this.visibleData.body = this.bodyChild?.getText() ?? '{}';
    this.bodyChange.emit(this.visibleData);
  }
}
