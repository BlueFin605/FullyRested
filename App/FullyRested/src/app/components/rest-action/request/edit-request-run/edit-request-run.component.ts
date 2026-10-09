import {
  Component,
  Input,
  Output,
  OnInit,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  RestAction,
  RestActionRun,
  HeaderTable,
  ParamTable,
  AuthenticationDetails,
  Collection,
  SecretTable,
  VariableTable,
  RestActionValidation,
  ValidationType,
  RestTypeVerb,
  HttpProtocol,
} from '@fullyrested/core';
import {
  CreateEmptyAction,
  CreateEmptyRestActionRun,
  CreateEmptyCollection,
  buildRequestUrl,
  resolveRequest,
} from '@fullyrested/core';
import { SystemSupportService } from 'src/app/services/system-support/system-support.service';
import { ExecuteRestAction } from '@fullyrested/core';
import { InheritedRow } from '../../../key-value-table/key-value-table.component';
import { activeCount, authLabel } from '../request-labels';

@Component({
  selector: 'app-edit-request-run',
  templateUrl: './edit-request-run.component.html',
  styleUrls: [
    '../edit-request/edit-request.component.css',
    './edit-request-run.component.css',
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class EditRequestRunComponent implements OnInit {
  public get restTypeVerb(): typeof RestTypeVerb {
    return RestTypeVerb;
  }

  public get httpProtocol(): typeof HttpProtocol {
    return HttpProtocol;
  }

  _run: RestActionRun = CreateEmptyRestActionRun(
    this.systemSupport,
    ValidationType.Inherit,
  );

  @Input()
  action: RestAction = CreateEmptyAction();

  @Input()
  set run(run: RestActionRun) {
    this._run = run;
    this.onParamChange(this._run.parameters);
  }

  @Output()
  runChange = new EventEmitter<RestActionRun>();

  @Output()
  nameChange = new EventEmitter<string>();

  @Output()
  execute = new EventEmitter<ExecuteRestAction>();

  @Input()
  collection: Collection = CreateEmptyCollection(this.systemSupport);

  displayUrl: string = '';

  readonly authLabel = authLabel;
  readonly count = activeCount;

  constructor(private systemSupport: SystemSupportService) {}

  get fullUrl(): string {
    return this.displayUrl == '' ? '' : `${this.action.protocol}://${this.displayUrl}`;
  }

  // What the request already sends; the run's own rows add to these
  inheritedParams(): InheritedRow[] {
    return this.action.parameters.map((p) => ({ key: p.key, value: p.value, active: p.active }));
  }

  inheritedHeaders(): InheritedRow[] {
    return this.action.headers.map((h) => ({ key: h.key, value: h.value, active: h.active }));
  }

  ngOnInit(): void {}

  onParamChange(params: ParamTable[]) {
    this.displayUrl = buildRequestUrl(
      this.action.url,
      this.action.parameters.concat(this._run.parameters),
    );
    this.runChange.emit(this._run);
  }

  onAuthChange(auth: AuthenticationDetails) {
    this.runChange.emit(this._run);
  }

  onHeadersChange(event: HeaderTable[]) {
    this.runChange.emit(this._run);
  }

  onSecretsChange(event: SecretTable[]) {
    this.runChange.emit(this._run);
  }

  onVariablesChange(event: VariableTable[]) {
    this.runChange.emit(this._run);
  }

  onValidationChange(event: RestActionValidation) {
    this.runChange.emit(this._run);
  }

  onNameChange(value: string) {
    this._run.name = value;
    this.runChange.emit(this._run);
    this.nameChange.emit(value);
  }

  async test() {
    this.execute.emit(resolveRequest(this.action, this._run));
  }
}
