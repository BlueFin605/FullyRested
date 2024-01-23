import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CreateEmptyAuthenticationDetailsBasicAuth } from '../../../../../../shared/runner';
import { IAuthenticationDetailsBasicAuth } from '../../../../../../shared/runner';

@Component({
  selector: 'app-settings-manage-authentication-basic-auth',
  templateUrl: './settings-manage-authentication-basic-auth.component.html',
  styleUrls: ['./settings-manage-authentication-basic-auth.component.css']
})
export class SettingsManageAuthenticationBasicAuthComponent implements OnInit {
  @Input()
  basicauth: IAuthenticationDetailsBasicAuth = CreateEmptyAuthenticationDetailsBasicAuth();

  @Output()
  basicauthChange = new EventEmitter<IAuthenticationDetailsBasicAuth>();

  constructor() { }

  ngOnInit(): void {
  }

  onChange($event: any) {
    this.basicauthChange.emit(this.basicauth);
  }
}
