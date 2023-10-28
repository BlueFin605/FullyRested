import { Component, OnInit, Input } from '@angular/core';

@Component({
  selector: 'app-display-response-headers',
  templateUrl: './display-response-headers.component.html',
  styleUrls: ['./display-response-headers.component.css']
})
export class DisplayResponseHeadersComponent implements OnInit {
  @Input()
  headers: { [header: string]: string } = {}
  displayedColumns: string[] = ['key', 'value'];
  
  constructor() { }

  ngOnInit(): void {
  }

  getValuesAsArray()
  {
    if (this.headers == undefined)
       return [];
          
    return Object.entries(this.headers).map(h => {return {key: h[0], value: h[1]}});
  }
}
