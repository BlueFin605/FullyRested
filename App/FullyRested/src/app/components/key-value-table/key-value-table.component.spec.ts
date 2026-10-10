import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { AppModule } from 'src/app/app.module';

import { KeyValueTableComponent } from './key-value-table.component';

describe('KeyValueTableComponent', () => {
  function create(inputs: Partial<KeyValueTableComponent>) {
    TestBed.configureTestingModule({ imports: [AppModule] });
    const fixture = TestBed.createComponent(KeyValueTableComponent);
    Object.assign(fixture.componentInstance, inputs);
    const emitted: any[][] = [];
    fixture.componentInstance.rowsChange.subscribe((r) => emitted.push(structuredClone(r)));
    fixture.detectChanges();
    return { fixture, emitted, element: fixture.nativeElement as HTMLElement };
  }

  function type(input: HTMLInputElement, text: string) {
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }

  it('adds a row using the caller\'s field names when typing in the empty row', () => {
    const { fixture, emitted, element } = create({ rows: [], keyField: '$secret', valueField: '$value' });

    type(element.querySelector('.kv-new .kv-value') as HTMLInputElement, 's3cr3t');
    fixture.detectChanges();

    expect(emitted.at(-1)).toEqual([jasmine.objectContaining({ $secret: '', $value: 's3cr3t', active: true })]);
    expect(element.querySelectorAll('.kv-row:not(.kv-head):not(.kv-new)').length).toBe(1);
  });

  it('keeps fast typing in one row when keys arrive before the caret moves to it', fakeAsync(() => {
    const { fixture, emitted, element } = create({ rows: [] });
    const add = element.querySelector('.kv-new .kv-key') as HTMLInputElement;

    // each keystroke lands in the add row until the refocus runs
    for (const key of 'abc') {
      type(add, add.value + key);
      fixture.detectChanges();
    }
    tick();
    fixture.detectChanges();

    expect(emitted.at(-1)).toEqual([jasmine.objectContaining({ key: 'abc', value: '', active: true })]);
    const rowKeys = element.querySelectorAll('.kv-row:not(.kv-head):not(.kv-new) .kv-key');
    expect(rowKeys.length).toBe(1);
    expect(document.activeElement).toBe(rowKeys[0]);
    expect(add.value).toBe('');
  }));

    it('disables and deletes rows', () => {
    const rows = [{ key: 'a', value: '1', active: true, id: '1' }, { key: 'b', value: '2', active: true, id: '2' }];
    const { fixture, emitted, element } = create({ rows });

    (element.querySelector('.kv-check') as HTMLInputElement).click();
    (element.querySelectorAll('.kv-delete')[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(emitted.at(-1)).toEqual([{ key: 'a', value: '1', active: false, id: '1' }]);
  });

  it('masks values until revealed', () => {
    const { fixture, element } = create({ rows: [{ key: 'k', value: 'v', active: true, id: '1' }], masked: true });
    const value = () => (element.querySelector('.kv-row:not(.kv-new) .kv-value') as HTMLInputElement).type;

    expect(value()).toBe('password');

    (element.querySelector('.reveal') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(value()).toBe('text');
  });

  it('shows inherited rows read-only with their source', () => {
    const { element } = create({ rows: [], inherited: [{ key: 'Accept', value: 'json', active: true }], inheritedSource: 'request' });

    const inherited = element.querySelector('.inherited') as HTMLElement;
    expect(inherited.textContent).toContain('Accept');
    expect(inherited.textContent).toContain('request');
    expect(inherited.querySelector('input')).toBeNull();
  });
});
