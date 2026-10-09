import {
  Component,
  OnInit,
  Input,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ContentTypeHelperService } from 'src/app/services/content-type-helper/content-type-helper.service';
import { RestActionResultBody } from '@fullyrested/core';

@Component({
  selector: 'app-display-response-body-default',
  templateUrl: './display-response-body-default.component.html',
  styleUrls: ['./display-response-body-default.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class DisplayResponseBodyDefaultComponent implements OnInit {
  rawData: string = '';

  @Input()
  set body(body: RestActionResultBody | undefined) {
    if (body == undefined) {
      this.rawData = '';
      return;
    }

    this.rawData = this.contentTypeHelper.convertArrayBufferToString(
      body.contentType,
      body.body,
    );
  }

  constructor(private contentTypeHelper: ContentTypeHelperService) {}

  ngOnInit(): void {}
}
