import { TestBed } from '@angular/core/testing';
import { EditorView } from '@codemirror/view';
import { AppModule } from 'src/app/app.module';

import { CodeEditorComponent } from './code-editor.component';

describe('CodeEditorComponent', () => {
  function create(inputs: Partial<CodeEditorComponent> = {}) {
    TestBed.configureTestingModule({ imports: [AppModule] });
    const fixture = TestBed.createComponent(CodeEditorComponent);
    Object.assign(fixture.componentInstance, inputs);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const view = EditorView.findFromDOM(element.querySelector('.cm-editor') as HTMLElement)!;
    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
    return { fixture, element, view, emitted };
  }

  it('shows the value it is given', () => {
    const { view } = create({ value: '{"a":1}', language: 'json' });

    expect(view.state.doc.toString()).toBe('{"a":1}');
  });

  it('emits the text when the user edits it', () => {
    const { view, emitted } = create({ value: 'abc' });

    view.dispatch({ changes: { from: 3, insert: 'd' } });

    expect(emitted).toEqual(['abcd']);
  });

  it('takes a new value from the input without echoing it back', () => {
    const { fixture, view, emitted } = create({ value: 'one' });

    fixture.componentRef.setInput('value', 'two');
    fixture.detectChanges();

    expect(view.state.doc.toString()).toBe('two');
    expect(emitted).toEqual([]);
  });

  it('highlights variables and secrets', () => {
    const { element } = create({ value: '{{host}}/x?k={{$secret apiKey}}', singleLine: true });

    expect(element.querySelector('.cm-fr-var')?.textContent).toBe('{{host}}');
    expect(element.querySelector('.cm-fr-secret')?.textContent).toBe('{{$secret apiKey}}');
  });

  it('keeps single-line input on one line', () => {
    const { view, emitted } = create({ value: 'a', singleLine: true });

    view.dispatch({ changes: { from: 1, insert: 'b\nc' } });

    expect(view.state.doc.lines).toBe(1);
    expect(emitted.at(-1)).toBe('abc');
  });
});
