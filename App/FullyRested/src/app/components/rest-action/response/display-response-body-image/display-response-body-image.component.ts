import { Component, OnInit, Input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RestActionResultBody } from '../../../../../../../shared/builder/src';

@Component({
  selector: 'app-display-response-body-image',
  templateUrl: './display-response-body-image.component.html',
  styleUrls: ['./display-response-body-image.component.css']
})
export class DisplayResponseBodyImageComponent implements OnInit {
  _data: Buffer | undefined;
  _thumbnail: any;
  _objectURL: string = "";
  _body: RestActionResultBody | undefined;

  @Input()
  set body(body: RestActionResultBody | undefined) {
    this._body = body;
    this._data = undefined;
    this._thumbnail = undefined;
    this._objectURL = "";

    //console.log(`DisplayResponseBodyImageComponent set body:[${JSON.stringify(body)}]`)
    
    if (body == undefined) {
      console.log(`body is undefined`);
      return;
    }

    this._data = Buffer.from(body.body);
    this.buildUrl();
  };


  constructor(private sanitizer: DomSanitizer) { }

  ngOnInit(): void {
  }

  buildUrl() {
    if (this._body?.contentType == undefined || this._data == undefined)
      return;

    this._objectURL = 'data:image/jpeg;base64,' + this._data.toString('base64');
    this._thumbnail = this.sanitizer.bypassSecurityTrustUrl(this._objectURL);
    // console.log(`content type:[${this._contenttype}] obj type[${typeof (this._data)}] len[${this._data.byteLength}]`);
    console.log(`thumbnail:[${this._thumbnail}]`);
  }
}
