import {
  Component,
  Input,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  EmptyActionResult,
  TimedActionResult,
} from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { LayoutService } from 'src/app/services/layout/layout.service';
import { formatBytes } from '../display-response-body/body-format';

@Component({
  selector: 'app-display-response',
  templateUrl: './display-response.component.html',
  styleUrls: ['./display-response.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class DisplayResponseComponent {
  @Input()
  response: TimedActionResult = EmptyActionResult;

  @Input()
  sending = false;

  constructor(public layout: LayoutService) {}

  hasResponse(): boolean {
    return !(this.response.status === '' && this.response.statusText === undefined);
  }

  // Colour of the status pill: 2xx ok, 3xx warn, everything else (including no response) error
  statusLevel(): 'ok' | 'warn' | 'error' {
    const status =
      typeof this.response.status === 'number'
        ? this.response.status
        : parseInt(this.response.status, 10);

    if (status >= 200 && status < 300) return 'ok';
    if (status >= 300 && status < 400) return 'warn';
    return 'error';
  }

  size(): string {
    return formatBytes(this.response.sizeBytes);
  }

  count(headers: { [header: string]: string } | undefined): number {
    return Object.keys(headers ?? {}).length;
  }
}
