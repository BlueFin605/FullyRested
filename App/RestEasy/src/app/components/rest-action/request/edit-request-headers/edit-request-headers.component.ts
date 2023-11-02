import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { HeaderTable } from 'src/app/services/action-repository/action-repository.service'

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
  selector: 'app-edit-request-headers',
  templateUrl: './edit-request-headers.component.html',
  styleUrls: ['./edit-request-headers.component.css']
})
export class EditRequestHeadersComponent implements OnInit {

  @Input()
  headers: HeaderTable[] = [];

  @Output()
  headersChange = new EventEmitter<any>();

  displayedColumns: string[] = COLUMNS_SCHEMA.map((col) => col.key);
  columnsSchema: any = COLUMNS_SCHEMA;

  constructor() {
  }

  ngOnInit(): void {
  }

  // convertValuesAsArray(headers: { [header: string]: string }): headerTable[]
  // {
  //   return Object.entries(headers).map(h => {return {key: h[0], value: h[1]}});
  // }

  // convertArraysAsValues(headers: headerTable[]): { [header: string]: string } 
  // {
  //   var converted: { [header: string]: string } = {};
  //   headers.filter(f => f.key != '' && f.value != '').forEach(v => converted[v.key]=v.value);
  //   return converted;
  // }

  add() {
    var max: number = Math.max(...this.headers.map(m => m.id));
    this.headers = [...this.headers, { key: '', value: '', active: true, id: max + 1 }];
    this.headersChange.emit(this.headers);
  }

  delete(id: number) {
    this.headers = this.headers.filter(f => f.id != id);
    this.headersChange.emit(this.headers);
  }

  activeClicked(id: number) {
    var entry = this.headers.find(f => f.id == id);
    if (entry == undefined)
      return;

    entry.active = !entry.active;
    this.headersChange.emit(this.headers);
  }

  modelChangeFn(value: any) {
    this.headersChange.emit(this.headers);
  }
}
