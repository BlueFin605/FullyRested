import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { RestActionResult } from '../execute-rest-calls/execute-rest-calls.service';
import { SystemSupportService } from '../system-support/system-support.service';

export const REConstants = {
  SolutionExtension: ".reasycol",
  ActionExtension: ".reasyreq"
};

export interface HeaderTable {
  key: string;
  value: string;
  active: boolean;
  id: number;
};
export interface ParamTable {
  key: string;
  value: string;
  active: boolean;
  id: number;
};

export interface RestAction {
  id: string;
  name: string;
  verb: string;
  protocol: string;
  url: string;
  headers: HeaderTable[];
  parameters: ParamTable[];
  body: string;
}
export interface LocalRestAction {
  action: RestAction;
  fullFilename: string;
  dirty: boolean;
}

export interface LocalRestSession {
  solutionGuid: string;
  actions: LocalRestAction[];
}

export interface RecentFile {
  name: string;
  fullFileName: string;
  path: string;
}

export interface CurrentState {
  currentSolution: string;
  sessions: LocalRestSession[];
  recentSolutions: RecentFile[];
}

export interface SolutionConfig {
  solutionGuid: string
}

export interface Solution {
  config: SolutionConfig;
  filename: string;
  name: string;
  path: string;
}

export interface TraversedDrectory {
  dir: Dir;
  subdirs: TraversedDrectory[];
  files: File[];
}

export interface Dir {
  name: string;
  path: string;
  fullPath: string;
}

export interface File {
  name: string;
  path: string;
  fullPath: string;
}

export interface SavedAsCompleted {
  id: string;
  fullFilename: string;
  name: string;
}

const EmptyActionJSON: string = JSON.stringify({ id: '', name: '', verb: 'get', protocol: 'https', url: '', headers: [], parameters: [], body: '{}' });
const EmptyLocalActionJSON: string = JSON.stringify({ action: CreateEmptyAction(), dirty: false });

export function CreateEmptyLocalAction(): LocalRestAction {
  return JSON.parse(EmptyLocalActionJSON);
}
export function CreateEmptyAction(): RestAction {
  return JSON.parse(EmptyActionJSON);
}


@Injectable({
  providedIn: 'root'
})

export class ActionRepositoryService {
  // solutions = new BehaviorSubject<Solution>({config: { solutionGuid: 'abcd' }, filename: '<filename>', path: '<path>'});
  solutions = new BehaviorSubject<Solution | undefined>(undefined);
  savedAs = new BehaviorSubject<SavedAsCompleted | undefined>(undefined);

  constructor(private systemSupport: SystemSupportService) {
    if (this.getIpcRenderer() == undefined)
      return;

    this.getIpcRenderer().receive('loadSolutionResponse', (solution: Solution) => {
      this.solutions.next(solution);
    });

    this.getIpcRenderer().receive('savedAsCompleted', (savedAs: SavedAsCompleted) => {
      this.savedAs.next(savedAs);
    });
  }

  private getIpcRenderer() {
    return (<any>window).ipc;
  }

  public createNewAction(max: number): LocalRestAction {
    console.log(max);
    var action = JSON.parse(EmptyLocalActionJSON);
    action.action.id = this.systemSupport.generateGUID();
    if (isFinite(max) == false)
      action.action.name = "new request";
    else
      action.action.name = "new request " + max;

    return action;
  }

  public async traverseDirectory(pathname: string, filter: string[]): Promise<TraversedDrectory> {
    if (this.getIpcRenderer() == undefined)
      return this.mockTraverseDirectory();

    return this.getIpcRenderer().invoke('traverseDirectory', { pathname: pathname, filter: filter });
  }

  public async getCurrentState(): Promise<CurrentState> {
    if (this.getIpcRenderer() == undefined)
      return this.mockCurrentState();

    var state: CurrentState = await this.getIpcRenderer().invoke('readState', '');
    //  if (state.actions.length == 0)
    //     state.actions.push(CreateEmptyLocalAction());

    console.log(state);
    return state;
  }

  public async saveCurrentState(state: CurrentState) {
    if (this.getIpcRenderer() == undefined)
      return;

    await this.getIpcRenderer().send('saveState', state);
  }

  public async saveAsRequest(request: LocalRestAction) {
    if (this.getIpcRenderer() == undefined)
      return;

    await this.getIpcRenderer().send('saveAsRequest', request.action);
  }

  public async loadSolution() {
    if (this.getIpcRenderer() == undefined) {
      console.log('send Mock');
      this.solutions.next(this.mockSolution());
      return;
    }

    this.getIpcRenderer().send("loadSolution");
  }

  public async loadSolutionFromFile(file: RecentFile) {
    if (this.getIpcRenderer() == undefined) {
      console.log('send Mock');
      this.solutions.next(this.mockSolution());
      return;
    }

    this.getIpcRenderer().send("loadSolutionFromFile", file);
  }

  private mockSolution(): Solution {
    return { config: { solutionGuid: '992f54a1-be78-4605-968d-13e456a94aab' }, filename: '<filename>', path: '<path>', name: 'name' };
  }

  private mockTraverseDirectory(): TraversedDrectory {
    return JSON.parse(`{"dir":{"name":"root","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src"},"subdirs":[{"dir":{"name":"app","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app"},"subdirs":[{"dir":{"name":"components","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components"},"subdirs":[{"dir":{"name":"empty","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/empty"},"subdirs":[],"files":[]},{"dir":{"name":"open-actions","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions"},"subdirs":[],"files":[{"name":"open-actions.component.css","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions/open-actions.component.css"},{"name":"open-actions.component.html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions/open-actions.component.html"},{"name":"open-actions.component.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions/open-actions.component.spec.ts"},{"name":"open-actions.component.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions/open-actions.component.ts"}]},{"dir":{"name":"rest-action","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action"},"subdirs":[{"dir":{"name":"request","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request"},"subdirs":[{"dir":{"name":"edit-request","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request"},"subdirs":[],"files":[{"name":"edit-request.component.css","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request/edit-request.component.css"},{"name":"edit-request.component.html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request/edit-request.component.html"},{"name":"edit-request.component.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request/edit-request.component.spec.ts"},{"name":"edit-request.component.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request/edit-request.component.ts"}]},{"dir":{"name":"edit-request-body","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body"},"subdirs":[],"files":[{"name":"edit-request-body.component.css","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body/edit-request-body.component.css"},{"name":"edit-request-body.component.html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body/edit-request-body.component.html"},{"name":"edit-request-body.component.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body/edit-request-body.component.spec.ts"},{"name":"edit-request-body.component.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body/edit-request-body.component.ts"}]},{"dir":{"name":"edit-request-headers","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers"},"subdirs":[],"files":[{"name":"edit-request-headers.component.css","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers/edit-request-headers.component.css"},{"name":"edit-request-headers.component.html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers/edit-request-headers.component.html"},{"name":"edit-request-headers.component.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers/edit-request-headers.component.spec.ts"},{"name":"edit-request-headers.component.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers/edit-request-headers.component.ts"}]},{"dir":{"name":"edit-request-parameters","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters"},"subdirs":[],"files":[{"name":"edit-request-parameters.component.css","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters/edit-request-parameters.component.css"},{"name":"edit-request-parameters.component.html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters/edit-request-parameters.component.html"},{"name":"edit-request-parameters.component.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters/edit-request-parameters.component.spec.ts"},{"name":"edit-request-parameters.component.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters/edit-request-parameters.component.ts"}]}],"files":[]},{"dir":{"name":"response","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response"},"subdirs":[{"dir":{"name":"display-response","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response"},"subdirs":[],"files":[{"name":"display-response.component.css","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response/display-response.component.css"},{"name":"display-response.component.html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response/display-response.component.html"},{"name":"display-response.component.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response/display-response.component.spec.ts"},{"name":"display-response.component.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response/display-response.component.ts"}]},{"dir":{"name":"display-response-body","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body"},"subdirs":[],"files":[{"name":"display-response-body.component.css","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body/display-response-body.component.css"},{"name":"display-response-body.component.html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body/display-response-body.component.html"},{"name":"display-response-body.component.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body/display-response-body.component.spec.ts"},{"name":"display-response-body.component.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body/display-response-body.component.ts"}]},{"dir":{"name":"display-response-body-default","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default"},"subdirs":[],"files":[{"name":"display-response-body-default.component.css","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default/display-response-body-default.component.css"},{"name":"display-response-body-default.component.html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default/display-response-body-default.component.html"},{"name":"display-response-body-default.component.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default/display-response-body-default.component.spec.ts"},{"name":"display-response-body-default.component.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default/display-response-body-default.component.ts"}]},{"dir":{"name":"display-response-body-html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html"},"subdirs":[],"files":[{"name":"display-response-body-html.component.css","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html/display-response-body-html.component.css"},{"name":"display-response-body-html.component.html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html/display-response-body-html.component.html"},{"name":"display-response-body-html.component.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html/display-response-body-html.component.spec.ts"},{"name":"display-response-body-html.component.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html/display-response-body-html.component.ts"}]},{"dir":{"name":"display-response-body-image","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image"},"subdirs":[],"files":[{"name":"display-response-body-image.component.css","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image/display-response-body-image.component.css"},{"name":"display-response-body-image.component.html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image/display-response-body-image.component.html"},{"name":"display-response-body-image.component.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image/display-response-body-image.component.spec.ts"},{"name":"display-response-body-image.component.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image/display-response-body-image.component.ts"}]},{"dir":{"name":"display-response-body-json","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json"},"subdirs":[],"files":[{"name":"display-response-body-json.component.css","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json/display-response-body-json.component.css"},{"name":"display-response-body-json.component.html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json/display-response-body-json.component.html"},{"name":"display-response-body-json.component.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json/display-response-body-json.component.spec.ts"},{"name":"display-response-body-json.component.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json/display-response-body-json.component.ts"}]},{"dir":{"name":"display-response-body-xml","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml"},"subdirs":[],"files":[{"name":"display-response-body-xml.component.css","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml/display-response-body-xml.component.css"},{"name":"display-response-body-xml.component.html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml/display-response-body-xml.component.html"},{"name":"display-response-body-xml.component.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml/display-response-body-xml.component.spec.ts"},{"name":"display-response-body-xml.component.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml/display-response-body-xml.component.ts"}]},{"dir":{"name":"display-response-headers","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers"},"subdirs":[],"files":[{"name":"display-response-headers.component.css","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers/display-response-headers.component.css"},{"name":"display-response-headers.component.html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers/display-response-headers.component.html"},{"name":"display-response-headers.component.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers/display-response-headers.component.spec.ts"},{"name":"display-response-headers.component.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers/display-response-headers.component.ts"}]}],"files":[]},{"dir":{"name":"rest-action","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action"},"subdirs":[],"files":[{"name":"rest-action.component.css","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action/rest-action.component.css"},{"name":"rest-action.component.html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action/rest-action.component.html"},{"name":"rest-action.component.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action/rest-action.component.spec.ts"},{"name":"rest-action.component.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action/rest-action.component.ts"}]}],"files":[]},{"dir":{"name":"solution-explorer","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer"},"subdirs":[],"files":[{"name":"solution-explorer.component.css","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer/solution-explorer.component.css"},{"name":"solution-explorer.component.html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer/solution-explorer.component.html"},{"name":"solution-explorer.component.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer/solution-explorer.component.spec.ts"},{"name":"solution-explorer.component.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer/solution-explorer.component.ts"}]}],"files":[]},{"dir":{"name":"services","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services"},"subdirs":[{"dir":{"name":"action-repository","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/action-repository"},"subdirs":[],"files":[{"name":"action-repository.service.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/action-repository","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/action-repository/action-repository.service.spec.ts"},{"name":"action-repository.service.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/action-repository","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/action-repository/action-repository.service.ts"}]},{"dir":{"name":"content-type-helper","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/content-type-helper"},"subdirs":[],"files":[{"name":"content-type-helper.service.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/content-type-helper","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/content-type-helper/content-type-helper.service.spec.ts"},{"name":"content-type-helper.service.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/content-type-helper","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/content-type-helper/content-type-helper.service.ts"}]},{"dir":{"name":"execute-rest-calls","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/execute-rest-calls"},"subdirs":[],"files":[{"name":"execute-rest-calls.service.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/execute-rest-calls","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/execute-rest-calls/execute-rest-calls.service.spec.ts"},{"name":"execute-rest-calls.service.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/execute-rest-calls","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/execute-rest-calls/execute-rest-calls.service.ts"}]},{"dir":{"name":"system-support","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/system-support"},"subdirs":[],"files":[{"name":"system-support.service.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/system-support","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/system-support/system-support.service.spec.ts"},{"name":"system-support.service.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/system-support","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/system-support/system-support.service.ts"}]}],"files":[{"name":"CustomUrlSerializer.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/CustomUrlSerializer.ts"}]}],"files":[{"name":".DS_Store","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/.DS_Store"},{"name":"app-routing.module.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/app-routing.module.ts"},{"name":"app.component.css","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/app.component.css"},{"name":"app.component.html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/app.component.html"},{"name":"app.component.spec.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/app.component.spec.ts"},{"name":"app.component.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/app.component.ts"},{"name":"app.module.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/app.module.ts"}]},{"dir":{"name":"assets","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/assets"},"subdirs":[],"files":[{"name":".gitkeep","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/assets","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/assets/.gitkeep"},{"name":"trademe-logo-no-tagline.png","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/assets","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/assets/trademe-logo-no-tagline.png"}]},{"dir":{"name":"environments","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/environments"},"subdirs":[],"files":[{"name":"environment.prod.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/environments","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/environments/environment.prod.ts"},{"name":"environment.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/environments","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/environments/environment.ts"}]}],"files":[{"name":".DS_Store","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/.DS_Store"},{"name":"favicon.ico","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/favicon.ico"},{"name":"index.html","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/index.html"},{"name":"main.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/main.ts"},{"name":"polyfills.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/polyfills.ts"},{"name":"styles.css","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/styles.css"},{"name":"test.ts","path":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src","fullPath":"/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/test.ts"}]}`);
  }

  private mockCurrentState(): CurrentState {
    return {
      currentSolution: '',
      sessions: [
        {
          "solutionGuid": "nosolution",
          actions: [
            { action: this.getActionDetails1(), dirty: false, fullFilename: 'filename1.reasycol' },
            { action: this.getActionDetails2(), dirty: false, fullFilename: 'filename2.reasycol' },
            { action: this.getActionDetails3(), dirty: false, fullFilename: 'filename3.reasycol' }
          ]
        },
        {
          "solutionGuid": "992f54a1-be78-4605-968d-13e456a94aab",
          actions: [
            { action: this.getActionDetails2(), dirty: false, fullFilename: 'filename2.reasycol' }
          ]
        }
      ],
      recentSolutions: [{name: "file1.reasysol", fullFileName: ".dir/file1.reasysol", path: ".dir/"},
               {name: "file2.reasysol", fullFileName: ".dir/file2.reasysol", path: ".dir/"},
               {name: "file3.reasysol", fullFileName: ".dir/file3.reasysol", path: ".dir/"},
               {name: "file3.reasysol", fullFileName: ".dir/file3.reasysol", path: ".dir/"},
              ]
    };
  }

  private getActionDetails1(): RestAction {
    var action: RestAction = {
      id: this.systemSupport.generateGUID(),
      name: "Image (trademe)",
      body: JSON.stringify({ "products": [{ "name": "car", "product": [{ "name": "honda", "model": [{ "id": "civic", "name": "civic" }, { "id": "accord", "name": "accord" }, { "id": "crv", "name": "crv" }, { "id": "pilot", "name": "pilot" }, { "id": "odyssey", "name": "odyssey" }] }] }] }),
      verb: "get",
      protocol: "https",
      url: "www.trademe.co.nz/images/frend/trademe-logo-no-tagline.png",
      headers: [
        { key: "accept", value: "*/*", active: true, id: 1 },
        { key: "content-type", value: "application/x-www-form-urlencoded", active: true, id: 2 },
        { key: "user-agent", value: "RestEasy1.0", active: true, id: 3 },
        { key: "accept-encoding", value: "gzip, deflate, br", active: true, id: 4 },
        // {key: "host", value: "jsonplaceholder.typicode.com", active: true, id: 5}
      ],
      parameters: []
    };  //see https://jsonplaceholder.typicode.com/

    return action;
  }

  private getActionDetails2(): RestAction {
    var action: RestAction = {
      id: this.systemSupport.generateGUID(),
      name: "XML Result",
      body: "{}",
      verb: "get",
      protocol: "https",
      url: "cdn.animenewsnetwork.com/encyclopedia/api.xml?title=4658",
      headers: [
        { key: "accept", value: "*/*", active: true, id: 1 },
        { key: "content-type", value: "application/x-www-form-urlencoded", active: true, id: 2 },
        { key: "user-agent", value: "RestEasy1.1", active: true, id: 3 },
        { key: "accept-encoding", value: "gzip, deflate, br", active: true, id: 4 },
      ],
      parameters: [
        { key: "userid", value: "1", active: false, id: 1 }
      ]
    };  //see https://jsonplaceholder.typicode.com/

    return action;
  }

  private getActionDetails3(): RestAction {
    var action: RestAction = {
      id: this.systemSupport.generateGUID(),
      name: "JSON Result",
      body: "{}",
      verb: "get",
      protocol: "https",
      url: "jsonplaceholder.typicode.com/todos/1",
      headers: [
        { key: "accept", value: "*/*", active: true, id: 1 },
        { key: "content-type", value: "application/x-www-form-urlencoded", active: true, id: 2 },
        { key: "user-agent", value: "RestEasy1.2", active: true, id: 3 },
        { key: "accept-encoding", value: "gzip, deflate, br", active: true, id: 4 },
      ],
      parameters: [
        { key: "userid", value: "1", active: true, id: 1 },
        { key: "sort", value: "firstname", active: true, id: 1 }
      ]
    };  //see https://jsonplaceholder.typicode.com/

    return action;
  }
}
