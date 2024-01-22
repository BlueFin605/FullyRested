import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsManageAuthenticationComponent } from './settings-manage-authentication.component';

describe('SettingsManageAuthenticationComponent', () => {
  let component: SettingsManageAuthenticationComponent;
  let fixture: ComponentFixture<SettingsManageAuthenticationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SettingsManageAuthenticationComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SettingsManageAuthenticationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
