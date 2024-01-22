import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsManageAuthenticationInheritComponent } from './settings-manage-authentication-inherit.component';

describe('SettingsManageAuthenticationInheritComponent', () => {
  let component: SettingsManageAuthenticationInheritComponent;
  let fixture: ComponentFixture<SettingsManageAuthenticationInheritComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SettingsManageAuthenticationInheritComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SettingsManageAuthenticationInheritComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
