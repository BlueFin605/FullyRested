import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { HeaderTable } from 'src/app/services/action-repository/action-repository.service'
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
  headersChange = new EventEmitter<HeaderTable[]>();

  displayedColumns: string[] = COLUMNS_SCHEMA.map((col) => col.key);
  columnsSchema: any = COLUMNS_SCHEMA;

  constructor(private systemSupport: SystemSupportService) {
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
    this.headers = [...this.headers, { key: '', value: '', active: true, id: this.systemSupport.generateGUID() }];
    console.log(this.headers);
    this.headersChange.emit(this.headers);
  }

  delete(id: string) {
    this.headers = this.headers.filter(f => f.id != id);
    this.headersChange.emit(this.headers);
  }

  activeClicked(id: string) {
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
