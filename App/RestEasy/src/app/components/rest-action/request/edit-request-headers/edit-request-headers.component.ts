import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { HeaderTable } from 'src/app/services/action-repository/action-repository.service'

const COLUMNS_SCHEMA = [
  {
      key: "key",
      type: "text",
      label: "Key"
  },
  {
      key: "value",
      type: "text",
      label: "Value"
  }
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
    this.headers = [...this.headers, {key: '', value: '', active: true, id: 10}];    
  }
}
