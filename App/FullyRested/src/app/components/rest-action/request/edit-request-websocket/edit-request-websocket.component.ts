import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CreateEmptyAction, DEFAULT_TRIGGER_INTERVAL_MS, ExpectFields, RestAction, applyExpectFields, normaliseExpect, normaliseTrigger } from '@fullyrested/core';
import { CollectionTreeService, HttpRequestChoice } from 'src/app/services/collection-tree/collection-tree.service';

type ExpectField = 'count' | 'match' | 'extras' | 'timeout' | 'settle' | 'schema';
type TriggerField = 'interval' | 'delay';

// The same bound set_trigger enforces
export const MIN_TRIGGER_INTERVAL_MS = 100;

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

  // The trigger: an http request of the collection (and optionally one of its runs) fired after the message
  private readonly trees = inject(CollectionTreeService);
  triggerRequest = '';
  triggerRun = '';
  triggerRepeat: string = 'until-done';
  intervalText = String(DEFAULT_TRIGGER_INTERVAL_MS);
  delayText = '0';
  triggerErrors: Partial<Record<TriggerField, string>> = {};

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
    return Object.keys(this.errors).length > 0 || Object.keys(this.triggerErrors).length > 0;
  }

  // The http requests a trigger can name: every http request of the collection except this one
  get triggerChoices(): HttpRequestChoice[] {
    return this.trees.httpRequests(this._action.id);
  }

  get triggerRuns(): HttpRequestChoice['runs'] {
    return this.triggerChoices.find(c => c.path == this.triggerRequest)?.runs ?? [];
  }

  // A trigger naming a request that is no longer in the collection still shows, so it can be seen and cleared
  get triggerMissing(): boolean {
    return this.triggerRequest != '' && !this.triggerChoices.some(c => c.path == this.triggerRequest);
  }

  // The trigger's run may be stored as a name or an id, but the picker's options are ids: match either and
  // give back the id (the raw text when no such run is known, so a stale value is still shown and kept)
  private runIdOf(request: string, run: string): string {
    const runs = this.triggerChoices.find(c => c.path == request)?.runs ?? [];
    return (runs.find(r => r.id == run) ?? runs.find(r => r.name == run))?.id ?? run;
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
    const trigger = this._action.trigger ? normaliseTrigger(this._action.trigger) : undefined;
    this.triggerRequest = trigger?.request ?? '';
    this.triggerRun = this.runIdOf(this.triggerRequest, trigger?.run ?? '');
    this.triggerRepeat = trigger?.repeat ?? 'until-done';
    this.intervalText = String(trigger?.interval ?? DEFAULT_TRIGGER_INTERVAL_MS);
    this.delayText = String(trigger?.delay ?? 0);
    const wasInvalid = this.invalid;
    this.errors = {};
    this.triggerErrors = {};
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

  // Picking a different request drops the old run, as set_trigger does
  onTriggerRequestChange() {
    this.triggerRun = '';
    this.onTriggerChange();
  }

  // Writes the trigger in the shape set_trigger writes. A value that fails its bounds shows its error and
  // is not written; the others still are. No request means no trigger.
  onTriggerChange() {
    const wasInvalid = this.invalid;
    const errors: Partial<Record<TriggerField, string>> = {};
    const interval = this.parseWhole(this.intervalText);
    const delay = this.parseWhole(this.delayText);
    // The interval only matters while repeating; with 'once' a hidden bad value must not block saving
    const intervalOk = Number.isInteger(interval) && interval >= MIN_TRIGGER_INTERVAL_MS;
    if (this.triggerRepeat == 'until-done' && !intervalOk) errors.interval = `interval must be a whole number of at least ${MIN_TRIGGER_INTERVAL_MS}ms`;
    if (!Number.isInteger(delay) || delay < 0) errors.delay = 'delay must be a whole number of 0 or more';
    this.triggerErrors = errors;

    const current = this._action.trigger ? normaliseTrigger(this._action.trigger) : undefined;
    if (this.triggerRequest == '') {
      if (current != undefined) {
        delete this._action.trigger;
        this.actionChange.emit(this._action);
      }
    } else {
      const next = normaliseTrigger({
        request: this.triggerRequest,
        run: this.runIdOf(this.triggerRequest, this.triggerRun) || undefined,
        repeat: this.triggerRepeat as 'once' | 'until-done',
        interval: intervalOk ? interval : current?.interval,
        delay: errors.delay ? current?.delay : delay,
      });
      if (next.run === undefined) delete next.run;
      if (JSON.stringify(next) != JSON.stringify(current)) {
        this._action.trigger = next;
        this.actionChange.emit(this._action);
      }
    }
    if (this.invalid != wasInvalid) this.invalidChange.emit(this.invalid);
  }

  clearTrigger() {
    this.triggerRequest = '';
    this.triggerRun = '';
    this.triggerRepeat = 'until-done';
    this.intervalText = String(DEFAULT_TRIGGER_INTERVAL_MS);
    this.delayText = '0';
    this.onTriggerChange();
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
