import { Component, Input, Output, OnInit, EventEmitter } from '@angular/core';
import { DefaultUrlSerializer, Params } from "@angular/router";

import { SystemSupportService } from 'src/app/services/system-support/system-support.service';
import { CreateEmptyAction, HttpProtocol, RestTypeVerb, buildRequestUrl, resolveRequest } from '@fullyrested/core';
import { RestAction, ParamTable, AuthenticationDetails, RestActionValidation, HeaderTable } from '@fullyrested/core';
import { ExecuteRestAction } from '@fullyrested/core';

@Component({
    selector: 'app-edit-request',
    templateUrl: './edit-request.component.html',
    styleUrls: ['./edit-request.component.css'],
    standalone: false
})
export class EditRequestComponent implements OnInit {
  public get restTypeVerb(): typeof RestTypeVerb {
    return RestTypeVerb;
  }

  public get httpProtocol(): typeof HttpProtocol {
    return HttpProtocol;
  }

  private _action: RestAction = CreateEmptyAction();

  @Input()
  set action(action: RestAction) {
    this._action = action;
    this.onParamChange(this._action.parameters);
  }

  @Output()
  actionChange = new EventEmitter<RestAction>();

  get action(): RestAction {
    return this._action;
  }

  @Output()
  execute = new EventEmitter<ExecuteRestAction>();

  displayUrl: string = '';

  constructor(private systemSupport: SystemSupportService) { }

  ngOnInit(): void {
  }

  onUrlChange(value: any) {

    if (value.startsWith("https://")) {
      value = value.substring(8);
      this.action.protocol = HttpProtocol.https
    } else
      if (value.startsWith("http://")) {
        value = value.substring(7);
        this.action.protocol = HttpProtocol.http;
      }

    //find end of base url
    var queryPos = value.indexOf('?');
    if (queryPos == -1) {
      this.action.url = value;
    } else {
      this.action.url = value.substring(0, queryPos);
    }

    const urlSerializer = new DefaultUrlSerializer();
    var parsedUrl = urlSerializer.parse(value);
    this.displayUrl = value;


    this.action.parameters = this.updateParamTable(parsedUrl.queryParams, this.action.parameters);
    this.actionChange.emit(this.action);
  }

  private updateParamTable(queryParams: { [key: string]: any }, origParamTable: ParamTable[]): ParamTable[] {

    var paramsTable: ParamTable[] = JSON.parse(JSON.stringify(origParamTable));

    var newParams = this.convertParsedUrlParamsToArray(queryParams).filter(f => f.active == true); //.map(m => m.key + '_' + m.value);
    var oldParams = paramsTable.filter(f => f.active == true); //.map(m => m.key + '_' + m.value);


    let addedInNew = newParams.filter(x => oldParams.find(f => f.key == x.key && f.value == x.value) == undefined);
    let removedInNew = oldParams.filter(x => newParams.find(f => f.key == x.key && f.value == x.value) == undefined);


    //okay if we are just chanign one param then let's just replace the value
    if (addedInNew.length == 1 &&
      removedInNew.length == 1 &&
      addedInNew[0].key ===
      removedInNew[0].key) {
      var index = paramsTable.findIndex(f => f.key === addedInNew[0].key);
      if (index == -1) {
        return paramsTable;
      }

      paramsTable[index].value = addedInNew[0].value;
      return paramsTable;
    }

    removedInNew.every(r => paramsTable = this.removeParam(paramsTable, r));
    addedInNew.every(r => paramsTable = this.addParam(paramsTable, r));
    return paramsTable;
  }

  private convertParsedUrlParamsToArray(queryParams: Params): ParamTable[] {
    return Object.keys(queryParams).map(k => { return { key: k, value: queryParams[k], active: true, id: this.systemSupport.generateGUID() } });
  }

  private removeParam(parameters: ParamTable[], remove: ParamTable): ParamTable[] {
    var index = parameters.findIndex(f => f.key === remove.key && f.value === remove.value);
    if (index == -1) {
      return parameters;
    }

    parameters.splice(index, 1);
    return parameters;
  }

  private addParam(parameters: ParamTable[], added: ParamTable): ParamTable[] {

    var inactive = parameters.find(f => f.active == false && f.key === added.key && f.value === added.value);
    if (inactive != undefined) {
      inactive.active = true;
      return parameters;
    }

    return [...parameters, { key: added.key, value: added.value, active: true, id: this.systemSupport.generateGUID() }];
  }

  onParamChange(params: any) {
    this.displayUrl = buildRequestUrl(this.action.url, params);
    this.actionChange.emit(this.action);
  }

  onAuthChange(auth: AuthenticationDetails) {
    this.actionChange.emit(this.action);
  }

  onValidationChange(auth: RestActionValidation) {
    this.actionChange.emit(this.action);
  }

  onHeadersChange(event: HeaderTable[]) {
    this.actionChange.emit(this.action);
  }

  onBodyChange(event: any) {
    this.actionChange.emit(this.action);
  }

  onVerbChange(event: any) {
    this.actionChange.emit(this.action);
  }

  onProtocolChange(event: any) {
    this.actionChange.emit(this.action);
  }

  onNameChange(value: any) {
    this.action.name = value;
    this.actionChange.emit(this.action);
  }

  async test() {
    this.execute.emit(resolveRequest(this.action));
  }
}
