import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CreateEmptyAuthenticationDetails } from '../../../../../../../shared/runner';
import { IAuthenticationDetails } from '../../../../../../../shared/runner';

@Component({
  selector: 'app-edit-request-authentication',
  templateUrl: './edit-request-authentication.component.html',
  styleUrls: ['./edit-request-authentication.component.css']
})
export class EditRequestAuthenticationComponent implements OnInit {
  @Input()
  auth: IAuthenticationDetails = CreateEmptyAuthenticationDetails('inherit');

  @Output()
  authChange = new EventEmitter<IAuthenticationDetails>();

  constructor() { }

  ngOnInit(): void {
  }

  onChange(event: IAuthenticationDetails) {
    this.authChange.emit(this.auth);
  }
}
