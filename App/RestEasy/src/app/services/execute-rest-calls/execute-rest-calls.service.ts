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
  body: RestActionResultBody | undefined;
}

export interface RestActionResultBody {
  contentType: string;
  body: ArrayBuffer;
}

//export const EmptyActionResultBody: RestActionResultBody = {contentType: undefined, body: undefined };
export const EmptyActionResult: RestActionResult = { status: "", statusText: undefined, headers: {}, headersSent: {}, body: undefined };

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
    var enc = new TextEncoder();

    var mockjson: RestActionResult = {
      status: 200,
      statusText: "OK",
      headers: {
        "date": "Tue, 17 Oct 2023 00:21:40 GMT",
        "content-type": "application/json; charset=utf-8",
        "content-length": "83",
        // "content-type": "image/png",
        // "content-length": "1949",
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
      // body: {contentType: 'image/png', body: new Uint16Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,1,82,0,0,0,54,8,3,0,0,0,162,25,225,37,0,0,0,183,80,76,84,69,0,0,0,20,143,226,20,143,226,20,143,226,20,143,226,20,143,226,20,143,226,20,143,226,20,143,226,20,143,226,20,143,226,20,143,226,20,143,226,20,143,226,20,143,226,20,143,226,20,143,226,93,178,235,138,199,241,240,248,253,255,255,255,226,241,251,64,164,231,242,242,242,230,230,230,58,148,196,249,175,44,35,150,228,115,115,115,51,51,51,77,77,77,191,191,191,92,153,169,249,175,44,249,175,44,249,175,44,249,175,44,249,175,44,249,175,44,249,175,44,249,175,44,249,175,44,249,175,44,249,175,44,153,153,153,217,217,217,204,204,204,34,145,215,249,175,44,249,175,44,249,175,44,102,102,102,128,128,128,249,175,44,140,140,140,224,171,64,179,179,179,196,227,248,79,171,233,123,192,239,108,185,237,19,76,200,23,0,0,0,56,116,82,78,83,0,48,64,16,207,255,96,175,32,223,159,239,112,128,191,143,80,255,255,255,255,255,255,255,255,191,64,255,255,255,255,255,255,255,191,159,128,96,16,80,175,48,112,143,255,255,255,255,239,32,223,255,255,207,255,143,52,0,128,1,0,0,6,93,73,68,65,84,120,1,237,154,135,186,218,58,18,128,71,146,199,93,178,211,19,82,49,198,167,237,238,5,114,211,243,254,207,181,54,56,50,99,25,185,64,186,255,84,64,71,200,255,167,50,35,9,122,153,153,153,153,153,97,156,115,56,32,96,230,2,56,88,225,184,80,226,57,12,102,206,198,175,254,184,1,6,149,205,48,18,240,19,225,223,240,225,15,32,142,208,5,16,65,8,63,17,252,134,132,95,29,206,165,148,170,38,145,210,229,12,218,176,8,25,128,139,98,86,106,71,164,82,69,216,69,160,164,75,196,114,12,0,4,242,89,169,5,63,118,208,78,164,100,163,213,195,20,160,235,105,24,175,97,127,185,82,215,193,65,68,161,11,123,82,76,32,197,20,12,20,214,168,191,90,105,28,225,112,162,248,48,242,21,40,244,103,165,157,48,7,199,161,68,165,212,9,209,131,89,105,23,49,142,198,17,144,28,254,153,149,118,16,226,112,238,221,191,127,15,43,60,8,16,61,1,179,210,243,140,222,123,240,176,228,209,99,44,225,169,100,208,197,172,212,29,97,180,18,250,228,233,195,7,149,211,103,139,5,116,49,43,245,35,28,202,243,7,165,208,23,47,95,189,126,248,8,17,223,44,15,100,217,42,95,47,138,73,74,73,228,42,220,42,99,243,100,42,224,52,44,14,171,140,46,102,54,165,190,43,189,178,148,116,125,56,77,113,149,95,103,217,117,190,128,134,155,124,149,101,89,126,85,64,23,55,183,119,89,245,180,230,199,20,53,174,147,254,231,229,203,255,62,252,223,195,178,155,254,179,36,108,202,150,108,91,85,70,170,6,246,36,170,198,221,203,9,131,99,233,220,67,77,232,131,171,106,146,99,233,50,208,101,130,88,24,74,205,0,219,113,225,136,187,172,230,14,138,213,70,183,60,63,40,42,242,29,125,139,176,45,63,213,172,22,112,26,142,195,185,95,42,125,251,242,229,191,175,95,61,172,150,168,165,201,110,85,212,74,41,45,213,18,64,120,164,31,151,47,9,137,236,232,233,41,29,80,1,239,82,202,3,108,149,2,77,182,172,201,174,54,164,217,55,0,176,216,145,30,210,146,150,47,41,215,196,57,193,27,173,180,130,40,37,228,195,148,178,128,184,96,17,26,24,74,19,60,137,180,21,74,76,165,149,80,34,240,6,214,203,22,107,104,184,121,183,164,80,231,4,31,113,220,192,127,93,25,125,95,13,124,252,144,231,249,237,58,175,200,178,119,163,148,106,133,178,207,40,170,33,129,137,180,78,99,161,161,212,20,116,107,190,117,211,24,221,44,59,88,79,91,238,41,143,74,167,255,123,241,246,227,195,79,141,39,77,177,88,231,217,176,129,159,56,196,133,31,97,191,82,137,22,164,93,123,66,149,14,36,131,154,45,49,74,157,155,132,56,134,207,15,247,28,130,40,15,58,25,162,52,162,46,20,246,43,101,104,67,246,100,129,124,160,82,202,21,28,120,183,236,102,87,64,7,14,142,115,250,168,50,250,233,16,234,79,87,74,93,184,56,64,169,234,87,106,153,197,130,73,74,175,233,202,100,146,67,7,56,150,207,95,190,238,133,162,7,253,74,3,89,115,82,75,12,0,1,217,56,228,105,18,153,74,249,177,31,201,121,236,117,40,13,155,122,164,15,224,203,166,34,215,84,186,201,50,99,64,191,203,72,143,132,138,162,41,181,91,23,0,55,171,166,10,218,77,125,46,136,210,145,56,98,128,82,213,27,2,115,98,203,19,80,33,18,67,169,71,54,22,43,152,211,86,42,154,198,49,216,227,235,50,78,91,233,102,13,37,183,180,87,110,1,96,113,36,117,65,203,172,224,64,19,28,220,194,17,9,98,228,78,87,170,4,156,173,52,242,164,244,143,251,86,216,181,106,42,106,11,25,212,8,167,165,52,214,21,51,128,246,12,236,183,148,222,104,59,109,99,197,142,42,213,138,51,51,72,125,215,94,233,35,49,81,105,224,2,156,171,212,73,225,64,160,107,21,160,241,168,210,206,160,222,111,41,245,104,25,58,23,196,84,233,10,106,222,153,163,120,77,230,202,66,191,218,66,5,157,11,138,118,147,57,68,56,18,157,95,79,84,106,246,72,50,175,154,186,20,141,160,4,52,132,84,169,126,22,71,105,2,242,125,25,237,164,116,88,223,105,97,68,233,66,191,202,26,180,210,69,251,233,56,40,28,78,144,164,62,16,166,43,245,58,50,98,82,185,67,234,8,205,159,51,251,46,218,80,52,123,130,3,218,24,177,179,57,86,154,47,109,220,154,74,147,225,62,77,157,211,149,70,162,195,11,28,147,144,58,20,113,167,33,74,217,8,165,89,91,41,25,215,217,112,165,121,187,49,2,210,41,147,231,249,74,19,232,83,42,71,43,229,104,165,87,41,156,167,84,96,69,164,39,32,59,145,4,184,172,82,6,223,161,151,254,92,165,92,183,54,193,94,148,15,23,86,26,1,124,135,185,244,231,42,149,122,137,245,177,15,9,112,190,82,243,253,105,43,126,36,140,158,108,174,248,12,58,152,170,84,23,216,129,21,167,249,106,137,86,162,20,70,227,97,141,99,87,58,60,46,77,59,227,210,232,68,92,26,94,82,105,97,132,4,150,93,210,192,72,66,76,34,6,227,145,116,44,155,74,19,208,92,60,123,162,221,148,243,243,148,118,103,79,112,117,3,45,98,186,163,62,41,147,183,32,91,63,239,74,243,160,164,33,53,114,124,144,182,28,63,61,149,227,251,102,179,121,245,34,140,217,57,74,205,28,31,86,250,168,77,19,144,46,148,246,27,101,92,238,225,12,122,161,21,42,85,137,20,22,165,116,39,42,229,60,9,240,8,101,84,233,196,156,187,61,59,81,238,222,113,243,134,55,81,41,221,137,202,22,80,114,213,100,12,107,58,172,66,114,76,102,160,75,176,196,161,79,216,139,143,109,82,139,210,97,251,165,206,216,253,82,165,34,82,96,178,82,200,233,142,224,242,136,109,187,147,106,88,112,170,157,190,12,76,59,125,152,207,31,90,148,14,219,213,231,253,74,45,75,173,3,103,40,133,119,189,33,148,52,151,8,33,205,86,48,50,114,52,238,148,11,44,129,69,233,37,207,158,60,203,34,59,89,169,113,154,103,212,194,140,136,165,194,15,35,34,212,53,205,152,129,225,240,163,18,102,81,122,153,19,82,91,248,146,194,84,165,54,167,239,138,246,142,137,65,154,168,131,109,47,246,205,41,209,241,100,73,245,73,63,230,163,73,139,210,222,115,252,126,167,210,86,40,98,48,89,41,61,199,39,100,5,205,86,228,168,91,167,65,194,97,28,66,33,33,180,43,5,95,33,33,73,166,222,54,73,3,164,120,2,206,86,10,197,157,113,240,223,26,148,225,152,88,40,228,48,1,55,64,141,199,161,75,41,129,31,73,13,25,221,137,234,188,19,37,135,220,137,138,66,118,94,168,175,217,222,29,141,254,29,189,51,197,60,39,20,48,4,167,190,242,53,17,22,39,125,55,241,8,254,160,155,123,82,223,220,235,171,73,37,146,195,37,89,228,119,89,73,190,222,194,84,68,162,66,14,51,51,51,51,51,51,127,0,255,7,222,16,117,145,199,189,17,209,0,0,0,0,73,69,78,68,174,66,96,130])}

      body: {
        contentType: 'application/json; charset=utf-8', body: enc.encode(JSON.stringify({
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
        }))
      }
    };

    return new Promise((resolve, reject) => { resolve(mockjson); });
  }
}