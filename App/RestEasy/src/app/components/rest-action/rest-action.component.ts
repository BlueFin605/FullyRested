import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-rest-action',
  templateUrl: './rest-action.component.html',
  styleUrls: ['./rest-action.component.css']
})
export class RestActionComponent implements OnInit {
  selected = 'GET';

  constructor() { }

  ngOnInit(): void {
  }

}
