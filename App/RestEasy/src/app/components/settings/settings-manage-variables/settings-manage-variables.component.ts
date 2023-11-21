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
    key: "variable",
    type: "text",
    label: "Variable"
  },
  {
    key: "value",
    type: "text",
    label: "Value"
  },
]

@Component({
  selector: 'app-settings-manage-variables',
  templateUrl: './settings-manage-variables.component.html',
  styleUrls: ['./settings-manage-variables.component.css']
})
export class SettingsManageVariablesComponent implements OnInit {

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
    var max: number = Math.max(...this.environment.variables.map(m => m.id));
    this.environment.variables = [...this.environment.variables, { variable: '', value: '', active: true, id: max + 1 }];
    this.environmentChange.emit(this.environment);
  }

  delete(id: number) {
    this.environment.variables = this.environment.variables.filter(f => f.id != id);
    this.environmentChange.emit(this.environment);
  }

  activeClicked(id: number) {
    var entry = this.environment.variables.find(f => f.id == id);
    if (entry == undefined)
      return;

    entry.active = !entry.active;
    this.environmentChange.emit(this.environment);
  }

  modelChangeFn(value: any) {
    this.environmentChange.emit(this.environment);
  }
}
