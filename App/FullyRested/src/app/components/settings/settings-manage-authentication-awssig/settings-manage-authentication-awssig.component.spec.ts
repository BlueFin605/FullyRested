import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsManageAuthenticationAWSSigComponent } from './settings-manage-authentication-awssig.component';

describe('SettingsManageAuthenticationAWSSigComponent', () => {
  let component: SettingsManageAuthenticationAWSSigComponent;
  let fixture: ComponentFixture<SettingsManageAuthenticationAWSSigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SettingsManageAuthenticationAWSSigComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SettingsManageAuthenticationAWSSigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
