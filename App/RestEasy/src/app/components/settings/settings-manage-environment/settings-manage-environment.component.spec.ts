import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsManageEnvironmentComponent } from './settings-manage-environment.component';

describe('SettingsManageEnvironmentComponent', () => {
  let component: SettingsManageEnvironmentComponent;
  let fixture: ComponentFixture<SettingsManageEnvironmentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SettingsManageEnvironmentComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SettingsManageEnvironmentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
