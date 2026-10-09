import { Component, OnInit, Input, Output, ViewChild, EventEmitter } from '@angular/core';
import { JsonEditorOptions, JsonEditorComponent } from '../../../json-editor/json-editor.component';
import { RestActionBody } from '@fullyrested/core';

@Component({
    selector: 'app-edit-request-body',
    templateUrl: './edit-request-body.component.html',
    styleUrls: ['./edit-request-body.component.css'],
    standalone: false
})
export class EditRequestBodyComponent implements OnInit {
  // private initialData: string;
  visibleData: RestActionBody = {contentType: 'none', body: new ArrayBuffer(0)};
  jsonObj: object = {};
  public editorOptions: JsonEditorOptions;

  @ViewChild('editor') bodyChild: JsonEditorComponent | undefined;

  @Input() set body(body: RestActionBody) {
    // this.initialData = body;
    if (this.visibleData == body)
        return;

    this.visibleData = body;

    switch(body?.contentType)
    {
      case 'application/json':
        {
          const str = body?.body ?? '{}';
          this.jsonObj = JSON.parse(str);
        }
    }
  }

  @Output()
  bodyChange = new EventEmitter<RestActionBody>();

  constructor() {
    this.editorOptions = new JsonEditorOptions()
    this.editorOptions.enableTransform = true;
    this.editorOptions.mode = 'code';
    this.editorOptions.modes = ['code', 'text', 'tree', 'view']; // set all allowed modes
    this.editorOptions.mainMenuBar = false;
  }

  ngOnInit(): void {
  }

  onContentTypeChange(event: any) {
    this.visibleData.contentType = event.value;

    switch(this.visibleData.contentType)
    {
      case 'application/json':
        {
          if (this.visibleData.body == undefined)
            this.visibleData.body = '{}';
            this.jsonObj = {};
          // const str = body?.body ?? '{}';
          // this.jsonObj = JSON.parse(str);
        }
    }


    // this.selectedview = event.value;
  }

  updateData(d: unknown) {

    // Native DOM change events from inside the editor also bubble out through (change); only the editor's own event carries JSON
    if (d instanceof Event)
      return;

    this.visibleData.body = this.bodyChild?.getText() ?? '{}';
    this.bodyChange.emit(this.visibleData);
  }
}
