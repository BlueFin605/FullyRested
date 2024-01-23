import { Component, OnInit, Input, Output, ViewChild, EventEmitter } from '@angular/core';
import { JsonEditorOptions, JsonEditorComponent } from '@maaxgr/ang-jsoneditor'
import { IRestActionBody } from '../../../../../../../shared/runner';

@Component({
  selector: 'app-edit-request-body',
  templateUrl: './edit-request-body.component.html',
  styleUrls: ['./edit-request-body.component.css']
})
export class EditRequestBodyComponent implements OnInit {
  // private initialData: string;
  visibleData: IRestActionBody = {contentType: 'none', body: new ArrayBuffer(0)};
  jsonObj: object = {};
  public editorOptions: JsonEditorOptions;

  @ViewChild('editor') bodyChild: JsonEditorComponent | undefined;

  @Input() set body(body: IRestActionBody) {
    // this.initialData = body;
    if (this.visibleData == body)
        return;

    this.visibleData = body;

    switch(body?.contentType)
    {
      case 'application/json':
        {
          const str = body?.body ?? '{}';
          console.log(`set body[${str}]`);
          this.jsonObj = JSON.parse(str);
          console.log(this.jsonObj);
        }
    }
  }

  @Output()
  bodyChange = new EventEmitter<IRestActionBody>();

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
    console.log(event);
    this.visibleData.contentType = event.value;
    console.log(this.visibleData);

    switch(this.visibleData.contentType)
    {
      case 'application/json':
        {
          if (this.visibleData.body == undefined)
            this.visibleData.body = '{}';
            this.jsonObj = {};
          // const str = body?.body ?? '{}';
          // console.log(`set body[${str}]`);
          // this.jsonObj = JSON.parse(str);
          // console.log(this.jsonObj);
        }
    }


    // this.selectedview = event.value;
  }

  updateData(d: Event) {
    console.log('updateData');
    console.log(this.jsonObj);
    console.log(JSON.stringify(d));
    console.log(`[u]valid json:${this.bodyChild?.isValidJson()}`);

    //I have no idea what this is, but lets ignore it since it causes us issues as I do not want the body to be set to this, you are kind of stuffed if this is what you want your payload to be 
    if (d.isTrusted == true)
      return;

    this.visibleData.body = this.bodyChild?.getText() ?? '{}';
    console.log(JSON.stringify(this.visibleData));
    this.bodyChange.emit(this.visibleData);
  }
}
