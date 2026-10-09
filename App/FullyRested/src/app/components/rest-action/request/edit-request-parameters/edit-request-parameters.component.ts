import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ParamTable } from '@fullyrested/core';
import { InheritedRow } from '../../../key-value-table/key-value-table.component';

@Component({
  selector: 'app-edit-request-parameters',
  templateUrl: './edit-request-parameters.component.html',
  styleUrls: ['./edit-request-parameters.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class EditRequestParametersComponent {
  @Input()
  params: ParamTable[] = [];

  // the same table edits form bodies, where the rows are fields
  @Input()
  keyLabel = 'Parameter';

  @Output()
  paramsChange = new EventEmitter<ParamTable[]>();

  // parameters set at a higher level (the request, when editing a run)
  @Input()
  inherited: InheritedRow[] = [];

  @Input()
  inheritedSource = '';

  onRowsChange(rows: ParamTable[]) {
    this.params = rows;
    this.paramsChange.emit(this.params);
  }
}
