import { Component, OnInit, Input } from '@angular/core';

@Component({
  selector: 'app-edit-request-headers',
  templateUrl: './edit-request-headers.component.html',
  styleUrls: ['./edit-request-headers.component.css']
})
export class EditRequestHeadersComponent implements OnInit {
  @Input()
  headers: { [header: string]: string } = {}
  displayedColumns: string[] = ['key', 'value'];

  constructor() { }

  ngOnInit(): void {
  }

  getValuesAsArray()
  {
    return Object.entries(this.headers).map(h => {return {key: h[0], value: h[1]}});
  }

}
