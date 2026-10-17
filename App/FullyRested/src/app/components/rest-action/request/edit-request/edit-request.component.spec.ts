import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CreateEmptyAction, HttpProtocol, RestAction } from '@fullyrested/core';
import { AppModule } from 'src/app/app.module';

import { EditRequestComponent } from './edit-request.component';

describe('EditRequestComponent', () => {
  function create(action: Partial<RestAction>) {
    TestBed.configureTestingModule({ imports: [AppModule] });
    const fixture = TestBed.createComponent(EditRequestComponent);
    fixture.componentInstance.action = { ...CreateEmptyAction(), ...action };
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, element: fixture.nativeElement as HTMLElement };
  }

  it('shows the protocol, url and active params as one URL', () => {
    const { component } = create({
      protocol: HttpProtocol.https,
      url: 'api.example/users',
      parameters: [
        { key: 'page', value: '2', active: true, id: '1' },
        { key: 'off', value: 'x', active: false, id: '2' },
      ],
    });

    expect(component.urlText).toBe('https://api.example/users?page=2');
  });

  it('splits a typed URL into protocol, url and params', () => {
    const { component } = create({ protocol: HttpProtocol.https, url: '' });

    component.onUrlChange('http://{{host}}/items?sort=name');

    expect(component.action.protocol).toBe(HttpProtocol.http);
    expect(component.action.url).toBe('{{host}}/items');
    expect(component.action.parameters).toEqual([jasmine.objectContaining({ key: 'sort', value: 'name', active: true })]);
    // the editor keeps exactly what was typed
    expect(component.urlText).toBe('http://{{host}}/items?sort=name');
  });

  it('labels sub-tabs with what is set', () => {
    const { element } = create({
      headers: [{ key: 'a', value: '1', active: true, id: '1' }, { key: 'b', value: '2', active: true, id: '2' }],
      body: { contentType: 'application/json', body: '{}' },
    });

    const counts = [...element.querySelectorAll('.mat-mdc-tab')].map((t) => t.querySelector('.count')?.textContent?.trim());
    expect(counts).toEqual([undefined, 'Inherit', '2', 'JSON', undefined]);
  });

  it('sends when Enter is pressed in the URL', () => {
    const { component } = create({ url: 'x.example' });
    const sent: unknown[] = [];
    component.execute.subscribe((a) => sent.push(a));

    (component as any).urlEditor.enter.emit();

    expect(sent.length).toBe(1);
  });

  it('shows Send and the method picker for an HTTP request', () => {
    const { element } = create({ url: 'x.example' });

    expect(element.querySelector('button.send')?.textContent?.trim()).toBe('Send');
    expect(element.querySelector('mat-select.verb-select')).not.toBeNull();
  });

  it('shows a Run button and a WS tag for a websocket request, and Run emits execute', () => {
    const { element, component } = create({ type: 'websocket', url: 'wss://x.example/feed' });
    const sent: unknown[] = [];
    component.execute.subscribe((a) => sent.push(a));

    const button = element.querySelector('button.send') as HTMLButtonElement;
    button.click();

    expect(button.textContent?.trim()).toBe('Run');
    expect(element.querySelector('mat-select.verb-select')).toBeNull();
    expect(element.querySelector('.fr-method')?.textContent?.trim()).toBe('WS');
    expect(sent.length).toBe(1);
  });

  it('shows the message and expect editor instead of Body and Validation for a websocket request', () => {
    const { element } = create({ type: 'websocket', url: 'wss://x.example/feed', message: '{}' });

    expect(element.querySelector('app-edit-request-websocket')).not.toBeNull();
    expect(element.querySelector('app-edit-request-body')).toBeNull();
    expect(element.querySelector('app-edit-request-validation')).toBeNull();
  });

  it('switches HTTP to websocket with the websocket defaults, like set_type', () => {
    const { component, fixture } = create({ url: 'x.example' });
    const changed: unknown[] = [];
    component.actionChange.subscribe((a) => changed.push(a));

    component.onTypeChange({ value: 'websocket' });
    fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();

    expect(component.action.type).toBe('websocket');
    expect(component.action.message).toBe('');
    expect(component.action.expect).toEqual(jasmine.objectContaining({ count: 1, match: 'all', extras: 'ignore', timeout: 5000, settle: 500 }));
    expect(changed.length).toBe(1);
    expect(fixture.nativeElement.querySelector('app-edit-request-websocket')).not.toBeNull();
  });

  it('keeps message and expect when switching back to HTTP, and clears a pending validation error', () => {
    const expect_ = { count: 2, match: 'any' as const, extras: 'fail' as const, timeout: 1000, settle: 10, schema: undefined };
    const { component, fixture } = create({ type: 'websocket', message: '{"a":1}', expect: expect_ });
    const invalid: boolean[] = [];
    component.invalidChange.subscribe((v) => invalid.push(v));

    component.onTypeChange({ value: 'http' });
    fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();

    expect(component.action.type).toBe('http');
    expect(component.action.message).toBe('{"a":1}');
    expect(component.action.expect).toEqual(expect_);
    expect(invalid).toEqual([false]);
    expect(fixture.nativeElement.querySelector('app-edit-request-websocket')).toBeNull();
  });

  it('does nothing when the chosen type is already set', () => {
    const { component } = create({ url: 'x.example' });
    const changed: unknown[] = [];
    component.actionChange.subscribe((a) => changed.push(a));

    component.onTypeChange({ value: 'http' });

    expect(changed.length).toBe(0);
  });
});
