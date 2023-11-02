import { Component, OnInit, Input, Output, ViewChild, EventEmitter } from '@angular/core';
import { JsonEditorOptions, JsonEditorComponent } from '@maaxgr/ang-jsoneditor'

@Component({
  selector: 'app-edit-request-body',
  templateUrl: './edit-request-body.component.html',
  styleUrls: ['./edit-request-body.component.css']
})
export class EditRequestBodyComponent implements OnInit {
  // private initialData: string;
  private visibleData: string = '';
  jsonObj: object = {};
  public editorOptions: JsonEditorOptions;

  @ViewChild('editor') bodyChild: JsonEditorComponent | undefined;

  @Input() set body(body: string) {
    // this.initialData = body;
    if (this.visibleData != body) {
      this.visibleData = body;
      this.jsonObj = JSON.parse(body);
      console.log('set body');
      console.log(JSON.stringify(this.visibleData));
    }
  }

  @Output()
  bodyChange = new EventEmitter<string>();

  constructor() {
    this.editorOptions = new JsonEditorOptions()
    this.editorOptions.enableTransform = true;
    this.editorOptions.mode = 'code';
    this.editorOptions.modes = ['code', 'text', 'tree', 'view']; // set all allowed modes
    this.editorOptions.mainMenuBar = false;
  }

  ngOnInit(): void {
  }

  // get body(): any {
  //   // console.log(`valid json:${this.bodyChild?.isValidJson()}`);
  //   return this.initialData;
  // }

  // get json(): any {
  //   return JSON.parse(this.bodyChild?.getText() ?? '');
  // }

  // get jsonText(): any {
  //   return this.bodyChild?.getText();
  // }

  // get isValidJSON(): boolean {
  //   console.log(`[i]valid json:${this.bodyChild?.isValidJson()}`);
  //   console.log(JSON.stringify(this.bodyChild?.getText()));
  //   return this.bodyChild?.isValidJson() ?? false;
  // }


  updateData(d: Event) {
    console.log('updateData');
    console.log(JSON.stringify(d));
    console.log(`[u]valid json:${this.bodyChild?.isValidJson()}`);

    //I have no idea what this is, but lets ignore it since it causes us issues as I do not want the body to be set to this, you are kind of stuffed if this is what you want your payload to be 
    if (d.isTrusted == true)
      return;

    this.visibleData = this.bodyChild?.getText() ?? '';

    console.log(JSON.stringify(this.visibleData));

    this.bodyChange.emit(this.bodyChild?.getText());
  }
}
