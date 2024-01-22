import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsManageAuthenticationNoneComponent } from './settings-manage-authentication-none.component';

describe('SettingsManageAuthenticationNoneComponent', () => {
  let component: SettingsManageAuthenticationNoneComponent;
  let fixture: ComponentFixture<SettingsManageAuthenticationNoneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SettingsManageAuthenticationNoneComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SettingsManageAuthenticationNoneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
