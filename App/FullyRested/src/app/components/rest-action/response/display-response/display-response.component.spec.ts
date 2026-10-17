import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ResponseValidation } from '@fullyrested/core';

import { EmptyActionResult } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { DisplayResponseComponent } from './display-response.component';

describe('DisplayResponseComponent validation', () => {
  function render(validated: ResponseValidation): HTMLElement {
    TestBed.configureTestingModule({
      declarations: [DisplayResponseComponent],
      schemas: [NO_ERRORS_SCHEMA],
    });
    const fixture = TestBed.createComponent(DisplayResponseComponent);
    fixture.componentInstance.response = {
      ...EmptyActionResult,
      status: 200,
      statusText: 'OK',
      validated,
    };
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('counts failed checks, not errors, and groups errors under their check', () => {
    const el = render({
      valid: false,
      information: [],
      errors: ['status 500', 'body: a', 'body: b'],
      checks: [
        { check: 'status', passed: false, errors: ['status 500'] },
        { check: 'body', passed: false, errors: ['body: a', 'body: b'] },
        { check: 'headers', passed: true, errors: [] },
      ],
    });

    expect(el.textContent).toContain('2 failed');
    const groups = Array.from(el.querySelectorAll('.validation-errors .check-label')).map(l => l.textContent?.trim());
    expect(groups).toEqual(['status', 'body']);
    expect(el.querySelectorAll('.validation-errors li.error').length).toBe(3);
  });

  it('falls back to a flat list and error count without checks', () => {
    const el = render({ valid: false, information: [], errors: ['x', 'y'] });

    expect(el.textContent).toContain('2 failed');
    expect(el.querySelectorAll('.validation-errors .check-label').length).toBe(0);
    expect(el.querySelectorAll('.validation-errors li').length).toBe(2);
  });
});

describe('DisplayResponseComponent trigger calls', () => {
  function render(triggerCalls?: { at: number; status?: number; error?: string; ms: number }[]): HTMLElement {
    TestBed.configureTestingModule({
      declarations: [DisplayResponseComponent],
      schemas: [NO_ERRORS_SCHEMA],
    });
    const fixture = TestBed.createComponent(DisplayResponseComponent);
    fixture.componentInstance.response = { ...EmptyActionResult, status: 'PASS', statusText: '1 message(s) received', triggerCalls };
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lists each call with its time, status or error and duration', () => {
    const el = render([{ at: Date.UTC(2026, 0, 1, 12, 0, 1), status: 200, ms: 12 }, { at: Date.UTC(2026, 0, 1, 12, 0, 2), error: 'ECONNREFUSED', ms: 3 }]);

    const rows = Array.from(el.querySelectorAll('.trigger-call'));
    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('.at')!.textContent).toMatch(/^\d\d:\d\d:\d\d\.\d{3}$/);
    expect(rows[0].querySelector('.outcome')!.textContent).toBe('200');
    expect(rows[0].getAttribute('data-level')).toBe('ok');
    expect(rows[1].querySelector('.outcome')!.textContent).toBe('ECONNREFUSED');
    expect(rows[1].getAttribute('data-level')).toBe('error');
    expect(rows[1].querySelector('.ms')!.textContent).toBe('3 ms');
  });

  it('shows no trigger section without calls', () => {
    expect(render().querySelector('.trigger-calls')).toBeNull();
  });
});
