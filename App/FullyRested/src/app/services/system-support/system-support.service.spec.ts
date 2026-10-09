import { TestBed } from '@angular/core/testing';

import { SystemSupportService } from './system-support.service';

describe('SystemSupportService', () => {
  let service: SystemSupportService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SystemSupportService);
  });

  it('generates version 4 GUIDs', () => {
    expect(service.generateGUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates a different GUID each time', () => {
    const guids = new Set(Array.from({ length: 50 }, () => service.generateGUID()));
    expect(guids.size).toBe(50);
  });
});
