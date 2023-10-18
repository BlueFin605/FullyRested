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

  getlevel() {
    console.log(`getlevel status[${this.response.status}]   text[${this.response.statusText}]`);
    if (this.response.status === "" && this.response.statusText === undefined) {
      console.log("Empty");
      return "Empty"
    }

    if (this.response.status === "") {
      console.log("Error");
      return "Error"
    }

    var status = typeof this.response.status === "number" ? this.response.status : parseInt(this.response.status, 10);

    if (status >= 200 && status < 300) {
      console.log("Ok");
      return "Ok"
    }

    console.log("Error");
    return "Error"
  }
}
