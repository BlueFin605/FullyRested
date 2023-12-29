import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CreateEmptyAuthenticationDetailsBasicAuth } from '../../../../../../shared';
import { AuthenticationDetailsBasicAuth } from '../../../../../../shared';

@Component({
  selector: 'app-settings-manage-authentication-basic-auth',
  templateUrl: './settings-manage-authentication-basic-auth.component.html',
  styleUrls: ['./settings-manage-authentication-basic-auth.component.css']
})
export class SettingsManageAuthenticationBasicAuthComponent implements OnInit {
  @Input()
  basicauth: AuthenticationDetailsBasicAuth = CreateEmptyAuthenticationDetailsBasicAuth();

  @Output()
  basicauthChange = new EventEmitter<AuthenticationDetailsBasicAuth>();

  constructor() { }

  ngOnInit(): void {
  }

  onChange($event: any) {
    this.basicauthChange.emit(this.basicauth);
  }
}
