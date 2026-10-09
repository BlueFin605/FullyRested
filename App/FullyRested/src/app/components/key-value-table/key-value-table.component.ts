import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { SystemSupportService } from 'src/app/services/system-support/system-support.service';

// A row inherited from a level above (e.g. the request, seen from a run). Shown greyed out, read-only.
export interface InheritedRow {
  key: string;
  value: string;
  active: boolean;
}

// The rows this table edits: headers, params, form fields, variables and secrets all have an id,
// an active flag and two string columns whose names differ (key/value, variable/value, $secret/$value).
type Row = { id: string; active: boolean; [field: string]: any };

// Dense key/value grid used for headers, params, form fields, variables and secrets.
// The last row is always empty: typing into it adds a real row.
@Component({
  selector: 'app-key-value-table',
  templateUrl: './key-value-table.component.html',
  styleUrls: ['./key-value-table.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class KeyValueTableComponent {
  // any[]: each caller passes its own row type (HeaderTable, VariableTable, ...)
  @Input() rows: any[] = [];
  @Output() rowsChange = new EventEmitter<any[]>();

  @Input() keyField = 'key';
  @Input() valueField = 'value';
  @Input() keyLabel = 'Key';
  @Input() valueLabel = 'Value';
  // secrets are masked until revealed
  @Input() masked = false;

  @Input() inherited: InheritedRow[] = [];
  @Input() inheritedSource = '';

  revealed = false;
  newKey = '';
  newValue = '';

  @ViewChildren('keyInput') keyInputs!: QueryList<ElementRef<HTMLInputElement>>;
  @ViewChildren('valueInput') valueInputs!: QueryList<ElementRef<HTMLInputElement>>;

  constructor(private systemSupport: SystemSupportService) {}

  get valueType(): string {
    return this.masked && !this.revealed ? 'password' : 'text';
  }

  changed() {
    this.rowsChange.emit(this.rows);
  }

  toggle(row: Row) {
    row.active = !row.active;
    this.changed();
  }

  delete(id: string) {
    this.rows = this.rows.filter((r) => r.id != id);
    this.changed();
  }

  // Typing in the empty last row turns it into a real row and keeps the caret where it was
  addFrom(field: 'key' | 'value', text: string) {
    if (text == '') return;

    this.rows = [
      ...this.rows,
      {
        [this.keyField]: field == 'key' ? text : '',
        [this.valueField]: field == 'value' ? text : '',
        active: true,
        id: this.systemSupport.generateGUID(),
      },
    ];
    this.newKey = '';
    this.newValue = '';
    this.changed();

    setTimeout(() => {
      const inputs = field == 'key' ? this.keyInputs : this.valueInputs;
      const input = inputs.last?.nativeElement;
      input?.focus();
      input?.setSelectionRange(text.length, text.length);
    });
  }

  trackRow(_: number, row: Row) {
    return row.id;
  }
}
