import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditRequestRunComponent } from './edit-request-run.component';

describe('EditRequestRunComponent', () => {
  let component: EditRequestRunComponent;
  let fixture: ComponentFixture<EditRequestRunComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EditRequestRunComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditRequestRunComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
