import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { CreateEmptyEnvironment, Environment, VariableTable } from 'src/app/services/action-repository/action-repository.service'
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
  variables: VariableTable[] = [];

  @Output()
  variablesChange = new EventEmitter<VariableTable[]>();

  displayedColumns: string[] = COLUMNS_SCHEMA.map((col) => col.key);
  columnsSchema: any = COLUMNS_SCHEMA;

  constructor(private systemSupport: SystemSupportService) {
  }

  ngOnInit(): void {
  }

  add() {
    var max = 0;
    this.variables = [...this.variables, { variable: '', value: '', active: true, id: this.systemSupport.generateGUID() }];
    this.variablesChange.emit(this.variables);
  }

  delete(id: string) {
    this.variables = this.variables.filter(f => f.id != id);
    this.variablesChange.emit(this.variables);
  }

  activeClicked(id: string) {
    var entry = this.variables.find(f => f.id == id);
    if (entry == undefined)
      return;

    entry.active = !entry.active;
    this.variablesChange.emit(this.variables);
  }

  modelChangeFn(value: any) {
    this.variablesChange.emit(this.variables);
  }
}
