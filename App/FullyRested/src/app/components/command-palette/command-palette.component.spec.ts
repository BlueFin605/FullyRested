import { TestBed } from '@angular/core/testing';
import { AppModule } from 'src/app/app.module';

import { CommandPaletteComponent, PaletteItem, matchScore } from './command-palette.component';

describe('CommandPaletteComponent', () => {
  it('matches substrings first, then letters in order', () => {
    expect(matchScore('New request', 'new')).toBe(0);
    expect(matchScore('Save request', 'req')).toBe(1);
    expect(matchScore('New request', 'nwreq')).toBeGreaterThan(2);
    expect(matchScore('New request', 'xyz')).toBeUndefined();
  });

  function create(labels: string[]) {
    TestBed.configureTestingModule({ imports: [AppModule] });
    const fixture = TestBed.createComponent(CommandPaletteComponent);
    const ran: string[] = [];
    fixture.componentInstance.items = labels.map(
      (label): PaletteItem => ({ label, group: 'Commands', run: () => ran.push(label) }),
    );
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, ran };
  }

  const key = (key: string) => new KeyboardEvent('keydown', { key });

  it('runs the highlighted result on Enter and closes', () => {
    const { component, ran } = create(['Get users', 'Get orders', 'Delete user']);
    let closed = false;
    component.closed.subscribe(() => (closed = true));

    component.onQuery('get');
    component.onKey(key('ArrowDown'));
    component.onKey(key('Enter'));

    expect(ran).toEqual(['Get orders']);
    expect(closed).toBeTrue();
  });

  it('ranks better matches first', () => {
    const { component } = create(['Toggle sidebar', 'Save request']);

    component.onQuery('save');

    expect(component.results.map((r) => r.label)).toEqual(['Save request']);
  });
});
