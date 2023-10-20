import { Component, OnInit, Input } from '@angular/core';
import { JsonEditorOptions } from '@maaxgr/ang-jsoneditor'

@Component({
  selector: 'app-edit-request-body',
  templateUrl: './edit-request-body.component.html',
  styleUrls: ['./edit-request-body.component.css']
})
export class EditRequestBodyComponent implements OnInit {
  @Input()
  public body: any;

  getData($event: any) {
    throw new Error('Method not implemented.');
  }
  public editorOptions: JsonEditorOptions;
  //@ViewChild(JsonEditorComponent, { static: false }) editor: JsonEditorComponent;

  constructor() {
    this.editorOptions = new JsonEditorOptions()
    this.editorOptions.enableTransform = true;
    this.editorOptions.mode = 'text';
    this.editorOptions.modes = ['code', 'text', 'tree', 'view']; // set all allowed modes
    this.editorOptions.expandAll = true;
    this.editorOptions.mainMenuBar = false;
    // this.editorOptions.onEditable = function(){return false;}
    //this.options.mode = 'code'; //set only one mode

    //this.data = undefined; //{"products":[{"name":"car","product":[{"name":"honda","model":[{"id":"civic","name":"civic"},{"id":"accord","name":"accord"},{"id":"crv","name":"crv"},{"id":"pilot","name":"pilot"},{"id":"odyssey","name":"odyssey"}]}]}]}
    //this.data = '{"products":[{"name":"car","product":[{"name":"honda","model":[{"id":"civic","name":"civic"},{"id":"accord","name":"accord"},{"id":"crv","name":"crv"},{"id":"pilot","name":"pilot"},{"id":"odyssey","name":"odyssey"}]}]}]}';
  }

  ngOnInit(): void {
  }
}
