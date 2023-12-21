import { TestBed } from '@angular/core/testing';

import { VariableSubstitutionService } from './variable-substitution.service';

describe('VariableSubstitutionService', () => {
  let service: VariableSubstitutionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VariableSubstitutionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
