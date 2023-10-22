import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { ParamTable } from 'src/app/services/action-repository/action-repository.service'

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
  selector: 'app-edit-request-paramaters',
  templateUrl: './edit-request-paramaters.component.html',
  styleUrls: ['./edit-request-paramaters.component.css']
})
export class EditRequestParamatersComponent implements OnInit {

  @Input()
  params: ParamTable[] = [];

  @Output()
  paramsChange = new EventEmitter<ParamTable[]>();

  displayedColumns: string[] = COLUMNS_SCHEMA.map((col) => col.key);
  columnsSchema: any = COLUMNS_SCHEMA;

  constructor() {
  }

  ngOnInit(): void {
  }

  modelChangeFn(value: any) {
    this.paramsChange.emit(this.params);
  }

  add() {
    var max: number = Math.max(...this.params.map(m => m.id));
    this.params = [...this.params, { key: '', value: '', active: true, id: max + 1 }];
    this.paramsChange.emit(this.params);
  }

  delete(id: number) {
    this.params = this.params.filter(f => f.id != id);
    this.paramsChange.emit(this.params);
  }

  activeClicked(id: number) {
    var entry = this.params.find(f => f.id == id);
    if (entry == undefined)
       return;

    entry.active = !entry.active;
    this.paramsChange.emit(this.params);
  }
}
