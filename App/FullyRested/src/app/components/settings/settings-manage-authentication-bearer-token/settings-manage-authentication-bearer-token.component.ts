import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CreateEmptyAuthenticationDetailsBearerToken } from '../../../../../../shared/runner';
import { AuthenticationDetailsBearerToken } from '../../../../../../shared/runner';

@Component({
  selector: 'app-settings-manage-authentication-bearer-token',
  templateUrl: './settings-manage-authentication-bearer-token.component.html',
  styleUrls: ['./settings-manage-authentication-bearer-token.component.css']
})
export class SettingsManageAuthenticationBearerTokenComponent implements OnInit {
  @Input()
  bearertoken: AuthenticationDetailsBearerToken = CreateEmptyAuthenticationDetailsBearerToken();

  @Output()
  bearertokenChange = new EventEmitter<AuthenticationDetailsBearerToken>();

  constructor() { }

  ngOnInit(): void {
  }

  onChange($event: any) {
    this.bearertokenChange.emit(this.bearertoken);
  }
}
