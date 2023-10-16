import { Component, OnInit, Input } from '@angular/core';
import { RestActionResult, EmptyActionResult } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';

@Component({
  selector: 'app-display-response',
  templateUrl: './display-response.component.html',
  styleUrls: ['./display-response.component.css']
})
export class DisplayResponseComponent implements OnInit {
  @Input()
  response: RestActionResult = EmptyActionResult;

  constructor() { }

  ngOnInit(): void {
  }

}
