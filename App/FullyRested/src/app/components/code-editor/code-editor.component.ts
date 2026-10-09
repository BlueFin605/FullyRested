import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { basicSetup } from 'codemirror';
import {
  Annotation,
  Compartment,
  EditorState,
  Extension,
  Prec,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  ViewUpdate,
  drawSelection,
  keymap,
  placeholder as placeholderExt,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { html } from '@codemirror/lang-html';

export type CodeLanguage = 'json' | 'xml' | 'html' | 'text';

// Marks a change that came from the [value] input, so it isn't echoed back out
const external = Annotation.define<boolean>();

// {{name}} and {{$secret name}} stand out wherever they're typed
const variableMatcher = new MatchDecorator({
  regexp: /\{\{\s*([^}]*)\}\}/g,
  decoration: (match) =>
    Decoration.mark({
      class: match[1].startsWith('$secret') ? 'cm-fr-secret' : 'cm-fr-var',
    }),
});

const variableHighlighter = ViewPlugin.fromClass(
  class {
    decorations;
    constructor(view: EditorView) {
      this.decorations = variableMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = variableMatcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

// Syntax colors come from CSS tokens, so they follow light and dark
const highlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--fr-syn-key)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--fr-syn-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--fr-syn-number)' },
  { tag: [tags.tagName, tags.typeName], color: 'var(--fr-syn-tag)' },
  { tag: tags.attributeName, color: 'var(--fr-syn-key)' },
  { tag: tags.attributeValue, color: 'var(--fr-syn-string)' },
  { tag: [tags.comment, tags.meta], color: 'var(--fr-text-faint)', fontStyle: 'italic' },
  { tag: [tags.punctuation, tags.bracket, tags.separator], color: 'var(--fr-text-muted)' },
]);

const editorTheme = EditorView.theme({
  '&': {
    color: 'var(--fr-text)',
    backgroundColor: 'transparent',
    fontSize: '13px',
    height: '100%',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--fr-font-mono)', lineHeight: '1.55' },
  '.cm-content': { caretColor: 'var(--fr-accent)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--fr-accent)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--fr-text-faint)',
    border: 'none',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--fr-hover)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    { backgroundColor: 'var(--fr-selected) !important' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--fr-surface-2)',
    border: 'none',
    color: 'var(--fr-text-muted)',
  },
  '.cm-panels': { backgroundColor: 'var(--fr-surface)', color: 'var(--fr-text)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--fr-border)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--fr-warn) 30%, transparent)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--fr-bg)',
    border: '1px solid var(--fr-border)',
  },
  '.cm-placeholder': { color: 'var(--fr-text-faint)' },
  '.cm-fr-var': {
    color: 'var(--fr-var)',
    backgroundColor: 'color-mix(in srgb, var(--fr-var) 12%, transparent)',
    borderRadius: '3px',
  },
  '.cm-fr-secret': {
    color: 'var(--fr-secret)',
    backgroundColor: 'color-mix(in srgb, var(--fr-secret) 12%, transparent)',
    borderRadius: '3px',
  },
});

// One line only: newlines (typed or pasted) become nothing, and the scroller doesn't wrap
const singleLineTheme = EditorView.theme({
  '.cm-content': { padding: '0' },
  '.cm-line': { padding: '0' },
  '.cm-scroller': { overflow: 'hidden', lineHeight: '30px' },
});

const singleLineFilter = EditorState.transactionFilter.of((tr) =>
  tr.newDoc.lines > 1
    ? [
        tr,
        {
          changes: {
            from: 0,
            to: tr.newDoc.length,
            insert: tr.newDoc.sliceString(0).replace(/[\r\n]+/g, ''),
          },
          sequential: true,
        },
      ]
    : tr,
);

function languageSupport(language: CodeLanguage): Extension {
  switch (language) {
    case 'json':
      return json();
    case 'xml':
      return xml();
    case 'html':
      return html();
    default:
      return [];
  }
}

// CodeMirror 6, styled from the app's tokens. Used for bodies, schemas, responses and the URL bar.
@Component({
  selector: 'app-code-editor',
  template: '<div class="host" #host></div>',
  styles: [
    ':host { display: block; min-height: 0; } .host { height: 100%; }',
    ':host(.single-line) .host { height: auto; }',
  ],
  host: { '[class.single-line]': 'singleLine' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class CodeEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLElement>;

  @Input() value: string = '';
  @Input() language: CodeLanguage = 'text';
  @Input() readOnly = false;
  @Input() singleLine = false;
  @Input() placeholder = '';

  @Output() valueChange = new EventEmitter<string>();
  // Enter in single-line mode
  @Output() enter = new EventEmitter<void>();

  private view: EditorView | undefined;
  private readonly languageConf = new Compartment();
  private readonly readOnlyConf = new Compartment();

  ngAfterViewInit(): void {
    this.view = new EditorView({
      parent: this.host.nativeElement,
      state: EditorState.create({
        doc: this.value ?? '',
        extensions: this.extensions(),
      }),
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.view == undefined) return;

    if (changes['value']) this.setText(this.value ?? '');

    if (changes['language'])
      this.view.dispatch({
        effects: this.languageConf.reconfigure(languageSupport(this.language)),
      });

    if (changes['readOnly'])
      this.view.dispatch({
        effects: this.readOnlyConf.reconfigure(this.readOnlyExtension()),
      });
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  getText(): string {
    return this.view?.state.doc.toString() ?? this.value;
  }

  focus() {
    if (this.view == undefined) return;
    this.view.focus();
    this.view.dispatch({ selection: { anchor: this.view.state.doc.length } });
  }

  private setText(text: string) {
    if (this.view == undefined || text == this.view.state.doc.toString()) return;

    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: text },
      annotations: external.of(true),
    });
  }

  private extensions(): Extension[] {
    const common: Extension[] = [
      editorTheme,
      syntaxHighlighting(highlightStyle),
      variableHighlighter,
      this.languageConf.of(languageSupport(this.language)),
      this.readOnlyConf.of(this.readOnlyExtension()),
      // Ctrl+Enter belongs to the app (send); stop CodeMirror inserting a line
      Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => true }])),
      EditorView.updateListener.of((update) => {
        if (
          update.docChanged &&
          !update.transactions.some((t) => t.annotation(external))
        )
          this.valueChange.emit(update.state.doc.toString());
      }),
    ];

    if (this.placeholder) common.push(placeholderExt(this.placeholder));

    if (!this.singleLine) return [basicSetup, ...common];

    return [
      ...common,
      singleLineTheme,
      singleLineFilter,
      history(),
      drawSelection(),
      Prec.high(
        keymap.of([
          {
            key: 'Enter',
            run: () => {
              this.enter.emit();
              return true;
            },
          },
        ]),
      ),
      keymap.of([...defaultKeymap, ...historyKeymap]),
    ];
  }

  private readOnlyExtension(): Extension {
    return [
      EditorState.readOnly.of(this.readOnly),
      EditorView.editable.of(!this.readOnly),
    ];
  }
}
