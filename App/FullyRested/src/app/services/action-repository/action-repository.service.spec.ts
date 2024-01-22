import { TestBed } from '@angular/core/testing';

import { ActionRepositoryService } from './action-repository.service';

describe('ActionRepositoryService', () => {
  let service: ActionRepositoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ActionRepositoryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
