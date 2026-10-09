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

    const inputs = [...element.querySelectorAll('app-edit-request-parameters input.mat-mdc-input-element')] as HTMLInputElement[];
    expect(element.querySelector('json-editor')).toBeNull();
    expect(element.textContent).toContain('Add Field');
    expect(inputs.map(i => i.value)).toEqual(['name', 'Ada']);
  });

  it('adds a field to the body when Add Field is pressed', () => {
    const { fixture, emitted, element } = create({ contentType: FORM_CONTENT_TYPE, body: [] });

    (element.querySelector('.addparam button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(emitted.at(-1)?.body.length).toBe(1);
    expect(emitted.at(-1)?.body[0]).toEqual(jasmine.objectContaining({ key: '', value: '', active: true }));
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
