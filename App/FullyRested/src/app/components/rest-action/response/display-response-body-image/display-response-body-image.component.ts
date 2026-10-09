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
  _data: Buffer | undefined;
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

    this._data = Buffer.from(body.body);
    this.buildUrl();
  }

  constructor(private sanitizer: DomSanitizer) {}

  ngOnInit(): void {}

  buildUrl() {
    if (this._body?.contentType == undefined || this._data == undefined) return;

    this._objectURL = 'data:image/jpeg;base64,' + this._data.toString('base64');
    this._thumbnail = this.sanitizer.bypassSecurityTrustUrl(this._objectURL);
  }
}
