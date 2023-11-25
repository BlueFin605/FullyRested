import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CreateEmptyEnvironment, Environment } from 'src/app/services/action-repository/action-repository.service'

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
    key: "secret",
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

  constructor() {
  }

  ngOnInit(): void {
  }

  add() {
    var max = 0;
    var vars: number[] = this.environment.secrets.map(m => m.id);
    if (vars.length > 0)
       max = Math.max(...vars);
    console.log(`max:[${max}]`);
    this.environment.secrets = [...this.environment.secrets, { secret: '', $value: '', active: true, id: max + 1 }];
    this.environmentChange.emit(this.environment);
  }

  delete(id: number) {
    this.environment.secrets = this.environment.secrets.filter(f => f.id != id);
    this.environmentChange.emit(this.environment);
  }

  activeClicked(id: number) {
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
