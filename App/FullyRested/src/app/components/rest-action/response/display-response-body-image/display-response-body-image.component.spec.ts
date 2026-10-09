import { TestBed } from '@angular/core/testing';

import { DisplayResponseBodyImageComponent } from './display-response-body-image.component';

describe('DisplayResponseBodyImageComponent', () => {
  const png = [137, 80, 78, 71, 13, 10, 26, 10];

  function show(body: ArrayBuffer | Uint8Array): DisplayResponseBodyImageComponent {
    TestBed.configureTestingModule({ declarations: [DisplayResponseBodyImageComponent] });
    const component = TestBed.createComponent(DisplayResponseBodyImageComponent).componentInstance;
    component.body = { contentType: 'image/png', body: body as ArrayBuffer };
    return component;
  }

  it('shows a body from the main process (a Uint8Array) as a base64 data URL', () => {
    expect(show(new Uint8Array(png))._objectURL).toBe('data:image/jpeg;base64,iVBORw0KGgo=');
  });

  it('shows an ArrayBuffer body the same way', () => {
    expect(show(new Uint8Array(png).buffer)._objectURL).toBe('data:image/jpeg;base64,iVBORw0KGgo=');
  });

  it('only encodes the view, not the rest of a shared buffer', () => {
    const shared = new Uint8Array([1, 2, ...png, 3]);
    expect(show(shared.subarray(2, 2 + png.length))._objectURL).toBe('data:image/jpeg;base64,iVBORw0KGgo=');
  });

  it('encodes images larger than one chunk', () => {
    const big = new Uint8Array(100_000).fill(65);   // 'A'
    expect(atob(show(big)._objectURL.split(',')[1])).toBe('A'.repeat(100_000));
  });
});
