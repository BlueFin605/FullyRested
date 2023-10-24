import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RestActionComponent } from './rest-action.component';

describe('RestActionComponent', () => {
  let component: RestActionComponent;
  let fixture: ComponentFixture<RestActionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RestActionComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RestActionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
