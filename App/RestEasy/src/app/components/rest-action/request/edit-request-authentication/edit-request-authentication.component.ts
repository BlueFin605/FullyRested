import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { AuthenticationDetails } from 'src/app/services/action-repository/action-repository.service';

@Component({
  selector: 'app-edit-request-authentication',
  templateUrl: './edit-request-authentication.component.html',
  styleUrls: ['./edit-request-authentication.component.css']
})
export class EditRequestAuthenticationComponent implements OnInit {
  @Input()
  auth: AuthenticationDetails = {};

  @Output()
  authChange = new EventEmitter<AuthenticationDetails>();

  constructor() { }

  ngOnInit(): void {
  }
}
