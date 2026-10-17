import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CreateEmptyAction, ExpectFields, RestAction, applyExpectFields, normaliseExpect } from '@fullyrested/core';

type ExpectField = 'count' | 'match' | 'extras' | 'timeout' | 'settle' | 'schema';

// Edits the websocket fields of a request: the message it sends and what the test expects back. Values
// go through core's applyExpectFields (the same code set_expect uses), so the UI, CLI and MCP write the
// same shape and reject the same values. A field that fails validation shows its error beside it and is
// never written to the request, so an invalid value cannot be saved.
@Component({
  selector: 'app-edit-request-websocket',
  templateUrl: './edit-request-websocket.component.html',
  styleUrls: ['./edit-request-websocket.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class EditRequestWebsocketComponent {
  private _action: RestAction = CreateEmptyAction();

  // The editable text of each field, kept apart from the request so half-typed values survive
  countText = '1';
  timeoutText = '5000';
  settleText = '500';
  schemaText = '';
  messageText = '';
  match: string = 'all';
  extras: string = 'ignore';
  errors: Partial<Record<ExpectField, string>> = {};

  @Input() set action(action: RestAction) {
    if (this._action === action) return;
    this._action = action;
    this.load();
  }
  get action(): RestAction {
    return this._action;
  }

  @Output() actionChange = new EventEmitter<RestAction>();
  // true while any field holds a value that cannot be saved
  @Output() invalidChange = new EventEmitter<boolean>();

  get invalid(): boolean {
    return Object.keys(this.errors).length > 0;
  }

  private load() {
    const expect = normaliseExpect(this._action.expect);
    this.countText = String(expect.count);
    this.timeoutText = String(expect.timeout);
    this.settleText = String(expect.settle);
    this.match = expect.match;
    this.extras = expect.extras;
    this.schemaText = expect.schema?.schema ?? '';
    this.messageText = this._action.message ?? '';
    const wasInvalid = this.invalid;
    this.errors = {};
    if (wasInvalid) this.invalidChange.emit(false);
  }

  onMessageChange(text: string) {
    this.messageText = text;
    this._action.message = text;
    this.actionChange.emit(this._action);
  }

  onFieldChange() {
    const wasInvalid = this.invalid;
    const fields: Record<ExpectField, ExpectFields> = {
      count: { count: this.parseWhole(this.countText) },
      match: { match: this.match },
      extras: { extras: this.extras },
      timeout: { timeout: this.parseWhole(this.timeoutText) },
      settle: { settle: this.parseWhole(this.settleText) },
      schema: { schema: this.schemaText },
    };

    const errors: Partial<Record<ExpectField, string>> = {};
    let valid: ExpectFields = {};
    for (const name of Object.keys(fields) as ExpectField[]) {
      try {
        applyExpectFields(undefined, fields[name]);
        valid = { ...valid, ...fields[name] };
      } catch (e) {
        errors[name] = (e as Error).message;
      }
    }
    this.errors = errors;

    const next = applyExpectFields(this._action.expect, valid);
    if (JSON.stringify(next) != JSON.stringify(this._action.expect)) {
      this._action.expect = next;
      this.actionChange.emit(this._action);
    }
    if (this.invalid != wasInvalid) this.invalidChange.emit(this.invalid);
  }

  // '' and '12abc' are not numbers; NaN is then rejected by core's whole-number rules
  private parseWhole(text: string): number {
    return /^\s*-?\d+\s*$/.test(text) ? Number(text) : NaN;
  }

  onSchemaChange(text: string) {
    this.schemaText = text;
    this.onFieldChange();
  }
}
