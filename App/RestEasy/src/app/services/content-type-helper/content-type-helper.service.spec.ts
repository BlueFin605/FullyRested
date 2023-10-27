import { TestBed } from '@angular/core/testing';

import { ContentTypeHelperService } from './content-type-helper.service';

describe('ContentTypeHelperService', () => {
  let service: ContentTypeHelperService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ContentTypeHelperService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
