import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsManageVariablesComponent } from './settings-manage-variables.component';

describe('SettingsManageVariablesComponent', () => {
  let component: SettingsManageVariablesComponent;
  let fixture: ComponentFixture<SettingsManageVariablesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SettingsManageVariablesComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SettingsManageVariablesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
