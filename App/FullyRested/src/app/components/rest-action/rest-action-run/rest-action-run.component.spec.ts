import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RestActionRunComponent } from './rest-action-run.component';

describe('RestActionRunComponent', () => {
  let component: RestActionRunComponent;
  let fixture: ComponentFixture<RestActionRunComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RestActionRunComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RestActionRunComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
