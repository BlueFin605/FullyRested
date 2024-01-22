import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { SystemSupportService } from 'src/app/services/system-support/system-support.service';
import { ParamTable } from '../../../../../../../shared/runner';

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
    key: "key",
    type: "text",
    label: "Key"
  },
  {
    key: "value",
    type: "text",
    label: "Value"
  },
]



@Component({
  selector: 'app-edit-request-parameters',
  templateUrl: './edit-request-parameters.component.html',
  styleUrls: ['./edit-request-parameters.component.css']
})
export class EditRequestParametersComponent implements OnInit {

  @Input()
  params: ParamTable[] = [];

  @Output()
  paramsChange = new EventEmitter<ParamTable[]>();

  displayedColumns: string[] = COLUMNS_SCHEMA.map((col) => col.key);
  columnsSchema: any = COLUMNS_SCHEMA;

  constructor(private systemSupport: SystemSupportService) {
  }

  ngOnInit(): void {
  }

  modelChangeFn(value: any) {
    this.paramsChange.emit(this.params);
  }

  add() {
    this.params = [...this.params, { key: '', value: '', active: true, id: this.systemSupport.generateGUID() }];
    this.paramsChange.emit(this.params);
  }

  delete(id: string) {
    this.params = this.params.filter(f => f.id != id);
    this.paramsChange.emit(this.params);
  }

  activeClicked(id: string) {
    var entry = this.params.find(f => f.id === id);
    if (entry == undefined)
      return;

    entry.active = !entry.active;
    this.paramsChange.emit(this.params);
  }
}
