import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { VariableTable } from '@fullyrested/core';
import { InheritedRow } from '../../key-value-table/key-value-table.component';

@Component({
  selector: 'app-settings-manage-variables',
  templateUrl: './settings-manage-variables.component.html',
  styleUrls: ['./settings-manage-variables.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SettingsManageVariablesComponent {
  @Input()
  variables: VariableTable[] = [];

  @Output()
  variablesChange = new EventEmitter<VariableTable[]>();

  @Input()
  inherited: InheritedRow[] = [];

  @Input()
  inheritedSource = '';

  onRowsChange(rows: VariableTable[]) {
    this.variables = rows;
    this.variablesChange.emit(this.variables);
  }
}
