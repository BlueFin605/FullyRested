import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import JSONEditor from 'jsoneditor';

// The jsoneditor options this app uses (see https://github.com/josdejong/jsoneditor/blob/develop/docs/api.md)
export class JsonEditorOptions {
  mode: 'code' | 'text' | 'tree' | 'view' | 'form' = 'tree';
  modes?: string[];
  enableSort = true;
  enableTransform = true;
  mainMenuBar = true;
  search = true;
  history = true;
  indentation = 2;
  onEditable?: () => boolean;
}

// A thin wrapper around the jsoneditor library, in place of the abandoned @maaxgr/ang-jsoneditor.
// `change` fires with the parsed JSON when it is valid; read the raw text with getText().
@Component({
    // eslint-disable-next-line @angular-eslint/component-selector
    selector: 'json-editor',
    template: '<div class="json-editor" #container></div>',
    styles: [':host { display: block; } .json-editor { height: 100%; }'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class JsonEditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('container', { static: true }) container!: ElementRef<HTMLElement>;

  @Input() options: JsonEditorOptions = new JsonEditorOptions();

  private _data: unknown = {};
  @Input() set data(value: unknown) {
    this._data = value;
    this.editor?.set(value);
  }

  @Output() change = new EventEmitter<unknown>();
  @Output() jsonChange = new EventEmitter<unknown>();

  private editor: any;

  ngAfterViewInit(): void {
    this.editor = new JSONEditor(this.container.nativeElement, {
      ...this.options,
      onChange: () => this.emit(this.change),
      onChangeJSON: this.options.mode == 'code' || this.options.mode == 'text' ? undefined : () => this.emit(this.jsonChange)
    }, this._data);
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
  }

  getText(): string {
    return this.editor?.getText() ?? '';
  }

  private emit(emitter: EventEmitter<unknown>) {
    try {
      emitter.emit(this.editor.get());
    } catch {
      // the text isn't valid JSON yet
    }
  }
}
