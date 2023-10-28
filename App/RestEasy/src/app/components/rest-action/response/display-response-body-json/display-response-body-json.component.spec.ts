import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DisplayResponseBodyJsonComponent } from './display-response-body-json.component';

describe('DisplayResponseBodyJsonComponent', () => {
  let component: DisplayResponseBodyJsonComponent;
  let fixture: ComponentFixture<DisplayResponseBodyJsonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DisplayResponseBodyJsonComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DisplayResponseBodyJsonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
