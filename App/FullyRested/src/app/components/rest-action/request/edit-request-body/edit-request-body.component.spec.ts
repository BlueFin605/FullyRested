import { TestBed } from '@angular/core/testing';
import { FORM_CONTENT_TYPE, RestActionBody } from '@fullyrested/core';
import { AppModule } from 'src/app/app.module';

import { EditRequestBodyComponent } from './edit-request-body.component';

describe('EditRequestBodyComponent', () => {
  function create(body: RestActionBody) {
    TestBed.configureTestingModule({ imports: [AppModule] });
    const fixture = TestBed.createComponent(EditRequestBodyComponent);
    const emitted: RestActionBody[] = [];
    fixture.componentInstance.bodyChange.subscribe(b => emitted.push(structuredClone(b)));
    fixture.componentInstance.body = body;
    fixture.detectChanges();
    return { fixture, emitted, element: fixture.nativeElement as HTMLElement };
  }

  it('edits a form body as a table of fields', async () => {
    const { fixture, element } = create({ contentType: FORM_CONTENT_TYPE, body: [{ key: 'name', value: 'Ada', active: true, id: '1' }] });
    await fixture.whenStable();   // ngModel writes input values asynchronously

    const inputs = [...element.querySelectorAll('app-edit-request-parameters .kv-row:not(.kv-new) .kv-input')] as HTMLInputElement[];
    expect(element.querySelector('app-code-editor')).toBeNull();
    expect(inputs.map(i => i.value)).toEqual(['name', 'Ada']);
  });

  it('adds a field to the body when typing into the empty last row', () => {
    const { fixture, emitted, element } = create({ contentType: FORM_CONTENT_TYPE, body: [] });

    const newKey = element.querySelector('.kv-new .kv-key') as HTMLInputElement;
    newKey.value = 'n';
    newKey.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(emitted.at(-1)?.body.length).toBe(1);
    expect(emitted.at(-1)?.body[0]).toEqual(jasmine.objectContaining({ key: 'n', value: '', active: true }));
  });

  it('keeps the JSON body as typed, including formatting', () => {
    const { fixture, emitted } = create({ contentType: 'application/json', body: '{\n  "a": 1\n}' });

    fixture.componentInstance.updateData('{\n  "a": 2\n}');

    expect(emitted.at(-1)?.body).toBe('{\n  "a": 2\n}');
    expect(fixture.componentInstance.jsonError).toBe('');
  });

  it('starts an empty field table when switching a JSON body to a form', () => {
    const { fixture, emitted } = create({ contentType: 'application/json', body: '{"a":1}' });

    fixture.componentInstance.onContentTypeChange({ value: FORM_CONTENT_TYPE });

    expect(emitted.at(-1)).toEqual({ contentType: FORM_CONTENT_TYPE, body: [] });
  });

  it('starts an empty JSON object when switching a form body to JSON', () => {
    const { fixture, emitted } = create({ contentType: FORM_CONTENT_TYPE, body: [{ key: 'a', value: '1', active: true, id: '1' }] });

    fixture.componentInstance.onContentTypeChange({ value: 'application/json' });

    expect(emitted.at(-1)).toEqual({ contentType: 'application/json', body: '{}' });
  });
});
