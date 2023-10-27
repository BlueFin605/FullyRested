import { Component, OnInit, Input } from '@angular/core';
import { ContentTypeHelperService } from 'src/app/services/content-type-helper/content-type-helper.service';
import { RestActionResultBody } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';

@Component({
  selector: 'app-display-response-body',
  templateUrl: './display-response-body.component.html',
  styleUrls: ['./display-response-body.component.css']
})
export class DisplayResponseBodyComponent implements OnInit {
  @Input()
  body: RestActionResultBody | undefined;

  constructor(private contentTypeHelper: ContentTypeHelperService) {
  }

  ngOnInit(): void {
  }

  get responseType(): string {
      //  console.log(`responseType[${this.body?.contentType}]`);
    if (this.body == undefined) {
      return 'unknown';
    }

    var type = this.contentTypeHelper.decode(this.body.contentType);

    console.log(type);

    switch (type.part1) {
      case 'application':
        {
          switch (type.part2) {
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
