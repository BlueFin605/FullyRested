import { Injectable } from '@angular/core';
import { RestActionComponent } from 'src/app/components/rest-action/rest-action/rest-action.component';

export interface ExecuteRestAction {
  verb: string;
  protocol: string;
  url: string;
  headers: { [header: string]: string };
  body: any;
};

export interface RestActionResult {
  status: number | string;
  statusText: string | undefined;
  headers: { [header: string]: string };
  headersSent: { [header: string]: string };
  body: any;
}

export const EmptyActionResult: RestActionResult = { status: "", statusText: undefined, headers: {}, headersSent: {}, body: {} };

@Injectable({
  providedIn: 'root'
})
export class ExecuteRestCallsService {

  constructor() { }

  getIpcRenderer() {
    return (<any>window).ipc;
  }

  async executeTest(action: ExecuteRestAction): Promise<RestActionResult> {
    if (this.getIpcRenderer() == undefined)
      return this.BuildMockData(action);

    var response = await this.getIpcRenderer().invoke('testRest', action);
    console.log(response);
    return response;
  }

  BuildMockData(action: ExecuteRestAction): RestActionResult | PromiseLike<RestActionResult> {
    var mockjson: RestActionResult = {
      status: 200,
      statusText: "OK",
      headers: {
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
      headersSent: action.headers,
      body: JSON.stringify({
        "userId": 1,
        "id": 1,
        "title": "delectus aut autem",
        "completed": false,
        "information": {
          "summary": "Lorem ipsum dolor sit amet, consectetur adipiscing elit. In magna neque, ultrices sit amet mattis tristique, fermentum vitae ipsum. In eu lorem mauris. Aliquam ut nulla consectetur, commodo erat id, malesuada sem. Morbi posuere eget augue eget eleifend. Mauris magna arcu, sodales at euismod et, mollis quis lectus. Phasellus varius id risus ut pharetra. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Quisque elementum metus velit. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Ut non vestibulum elit. Suspendisse potenti. Aliquam posuere diam sed enim viverra vulputate. Praesent cursus sem sit amet turpis rhoncus bibendum.",
          "details": "Quisque at quam sit amet tortor porta tempor. Cras in est in nibh facilisis sodales nec ac nisl. In tincidunt interdum mauris vitae mollis. Pellentesque sed molestie nulla, sed fringilla mauris. Integer egestas velit at massa gravida, ac consequat ante convallis. Sed lacinia ante non dui commodo vulputate. Quisque sit amet pharetra nisl. Aenean hendrerit venenatis erat eu tristique. Suspendisse molestie feugiat tristique. Quisque vitae semper massa. Proin id enim elementum, posuere arcu eget, finibus eros. Cras malesuada velit sed pellentesque finibus. Curabitur ac lorem eget risus tincidunt ullamcorper. Nunc luctus congue urna, at hendrerit quam sollicitudin in. Aenean eget tincidunt ligula, nec rutrum leo.  Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Vivamus pharetra augue vel orci pharetra maximus. Fusce vitae mi eu sem lacinia ornare. Morbi molestie dolor sit amet tempor consectetur. Morbi in dui at augue consectetur bibendum. Suspendisse a aliquet ex. Maecenas mi nulla, lacinia viverra suscipit at, porta et metus. Nullam lobortis sapien vitae risus laoreet mollis. Proin sit amet justo eget sapien mattis eleifend. Cras volutpat feugiat viverra. Maecenas ut diam sit amet metus laoreet vehicula. Quisque tortor felis, congue vel metus ac, pharetra consectetur felis. Duis porttitor, arcu ut luctus posuere, tellus quam convallis quam, ac condimentum nibh nibh iaculis ante. Aliquam ornare lobortis euismod. Integer diam ligula, rutrum ac tellus vel, commodo tempor ante. Sed vulputate aliquet lectus, ac sollicitudin justo placerat at. Sed rutrum auctor odio, sit amet imperdiet augue pretium et. Praesent at metus ut felis mattis dignissim ut eu lectus. Donec euismod mi sed enim pulvinar, nec consectetur ligula semper. Etiam blandit tortor sed orci fermentum, eget tincidunt massa tincidunt. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Duis vulputate odio non ipsum porttitor tristique. Proin vitae fringilla nulla, nec consequat nisi. Fusce vel ipsum sit amet sem luctus pellentesque. Aliquam iaculis est ac augue euismod, ac dapibus enim aliquam.",
          "contributers": {
            "author": "Marike Oissíne",
            "editor": "Fabian Ieronim",
            "factchecker": "Dov Seleucus"
          }
        }
      })
    };

    return new Promise((resolve, reject) => { resolve(mockjson); });
  }
}