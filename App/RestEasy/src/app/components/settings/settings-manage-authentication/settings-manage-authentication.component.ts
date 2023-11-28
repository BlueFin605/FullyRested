import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { AuthenticationDetails } from 'src/app/services/action-repository/action-repository.service';
import { CreateEmptyAuthenticationDetails } from 'src/app/services/action-repository/action-repository.service';

@Component({
  selector: 'app-settings-manage-authentication',
  templateUrl: './settings-manage-authentication.component.html',
  styleUrls: ['./settings-manage-authentication.component.css']
})
export class SettingsManageAuthenticationComponent implements OnInit {
  @Input()
  auth: AuthenticationDetails = CreateEmptyAuthenticationDetails();

  @Output()
  authChange = new EventEmitter<AuthenticationDetails>();

  //selected: string = 'awssig';
  
  constructor() { }

  ngOnInit(): void {
  }

  onChange($event: any)
  {
    this.authChange.emit(this.auth);
  }
}
