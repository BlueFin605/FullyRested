import { Component, OnInit, Input } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-display-response-body-image',
  templateUrl: './display-response-body-image.component.html',
  styleUrls: ['./display-response-body-image.component.css']
})
export class DisplayResponseBodyImageComponent implements OnInit {
  _data: Buffer | undefined;
  _contenttype: string = "";
  _thumbnail: any;
  _objectURL: string = "";

  @Input()
  set data(data: ArrayBuffer) {
    this._data = Buffer.from(data);
    this.buildUrl();
  };

  @Input()
  set contenttype(contenttype: string) {
    this._contenttype = contenttype;
    this.buildUrl();

  }

  constructor(private sanitizer: DomSanitizer) { }

  ngOnInit(): void {
  }

  buildUrl() {
    if (this._contenttype == "" || this._data == undefined)
      return;

    this._objectURL = 'data:image/jpeg;base64,' + this._data.toString('base64');
    this._thumbnail = this.sanitizer.bypassSecurityTrustUrl(this._objectURL);
    // console.log(`content type:[${this._contenttype}] obj type[${typeof (this._data)}] len[${this._data.byteLength}]`);
    console.log(`thumbnail:[${this._thumbnail}]`);
  }
}
