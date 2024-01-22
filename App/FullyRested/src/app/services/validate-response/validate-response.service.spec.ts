import { TestBed } from '@angular/core/testing';

import { ValidateResponseService } from './validate-response.service';

describe('ValidateResponseService', () => {
  let service: ValidateResponseService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ValidateResponseService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
