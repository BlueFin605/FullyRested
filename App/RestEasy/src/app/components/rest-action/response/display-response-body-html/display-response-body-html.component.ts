import { Component, OnInit, Input } from '@angular/core';
import { RestActionResultBody } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { ContentTypeHelperService } from 'src/app/services/content-type-helper/content-type-helper.service';

@Component({
  selector: 'app-display-response-body-html',
  templateUrl: './display-response-body-html.component.html',
  styleUrls: ['./display-response-body-html.component.css']
})
export class DisplayResponseBodyHtmlComponent implements OnInit {
  rawhtml: string = '';
  formattedhtml: string = "";
  selectedview: string = "preview";

  @Input()
  set body(body: RestActionResultBody | undefined) {
    if (body == undefined) {
      this.rawhtml = '';
      return;
    }

    this.rawhtml = this.contentTypeHelper.convertArrayBufferToString(body.contentType, body.body);
    this.formattedhtml = this.formatCode(this.rawhtml, true, true);
    // console.log(this.formattedhtml);
  }

  constructor(private contentTypeHelper: ContentTypeHelperService) {
  }

  ngOnInit(): void {
  }

  onViewChange(event:any){
    console.log(event);
    this.selectedview = event.value;
  }

  formatCode(code: string, stripWhiteSpaces: boolean, stripEmptyLines: boolean): string {
    "use strict";
    var whitespace = ' '.repeat(4);             // Default indenting 4 whitespaces
    var currentIndent = 0;
    var char = null;
    var nextChar = null;


    var result = '';
    for (var pos = 0; pos <= code.length; pos++) {
      char = code.substr(pos, 1);
      nextChar = code.substr(pos + 1, 1);

      // If opening tag, add newline character and indention
      if (char === '<' && nextChar !== '/') {
        result += '\n' + whitespace.repeat(currentIndent);
        currentIndent++;
      }
      // if Closing tag, add newline and indention
      else if (char === '<' && nextChar === '/') {
        // If there're more closing tags than opening
        if (--currentIndent < 0) currentIndent = 0;
        result += '\n' + whitespace.repeat(currentIndent);
      }

      // remove multiple whitespaces
      else if (stripWhiteSpaces === true && char === ' ' && nextChar === ' ') char = '';
      // remove empty lines
      else if (stripEmptyLines === true && char === '\n') {
        //debugger;
        if (code.substr(pos, code.substr(pos).indexOf("<")).trim() === '') char = '';
      }

      result += char;
    }

    return result;
  }

}
