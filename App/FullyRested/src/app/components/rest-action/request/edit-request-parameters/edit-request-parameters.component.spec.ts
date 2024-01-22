import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditRequestParametersComponent } from './edit-request-parameters.component';

describe('EditRequestParametersComponent', () => {
  let component: EditRequestParametersComponent;
  let fixture: ComponentFixture<EditRequestParametersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EditRequestParametersComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditRequestParametersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
