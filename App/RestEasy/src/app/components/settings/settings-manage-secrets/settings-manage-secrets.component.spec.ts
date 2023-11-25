import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsManageSecretsComponent } from './settings-manage-secrets.component';

describe('SettingsManageSecretsComponent', () => {
  let component: SettingsManageSecretsComponent;
  let fixture: ComponentFixture<SettingsManageSecretsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SettingsManageSecretsComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SettingsManageSecretsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
