import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CreateEmptyAction, RestAction } from '@fullyrested/core';
import { AppModule } from 'src/app/app.module';

import { EditRequestWebsocketComponent } from './edit-request-websocket.component';

// The app is zoneless: a view only refreshes once marked dirty, as a template event would
function refresh(fixture: ComponentFixture<unknown>) {
  fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
  fixture.detectChanges();
}

describe('EditRequestWebsocketComponent', () => {
  function create(extra: Partial<RestAction> = {}) {
    TestBed.configureTestingModule({ imports: [AppModule] });
    const fixture = TestBed.createComponent(EditRequestWebsocketComponent);
    const component = fixture.componentInstance;
    const action = { ...CreateEmptyAction(), type: 'websocket', message: '{"hello":1}', ...extra } as RestAction;
    const changes: number[] = [];
    const invalid: boolean[] = [];
    component.actionChange.subscribe(() => changes.push(1));
    component.invalidChange.subscribe((v) => invalid.push(v));
    component.action = action;
    fixture.detectChanges();
    return { fixture, component, action, changes, invalid, element: fixture.nativeElement as HTMLElement };
  }

  it('renders the message editor, expect fields and schema editor with defaults', async () => {
    const { fixture, element } = create();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelectorAll('app-code-editor').length).toBe(2);
    const value = (name: string) => (element.querySelector(`input[name=${name}]`) as HTMLInputElement).value;
    expect(value('count')).toBe('1');
    expect(value('timeout')).toBe('5000');
    expect(value('settle')).toBe('500');
    expect(element.textContent).toContain('Match');
    expect(element.textContent).toContain('Extras');
  });

  it('shows the values of an existing expect', async () => {
    const { fixture, element } = create({
      expect: { count: 3, match: 'any', extras: 'fail', timeout: 9000, settle: 100, schema: { schema: '{"type":"object"}' } },
    });
    await fixture.whenStable();

    const value = (name: string) => (element.querySelector(`input[name=${name}]`) as HTMLInputElement).value;
    expect([value('count'), value('timeout'), value('settle')]).toEqual(['3', '9000', '100']);
    expect(fixture.componentInstance.match).toBe('any');
    expect(fixture.componentInstance.schemaText).toBe('{"type":"object"}');
  });

  it('writes the message to the request', () => {
    const { component, action, changes } = create();

    component.onMessageChange('{"ping":true}');

    expect(action.message).toBe('{"ping":true}');
    expect(changes.length).toBe(1);
  });

  it('writes expect fields in the same shape set_expect writes', () => {
    const { component, action } = create();

    component.countText = '2';
    component.match = 'any';
    component.extras = 'fail';
    component.timeoutText = '1500';
    component.settleText = '0';
    component.onSchemaChange('{"type":"object"}');

    expect(action.expect).toEqual({
      count: 2, match: 'any', extras: 'fail', timeout: 1500, settle: 0, schema: { schema: '{"type":"object"}' },
    });
    expect(component.invalid).toBeFalse();
  });

  it('clears the schema when the text is emptied', () => {
    const { component, action } = create({
      expect: { count: 1, match: 'all', extras: 'ignore', timeout: 5000, settle: 500, schema: { schema: '{}' } },
    });

    component.onSchemaChange('');

    expect(action.expect?.schema).toBeUndefined();
  });

  for (const bad of ['0', '-5', '1.5', 'abc', '']) {
    it(`rejects timeout '${bad}' inline and does not write it`, async () => {
      const { fixture, component, action, invalid, element } = create();

      component.timeoutText = bad;
      component.onFieldChange();
      refresh(fixture);

      expect(action.expect?.timeout).toBe(5000);
      expect(component.invalid).toBeTrue();
      expect(invalid).toEqual([true]);
      expect(element.querySelector('[data-field=timeout]')?.textContent).toContain('positive whole number');
    });
  }

  it('rejects an invalid count and settle inline', () => {
    const { fixture, component, action, element } = create();

    component.countText = '0';
    component.settleText = '-1';
    component.onFieldChange();
    refresh(fixture);

    expect(action.expect?.count).toBe(1);
    expect(action.expect?.settle).toBe(500);
    expect(element.querySelector('[data-field=count]')).not.toBeNull();
    expect(element.querySelector('[data-field=settle]')).not.toBeNull();
  });

  it('rejects schema text that is not JSON', () => {
    const { fixture, component, action, element } = create();

    component.onSchemaChange('{ nope');
    refresh(fixture);

    expect(action.expect?.schema).toBeUndefined();
    expect(component.invalid).toBeTrue();
    expect(element.querySelector('[data-field=schema]')?.textContent).toContain('not valid JSON');
  });

  it('rejects a schema that does not compile', () => {
    const { fixture, component, action, element } = create();

    component.onSchemaChange('{"type":"nonsense"}');
    refresh(fixture);

    expect(action.expect?.schema).toBeUndefined();
    expect(element.querySelector('[data-field=schema]')?.textContent).toContain('does not compile');
  });

  it('still writes the valid fields while another is invalid, and recovers when fixed', () => {
    const { component, action, invalid } = create();

    component.countText = '4';
    component.timeoutText = '0';
    component.onFieldChange();
    expect(action.expect?.count).toBe(4);
    expect(component.invalid).toBeTrue();

    component.timeoutText = '2500';
    component.onFieldChange();
    expect(action.expect?.timeout).toBe(2500);
    expect(component.invalid).toBeFalse();
    expect(invalid).toEqual([true, false]);
  });
});
