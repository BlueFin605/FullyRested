import { Component, Input, Output, OnInit, EventEmitter, ViewChild } from '@angular/core';
import { UrlTree, UrlSegmentGroup, DefaultUrlSerializer, UrlSegment } from "@angular/router";

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
  
  @Input()
  action: RestAction = {verb: 'GET', protocol:'HTTPS', url: '', headers: [], parameters: [], body: {}};
  
  @Output()
  execute = new EventEmitter<ExecuteRestAction>();
  
  @ViewChild('headerChild') headerChild: EditRequestHeadersComponent | undefined;
  @ViewChild('bodyChild') bodyChild: EditRequestBodyComponent | undefined;
  
  constructor() { }

  ngOnInit(): void {
  }

  onParamChange(params: any)
  {
    const urlTree = new UrlTree();
    urlTree.root = new UrlSegmentGroup([new UrlSegment(this.action.url, {})], {});
    urlTree.queryParams = this.convertParamsArraysAsValues(params);
    const urlSerializer = new CustomUrlSerializer();
    const url = urlSerializer.serialize(urlTree);
    console.log(JSON.stringify(url));

  }

  convertHeaderArraysAsValues(headers: HeaderTable[]): { [header: string]: string } 
  {
    var converted: { [header: string]: string } = {};
    headers.filter(f => f.active == true && f.key != '' && f.value != '').forEach(v => converted[v.key]=v.value);
    return converted;
  }

  convertParamsArraysAsValues(params: ParamTable[]): { [header: string]: string } 
  {
    var converted: { [params: string]: string } = {};
    params.filter(f => f.active == true && f.key != '' && f.value != '').forEach(v => converted[v.key]=v.value);
    return converted;
  }

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
