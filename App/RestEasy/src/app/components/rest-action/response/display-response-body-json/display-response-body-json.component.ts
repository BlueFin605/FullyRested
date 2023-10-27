import { Component, OnInit, Input } from '@angular/core';
import { JsonEditorOptions, JsonEditorComponent } from '@maaxgr/ang-jsoneditor'
import { ContentTypeHelperService } from 'src/app/services/content-type-helper/content-type-helper.service';
import { RestActionResultBody } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';

@Component({
  selector: 'app-display-response-body-json',
  templateUrl: './display-response-body-json.component.html',
  styleUrls: ['./display-response-body-json.component.css']
})
export class DisplayResponseBodyJsonComponent implements OnInit {
  rawData: string = '';
  objData = {};
  
  @Input()
  set body(body: RestActionResultBody | undefined) {
    if (body == undefined) {
      this.rawData = '';
      this.objData = {};
      return;
    }

     this.rawData = this.contentTypeHelper.convertArrayBufferToString(body.contentType, body.body);
     try {
      this.objData = JSON.parse(this.rawData);
     }
     catch (error) {
      console.log(`Invalid JSON[${this.rawData}]`);
      this.objData = {};
     }
  }

  public editorOptions: JsonEditorOptions;

  constructor(private contentTypeHelper: ContentTypeHelperService) { 
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
