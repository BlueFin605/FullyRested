import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CreateEmptyAuthenticationDetails } from '../../../../../../shared';
import { AuthenticationDetails } from '../../../../../../shared';

@Component({
  selector: 'app-settings-manage-authentication',
  templateUrl: './settings-manage-authentication.component.html',
  styleUrls: ['./settings-manage-authentication.component.css']
})
export class SettingsManageAuthenticationComponent implements OnInit {
  @Input()
  auth: AuthenticationDetails = CreateEmptyAuthenticationDetails('inherit');

  @Output()
  authChange = new EventEmitter<AuthenticationDetails>();

  //selected: string = 'awssig';
  
  constructor() { }

  ngOnInit(): void {
  }

  onChange($event: any)
  {
    console.log($event);
    this.authChange.emit(this.auth);
  }
}
