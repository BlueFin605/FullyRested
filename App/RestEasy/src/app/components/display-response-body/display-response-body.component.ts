import { Component, OnInit, Input } from '@angular/core';

@Component({
  selector: 'app-display-response-body',
  templateUrl: './display-response-body.component.html',
  styleUrls: ['./display-response-body.component.css']
})
export class DisplayResponseBodyComponent implements OnInit {
  @Input()
  data: any = {};

  constructor() { }

  ngOnInit(): void {
  }

}
