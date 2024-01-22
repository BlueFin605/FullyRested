import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CreateEmptyAuthenticationDetailsAwsSig } from '../../../../../../shared/runner';
import { AuthenticationDetailsAWSSig } from '../../../../../../shared/runner';

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
