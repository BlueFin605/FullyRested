import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

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

interface headerTable {
  key: string;
  value: string;
};

@Component({
  selector: 'app-edit-request-headers',
  templateUrl: './edit-request-headers.component.html',
  styleUrls: ['./edit-request-headers.component.css']
})
export class EditRequestHeadersComponent implements OnInit {
  _headers: headerTable[] = [];

  @Input()
  set headers(headers: { [header: string]: string }) {
    this._headers = this.convertValuesAsArray(headers);
    console.log(`set headres[${JSON.stringify(this._headers)}]`)
  }
  get headers() { 
    console.log(`get headres[${JSON.stringify(this._headers)}]`)
    return this.convertArraysAsValues(this._headers);
  }

  @Output()
  headersChange = new EventEmitter<any>();

  displayedColumns: string[] = COLUMNS_SCHEMA.map((col) => col.key);
  columnsSchema: any = COLUMNS_SCHEMA;
  
  constructor() { 
  }

  ngOnInit(): void {
  }

  convertValuesAsArray(headers: { [header: string]: string }): headerTable[]
  {
    return Object.entries(headers).map(h => {return {key: h[0], value: h[1]}});
  }

  convertArraysAsValues(headers: headerTable[]): { [header: string]: string } 
  {
    var converted: { [header: string]: string } = {};
    headers.forEach(v => converted[v.key]=v.value);
    return converted;
  }
}
