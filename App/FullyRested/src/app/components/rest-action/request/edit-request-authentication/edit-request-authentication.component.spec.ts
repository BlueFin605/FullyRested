import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditRequestAuthenticationComponent } from './edit-request-authentication.component';

describe('EditRequestAuthenticationComponent', () => {
  let component: EditRequestAuthenticationComponent;
  let fixture: ComponentFixture<EditRequestAuthenticationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EditRequestAuthenticationComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditRequestAuthenticationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
