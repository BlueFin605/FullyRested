import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OpenActionsComponent } from './open-actions.component';

describe('OpenActionsComponent', () => {
  let component: OpenActionsComponent;
  let fixture: ComponentFixture<OpenActionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ OpenActionsComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OpenActionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
