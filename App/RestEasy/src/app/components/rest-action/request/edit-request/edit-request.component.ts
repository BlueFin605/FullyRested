import { Component, Input, Output, OnInit, EventEmitter } from '@angular/core';
import { UrlTree, UrlSegmentGroup, DefaultUrlSerializer, UrlSegment, Params } from "@angular/router";

import { CustomUrlSerializer } from 'src/app/services/CustomUrlSerializer';


import { SystemSupportService } from 'src/app/services/system-support/system-support.service';
import { CreateEmptyAction } from '../../../../../../../shared/runner';
import { RestAction, ParamTable, AuthenticationDetails, RestActionValidation, HeaderTable } from '../../../../../../../shared/runner';
import { ExecuteRestAction } from '../../../../../../../shared/builder/src';

@Component({
  selector: 'app-edit-request',
  templateUrl: './edit-request.component.html',
  styleUrls: ['./edit-request.component.css']
})
export class EditRequestComponent implements OnInit {
  private _action: RestAction = CreateEmptyAction();

  @Input()
  set action(action: RestAction) {
    console.log(`set action[${JSON.stringify(action)}]`)
    this._action = action;
    this.onParamChange(this._action.parameters);
  }

  @Output()
  actionChange = new EventEmitter<RestAction>();

  get action(): RestAction {
    // console.log(`valid json:${this.bodyChild?.isValidJson()}`);
    return this._action;
  }

  @Output()
  execute = new EventEmitter<ExecuteRestAction>();

  displayUrl: string = '';

  constructor(private systemSupport: SystemSupportService) { }

  ngOnInit(): void {
  }

  onUrlChange(value: any) {
    console.log(`modelChangeFn[${value}]`);

    if (value.startsWith("https://")) {
      value = value.substring(8);
      this.action.protocol = "https";
    } else
      if (value.startsWith("http://")) {
        value = value.substring(7);
        this.action.protocol = "http";
      }

    //find end of base url
    var queryPos = value.indexOf('?');
    if (queryPos == -1) {
      this.action.url = value;
      console.log(`url:[${value}] root:[${this.action.url}]`);
    } else {
      this.action.url = value.substring(0, queryPos);
      console.log(`url:[${value}] root pos:[${queryPos}] root:[${this.action.url}]`);
    }

    const urlSerializer = new DefaultUrlSerializer();
    var parsedUrl = urlSerializer.parse(value);
    console.log(`${JSON.stringify(parsedUrl.queryParams)}`);
    this.displayUrl = value;

    console.log(`parsed url:[${JSON.stringify(parsedUrl.root.segments)}]`)

    this.action.parameters = this.updateParamTable(parsedUrl.queryParams, this.action.parameters);
    this.actionChange.emit(this.action);
  }

  private updateParamTable(queryParams: { [key: string]: any }, origParamTable: ParamTable[]): ParamTable[] {

    var paramsTable: ParamTable[] = JSON.parse(JSON.stringify(origParamTable));

    var newParams = this.convertParsedUrlParamsToArray(queryParams).filter(f => f.active == true); //.map(m => m.key + '_' + m.value);
    var oldParams = paramsTable.filter(f => f.active == true); //.map(m => m.key + '_' + m.value);

    console.log(`new params:[${JSON.stringify(newParams)}]`)
    console.log(`old params:[${JSON.stringify(oldParams)}]`)

    let addedInNew = newParams.filter(x => oldParams.find(f => f.key == x.key && f.value == x.value) == undefined);
    let removedInNew = oldParams.filter(x => newParams.find(f => f.key == x.key && f.value == x.value) == undefined);

    console.log(`added[${JSON.stringify(addedInNew)}]`);
    console.log(`removed[${JSON.stringify(removedInNew)}]`);

    //okay if we are just chanign one param then let's just replace the value
    if (addedInNew.length == 1 &&
      removedInNew.length == 1 &&
      addedInNew[0].key ===
      removedInNew[0].key) {
      var index = paramsTable.findIndex(f => f.key === addedInNew[0].key);
      if (index == -1) {
        console.log(`!!!!!item not found [${addedInNew[0].key}] in []${JSON.stringify(paramsTable)}`);
        console.log(`[C]after changes:[${JSON.stringify(paramsTable)}]`)
        return paramsTable;
      }

      paramsTable[index].value = addedInNew[0].value;
      console.log(`[B]after changes:[${JSON.stringify(paramsTable)}]`)
      return paramsTable;
    }

    removedInNew.every(r => paramsTable = this.removeParam(paramsTable, r));
    addedInNew.every(r => paramsTable = this.addParam(paramsTable, r));
    console.log(`[A]after changes:[${JSON.stringify(paramsTable)}]`)
    return paramsTable;
  }

  private convertParsedUrlParamsToArray(queryParams: Params): ParamTable[] {
    return Object.keys(queryParams).map(k => { return { key: k, value: queryParams[k], active: true, id: this.systemSupport.generateGUID() } });
  }

  private removeParam(parameters: ParamTable[], remove: ParamTable): ParamTable[] {
    var index = parameters.findIndex(f => f.key === remove.key && f.value === remove.value);
    if (index == -1) {
      console.log(`!!!!!item not found [${remove}] in []${JSON.stringify(parameters)}`);
      return parameters;
    }

    parameters.splice(index, 1);
    return parameters;
  }

  private addParam(parameters: ParamTable[], added: ParamTable): ParamTable[] {
    // console.log(`addParam adding[${JSON.stringify(added)}]`);
    // console.log(`addParam parameters[${JSON.stringify(parameters)}]`);

    var inactive = parameters.find(f => f.active == false && f.key === added.key && f.value === added.value);
    if (inactive != undefined) {
      console.log(`activating inactive param;[${JSON.stringify(inactive)}]`);
      inactive.active = true;
      return parameters;
    }

    return [...parameters, { key: added.key, value: added.value, active: true, id: this.systemSupport.generateGUID() }];
  }

  onParamChange(params: any) {
    const urlTree = new UrlTree();
    urlTree.root = new UrlSegmentGroup([new UrlSegment(this.action.url, {})], {});
    urlTree.queryParams = this.convertParamsArraysAsValues(params);
    const urlSerializer = new CustomUrlSerializer();
    var url = urlSerializer.serialize(urlTree);
    if (url.startsWith('/'))
      url = url.substring(1);
    console.log(`onParamChange:[${JSON.stringify(url)}]`);
    console.log(`onParamChange:[${JSON.stringify(this.action.parameters)}]`);
    this.displayUrl = url;
    this.actionChange.emit(this.action);
  }

  onAuthChange(auth: AuthenticationDetails) {
    console.log(auth);
    console.log(this.action);
    this.actionChange.emit(this.action);
  }

  onValidationChange(auth: RestActionValidation) {
    console.log(auth);
    console.log(this.action);
    this.actionChange.emit(this.action);
  }

  onHeadersChange(event: HeaderTable[]) {
    // console.log(event);    
    this.actionChange.emit(this.action);
  }

  onBodyChange(event: any) {
    // console.log(event);
    this.actionChange.emit(this.action);
  }

  onVerbChange(event: any) {
    // console.log(event);
    this.actionChange.emit(this.action);
  }

  onProtocolChange(event: any) {
    // console.log(event);
    this.actionChange.emit(this.action);
  }

  onNameChange(value: any) {
    // console.log(value);
    this.action.name = value;
    this.actionChange.emit(this.action);
  }

  convertHeaderArraysAsValues(headers: HeaderTable[]): { [header: string]: string } {
    var converted: { [header: string]: string } = {};
    headers.filter(f => f.active == true && f.key != '' && f.value != '').forEach(v => converted[v.key] = v.value);
    return converted;
  }

  convertParamsArraysAsValues(params: ParamTable[]): { [header: string]: string } {
    var converted: { [params: string]: string } = {};
    params.filter(f => f.active == true && f.key != '' && f.value != '').forEach(v => converted[v.key] = v.value);
    return converted;
  }

  async test() {
    console.log(this.action.body);
    var action: ExecuteRestAction = {
      verb: this.action.verb,
      protocol: this.action.protocol,
      url: this.displayUrl,
      headers: this.convertHeaderArraysAsValues(this.action.headers ?? []),
      body: this.action.body,
      authentication: this.action.authentication,
      secrets: undefined,
      variables: undefined,
      validation: this.action.validation
    };

    console.log(`emit[${JSON.stringify(action)}]`)
    this.execute.emit(action);
  }
}

