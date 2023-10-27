import { Component, OnInit, Input } from '@angular/core';
import { RestActionResultBody } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { ContentTypeHelperService } from 'src/app/services/content-type-helper/content-type-helper.service';

@Component({
  selector: 'app-display-response-body-html',
  templateUrl: './display-response-body-html.component.html',
  styleUrls: ['./display-response-body-html.component.css']
})
export class DisplayResponseBodyHtmlComponent implements OnInit {
  html: string = '';
  
  @Input()
  set body(body: RestActionResultBody | undefined) {
    if (body == undefined) {
      this.html = '';
      return;
    }

     this.html = this.contentTypeHelper.convertArrayBufferToString(body.contentType, body.body);
  }

  constructor(private contentTypeHelper: ContentTypeHelperService) { 
  }

  ngOnInit(): void {
  }
}
