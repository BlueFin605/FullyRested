import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DisplayResponseBodyDefaultComponent } from './display-response-body-default.component';

describe('DisplayResponseBodyDefaultComponent', () => {
  let component: DisplayResponseBodyDefaultComponent;
  let fixture: ComponentFixture<DisplayResponseBodyDefaultComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DisplayResponseBodyDefaultComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DisplayResponseBodyDefaultComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
