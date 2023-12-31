// https://wallis.dev/blog/typescript-project-references
// https://github.com/ashleydavis/sharing-typescript-code-libraries/tree/main/nodejs-example

export const REConstants = {
    CollectionExtension: ".reasycol",
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

export interface RestActionRun {
    id: string;
    name: string;
    variables: VariableTable[];
    secrets: SecretTable[];
    authentication: AuthenticationDetails;
    headers: HeaderTable[];
    parameters: ParamTable[];
    validation: RestActionValidation;
}

export interface RestAction {
    id: string;
    name: string;
    verb: RestTypeVerb;
    protocol: string;
    url: string;
    headers: HeaderTable[];
    parameters: ParamTable[];
    authentication: AuthenticationDetails;
    body: RestActionBody;
    runs: RestActionRun[];
    validation: RestActionValidation;
}


export enum RestTypeVerb {
  get = "get",
  post = "post",
  patch = "patch",
  option = "option",
  delete = "delete",
  put = "put"
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

export interface Environment {
    name: string;
    id: string;
    variables: VariableTable[];
    secrets: SecretTable[];
    auth: AuthenticationDetails;
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
      verb: RestTypeVerb.get,
      protocol: 'https',
      url: '',
      headers: [],
      parameters: [],
      body: CreateEmptyActionBody(),
      authentication: CreateEmptyAuthenticationDetails('inherit'),
      runs: [],
      validation: CreateEmptyRestActionValidation(undefined)
    };
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
             authentication: CreateEmptyAuthenticationDetails('none'), 
             validation: CreateEmptyRestActionValidation(valType) };
  }
  
  export interface guidGenerator {
    generateGUID(): string;
  }
