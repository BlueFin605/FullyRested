import { Component, Input, Output, OnInit, EventEmitter, ViewChild } from '@angular/core';
import { UrlTree, UrlSegmentGroup, DefaultUrlSerializer, UrlSegment, Params } from "@angular/router";

import { CustomUrlSerializer } from 'src/app/services/CustomUrlSerializer';


import { RestAction, HeaderTable, ParamTable } from 'src/app/services/action-repository/action-repository.service';
import { ExecuteRestAction } from 'src/app/services/execute-rest-calls/execute-rest-calls.service';
import { EditRequestHeadersComponent } from '../edit-request-headers/edit-request-headers.component';
import { EditRequestBodyComponent } from '../edit-request-body/edit-request-body.component';

@Component({
  selector: 'app-edit-request',
  templateUrl: './edit-request.component.html',
  styleUrls: ['./edit-request.component.css']
})
export class EditRequestComponent implements OnInit {
  private _action: RestAction = { verb: 'GET', protocol: 'HTTPS', url: '', headers: [], parameters: [], body: {} };

  @Input()
  set action(action: RestAction) {
    console.log(`set action[${JSON.stringify(action)}]`)
    this._action = action;
    this.onParamChange(this._action.parameters);
  }


  get action(): RestAction {
    // console.log(`valid json:${this.bodyChild?.isValidJson()}`);
    return this._action;
  }

  @Output()
  execute = new EventEmitter<ExecuteRestAction>();

  @ViewChild('headerChild') headerChild: EditRequestHeadersComponent | undefined;
  @ViewChild('bodyChild') bodyChild: EditRequestBodyComponent | undefined;

  displayUrl: string = '';

  constructor() { }

  ngOnInit(): void {
  }

  modelChangeFn(value: any) {
    console.log(`modelChangeFn[${value}]`);
    const urlSerializer = new DefaultUrlSerializer();
    var parsedUrl = urlSerializer.parse(value);
    console.log(`${JSON.stringify(parsedUrl.queryParams)}`);
    this.displayUrl = value;

    // console.log(`parsed params:[${JSON.stringify(parsedUrl.queryParams)}]`)

    
    var newParams = this.convertParsedUrlParamsToArray(parsedUrl.queryParams).filter(f => f.active == true); //.map(m => m.key + '_' + m.value);
    var oldParams = this.action.parameters.filter(f => f.active == true); //.map(m => m.key + '_' + m.value);
    
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
      var index = this.action.parameters.findIndex(f => f.key === addedInNew[0].key);
      if (index == -1) {
        console.log(`!!!!!item not found [${addedInNew[0].key}] in []${JSON.stringify(this.action.parameters)}`);
        return;
      }

      this.action.parameters[index].value = addedInNew[0].value;
      return;
    }

    removedInNew.every(r => this.action.parameters = this.removeParam(this.action.parameters, r));
    // console.log(`after remove:[${JSON.stringify(this.action.parameters)}]`)
    addedInNew.every(r => this.action.parameters = this.addParam(this.action.parameters, r));
    console.log(`after changes:[${JSON.stringify(this.action.parameters)}]`)
  }

  convertParsedUrlParamsToArray(queryParams: Params): ParamTable[] {
    var id = 1;
    return Object.keys(queryParams).map(k => { return { key: k, value: queryParams[k], active: true, id: id++ } });
  }

  removeParam(parameters: ParamTable[], remove: ParamTable): ParamTable[] {
    var index = parameters.findIndex(f => f.key === remove.key && f.value === remove.value);
    if (index == -1) {
      console.log(`!!!!!item not found [${remove}] in []${JSON.stringify(parameters)}`);
      return parameters;
    }

    parameters.splice(index, 1);
    return parameters;
  }

  addParam(parameters: ParamTable[], added: ParamTable): ParamTable[] {
    var inactive = parameters.find(f => f.active == false && f.key === added.key && f.value === added.value);
    if (inactive != undefined)
    {
      console.log(`activating inactive param;[${JSON.stringify(inactive)}]`);
      inactive.active = true;
      return parameters;
    }

    var max: number = this.action.parameters.length == 0 ? 0 : Math.max(...this.action.parameters.map(m => m.id));
    console.log(`max:[${max}]`);
    return [...this.action.parameters, { key: added.key, value: added.value, active: true, id: max + 1 }];
  }

  onParamChange(params: any) {
    const urlTree = new UrlTree();
    urlTree.root = new UrlSegmentGroup([new UrlSegment(this.action.url, {})], {});
    urlTree.queryParams = this.convertParamsArraysAsValues(params);
    const urlSerializer = new CustomUrlSerializer();
    const url = urlSerializer.serialize(urlTree);
    console.log(`onParamChange:[${JSON.stringify(url)}]`);
    console.log(`onParamChange:[${JSON.stringify(this.action.parameters)}]`);
    this.displayUrl = url;
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

  // convertParsedUrlParamsToArray
  async test() {
    if (this.bodyChild?.isValidJSON == false) {
      console.log('Body JSON is not va lid, sorry cannot execute action');
      // console.log(this.bodyChild?.jsonText);

      return;
    }

    var action: ExecuteRestAction = {
      verb: this.action.verb,
      protocol: this.action.protocol,
      url: this.action.url,
      headers: this.convertHeaderArraysAsValues(this.headerChild?.headers ?? []),
      body: this.bodyChild?.json ?? {}
    };

    console.log(`emit[${JSON.stringify(action)}]`)
    this.execute.emit(action);
  }
}

