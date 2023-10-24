import { Component, OnInit, Input } from '@angular/core';
import { JsonEditorOptions, JsonEditorComponent } from '@maaxgr/ang-jsoneditor'

@Component({
  selector: 'app-display-response-body-json',
  templateUrl: './display-response-body-json.component.html',
  styleUrls: ['./display-response-body-json.component.css']
})
export class DisplayResponseBodyJsonComponent implements OnInit {
  @Input()
  data: any = {};

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
