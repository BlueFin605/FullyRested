import { Component, OnInit, Input } from '@angular/core';
import { EmptyActionResult } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { RestActionResult } from '../../../../../../../shared/builder/src';

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

  getlevel() {
    if (this.response.validated == undefined)
      return this.getLevelFromStatusCode();

    return this.response.validated.valid ? "Ok" : "Error";
  }

  getLevelFromStatusCode() {
    if (this.response.status === "" && this.response.statusText === undefined) {
      return "Empty"
    }

    if (this.response.status === "") {
      return "Error"
    }

    var status = typeof this.response.status === "number" ? this.response.status : parseInt(this.response.status, 10);

    if (status >= 200 && status < 300) {
      return "Ok"
    }

    return "Error"
  }

  getErrorString(): string {
    var alertString:string = '';

    this.response.validated?.errors.forEach(element => {
      alertString += element + "\n";
    });

    return alertString;
    }
}
