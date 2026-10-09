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
});
