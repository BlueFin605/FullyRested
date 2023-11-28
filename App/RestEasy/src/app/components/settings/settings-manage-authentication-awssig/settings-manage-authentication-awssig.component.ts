import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { AuthenticationDetailsAWSSig, CreateEmptyAuthenticationDetailsAwsSig } from 'src/app/services/action-repository/action-repository.service';

@Component({
  selector: 'app-settings-manage-authentication-awssig',
  templateUrl: './settings-manage-authentication-awssig.component.html',
  styleUrls: ['./settings-manage-authentication-awssig.component.css']
})
export class SettingsManageAuthenticationAWSSigComponent implements OnInit {
@Input()
  awssig: AuthenticationDetailsAWSSig = CreateEmptyAuthenticationDetailsAwsSig();

  @Output()
  awssigChange = new EventEmitter<AuthenticationDetailsAWSSig>();

  constructor() { }

  ngOnInit(): void {
  }

  onChange($event: any) {
    this.awssigChange.emit(this.awssig);
  }
}
