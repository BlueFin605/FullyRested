import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsManageAuthenticationBasicAuthComponent } from './settings-manage-authentication-basic-auth.component';

describe('SettingsManageAuthenticationBasicAuthComponent', () => {
  let component: SettingsManageAuthenticationBasicAuthComponent;
  let fixture: ComponentFixture<SettingsManageAuthenticationBasicAuthComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SettingsManageAuthenticationBasicAuthComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SettingsManageAuthenticationBasicAuthComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
