import { TestBed } from '@angular/core/testing';

import { SystemSupportService } from './system-support.service';

describe('SystemSupportService', () => {
  let service: SystemSupportService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SystemSupportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
