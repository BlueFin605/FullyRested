import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditRequestValidationComponent } from './edit-request-validation.component';

describe('EditRequestValidationComponent', () => {
  let component: EditRequestValidationComponent;
  let fixture: ComponentFixture<EditRequestValidationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EditRequestValidationComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditRequestValidationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
