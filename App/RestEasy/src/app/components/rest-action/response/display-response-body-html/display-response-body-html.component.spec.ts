import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DisplayResponseBodyHtmlComponent } from './display-response-body-html.component';

describe('DisplayResponseBodyHtmlComponent', () => {
  let component: DisplayResponseBodyHtmlComponent;
  let fixture: ComponentFixture<DisplayResponseBodyHtmlComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DisplayResponseBodyHtmlComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DisplayResponseBodyHtmlComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
