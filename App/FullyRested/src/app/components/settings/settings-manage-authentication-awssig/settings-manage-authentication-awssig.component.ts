import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CreateEmptyAuthenticationDetailsAwsSig } from '../../../../../../shared/runner';
import { IAuthenticationDetailsAWSSig } from '../../../../../../shared/runner';

@Component({
  selector: 'app-settings-manage-authentication-awssig',
  templateUrl: './settings-manage-authentication-awssig.component.html',
  styleUrls: ['./settings-manage-authentication-awssig.component.css']
})
export class SettingsManageAuthenticationAWSSigComponent implements OnInit {
@Input()
  awssig: IAuthenticationDetailsAWSSig = CreateEmptyAuthenticationDetailsAwsSig();

  @Output()
  awssigChange = new EventEmitter<IAuthenticationDetailsAWSSig>();

  constructor() { }

  ngOnInit(): void {
  }

  onChange($event: any) {
    this.awssigChange.emit(this.awssig);
  }
}
