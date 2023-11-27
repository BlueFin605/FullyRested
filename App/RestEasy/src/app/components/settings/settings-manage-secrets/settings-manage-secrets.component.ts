import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CreateEmptyEnvironment, Environment } from 'src/app/services/action-repository/action-repository.service'
import { SystemSupportService } from 'src/app/services/system-support/system-support.service';

const COLUMNS_SCHEMA = [
  {
    key: "isdelete",
    type: "isdelete",
    label: ""
  },
  {
    key: "isenabled",
    type: "isenabled",
    label: ""
  },
  {
    key: "$secret",
    type: "text",
    label: "Secret"
  },
  {
    key: "$value",
    type: "text",
    label: "Value"
  },
]
@Component({
  selector: 'app-settings-manage-secrets',
  templateUrl: './settings-manage-secrets.component.html',
  styleUrls: ['./settings-manage-secrets.component.css']
})
export class SettingsManageSecretsComponent implements OnInit {

  @Input()
  environment: Environment = CreateEmptyEnvironment();

  @Output()
  environmentChange = new EventEmitter<Environment>();

  displayedColumns: string[] = COLUMNS_SCHEMA.map((col) => col.key);
  columnsSchema: any = COLUMNS_SCHEMA;

  constructor(private systemSupport: SystemSupportService) {
  }

  ngOnInit(): void {
  }

  add() {
    this.environment.secrets = [...this.environment.secrets, { $secret: '', $value: '', active: true, id: this.systemSupport.generateGUID() }];
    this.environmentChange.emit(this.environment);
  }

  delete(id: string) {
    this.environment.secrets = this.environment.secrets.filter(f => f.id != id);
    this.environmentChange.emit(this.environment);
  }

  activeClicked(id: string) {
    var entry = this.environment.secrets.find(f => f.id == id);
    if (entry == undefined)
      return;

    entry.active = !entry.active;
    this.environmentChange.emit(this.environment);
  }

  modelChangeFn(value: any) {
    // console.log(value);
    // console.log(this.environment);
    this.environmentChange.emit(this.environment);
  }
}
