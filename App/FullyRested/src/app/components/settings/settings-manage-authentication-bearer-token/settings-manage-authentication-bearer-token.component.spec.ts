import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsManageAuthenticationBearerTokenComponent } from './settings-manage-authentication-bearer-token.component';

describe('SettingsManageAuthenticationBearerTokenComponent', () => {
  let component: SettingsManageAuthenticationBearerTokenComponent;
  let fixture: ComponentFixture<SettingsManageAuthenticationBearerTokenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SettingsManageAuthenticationBearerTokenComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SettingsManageAuthenticationBearerTokenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
