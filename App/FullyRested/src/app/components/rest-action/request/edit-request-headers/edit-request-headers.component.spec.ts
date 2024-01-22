import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditRequestHeadersComponent } from './edit-request-headers.component';

describe('EditRequestHeadersComponent', () => {
  let component: EditRequestHeadersComponent;
  let fixture: ComponentFixture<EditRequestHeadersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EditRequestHeadersComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditRequestHeadersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
