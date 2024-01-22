import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DisplayResponseBodyImageComponent } from './display-response-body-image.component';

describe('DisplayResponseBodyImageComponent', () => {
  let component: DisplayResponseBodyImageComponent;
  let fixture: ComponentFixture<DisplayResponseBodyImageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DisplayResponseBodyImageComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DisplayResponseBodyImageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
