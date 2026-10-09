import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CreateEmptyAuthenticationDetails } from '@fullyrested/core';
import { Environment } from '@fullyrested/core';

@Component({
    selector: 'app-settings-manage-environment',
    templateUrl: './settings-manage-environment.component.html',
    styleUrls: ['./settings-manage-environment.component.css'],
    standalone: false
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
    this.environmentChange.emit(this.environment);
  }
}
