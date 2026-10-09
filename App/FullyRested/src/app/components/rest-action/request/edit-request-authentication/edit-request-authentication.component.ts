import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CreateEmptyAuthenticationDetails } from '@fullyrested/core';
import { AuthenticationDetails } from '@fullyrested/core';

@Component({
    selector: 'app-edit-request-authentication',
    templateUrl: './edit-request-authentication.component.html',
    styleUrls: ['./edit-request-authentication.component.css'],
    standalone: false
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
