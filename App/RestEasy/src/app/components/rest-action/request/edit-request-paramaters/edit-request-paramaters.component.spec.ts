import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditRequestParamatersComponent } from './edit-request-paramaters.component';

describe('EditRequestParamatersComponent', () => {
  let component: EditRequestParamatersComponent;
  let fixture: ComponentFixture<EditRequestParamatersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EditRequestParamatersComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditRequestParamatersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
