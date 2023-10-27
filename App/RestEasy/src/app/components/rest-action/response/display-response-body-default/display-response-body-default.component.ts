import { Component, OnInit, Input } from '@angular/core';
import { RestActionResultBody } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';

@Component({
  selector: 'app-display-response-body-default',
  templateUrl: './display-response-body-default.component.html',
  styleUrls: ['./display-response-body-default.component.css']
})
export class DisplayResponseBodyDefaultComponent implements OnInit {
  @Input()
  body: RestActionResultBody | undefined;

  constructor() { 
  }

  ngOnInit(): void {
  }
}
