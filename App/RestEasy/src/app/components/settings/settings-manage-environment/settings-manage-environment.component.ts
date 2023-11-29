import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CreateEmptyAuthenticationDetails, CreateEmptyEnvironment, Environment } from 'src/app/services/action-repository/action-repository.service'

@Component({
  selector: 'app-settings-manage-environment',
  templateUrl: './settings-manage-environment.component.html',
  styleUrls: ['./settings-manage-environment.component.css']
})
export class SettingsManageEnvironmentComponent implements OnInit {

  @Input()
  environment: Environment = { name: 'noname', id: '', variables: [], secrets: [], auth: CreateEmptyAuthenticationDetails('inherit') }//CreateEmptyEnvironment();

  @Output()
  environmentChange = new EventEmitter<Environment>();

  constructor() { }

  ngOnInit(): void {
  }

  modelChange(name: string) {
    console.log(`modelChange[${name}]`);
    console.log(this.environment);
    this.environmentChange.emit(this.environment);
  }
}
