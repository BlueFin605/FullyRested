import { Component, OnInit, Input } from '@angular/core';
import { JsonEditorOptions, JsonEditorComponent } from '@maaxgr/ang-jsoneditor'

@Component({
  selector: 'app-display-response-body',
  templateUrl: './display-response-body.component.html',
  styleUrls: ['./display-response-body.component.css']
})
export class DisplayResponseBodyComponent implements OnInit {
  @Input()
  data: any = {};

  public editorOptions: JsonEditorOptions;

  constructor() { 
    this.editorOptions = new JsonEditorOptions()
    this.editorOptions.enableTransform = true;
    this.editorOptions.mode = 'text';
    this.editorOptions.modes = ['code', 'text', 'tree', 'view']; // set all allowed modes
    this.editorOptions.mainMenuBar = false;
    this.editorOptions.onEditable = function(){return false;}
  }

  ngOnInit(): void {
  }
}
