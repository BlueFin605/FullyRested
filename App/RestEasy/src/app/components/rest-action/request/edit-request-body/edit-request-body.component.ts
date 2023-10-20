import { Component, OnInit, ViewChild } from '@angular/core';
import { JsonEditorOptions } from '@maaxgr/ang-jsoneditor'

@Component({
  selector: 'app-edit-request-body',
  templateUrl: './edit-request-body.component.html',
  styleUrls: ['./edit-request-body.component.css']
})
export class EditRequestBodyComponent implements OnInit {
  getData($event: any) {
    throw new Error('Method not implemented.');
  }
  public editorOptions: JsonEditorOptions;
  public data: any;
  //@ViewChild(JsonEditorComponent, { static: false }) editor: JsonEditorComponent;

  constructor() {
    this.editorOptions = new JsonEditorOptions()
    this.editorOptions.mode = 'code';
    this.editorOptions.modes = ['code', 'text', 'tree', 'view']; // set all allowed modes
    this.editorOptions.expandAll = true;
    this.editorOptions.mainMenuBar = false;
    //this.options.mode = 'code'; //set only one mode

    this.data = ""; //{"products":[{"name":"car","product":[{"name":"honda","model":[{"id":"civic","name":"civic"},{"id":"accord","name":"accord"},{"id":"crv","name":"crv"},{"id":"pilot","name":"pilot"},{"id":"odyssey","name":"odyssey"}]}]}]}
  }

  ngOnInit(): void {
  }
}
