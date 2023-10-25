import { Component, OnInit, Input } from '@angular/core';

@Component({
  selector: 'app-display-response-body-default',
  templateUrl: './display-response-body-default.component.html',
  styleUrls: ['./display-response-body-default.component.css']
})
export class DisplayResponseBodyDefaultComponent implements OnInit {
  @Input()
  data: any = {};

  @Input()
  type: string = "";

  constructor() { 
  }

  ngOnInit(): void {
  }
}
