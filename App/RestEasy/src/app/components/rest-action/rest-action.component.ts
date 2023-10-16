import { Component, OnInit } from '@angular/core';
import { RestActionResult, ExecuteRestCallsService } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';

@Component({
  selector: 'app-rest-action',
  templateUrl: './rest-action.component.html',
  styleUrls: ['./rest-action.component.css']
})
export class RestActionComponent implements OnInit {
  verb = 'get';
  protocol="https";
  url = 'jsonplaceholder.typicode.com/todos/1';  //see https://jsonplaceholder.typicode.com/
  response: RestActionResult | undefined;

  constructor(private era: ExecuteRestCallsService) { }

  ngOnInit(): void {
  }

  async test() {
    this.response = undefined;
    var headers = {"Accept":"*/*",
                   "Content-Type":"application/x-www-form-urlencoded",
                   "user-agent":"RestEasy1.0",
                   "accept-encoding": ""
                  };
    this.response = await this.era.executeTest(this.verb, this.protocol, this.url, headers);
  }
}
