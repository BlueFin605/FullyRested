import { Component, OnInit, Input } from '@angular/core';
import { JsonEditorOptions, JsonEditorComponent } from '@maaxgr/ang-jsoneditor'

@Component({
  selector: 'app-display-response-body-json',
  templateUrl: './display-response-body-json.component.html',
  styleUrls: ['./display-response-body-json.component.css']
})
export class DisplayResponseBodyJsonComponent implements OnInit {
  rawData: string = '';
  objData = {};
  
  @Input()
  set data(data: any) {
     this.rawData = data;
     try {
      this.objData = JSON.parse(data);
     }
     catch (error) {
      console.log(`Invalid JSON[${data}]`);
      this.objData = {};
     }
  }

  public editorOptions: JsonEditorOptions;

  constructor() { 
    this.editorOptions = new JsonEditorOptions()
    this.editorOptions.enableTransform = true;
    this.editorOptions.mode = 'code';
    this.editorOptions.modes = ['code', 'text', 'tree', 'view']; // set all allowed modes
    this.editorOptions.mainMenuBar = true;
    this.editorOptions.onEditable = function(){return false;}
  }

  ngOnInit(): void {
  }
}
