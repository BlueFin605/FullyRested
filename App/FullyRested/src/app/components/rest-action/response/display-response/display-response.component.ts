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
import type { TriggerCall } from '@fullyrested/core';
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

  // Failed checks when the validation reports them, otherwise the number of errors
  failedCount(): number {
    const validated = this.response.validated;
    return validated?.checks?.filter(c => !c.passed).length ?? validated?.errors.length ?? 0;
  }

  // When a trigger call started, relative to the start of the test (its `at` is ms since then)
  callTime(at: number): string {
    return `+${(Math.max(0, at) / 1000).toFixed(3)}s`;
  }

  callLevel(call: TriggerCall): 'ok' | 'warn' | 'error' {
    if (call.error != undefined || call.status === undefined) return 'error';
    return call.status >= 200 && call.status < 300 ? 'ok' : call.status < 400 ? 'warn' : 'error';
  }

  size(): string {
    return formatBytes(this.response.sizeBytes);
  }

  count(headers: { [header: string]: string } | undefined): number {
    return Object.keys(headers ?? {}).length;
  }
}
