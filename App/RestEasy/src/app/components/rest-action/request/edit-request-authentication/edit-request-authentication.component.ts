import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CreateEmptyAuthenticationDetails } from '../../../../../../../shared/runner';
import { AuthenticationDetails } from '../../../../../../../shared/runner';

@Component({
  selector: 'app-edit-request-authentication',
  templateUrl: './edit-request-authentication.component.html',
  styleUrls: ['./edit-request-authentication.component.css']
})
export class EditRequestAuthenticationComponent implements OnInit {
  @Input()
  auth: AuthenticationDetails = CreateEmptyAuthenticationDetails('inherit');

  @Output()
  authChange = new EventEmitter<AuthenticationDetails>();

  constructor() { }

  ngOnInit(): void {
  }

  onChange(event: AuthenticationDetails) {
    this.authChange.emit(this.auth);
  }
}
