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
  id: string;
};

export interface ParamTable {
  key: string;
  value: string;
  active: boolean;
  id: string;
};

export interface VariableTable {
  variable: string;
  value: string;
  active: boolean;
  id: string;
};

export interface SecretTable {
  $secret: string;
  $value: string;
  active: boolean;
  id: string;
}

export interface AuthenticationDetails {
  authentication: string;
  awsSig: AuthenticationDetailsAWSSig;
  basicAuth: AuthenticationDetailsBasicAuth;
  bearerToken: AuthenticationDetailsBearerToken;
}

export interface AuthenticationDetailsAWSSig {
  signUrl: boolean;
  accessKey: string;
  secretKey: string;
  awsRegion: string;
  serviceName: string;
}

export interface AuthenticationDetailsBasicAuth {
  userName: string;
  password: string;
}

export interface AuthenticationDetailsBearerToken {
  token: string;
}

export interface RestActionBody {
  contentType: string;
  body: any;
}

export interface RestActionRun {
  id: string;
  name: string;
  variables: VariableTable[];
  secrets: SecretTable[];
  authentication: AuthenticationDetails;
  headers: HeaderTable[];
  parameters: ParamTable[];
}

export interface RestAction {
  id: string;
  name: string;
  verb: string;
  protocol: string;
  url: string;
  headers: HeaderTable[];
  parameters: ParamTable[];
  authentication: AuthenticationDetails;
  body: RestActionBody;
  runs: RestActionRun[];
}

export interface LocalRestAction {
  action: RestAction;
  fullFilename: string;
  dirty: boolean;
  // active: boolean;
  activeTab: boolean;
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

export interface Environment {
  name: string;
  id: string;
  variables: VariableTable[];
  secrets: SecretTable[];
  auth: AuthenticationDetails;
}

export interface SolutionConfig {
  solutionGuid: string
  solutionEnvironment: Environment;
  environments: Environment[];
  selectedEnvironmentId: string;
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

export function CreateEmptyLocalAction(): LocalRestAction {
  return { action: CreateEmptyAction(), dirty: false, fullFilename: '', activeTab: false };
}

export function CreateEmptyAction(): RestAction {
  return {
    id: '',
    name: '',
    verb: 'get',
    protocol: 'https',
    url: '',
    headers: [],
    parameters: [],
    body: { contentType: 'none', body: undefined },
    authentication: CreateEmptyAuthenticationDetails('inherit'),
    runs: []
  };
}

export function CreateEmptyEnvironment(): Environment {
  return {
    name: '',
    id: '',
    variables: [],
    secrets: [],
    auth: CreateEmptyAuthenticationDetails('inherit')
  };
}

export function CreateEmptyAuthenticationDetails(type: string): AuthenticationDetails {
  return {
    authentication: type,
    awsSig: CreateEmptyAuthenticationDetailsAwsSig(),
    basicAuth: CreateEmptyAuthenticationDetailsBasicAuth(),
    bearerToken: CreateEmptyAuthenticationDetailsBearerToken()
  };
}

export function CreateEmptyAuthenticationDetailsAwsSig(): AuthenticationDetailsAWSSig {
  return { signUrl: false, accessKey: '', secretKey: '', awsRegion: 'eu-central-1', serviceName: '' };
}

export function CreateEmptyAuthenticationDetailsBasicAuth(): AuthenticationDetailsBasicAuth {
  return { userName: '', password: '' };
}

export function CreateEmptyAuthenticationDetailsBearerToken(): AuthenticationDetailsBearerToken {
  return { token: '' };
}

export function CreateEmptySolution(): Solution {
  return {
    config: CreateEmptySolutionConfig(),
    filename: '',
    name: '',
    path: ''
  };
}

export function CreateEmptySolutionConfig(): SolutionConfig {
  return {
    solutionGuid: new SystemSupportService().generateGUID(),
    solutionEnvironment: CreateEmptyEnvironment(),
    environments: [],
    selectedEnvironmentId: ''
  }
}

export function CreateEmptyRestActionRun(): RestActionRun {
  return { id: '', name: '', parameters: [], headers: [], variables: [], secrets: [], authentication: CreateEmptyAuthenticationDetails('none') };
}

@Injectable({
  providedIn: 'root'
})

export class ActionRepositoryService {
  // solutions = new BehaviorSubject<Solution>({config: { solutionGuid: 'abcd' }, filename: '<filename>', path: '<path>'});
  solutions = new BehaviorSubject<Solution | undefined>(undefined);
  savedAs = new BehaviorSubject<SavedAsCompleted | undefined>(undefined);

  constructor(private systemSupport: SystemSupportService) {
    console.log('ActionRepositoryService ctor');

    if (this.getIpcRenderer() == undefined)
      return;

    this.getIpcRenderer().receive('loadSolutionResponse', (solution: Solution) => {
      this.patchSolution(solution);
      this.solutions.next(solution);
    });

    this.getIpcRenderer().receive('savedAsCompleted', (savedAs: SavedAsCompleted) => {
      this.savedAs.next(savedAs);
    });
  }

  private patchSolution(solution: Solution) {
    this.patchEnvironment(solution.config.solutionEnvironment);
    solution.config.environments.forEach(e => this.patchEnvironment(e))
  }

  patchState(state: CurrentState) {
    state.sessions.forEach(s => s.actions.forEach(a => this.patchAuthentication(a.action.authentication)));
  }

  patchEnvironment(env: Environment): void {
    this.patchAuthentication(env.auth);
  }

  patchAuthentication(auth: AuthenticationDetails) {
    if (auth.basicAuth == undefined)
      auth.basicAuth = CreateEmptyAuthenticationDetailsBasicAuth();

    if (auth.bearerToken == undefined)
      auth.bearerToken = CreateEmptyAuthenticationDetailsBearerToken();
  }

  patchRequest(request: RestAction) {
    this.patchAuthentication(request.authentication);
    if (request.runs == undefined)
      request.runs = [];
  }

  private getIpcRenderer() {
    return (<any>window).ipc;
  }

  public createNewAction(max: number): LocalRestAction {
    console.log(max);
    var action: LocalRestAction = CreateEmptyLocalAction();
    action.action.id = this.systemSupport.generateGUID();
    if (isFinite(max) == false)
      action.action.name = "new request";
    else
      action.action.name = "new request " + max;

    action.action.headers.push({ key: 'user-agent', value: 'resteasy', active: true, id: 'aaa' });
    action.action.headers.push({ key: 'accept', value: '*', active: true, id: new SystemSupportService().generateGUID() });
    action.action.headers.push({ key: 'accept-encoding', value: 'gzip, deflate, br', active: true, id: new SystemSupportService().generateGUID() });
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

    this.patchState(state);
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

  public async saveRequest(request: LocalRestAction) {
    if (this.getIpcRenderer() == undefined)
      return;

    await this.getIpcRenderer().send('saveRequest', { fullFilename: request.fullFilename, action: request.action });
  }

  public async loadRequest(fullFilename: string): Promise<RestAction> {
    if (fullFilename == undefined || fullFilename == "")
      return CreateEmptyAction();

    if (this.getIpcRenderer() == undefined) {
      console.log('send Mock action');
      return this.mockRequest(fullFilename);
    }

    var request: RestAction = await this.getIpcRenderer().invoke('loadRequest', fullFilename);
    this.patchRequest(request);
    return request;
  }

  public async loadSolution() {
    if (this.getIpcRenderer() == undefined) {
      console.log('send Mock solution');
      this.solutions.next(this.mockSolution());
      return;
    }

    this.getIpcRenderer().send("loadSolution");
  }

  public async newSolution() {
    var solution: Solution = CreateEmptySolution();
    solution.config.solutionEnvironment.auth.authentication = 'none';
    this.solutions.next(solution);
  }

  public async loadSolutionFromFile(file: RecentFile) {
    if (this.getIpcRenderer() == undefined) {
      console.log('send Mock');
      this.solutions.next(this.mockSolution());
      return;
    }

    this.getIpcRenderer().send("loadSolutionFromFile", file);
  }

  public async saveSolution(solution: Solution) {
    if (this.getIpcRenderer() == undefined) {
      setTimeout(() => this.solutions.next(JSON.parse(JSON.stringify(solution))));
      return;
    }

    await this.getIpcRenderer().send('saveSolution', solution);
  }


  public async saveSolutionAs(solution: Solution) {
    if (this.getIpcRenderer() == undefined) {
      setTimeout(() => this.solutions.next(JSON.parse(JSON.stringify(solution))));
      return;
    }

    await this.getIpcRenderer().send('saveSolutionAs', solution);
  }

  public async storeSolution(solution: Solution) {
    setTimeout(() => this.solutions.next(JSON.parse(JSON.stringify(solution))));
  }

  private mockSolution(): Solution {
    return mockSolution;
  }

  private mockCurrentState(): CurrentState {
    return mockCurrentState;
  }

  private mockTraverseDirectory(): TraversedDrectory {
    return mockTraverse;
  }

  private mockRequest(name: string): RestAction {
    return {
      id: `${name}-mockrequest`,
      name: 'name',
      body: {
        contentType: 'application/json',
        body: `{\\"products\\":[{\\"name\\":\\"car\\",\\"product\\":[{\\"name\\":\\"honda\\",\\"model\\":[{\\"id\\":\\"civic\\",\\"name\\":\\"civic\\"},{\\"id\\":\\"accord\\",\\"name\\":\\"accord\\"},{\\"id\\":\\"crv\\",\\"name\\":\\"crv\\"},{\\"id\\":\\"pilot\\",\\"name\\":\\"pilot\\"},{\\"id\\":\\"odyssey\\",\\"name\\":\\"odyssey\\"}]}]}]}`
      },
      verb: "get",
      protocol: "https",
      url: "www.trademe.co.nz/images/frend/trademe-logo-no-tagline.png",
      headers: [
        {
          key: "accept",
          value: "*/*",
          active: true,
          id: 'aaaaa'
        },
        {
          key: "content-type",
          value: "application/x-www-form-urlencoded",
          active: true,
          id: 'bbbbb'
        },
        {
          key: "user-agent",
          value: "RestEasy1.0",
          active: true,
          "id": 'ccccc'
        },
        {
          key: "accept-encoding",
          value: "gzip, deflate, br",
          active: true,
          "id": 'ddddd'
        }
      ],
      parameters: [],
      authentication: CreateEmptyAuthenticationDetails('inherited'),
      runs: [
        { id: `${name}-mockrun1`, name: 'test1', parameters: [], headers: [], variables: [], secrets: [], authentication: CreateEmptyAuthenticationDetails('none') },
        { id: `${name}-mockrun2`, name: 'test2', parameters: [], headers: [], variables: [], secrets: [], authentication: CreateEmptyAuthenticationDetails('none') },
        { id: `${name}-mockrun3`, name: 'test3', parameters: [], headers: [], variables: [], secrets: [], authentication: CreateEmptyAuthenticationDetails('none') }
      ]
    };
  }
}

const mockSolution = {
  config: {
    solutionGuid: '92f54a1-be78-4605-968d-13e456a94aab',
    solutionEnvironment: {
      name: '',
      id: 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      variables: [
        { variable: 'env', value: 'unknown', active: true, id: new SystemSupportService().generateGUID() },
        { variable: 'host', value: 'www.google.com', active: true, id: new SystemSupportService().generateGUID() }
      ],
      secrets: [
        { $secret: 'accesskey', $value: 'abcdefghijklm', active: true, id: new SystemSupportService().generateGUID() },
      ],
      auth: {
        authentication: 'awssig',
        awsSig: { signUrl: false, accessKey: 'akey', secretKey: 'skey', awsRegion: 'eu-central-1', serviceName: 'sName' },
        basicAuth: { userName: '', password: '' },
        bearerToken: { token: '' }
      }
    },
    environments: [
      {
        name: 'prod',
        id: new SystemSupportService().generateGUID(),
        variables: [
          { variable: 'env', value: 'prod', active: true, id: new SystemSupportService().generateGUID() }
        ],
        secrets: [
          { $secret: 'accesskey', $value: 'kjhfkjshdfkhksahfdkjasd', active: true, id: new SystemSupportService().generateGUID() },
        ],
        auth: CreateEmptyAuthenticationDetails('inherit')
      },
      {
        name: 'test',
        id: new SystemSupportService().generateGUID(),
        variables: [],
        secrets: [],
        auth: CreateEmptyAuthenticationDetails('inherit')
      },
      {
        name: 'dev',
        id: new SystemSupportService().generateGUID(),
        variables: [],
        secrets: [],
        auth: CreateEmptyAuthenticationDetails('inherit')
      }
    ],
    selectedEnvironmentId: '3df64a2-af78-6321-958e-92e496a94fa3'
  },
  filename: '<filename>',
  path: '<path>',
  name: 'solution name'
};

const mockCurrentState: CurrentState = {
  sessions: [
    {
      solutionGuid: "nosolution",
      actions: [
        {
          action: {
            id: "3af54a2-ee78-1236-958d-83e496a94ba3",
            name: "Image (trade-me)",
            body: { contentType: 'application/json', body: '{\"products\":[{\"name\":\"car\",\"product\":[{\"name\":\"honda\",\"model\":[{\"id\":\"civic\",\"name\":\"civic\"},{\"id\":\"accord\",\"name\":\"accord\"},{\"id\":\"crv\",\"name\":\"crv\"},{\"id\":\"pilot\",\"name\":\"pilot\"},{\"id\":\"odyssey\",\"name\":\"odyssey\"}]}]}]}' },
            verb: "get",
            protocol: "https",
            url: "www.trademe.co.nz/images/frend/trademe-logo-no-tagline.png",
            headers: [
              {
                key: "accept",
                value: "*/*",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "content-type",
                value: "application/x-www-form-urlencoded",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "user-agent",
                value: "RestEasy1.0",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "accept-encoding",
                value: "gzip, deflate, br",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            parameters: [],
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        },
        {
          action: {
            id: "3af54a2-ee12-1236-95aa-83e496a94ba4",
            name: "XML Result",
            body: { contentType: 'none', body: undefined },
            verb: "get",
            protocol: "https",
            url: "cdn.animenewsnetwork.com/encyclopedia/api.xml?title=4658",
            headers: [
              {
                key: "accept",
                value: "*/*",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "content-type",
                value: "application/x-www-form-urlencoded",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "user-agent",
                value: "RestEasy1.1",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "accept-encoding",
                value: "gzip, deflate, br",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "my-header1",
                value: "{{header1}}",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "my-header2",
                value: "{{header2}}",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            parameters: [
              {
                key: "userid",
                value: "1",
                active: false,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "param1",
                value: "{{value1}}",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "param2",
                value: "{{value2}}",
                active: true,
                id: new SystemSupportService().generateGUID()
              },

            ],
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        },
        {
          action: {
            id: "ddd54a4-ee95-4321-95aa-83e496a94ba4",
            name: "JSON Result",
            body: { contentType: 'none', body: undefined },
            verb: "get",
            protocol: "https",
            url: "jsonplaceholder.typicode.com/todos/1",
            headers: [
              {
                key: "accept",
                value: "*/*",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "content-type",
                value: "application/x-www-form-urlencoded",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "user-agent",
                value: "RestEasy1.2",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "accept-encoding",
                value: "gzip, deflate, br",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            parameters: [
              {
                key: "userid",
                value: "1",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sort",
                value: "firstname",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        },
        {
          action: {
            id: "ddd54a4-ee95-7654-95fd-73e496a94ba4",
            name: "logo",
            verb: "get",
            protocol: "https",
            url: "www.trademe.co.nz/images/frend/trademe-logo-no-tagline.png",
            headers: [],
            parameters: [],
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            runs: [],
            body: { contentType: 'none', body: undefined }
          },
          dirty: false,
          activeTab: false,
          fullFilename: "/Users/deanmitchell/Projects/RestEasy/Test Collection/trademe/logo.reasyreq"
        },
        {
          action: {
            id: "ccc54c4-ee95-7654-95fd-86e496a94ba5",
            name: "google search",
            verb: "get",
            protocol: "https",
            url: "www.google.com/search",
            headers: [],
            parameters: [
              {
                key: "q",
                value: "angular material select first tab .selectedIndex",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sca_esv",
                value: "578070544",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "rlz",
                value: "1C5CHFA_enNZ1009NZ1009",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sxsrf",
                value: "AM9HkKllLm75pun144GmcZse4QxpFrlWNg:1698741847525",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "ei",
                value: "V75AZa3bH_7n2roP186e8Aw",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "ved",
                value: "0ahUKEwjt4ovD8p-CAxX-s1YBHVenB84Q4dUDCBE",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "uact",
                value: "5",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "oq",
                value: "angular material select first tab .selectedIndex",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "gs_lp",
                value: "Egxnd3Mtd2l6LXNlcnAiMGFuZ3VsYXIgbWF0ZXJpYWwgc2VsZWN0IGZpcnN0IHRhYiAuc2VsZWN0ZWRJbmRleDIHECEYoAEYCkilD1C5BVjhCHABeAGQAQCYAb8CoAHSBKoBBTItMS4xuAEDyAEA-AEB-AECwgIKEAAYRxjWBBiwA8ICBRAhGKABwgIIECEYFhgeGB3iAwQYACBBiAYBkAYI",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sclient",
                value: "gws-wiz-serp",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            body: { contentType: 'none', body: undefined },
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        },
        {
          action: {
            id: "d87019dc-0eea-45a2-a1fa-1e4b57a6b76e",
            name: "MDListModule Search",
            verb: "get",
            protocol: "https",
            url: "www.google.com/search",
            headers: [],
            parameters: [
              {
                key: "q",
                value: "MdListModule",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "rlz",
                value: "1C5CHFA_enNZ1009NZ1009",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "oq",
                value: "MdListModule",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "gs_lcrp",
                value: "EgZjaHJvbWUyBggAEEUYOTIJCAEQABgNGIAEMgkIAhAAGA0YgAQyCQgDEAAYDRiABDIJCAQQABgNGIAEMggIBRAAGA0YHtIBBzQxOWowajeoAgCwAgA",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sourceid",
                value: "chrome",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "ie",
                value: "UTF-8",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            body: { contentType: 'none', body: undefined },
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        }
      ]
    },
    {
      solutionGuid: "92f54a1-be78-4605-968d-13e456a94aab",
      actions: [
        {
          action: {
            id: "92f54a1-be78-4606-958d-13e456a94aac",
            name: "XML Result",
            body: { contentType: 'none', body: undefined },
            verb: "get",
            protocol: "https",
            url: "cdn.animenewsnetwork.com/encyclopedia/api.xml",
            headers: [
              {
                key: "accept",
                value: "*/*",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "content-type",
                value: "application/x-www-form-urlencoded",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "user-agent",
                value: "RestEasy1.1",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "accept-encoding",
                value: "gzip, deflate, br",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            parameters: [
              {
                key: "userid",
                value: "1",
                active: false,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "title",
                value: "4658",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            runs: []
          },
          dirty: false,
          activeTab: false,
          fullFilename: "/Users/deanmitchell/Projects/RestEasy/Test Collection/xml/XML Result.reasyreq"
        },
        {
          action: {
            id: "32f54a1-be78-4606-958d-23e496a94aaf",
            name: "JSON Result(sfasfasfsadddd)",
            body: { contentType: 'none', body: undefined },
            verb: "get",
            protocol: "https",
            url: "jsonplaceholder.typicode.com/todos/1",
            headers: [
              {
                key: "accept",
                value: "*/*",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "content-type",
                value: "application/x-www-form-urlencoded",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "user-agent",
                value: "RestEasy1.2",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "accept-encoding",
                value: "gzip, deflate, br",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            parameters: [
              {
                key: "userid",
                value: "1",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sort",
                value: "firstname",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        },
        {
          action: {
            id: "32b54a4-be78-5603-958d-23e496a94baf",
            name: "was this innamed",
            verb: "get",
            protocol: "https",
            url: "www.trademe.co.nz/images/frend/trademe-logo-no-tagline.png",
            headers: [],
            parameters: [],
            body: { contentType: 'none', body: undefined },
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        },
        {
          action: {
            id: "32b54a4-be78-1206-958d-83e496a94bab",
            name: "google search",
            verb: "get",
            protocol: "https",
            url: "{{host}}/search",
            headers: [
              {
                key: "my-header1",
                value: "{{header1}}",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "my-header2",
                value: "{{header2}}",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "Environment",
                value: "{{env}}",
                active: true,
                id: new SystemSupportService().generateGUID()
              }],
            parameters: [
              {
                key: "q",
                value: "angular material select first tab .selectedIndex",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sca_esv",
                value: "578070544",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "rlz",
                value: "1C5CHFA_enNZ1009NZ1009",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sxsrf",
                value: "AM9HkKllLm75pun144GmcZse4QxpFrlWNg:1698741847525",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "ei",
                value: "V75AZa3bH_7n2roP186e8Aw",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "ved",
                value: "0ahUKEwjt4ovD8p-CAxX-s1YBHVenB84Q4dUDCBE",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "uact",
                value: "5",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "oq",
                value: "angular material select first tab .selectedIndex",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "gs_lp",
                value: "Egxnd3Mtd2l6LXNlcnAiMGFuZ3VsYXIgbWF0ZXJpYWwgc2VsZWN0IGZpcnN0IHRhYiAuc2VsZWN0ZWRJbmRleDIHECEYoAEYCkilD1C5BVjhCHABeAGQAQCYAb8CoAHSBKoBBTItMS4xuAEDyAEA-AEB-AECwgIKEAAYRxjWBBiwA8ICBRAhGKABwgIIECEYFhgeGB3iAwQYACBBiAYBkAYI",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sclient",
                value: "gws-wiz-serp",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            body: { contentType: 'none', body: undefined },
            authentication: CreateEmptyAuthenticationDetails('iherit'),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        },
        {
          action: {
            id: "c78091f7-cdb4-465c-a8c9-02742470b92b",
            name: "stackoverflow search",
            verb: "get",
            protocol: "https",
            url: "stackoverflow.com/questions/32979630/how-can-i-display-a-save-as-dialog-in-an-electron-app",
            headers: [],
            parameters: [],
            body: { contentType: 'none', body: undefined },
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        }
      ]
    }
  ],
  recentSolutions: [
    {
      fullFileName: "/Users/deanmitchell/Projects/RestEasy/Test Collection/my collection.reasycol",
      name: "my collection.reasycol",
      path: "/Users/deanmitchell/Projects/RestEasy/Test Collection"
    },
    {
      fullFileName: "/Users/deanmitchell/Projects/RestEasy/Test Collection/my 2nd collection.reasycol",
      name: "my 2nd collection.reasycol",
      path: "/Users/deanmitchell/Projects/RestEasy/Test Collection"
    },
    {
      fullFileName: "/Users/deanmitchell/Projects/RestEasy/Test Collection/my 3rd collection.reasycol",
      name: "my 3rd collection.reasycol",
      path: "/Users/deanmitchell/Projects/RestEasy/Test Collection"
    },
    {
      fullFileName: "/Users/deanmitchell/Projects/RestEasy/Test Collection/my 4th collection.reasycol",
      name: "my 4th collection.reasycol",
      path: "/Users/deanmitchell/Projects/RestEasy/Test Collection"
    },
    {
      fullFileName: "/Users/deanmitchell/Projects/RestEasy/Test Collection/my 5th collection.reasycol",
      name: "my 5th collection.reasycol",
      path: "/Users/deanmitchell/Projects/RestEasy/Test Collection"
    }
  ],
  currentSolution: "/Users/deanmitchell/Projects/RestEasy/Test Collection/my collection.reasycol"
};

const mockTraverse: TraversedDrectory = {
  dir: {
    name: "src",
    path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src",
    fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src"
  },
  subdirs: [
    {
      dir: {
        name: "app",
        path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src",
        fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app"
      },
      subdirs: [
        {
          dir: {
            name: "components",
            path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app",
            fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components"
          },
          subdirs: [
            {
              dir: {
                name: "empty",
                path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components",
                fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/empty"
              },
              subdirs: [],
              files: []
            },
            {
              dir: {
                name: "open-actions",
                path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components",
                fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions"
              },
              subdirs: [],
              files: [
                {
                  name: "open-actions.component.css",
                  path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions",
                  fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions/open-actions.component.css"
                },
                {
                  name: "open-actions.component.html",
                  path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions",
                  fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions/open-actions.component.html"
                },
                {
                  name: "open-actions.component.spec.ts",
                  path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions",
                  fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions/open-actions.component.spec.ts"
                },
                {
                  name: "open-actions.component.ts",
                  path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions",
                  fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/open-actions/open-actions.component.ts"
                }
              ]
            },
            {
              dir: {
                name: "rest-action",
                path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components",
                fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action"
              },
              subdirs: [
                {
                  dir: {
                    name: "request",
                    path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action",
                    fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request"
                  },
                  subdirs: [
                    {
                      dir: {
                        name: "edit-request",
                        path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request",
                        fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request"
                      },
                      subdirs: [],
                      files: [
                        {
                          name: "edit-request.component.css",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request/edit-request.component.css"
                        },
                        {
                          name: "edit-request.component.html",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request/edit-request.component.html"
                        },
                        {
                          name: "edit-request.component.spec.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request/edit-request.component.spec.ts"
                        },
                        {
                          name: "edit-request.component.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request/edit-request.component.ts"
                        }
                      ]
                    },
                    {
                      dir: {
                        name: "edit-request-body",
                        path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request",
                        fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body"
                      },
                      subdirs: [],
                      files: [
                        {
                          name: "edit-request-body.component.css",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body/edit-request-body.component.css"
                        },
                        {
                          name: "edit-request-body.component.html",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body/edit-request-body.component.html"
                        },
                        {
                          name: "edit-request-body.component.spec.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body/edit-request-body.component.spec.ts"
                        },
                        {
                          name: "edit-request-body.component.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-body/edit-request-body.component.ts"
                        }
                      ]
                    },
                    {
                      dir: {
                        name: "edit-request-headers",
                        path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request",
                        fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers"
                      },
                      subdirs: [],
                      files: [
                        {
                          name: "edit-request-headers.component.css",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers/edit-request-headers.component.css"
                        },
                        {
                          name: "edit-request-headers.component.html",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers/edit-request-headers.component.html"
                        },
                        {
                          name: "edit-request-headers.component.spec.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers/edit-request-headers.component.spec.ts"
                        },
                        {
                          name: "edit-request-headers.component.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-headers/edit-request-headers.component.ts"
                        }
                      ]
                    },
                    {
                      dir: {
                        name: "edit-request-parameters",
                        path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request",
                        fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters"
                      },
                      subdirs: [],
                      files: [
                        {
                          name: "edit-request-parameters.component.css",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters/edit-request-parameters.component.css"
                        },
                        {
                          name: "edit-request-parameters.component.html",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters/edit-request-parameters.component.html"
                        },
                        {
                          name: "edit-request-parameters.component.spec.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters/edit-request-parameters.component.spec.ts"
                        },
                        {
                          name: "edit-request-parameters.component.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/request/edit-request-parameters/edit-request-parameters.component.ts"
                        }
                      ]
                    }
                  ],
                  files: []
                },
                {
                  dir: {
                    name: "response",
                    path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action",
                    fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response"
                  },
                  subdirs: [
                    {
                      dir: {
                        name: "display-response",
                        path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response",
                        fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response"
                      },
                      subdirs: [],
                      files: [
                        {
                          name: "display-response.component.css",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response/display-response.component.css"
                        },
                        {
                          name: "display-response.component.html",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response/display-response.component.html"
                        },
                        {
                          name: "display-response.component.spec.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response/display-response.component.spec.ts"
                        },
                        {
                          name: "display-response.component.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response/display-response.component.ts"
                        }
                      ]
                    },
                    {
                      dir: {
                        name: "display-response-body",
                        path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response",
                        fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body"
                      },
                      subdirs: [],
                      files: [
                        {
                          name: "display-response-body.component.css",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body/display-response-body.component.css"
                        },
                        {
                          name: "display-response-body.component.html",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body/display-response-body.component.html"
                        },
                        {
                          name: "display-response-body.component.spec.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body/display-response-body.component.spec.ts"
                        },
                        {
                          name: "display-response-body.component.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body/display-response-body.component.ts"
                        }
                      ]
                    },
                    {
                      dir: {
                        name: "display-response-body-default",
                        path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response",
                        fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default"
                      },
                      subdirs: [],
                      files: [
                        {
                          name: "display-response-body-default.component.css",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default/display-response-body-default.component.css"
                        },
                        {
                          name: "display-response-body-default.component.html",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default/display-response-body-default.component.html"
                        },
                        {
                          name: "display-response-body-default.component.spec.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default/display-response-body-default.component.spec.ts"
                        },
                        {
                          name: "display-response-body-default.component.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-default/display-response-body-default.component.ts"
                        }
                      ]
                    },
                    {
                      dir: {
                        name: "display-response-body-html",
                        path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response",
                        fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html"
                      },
                      subdirs: [],
                      files: [
                        {
                          name: "display-response-body-html.component.css",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html/display-response-body-html.component.css"
                        },
                        {
                          name: "display-response-body-html.component.html",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html/display-response-body-html.component.html"
                        },
                        {
                          name: "display-response-body-html.component.spec.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html/display-response-body-html.component.spec.ts"
                        },
                        {
                          name: "display-response-body-html.component.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-html/display-response-body-html.component.ts"
                        }
                      ]
                    },
                    {
                      dir: {
                        name: "display-response-body-image",
                        path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response",
                        fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image"
                      },
                      subdirs: [],
                      files: [
                        {
                          name: "display-response-body-image.component.css",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image/display-response-body-image.component.css"
                        },
                        {
                          name: "display-response-body-image.component.html",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image/display-response-body-image.component.html"
                        },
                        {
                          name: "display-response-body-image.component.spec.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image/display-response-body-image.component.spec.ts"
                        },
                        {
                          name: "display-response-body-image.component.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-image/display-response-body-image.component.ts"
                        }
                      ]
                    },
                    {
                      dir: {
                        name: "display-response-body-json",
                        path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response",
                        fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json"
                      },
                      subdirs: [],
                      files: [
                        {
                          name: "display-response-body-json.component.css",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json/display-response-body-json.component.css"
                        },
                        {
                          name: "display-response-body-json.component.html",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json/display-response-body-json.component.html"
                        },
                        {
                          name: "display-response-body-json.component.spec.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json/display-response-body-json.component.spec.ts"
                        },
                        {
                          name: "display-response-body-json.component.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-json/display-response-body-json.component.ts"
                        }
                      ]
                    },
                    {
                      dir: {
                        name: "display-response-body-xml",
                        path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response",
                        fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml"
                      },
                      subdirs: [],
                      files: [
                        {
                          name: "display-response-body-xml.component.css",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml/display-response-body-xml.component.css"
                        },
                        {
                          name: "display-response-body-xml.component.html",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml/display-response-body-xml.component.html"
                        },
                        {
                          name: "display-response-body-xml.component.spec.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml/display-response-body-xml.component.spec.ts"
                        },
                        {
                          name: "display-response-body-xml.component.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-body-xml/display-response-body-xml.component.ts"
                        }
                      ]
                    },
                    {
                      dir: {
                        name: "display-response-headers",
                        path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response",
                        fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers"
                      },
                      subdirs: [],
                      files: [
                        {
                          name: "display-response-headers.component.css",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers/display-response-headers.component.css"
                        },
                        {
                          name: "display-response-headers.component.html",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers/display-response-headers.component.html"
                        },
                        {
                          name: "display-response-headers.component.spec.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers/display-response-headers.component.spec.ts"
                        },
                        {
                          name: "display-response-headers.component.ts",
                          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers",
                          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/response/display-response-headers/display-response-headers.component.ts"
                        }
                      ]
                    }
                  ],
                  files: []
                },
                {
                  dir: {
                    name: "rest-action",
                    path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action",
                    fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action"
                  },
                  subdirs: [],
                  files: [
                    {
                      name: "rest-action.component.css",
                      path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action",
                      fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action/rest-action.component.css"
                    },
                    {
                      name: "rest-action.component.html",
                      path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action",
                      fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action/rest-action.component.html"
                    },
                    {
                      name: "rest-action.component.spec.ts",
                      path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action",
                      fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action/rest-action.component.spec.ts"
                    },
                    {
                      name: "rest-action.component.ts",
                      path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action",
                      fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/rest-action/rest-action/rest-action.component.ts"
                    }
                  ]
                }
              ],
              files: []
            },
            {
              dir: {
                name: "solution-explorer",
                path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components",
                fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer"
              },
              subdirs: [],
              files: [
                {
                  name: "solution-explorer.component.css",
                  path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer",
                  fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer/solution-explorer.component.css"
                },
                {
                  name: "solution-explorer.component.html",
                  path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer",
                  fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer/solution-explorer.component.html"
                },
                {
                  name: "solution-explorer.component.spec.ts",
                  path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer",
                  fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer/solution-explorer.component.spec.ts"
                },
                {
                  name: "solution-explorer.component.ts",
                  path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer",
                  fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/components/solution-explorer/solution-explorer.component.ts"
                }
              ]
            }
          ],
          files: []
        },
        {
          dir: {
            name: "services",
            path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app",
            fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services"
          },
          subdirs: [
            {
              dir: {
                name: "action-repository",
                path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services",
                fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/action-repository"
              },
              subdirs: [],
              files: [
                {
                  name: "action-repository.service.spec.ts",
                  path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/action-repository",
                  fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/action-repository/action-repository.service.spec.ts"
                },
                {
                  name: "action-repository.service.ts",
                  path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/action-repository",
                  fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/action-repository/action-repository.service.ts"
                }
              ]
            },
            {
              dir: {
                name: "content-type-helper",
                path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services",
                fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/content-type-helper"
              },
              subdirs: [],
              files: [
                {
                  name: "content-type-helper.service.spec.ts",
                  path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/content-type-helper",
                  fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/content-type-helper/content-type-helper.service.spec.ts"
                },
                {
                  name: "content-type-helper.service.ts",
                  path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/content-type-helper",
                  fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/content-type-helper/content-type-helper.service.ts"
                }
              ]
            },
            {
              dir: {
                name: "execute-rest-calls",
                path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services",
                fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/execute-rest-calls"
              },
              subdirs: [],
              files: [
                {
                  name: "execute-rest-calls.service.spec.ts",
                  path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/execute-rest-calls",
                  fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/execute-rest-calls/execute-rest-calls.service.spec.ts"
                },
                {
                  name: "execute-rest-calls.service.ts",
                  path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/execute-rest-calls",
                  fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/execute-rest-calls/execute-rest-calls.service.ts"
                }
              ]
            },
            {
              dir: {
                name: "system-support",
                path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services",
                fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/system-support"
              },
              subdirs: [],
              files: [
                {
                  name: "system-support.service.spec.ts",
                  path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/system-support",
                  fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/system-support/system-support.service.spec.ts"
                },
                {
                  name: "system-support.service.ts",
                  path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/system-support",
                  fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/system-support/system-support.service.ts"
                }
              ]
            }
          ],
          files: [
            {
              name: "CustomUrlSerializer.ts",
              path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services",
              fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/services/CustomUrlSerializer.ts"
            }
          ]
        }
      ],
      files: [
        {
          name: ".DS_Store",
          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app",
          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/.DS_Store"
        },
        {
          name: "app-routing.module.ts",
          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app",
          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/app-routing.module.ts"
        },
        {
          name: "app.component.css",
          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app",
          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/app.component.css"
        },
        {
          name: "app.component.html",
          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app",
          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/app.component.html"
        },
        {
          name: "app.component.spec.ts",
          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app",
          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/app.component.spec.ts"
        },
        {
          name: "app.component.ts",
          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app",
          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/app.component.ts"
        },
        {
          name: "app.module.ts",
          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app",
          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/app/app.module.ts"
        }
      ]
    },
    {
      dir: {
        name: "assets",
        path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src",
        fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/assets"
      },
      subdirs: [],
      files: [
        {
          name: ".gitkeep",
          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/assets",
          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/assets/.gitkeep"
        },
        {
          name: "trademe-logo-no-tagline.png",
          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/assets",
          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/assets/trademe-logo-no-tagline.png"
        }
      ]
    },
    {
      dir: {
        name: "environments",
        path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src",
        fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/environments"
      },
      subdirs: [],
      files: [
        {
          name: "environment.prod.ts",
          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/environments",
          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/environments/environment.prod.ts"
        },
        {
          name: "environment.ts",
          path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/environments",
          fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/environments/environment.ts"
        }
      ]
    }
  ],
  files: [
    {
      name: ".DS_Store",
      path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src",
      fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/.DS_Store"
    },
    {
      name: "favicon.ico",
      path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src",
      fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/favicon.ico"
    },
    {
      name: "index.html",
      path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src",
      fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/index.html"
    },
    {
      name: "main.ts",
      path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src",
      fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/main.ts"
    },
    {
      name: "polyfills.ts",
      path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src",
      fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/polyfills.ts"
    },
    {
      name: "styles.css",
      path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src",
      fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/styles.css"
    },
    {
      name: "test.ts",
      path: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src",
      fullPath: "/Users/deanmitchell/Projects/RestEasy/App/RestEasy/src/test.ts"
    }
  ]
};
