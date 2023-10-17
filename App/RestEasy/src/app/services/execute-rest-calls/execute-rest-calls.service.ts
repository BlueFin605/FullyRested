import { Injectable } from '@angular/core';
import { RestActionComponent } from 'src/app/components/rest-action/rest-action.component';

export interface ExecuteRestAction {
  verb: string;
  protocol: string;
  url: string;
};

export interface RestActionResult {
  status: number | string;
  statusText: string | undefined;
  headers: { [header: string]: string };
  headersSent: { [header: string]: string };
  data: any;
}

export const EmptyActionResult: RestActionResult = { status: "", statusText: undefined, headers: {}, headersSent: {}, data: {} };

@Injectable({
  providedIn: 'root'
})
export class ExecuteRestCallsService {

  constructor() { }

  getIpcRenderer() {
    return (<any>window).ipc;
  }

  async executeTest(verb: string, protocol: string, url: string, headers: any): Promise<RestActionResult> {
    if (this.getIpcRenderer() == undefined)
      return this.BuildMockData(verb, protocol, url, headers);

    var response = await this.getIpcRenderer().invoke('testRest', { verb: verb, protocol: protocol, url: url, headers: headers });
    console.log(response);
    return response;
  }

  BuildMockData(verb: string, protocol: string, url: string, headers: any): RestActionResult | PromiseLike<RestActionResult> {
    var mockjson: RestActionResult = {
      "status": 200,
      "statusText": "OK",
      "headers": {
        "date": "Tue, 17 Oct 2023 00:21:40 GMT",
        "content-type": "application/json; charset=utf-8",
        "content-length": "83",
        "connection": "close",
        "x-powered-by": "Express",
        "x-ratelimit-limit": "1000",
        "x-ratelimit-remaining": "999",
        "x-ratelimit-reset": "1697036682",
        "vary": "Origin, Accept-Encoding",
        "access-control-allow-credentials": "true",
        "cache-control": "max-age=43200",
        "pragma": "no-cache",
        "expires": "-1",
        "x-content-type-options": "nosniff",
        "etag": "W/\"53-hfEnumeNh6YirfjyjaujcOPPT+s\"",
        "via": "1.1 vegur",
        "cf-cache-status": "HIT",
        "age": "1765",
        "accept-ranges": "bytes",
        "report-to": "{\"endpoints\":[{\"url\":\"https:\\/\\/a.nel.cloudflare.com\\/report\\/v3?s=2Bj4eRjfDAGFuXRhuIuQSyCb2FkiZJ4ktsgs631%2Fav1bU5l%2Bx8R9KH4UWy%2FIVzCdPccLxaxc5oYQLqLnZ59Mescjx16Ad4uy8CMs2Sb8ZVVJAlBCp4UtQN2YQaNw4KBqlqe0JpTBtMh628F00TK1\"}],\"group\":\"cf-nel\",\"max_age\":604800}",
        "nel": "{\"success_fraction\":0,\"report_to\":\"cf-nel\",\"max_age\":604800}",
        "server": "cloudflare",
        "cf-ray": "817461fe1d8da86e-SYD",
        "alt-svc": "h3=\":443\"; ma=86400"
      },
      "headersSent": {
        "accept": "*/*",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "RestEasy1.0",
        "accept-encoding": "",
        "host": "jsonplaceholder.typicode.com"
      },
      "data": {
        "userId": 1,
        "id": 1,
        "title": "delectus aut autem",
        "completed": false
      }
    };

    return new Promise((resolve, reject) => { resolve(mockjson); });
  }
}
