import { Component, Input, Output, OnInit, EventEmitter } from '@angular/core';
import { UrlTree, UrlSegmentGroup, UrlSegment } from "@angular/router";
import { IRestAction, IRestActionRun, IHeaderTable, IParamTable, IAuthenticationDetails, ICollection, ISecretTable, IVariableTable, IRestActionValidation, ValidationType, RestTypeVerb, HttpProtocol } from '../../../../../../../shared/runner';
import { CreateEmptyAction, CreateEmptyRestActionRun, CreateEmptyCollection,  CreateEmptyRestActionValidation } from '../../../../../../../shared/runner';
import { SystemSupportService } from 'src/app/services/system-support/system-support.service';
import { CustomUrlSerializer } from 'src/app/services/CustomUrlSerializer';
import { ExecuteRestAction } from '../../../../../../../shared/builder/src';

@Component({
  selector: 'app-edit-request-run',
  templateUrl: './edit-request-run.component.html',
  styleUrls: ['./edit-request-run.component.css']
})
export class EditRequestRunComponent implements OnInit {
  public get restTypeVerb(): typeof RestTypeVerb {
    return RestTypeVerb;
  }

  public get httpProtocol(): typeof HttpProtocol {
    return HttpProtocol;
  }
  
  _run: IRestActionRun = CreateEmptyRestActionRun(this.systemSupport, ValidationType.Inherit);

  @Input()
  action: IRestAction = CreateEmptyAction();

  @Input()
  set run(run: IRestActionRun) {
    console.log(`set action[${JSON.stringify(run)}]`)
    this._run = run;
    this.onParamChange(this._run.parameters);
  }

  @Output()
  runChange = new EventEmitter<IRestActionRun>();

  @Output()
  nameChange = new EventEmitter<string>();

  @Output()
  execute = new EventEmitter<ExecuteRestAction>();

  @Input()
  collection: ICollection = CreateEmptyCollection(this.systemSupport);

  displayUrl: string = ''

  constructor(private systemSupport: SystemSupportService) { }

  ngOnInit(): void {
  }

  onParamChange(params: IParamTable[]) {
    const urlTree = new UrlTree();
    urlTree.root = new UrlSegmentGroup([new UrlSegment(this.action.url, {})], {});
    var combined = this.combineAllParamaters(this._run.parameters, this.action.parameters);
    console.log(combined);
    urlTree.queryParams = this.convertParamsArraysAsValues(combined);
    const urlSerializer = new CustomUrlSerializer();
    var url = urlSerializer.serialize(urlTree);
    if (url.startsWith('/'))
      url = url.substring(1);
    console.log(`onParamChange:[${JSON.stringify(url)}]`);
    console.log(`onParamChange:[${JSON.stringify(this.action.parameters)}]`);
    this.displayUrl = url;
    this.runChange.emit(this._run);
  }

  onAuthChange(auth: IAuthenticationDetails) {
    console.log(auth);
    console.log(this.action);
    this.runChange.emit(this._run);
  }

  onHeadersChange(event: IHeaderTable[]) {
    console.log(event);    
    this.runChange.emit(this._run);
  }

  onSecretsChange(event: ISecretTable[]) {
    // console.log(event);    
    this.runChange.emit(this._run);
  }

  onVariablesChange(event: IVariableTable[]) {
    // console.log(event);    
    this.runChange.emit(this._run);
  }

  onValidationChange(event: IRestActionValidation) {
    // console.log(event);    
    this.runChange.emit(this._run);
  }
  
  onNameChange(value: string) {
    this._run.name = value;
    console.log(this.action);
    this.runChange.emit(this._run);
    this.nameChange.emit(value);
  }

  combineAllParamaters(run: IParamTable[], action: IParamTable[]) {
    console.log(run);
    console.log(action);
    return action.concat(run);
  }

  convertParamsArraysAsValues(params: IParamTable[]): { [params: string]: string } {
    var reverse = params.reverse();
    params = reverse.filter((item, index) => reverse.findIndex(i => i.key == item.key) === index).reverse();
    var converted: { [params: string]: string } = {};
    params.filter(f => f.active == true && f.key != '' && f.value != '').forEach(v => converted[v.key] = v.value);
    return converted;
  }

  combineAllHeaders(run: IHeaderTable[], action: IHeaderTable[]) {
    console.log(run);
    console.log(action);
    return action.concat(run);
  }

  findAuthentication(): IAuthenticationDetails
  {
    if (!this._run.authentication || this._run.authentication.authentication == 'inherit')
       return this.action.authentication;

    return this._run.authentication;
  }

  async test() {
    console.log(this.action.body);

    var headers = this.combineAllHeaders(this._run.headers, this.action.headers);

    var action: ExecuteRestAction = ExecuteRestAction.NewExecuteRestAction()
                                                      .setVerb(this.action.verb)
                                                      .setProtocol(this.action.protocol)
                                                      .setUrl(this.displayUrl)
                                                      .setHeadersFromArray(headers)
                                                      .setBody(this.action.body)
                                                      .authentication_pushBack(this.findAuthentication())
                                                      .secrets_pushBack(this._run.secrets)
                                                      .variables_pushFront(this._run.variables)
                                                      .setValidation(this._run.validation.type != ValidationType.Inherit ? this._run.validation : (this.action.validation ?? CreateEmptyRestActionValidation(undefined)));

    console.log(`emit[${action.url}]`);
    console.log(action);
    this.execute.emit(action);
  }
}