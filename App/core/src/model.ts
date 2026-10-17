export const REConstants = {
    CollectionExtension: ".frcol",
    ActionExtension: ".frreq",
    LegacyCollectionExtension: ".reasycol",
    LegacyActionExtension: ".reasyreq",
    FolderSettingsFile: "folder.frfolder"
};

// Extensions to accept when opening files: new first, then the old Rest Easy ones
export const COLLECTION_FILE_EXTENSIONS = [REConstants.CollectionExtension, REConstants.LegacyCollectionExtension];
export const ACTION_FILE_EXTENSIONS = [REConstants.ActionExtension, REConstants.LegacyActionExtension];

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
    // Where a token goes on a websocket handshake: 'header' (the default, and what a missing
    // value means) or the name of a query parameter, e.g. 'token'.
    placement?: string;
}

export interface AuthenticationDetailsAWSSig {
    signUrl: boolean;
    accessKey: string;
    secretKey: string;
    sessionToken?: string;   // temporary credentials (SSO, assumed roles); older files have none
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

// body is the JSON text for 'application/json', a FormField[] for FORM_CONTENT_TYPE, unused for 'none'
export interface RestActionBody {
    contentType: string;
    body: any;
}

export const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

export type FormField = ParamTable;

// multipart/form-data: body is a MultipartPart[]. The boundary and CRLF framing are generated when the
// request is sent, so nothing here depends on line endings.
export const MULTIPART_CONTENT_TYPE = 'multipart/form-data';

// One part. With neither filename, base64 nor size it is a plain text field (value is its text).
// A filename makes it a file part: value is its text content, unless base64 gives binary content or
// size asks for that many generated filler bytes (to exceed a size limit without a big file on disk).
export interface MultipartPart extends ParamTable {
    filename?: string;
    contentType?: string;   // a file part's own Content-Type; default application/octet-stream (text/plain for a text file part)
    base64?: string;        // binary content
    size?: number;          // generated content of this many bytes
}

export enum ValidationType {
    Inherit = "Inherit",
    None = "None",
    ResponseCode = "ResponseCode",
    Headers = "Headers",
    Body = "Body",
    HeadersBody = "HeadersBody"
}

export enum ValidationTypeBody {
    None = "None",
    JsonSchema = "JsonSchema"
}

export interface RestActionValidationJsonSchema {
    schema: string;
}

export interface RestActionValidation {
    type: ValidationType,
    httpCode: number,
    headers: HeaderTable[];
    body: ValidationTypeBody;
    jsonSchema: RestActionValidationJsonSchema | undefined;
}

export type RequestType = 'http' | 'websocket' | 'mcp';

// What an MCP call's JSON-RPC reply must be. 'result': a result, and not a tool result with
// isError. 'tool-error': a tool result with isError true. 'rpc-error': a JSON-RPC error (of `code`,
// when given). 'any': no MCP check (HTTP validation only, e.g. a 401 test).
export type McpOutcome = 'result' | 'tool-error' | 'rpc-error' | 'any';

export interface McpExpect {
    outcome: McpOutcome;
    code?: number;     // rpc-error only: the JSON-RPC error code
    text?: string;     // the tool result text (or the error message) must contain this
}

// An MCP request (type 'mcp'): one JSON-RPC call sent as an HTTP POST to the request's url
// (MCP streamable HTTP). The envelope, id, Accept header and content type are generated.
export interface McpCall {
    method: string;      // initialize, tools/list, tools/call, or any other JSON-RPC method
    params: string;      // JSON text of the params; '' sends none (initialize gets default params)
    handshake: boolean;  // send initialize + notifications/initialized first and carry Mcp-Session-Id
    expect: McpExpect;
}

export type ExpectMatch = 'all' | 'any';
export type ExpectExtras = 'ignore' | 'fail';

export const DEFAULT_EXPECT_SETTLE_MS = 500;

// What a websocket test waits for (see the websocket design spec)
export interface WebSocketExpect {
    count: number;
    match: ExpectMatch;
    schema: RestActionValidationJsonSchema | undefined;
    extras: ExpectExtras;
    timeout: number;   // ms, overall limit
    settle: number;    // ms to keep listening after a pass; used only when extras is 'fail'
}

export type TriggerRepeat = 'once' | 'until-done';

export const DEFAULT_TRIGGER_INTERVAL_MS = 1000;

// A request to fire (optionally with one of its runs) to provoke a websocket message
export interface WebSocketTrigger {
    request: string;
    run?: string;
    repeat: TriggerRepeat;
    interval: number;  // ms between firings when repeat is 'until-done'
    delay: number;     // ms to wait after the message is sent before the first firing
}

// Takes a value out of a response and holds it in a variable for the requests that run after it in the
// same run. Never written to a variable table on disk: it lives only for the run that captured it.
export type CaptureFrom = 'body' | 'header' | 'status';

export interface CaptureRule {
    variable: string;   // the {{name}} the later requests use
    from: CaptureFrom;
    path: string;       // body: a JSONPath ($.id, $.items[0].guid); header: the header name; status: unused
    id: string;
}

export interface RestActionRun {
    id: string;
    name: string;
    variables: VariableTable[];
    secrets: SecretTable[];
    authentication: AuthenticationDetails;
    headers: HeaderTable[];
    parameters: ParamTable[];
    validation: RestActionValidation;
    // Absent in files written before capture existed
    capture?: CaptureRule[];
    // Replaces the request's body for this run; absent = the request's. contentType 'none' sends no body.
    body?: RestActionBody;
    // Replaces the request's url (and protocol, if it names one) for this run; absent = the request's.
    // Query parameters still come from the request and the run.
    url?: string;
    protocol?: HttpProtocol;
}

export interface RestAction {
    id: string;
    name: string;
    verb: RestTypeVerb;
    protocol: HttpProtocol;
    url: string;
    headers: HeaderTable[];
    parameters: ParamTable[];
    authentication: AuthenticationDetails;
    body: RestActionBody;
    runs: RestActionRun[];
    validation: RestActionValidation;
    // true: a suite run (--all, --folder, the desktop's run-all) tests only this request's runs and
    // never sends it bare. Absent = false.
    runsOnly?: boolean;
    // Values to take from the response; a run's rule for the same variable replaces the request's
    capture?: CaptureRule[];
    // Websocket requests only. A missing type means 'http', so older files load unchanged.
    type?: RequestType;
    message?: string;
    expect?: WebSocketExpect;
    trigger?: WebSocketTrigger;
    // MCP requests only
    mcp?: McpCall;
}


export enum RestTypeVerb {
  get = "get",
  post = "post",
  patch = "patch",
  option = "option",
  delete = "delete",
  put = "put"
}

export enum HttpProtocol {
  http = "http",
  https = "https"
}

export interface LocalRestAction {
    action: RestAction;
    fullFilename: string;
    dirty: boolean;
    // active: boolean;
    activeTab: boolean;
}

export interface LocalRestSession {
    collectionGuid: string;
    actions: LocalRestAction[];
}

export interface RecentFile {
    name: string;
    fullFileName: string;
    path: string;
}

export interface CurrentState {
    currentCollection: string;
    sessions: LocalRestSession[];
    recentCollections: RecentFile[];
}

// What every level of the hierarchy can set for the requests below it
export interface ScopeSettings {
    variables: VariableTable[];
    secrets: SecretTable[];
    auth: AuthenticationDetails;
    headers: HeaderTable[];
}

export interface Environment extends ScopeSettings {
    name: string;
    id: string;
}

// folder.frfolder: the settings a folder gives the folders and requests inside it
export interface FolderConfig extends ScopeSettings {
    folderId: string;
}

export interface CollectionConfig {
    collectionGuid: string
    collectionEnvironment: Environment;
    environments: Environment[];
    selectedEnvironmentId: string;
}

export interface Collection {
    config: CollectionConfig;
    filename: string;
    name: string;
    path: string;
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
      verb: RestTypeVerb.get,
      protocol: HttpProtocol.https,
      url: '',
      headers: [],
      parameters: [],
      body: CreateEmptyActionBody(),
      authentication: CreateEmptyAuthenticationDetails('inherit'),
      runs: [],
      validation: CreateEmptyRestActionValidation(undefined)
    };
  }
  
  export function CreateEmptyWebSocketExpect(): WebSocketExpect {
    return { count: 1, match: 'all', schema: undefined, extras: 'ignore', timeout: 5000, settle: DEFAULT_EXPECT_SETTLE_MS };
  }

  export function CreateEmptyMcpCall(): McpCall {
    return { method: 'tools/list', params: '', handshake: false, expect: { outcome: 'result' } };
  }

  export function CreateEmptyActionBody(): RestActionBody {
    return { contentType: 'none', body: undefined };
  }
  
  export function CreateEmptyEnvironment(): Environment {
    return {
      name: '',
      id: '',
      variables: [],
      secrets: [],
      auth: CreateEmptyAuthenticationDetails('inherit'),
      headers: []
    };
  }

  export function CreateEmptyFolderConfig(folderId: string): FolderConfig {
    return {
      folderId,
      variables: [],
      secrets: [],
      auth: CreateEmptyAuthenticationDetails('inherit'),
      headers: []
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
    return { signUrl: false, accessKey: '', secretKey: '', sessionToken: '', awsRegion: 'eu-central-1', serviceName: '' };
  }
  
  export function CreateEmptyAuthenticationDetailsBasicAuth(): AuthenticationDetailsBasicAuth {
    return { userName: '', password: '' };
  }
  
  export function CreateEmptyAuthenticationDetailsBearerToken(): AuthenticationDetailsBearerToken {
    return { token: '' };
  }
  
  export function CreateEmptyCollection(guid: guidGenerator): Collection {
    return {
      config: CreateEmptyCollectionConfig(guid),
      filename: '',
      name: '',
      path: ''
    };
  }
  
  export function CreateEmptyCollectionConfig(guid: guidGenerator): CollectionConfig {
    return {
      collectionGuid: guid.generateGUID(),
      collectionEnvironment: CreateEmptyEnvironment(),
      environments: [],
      selectedEnvironmentId: ''
    }
  }
  
  export function CreateEmptyRestActionValidation(valType: ValidationType | undefined): RestActionValidation {
    return {
      type: valType ?? ValidationType.None,
      headers: [],
      body: ValidationTypeBody.None,
      httpCode: 200,
      jsonSchema: undefined
    }
  };
  
  export function CreateEmptyRestActionRun(guid: guidGenerator, valType: ValidationType | undefined): RestActionRun {
    return { id: guid.generateGUID(), 
             name: '', 
             parameters: [], 
             headers: [], 
             variables: [], 
             secrets: [], 
             authentication: CreateEmptyAuthenticationDetails('inherit'), 
             validation: CreateEmptyRestActionValidation(valType) };
  }
  
  export interface guidGenerator {
    generateGUID(): string;
  }

export interface ValidationCheck { check: 'status' | 'body' | 'headers' | 'mcp'; passed: boolean; errors: string[] }

export interface ResponseValidation {
  information: string[];
  errors: string[];
  valid: boolean;
  checks?: ValidationCheck[];
}
