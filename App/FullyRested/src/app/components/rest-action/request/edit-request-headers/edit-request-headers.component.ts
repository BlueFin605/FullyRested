import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { HeaderTable } from '@fullyrested/core';
import { InheritedRow } from '../../../key-value-table/key-value-table.component';

@Component({
  selector: 'app-edit-request-headers',
  templateUrl: './edit-request-headers.component.html',
  styleUrls: ['./edit-request-headers.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class EditRequestHeadersComponent {
  @Input()
  headers: HeaderTable[] = [];

  @Output()
  headersChange = new EventEmitter<HeaderTable[]>();

  // headers set at a higher level (the request, when editing a run)
  @Input()
  inherited: InheritedRow[] = [];

  @Input()
  inheritedSource = '';

  onRowsChange(rows: HeaderTable[]) {
    this.headers = rows;
    this.headersChange.emit(this.headers);
  }
}
