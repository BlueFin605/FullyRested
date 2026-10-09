import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-settings-manage-authentication-none',
  templateUrl: './settings-manage-authentication-none.component.html',
  styleUrls: ['./settings-manage-authentication-none.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SettingsManageAuthenticationNoneComponent implements OnInit {
  constructor() {}

  ngOnInit(): void {}
}
