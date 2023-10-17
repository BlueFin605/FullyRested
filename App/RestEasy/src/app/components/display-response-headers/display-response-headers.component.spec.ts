import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DisplayResponseHeadersComponent } from './display-response-headers.component';

describe('DisplayResponseHeadersComponent', () => {
  let component: DisplayResponseHeadersComponent;
  let fixture: ComponentFixture<DisplayResponseHeadersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DisplayResponseHeadersComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DisplayResponseHeadersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
