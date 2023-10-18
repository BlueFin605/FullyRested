import { Component, Input, Output, OnInit, EventEmitter } from '@angular/core';
import { RestAction } from 'src/app/services/action-repository/action-repository.service';
import { ExecuteRestAction } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';

@Component({
  selector: 'app-edit-request',
  templateUrl: './edit-request.component.html',
  styleUrls: ['./edit-request.component.css']
})
export class EditRequestComponent implements OnInit {

  @Input()
  action: RestAction = {verb: 'GET', protocol:'HTTPS', url: ''};

  @Output()
  execute = new EventEmitter<ExecuteRestAction>();

  // verb: string | undefined;
  // protocol: string | undefined;
  // url: string | undefined
  
  constructor() { }

  ngOnInit(): void {
    // this.verb = this.action?.verb;
    // this.protocol = this.action?.protocol;
    // this.url = this.action?.protocol;
  }

  async test() {
    var headers = {"Accept":"*/*",
                   "Content-Type":"application/x-www-form-urlencoded",
                   "user-agent":"RestEasy1.0",
                   "accept-encoding": ""
                  };

    var action: ExecuteRestAction = {
      verb: this.action.verb,
      protocol: this.action.protocol,
      url: this.action.url,
      headers: headers
    };

    console.log(`emit[${action}]`)
    this.execute.emit(action);
  }
}
