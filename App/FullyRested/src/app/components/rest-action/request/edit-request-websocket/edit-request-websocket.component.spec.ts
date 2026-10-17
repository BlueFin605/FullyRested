import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CollectionConfig, CollectionNode, CreateEmptyAction, CreateEmptyRestActionRun, RequestNode, RestAction, normaliseCollectionConfig } from '@fullyrested/core';
import { CollectionTreeService } from 'src/app/services/collection-tree/collection-tree.service';
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

describe('EditRequestWebsocketComponent trigger', () => {
  function create(extra: Partial<RestAction> = {}) {
    TestBed.configureTestingModule({ imports: [AppModule] });
    const root = new CollectionNode(normaliseCollectionConfig({} as CollectionConfig), 'api.frcol');
    root.children.push(
      new RequestNode(root, 'pages/touch.frreq', { ...CreateEmptyAction(), id: 'touch-id', name: 'touch', runs: [{ ...CreateEmptyRestActionRun({ generateGUID: () => 'r1' }, undefined), name: 'loud' }] }),
      new RequestNode(root, 'feed.frreq', { ...CreateEmptyAction(), id: 'feed-id', type: 'websocket' }),
    );
    const self = new RequestNode(root, 'me.frreq', { ...CreateEmptyAction(), id: 'me-id', type: 'websocket' });
    root.children.push(self);
    TestBed.inject(CollectionTreeService).tree.next(root);

    const fixture = TestBed.createComponent(EditRequestWebsocketComponent);
    const component = fixture.componentInstance;
    const action = { ...self.action, ...extra } as RestAction;
    const changes: number[] = [];
    const invalid: boolean[] = [];
    component.actionChange.subscribe(() => changes.push(1));
    component.invalidChange.subscribe((v) => invalid.push(v));
    component.action = action;
    fixture.detectChanges();
    return { fixture, component, action, changes, invalid, element: fixture.nativeElement as HTMLElement };
  }

  const existing = { request: 'pages/touch.frreq', repeat: 'until-done', interval: 1000, delay: 0 } as const;

  it('offers the collection http requests, not websocket ones or itself', () => {
    const { component } = create();

    expect(component.triggerChoices.map(c => c.path)).toEqual(['pages/touch.frreq']);
  });

  it('writes the trigger in the shape set_trigger writes, with defaults', () => {
    const { component, action, changes } = create();

    component.triggerRequest = 'pages/touch.frreq';
    component.onTriggerRequestChange();

    expect(action.trigger).toEqual({ request: 'pages/touch.frreq', repeat: 'until-done', interval: 1000, delay: 0 });
    expect(changes.length).toBe(1);
  });

  it('writes run, repeat, interval and delay', () => {
    const { component, action } = create();
    component.triggerRequest = 'pages/touch.frreq';
    component.onTriggerRequestChange();

    component.triggerRun = 'r1';
    component.triggerRepeat = 'once';
    component.intervalText = '250';
    component.delayText = '40';
    component.onTriggerChange();

    expect(action.trigger).toEqual({ request: 'pages/touch.frreq', run: 'r1', repeat: 'once', interval: 250, delay: 40 });
  });

  it('drops the run when another request is picked', () => {
    const { component, action } = create({ trigger: { ...existing, run: 'r1' } });
    expect(component.triggerRun).toBe('r1');

    component.triggerRequest = 'feed.frreq';
    component.onTriggerRequestChange();

    expect(action.trigger?.run).toBeUndefined();
  });

  it('shows a trigger run stored by name as the run id, which is what the picker offers, and writes the id back', () => {
    const { component, action } = create({ trigger: { request: 'pages/touch.frreq', run: 'loud', repeat: 'once', interval: 300, delay: 20 } });
    expect(component.triggerRun).toBe('r1');
    expect(component.triggerRuns.some(r => r.id == component.triggerRun)).toBeTrue();

    component.delayText = '30';
    component.onTriggerChange();

    expect(action.trigger?.run).toBe('r1');
  });

  it('shows the values of an existing trigger', () => {
    const { component } = create({ trigger: { request: 'pages/touch.frreq', run: 'r1', repeat: 'once', interval: 300, delay: 20 } });

    expect([component.triggerRequest, component.triggerRun, component.triggerRepeat, component.intervalText, component.delayText])
      .toEqual(['pages/touch.frreq', 'r1', 'once', '300', '20']);
    expect(component.triggerRuns.map(r => r.id)).toEqual(['r1']);
  });

  for (const bad of ['99', '0', 'abc', '', '1.5']) {
    it(`rejects interval '${bad}' inline and does not write it`, () => {
      const { fixture, component, action, invalid, element } = create({ trigger: { ...existing, interval: 500 } });

      component.intervalText = bad;
      component.onTriggerChange();
      refresh(fixture);

      expect(action.trigger?.interval).toBe(500);
      expect(component.invalid).toBeTrue();
      expect(invalid).toEqual([true]);
      expect(element.querySelector('[data-field=interval]')?.textContent).toContain('at least 100');
    });
  }

  it('rejects a negative delay and recovers when fixed', () => {
    const { component, action, invalid } = create({ trigger: { ...existing } });

    component.delayText = '-1';
    component.onTriggerChange();
    expect(component.invalid).toBeTrue();
    expect(action.trigger?.delay).toBe(0);

    component.delayText = '200';
    component.onTriggerChange();
    expect(component.invalid).toBeFalse();
    expect(action.trigger?.delay).toBe(200);
    expect(invalid).toEqual([true, false]);
  });

  it('keeps a trigger error when an expect field is edited', () => {
    const { component } = create({ trigger: { ...existing } });

    component.intervalText = '5';
    component.onTriggerChange();
    component.onFieldChange();

    expect(component.invalid).toBeTrue();
  });

  it('flags a trigger whose request is no longer in the collection', () => {
    const { component } = create({ trigger: { request: 'gone.frreq', repeat: 'once', interval: 1000, delay: 0 } });

    expect(component.triggerMissing).toBeTrue();
  });

  it('Clear removes the trigger and resets the fields', () => {
    const { fixture, component, action, element } = create({ trigger: { request: 'pages/touch.frreq', repeat: 'once', interval: 300, delay: 20 } });
    refresh(fixture);

    (element.querySelector('.clear-trigger') as HTMLButtonElement).click();
    refresh(fixture);

    expect(action.trigger).toBeUndefined();
    expect([component.triggerRequest, component.intervalText, component.delayText]).toEqual(['', '1000', '0']);
    expect(element.querySelector('.clear-trigger')).toBeNull();
  });

  it('clearing when there is no trigger changes nothing', () => {
    const { component, changes } = create();

    component.clearTrigger();

    expect(changes.length).toBe(0);
  });
});
