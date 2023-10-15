import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-rest-action',
  templateUrl: './rest-action.component.html',
  styleUrls: ['./rest-action.component.css']
})
export class RestActionComponent implements OnInit {
  verb = 'GET';
  protocol="HTTPS";
  url = 'jsonplaceholder.typicode.com/todos/1';  //see https://jsonplaceholder.typicode.com/

  constructor() { }

  ngOnInit(): void {
  }

}
