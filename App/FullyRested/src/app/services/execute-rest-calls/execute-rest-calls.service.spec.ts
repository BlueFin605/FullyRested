import { TestBed } from '@angular/core/testing';

import { ExecuteRestCallsService } from './execute-rest-calls.service';

describe('ExecuteRestCallsService', () => {
  let service: ExecuteRestCallsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ExecuteRestCallsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
