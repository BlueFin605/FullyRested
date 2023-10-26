import { Component, OnInit, Input } from '@angular/core';

@Component({
  selector: 'app-display-response-body',
  templateUrl: './display-response-body.component.html',
  styleUrls: ['./display-response-body.component.css']
})
export class DisplayResponseBodyComponent implements OnInit {
  @Input()
  data: any = {};

  @Input()
  contenttype: string = "";

  constructor() {
  }

  ngOnInit(): void {
  }

  get responseType(): string {
    //    console.log(`responseType[${this.response.headers['content-type']}]`);
    if (this.contenttype == undefined) {
      return 'unknown';
    }

    var split = this.contenttype.split(/[\s;/]+/);
    var part1 = split[0];
    var part2 = "";

    if (split.length > 1)
      part2 = split[1];

    // console.log(`part1[${part1}]/[${part2}];[${split[2]}]`);

    switch (part1) {
      case 'application':
        {
          switch (part2) {
            case 'json':
              return "json";
            default:
              return "unknown";
          }
        }
      case 'image':
        {
          return "image"
        }
      default:
        return "unknown";
    }
  }
}
