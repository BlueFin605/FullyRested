import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { AuthenticationDetailsBearerToken, CreateEmptyAuthenticationDetailsBearerToken } from 'src/app/services/action-repository/action-repository.service';

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
