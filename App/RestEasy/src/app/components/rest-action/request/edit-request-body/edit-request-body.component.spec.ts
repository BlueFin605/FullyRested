import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditRequestBodyComponent } from './edit-request-body.component';

describe('EditRequestBodyComponent', () => {
  let component: EditRequestBodyComponent;
  let fixture: ComponentFixture<EditRequestBodyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EditRequestBodyComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditRequestBodyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
