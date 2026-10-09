import {
  Component,
  Input,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ContentTypeHelperService } from 'src/app/services/content-type-helper/content-type-helper.service';
import { RestActionResultBody } from '@fullyrested/core';
import { CodeLanguage } from '../../../code-editor/code-editor.component';
import { BodyKind, bodyKind, editorLanguage, prettyBody } from './body-format';

export type BodyView = 'pretty' | 'raw' | 'preview';

@Component({
  selector: 'app-display-response-body',
  templateUrl: './display-response-body.component.html',
  styleUrls: ['./display-response-body.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class DisplayResponseBodyComponent {
  _body: RestActionResultBody | undefined;
  kind: BodyKind = 'text';
  language: CodeLanguage = 'text';
  raw = '';
  pretty = '';
  view: BodyView = 'pretty';
  copied = false;

  @Input()
  set body(body: RestActionResultBody | undefined) {
    this._body = body;
    this.kind = bodyKind(body?.contentType);
    this.language = editorLanguage(this.kind);
    this.raw =
      body == undefined || this.kind == 'image'
        ? ''
        : this.contentTypeHelper.convertArrayBufferToString(body.contentType, body.body);
    this.pretty = prettyBody(this.kind, this.raw);

    // images only make sense as a preview; keep the user's choice otherwise
    if (this.kind == 'image') this.view = 'preview';
    else if (this.view == 'preview' && !this.hasPreview) this.view = 'pretty';
  }

  constructor(private contentTypeHelper: ContentTypeHelperService) {}

  get hasPreview(): boolean {
    return this.kind == 'html' || this.kind == 'image';
  }

  get contentType(): string {
    return this._body?.contentType?.split(';')[0] ?? '';
  }

  async copy() {
    try {
      await navigator.clipboard.writeText(this.view == 'raw' ? this.raw : this.pretty);
      this.copied = true;
      setTimeout(() => (this.copied = false), 1500);
    } catch {
      // clipboard refused: nothing to do
    }
  }
}
