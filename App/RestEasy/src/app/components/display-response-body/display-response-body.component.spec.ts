import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DisplayResponseBodyComponent } from './display-response-body.component';

describe('DisplayResponseBodyComponent', () => {
  let component: DisplayResponseBodyComponent;
  let fixture: ComponentFixture<DisplayResponseBodyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DisplayResponseBodyComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DisplayResponseBodyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
