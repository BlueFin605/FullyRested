import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DisplayResponseBodyXmlComponent } from './display-response-body-xml.component';

describe('DisplayResponseBodyXmlComponent', () => {
  let component: DisplayResponseBodyXmlComponent;
  let fixture: ComponentFixture<DisplayResponseBodyXmlComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DisplayResponseBodyXmlComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DisplayResponseBodyXmlComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
