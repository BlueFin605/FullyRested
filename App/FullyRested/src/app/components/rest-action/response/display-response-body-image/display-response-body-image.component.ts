import {
  Component,
  OnInit,
  Input,
  ChangeDetectionStrategy,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RestActionResultBody } from '@fullyrested/core';

@Component({
  selector: 'app-display-response-body-image',
  templateUrl: './display-response-body-image.component.html',
  styleUrls: ['./display-response-body-image.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class DisplayResponseBodyImageComponent implements OnInit {
  _data: Uint8Array | undefined;
  _thumbnail: any;
  _objectURL: string = '';
  _body: RestActionResultBody | undefined;

  @Input()
  set body(body: RestActionResultBody | undefined) {
    this._body = body;
    this._data = undefined;
    this._thumbnail = undefined;
    this._objectURL = '';

    if (body == undefined) {
      return;
    }

    // typed as ArrayBuffer, but a body sent over IPC from the main process arrives as a Uint8Array
    const data: ArrayBuffer | ArrayBufferView = body.body;
    this._data = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
    this.buildUrl();
  }

  constructor(private sanitizer: DomSanitizer) {}

  ngOnInit(): void {}

  buildUrl() {
    if (this._body?.contentType == undefined || this._data == undefined) return;

    this._objectURL = 'data:image/jpeg;base64,' + toBase64(this._data);
    this._thumbnail = this.sanitizer.bypassSecurityTrustUrl(this._objectURL);
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // in chunks: String.fromCharCode can't take a whole large image as arguments
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
