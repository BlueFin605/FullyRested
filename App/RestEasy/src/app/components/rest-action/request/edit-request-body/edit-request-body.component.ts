import { Component, OnInit, Input, ViewChild } from '@angular/core';
import { JsonEditorOptions, JsonEditorComponent } from '@maaxgr/ang-jsoneditor'

@Component({
  selector: 'app-edit-request-body',
  templateUrl: './edit-request-body.component.html',
  styleUrls: ['./edit-request-body.component.css']
})
export class EditRequestBodyComponent implements OnInit {
  @Input() set body(body: any) {
    this.initialData = body;
    this.visibleData = body;
    console.log('set body');
    console.log(JSON.stringify(this.visibleData));
  }

  get body(): boolean {
    // console.log(`valid json:${this.bodyChild?.isValidJson()}`);
    return this.initialData;
  }

  get isValidJSON(): boolean {
    console.log(`valid json:${this.bodyChild?.isValidJson()}`);
    return this.bodyChild?.isValidJson() ?? false;
  }

  initialData: any;
  visibleData: any;

  updateData(d: Event) {
    console.log('updateData');
    console.log(JSON.stringify(d));
    console.log(`valid json:${this.bodyChild?.isValidJson()}`);
    
    //I have no idea what this is, but lets ignore it since it causes us issues as I do not want the body to be set to this, you are kind of stuffed if this is what you want your payload to be 
    if (d.isTrusted == true)
    return;
  
  this.visibleData = d;

  console.log(JSON.stringify(this.visibleData));
  }
  public editorOptions: JsonEditorOptions;

  @ViewChild('editor') bodyChild: JsonEditorComponent | undefined;


  constructor() {
    this.editorOptions = new JsonEditorOptions()
    this.editorOptions.enableTransform = true;
    this.editorOptions.mode = 'text';
    this.editorOptions.modes = ['code', 'text', 'tree', 'view']; // set all allowed modes
    this.editorOptions.mainMenuBar = false;
  }

  ngOnInit(): void {
  }
}
