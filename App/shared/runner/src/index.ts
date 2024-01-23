// https://wallis.dev/blog/typescript-project-references
// https://github.com/ashleydavis/sharing-typescript-code-libraries/tree/main/nodejs-example

export const REConstants = {
    CollectionExtension: ".reasycol",
    ActionExtension: ".reasyreq"
};

export interface IHeaderTable {
    key: string;
    value: string;
    active: boolean;
    id: string;
};

export interface IParamTable {
    key: string;
    value: string;
    active: boolean;
    id: string;
};

export interface IVariableTable {
    variable: string;
    value: string;
    active: boolean;
    id: string;
};

export interface ISecretTable {
    $secret: string;
    $value: string;
    active: boolean;
    id: string;
}

export interface IAuthenticationDetails {
    authentication: string;
    awsSig: IAuthenticationDetailsAWSSig;
    basicAuth: IAuthenticationDetailsBasicAuth;
    bearerToken: IAuthenticationDetailsBearerToken;
}

export interface IAuthenticationDetailsAWSSig {
    signUrl: boolean;
    accessKey: string;
    secretKey: string;
    awsRegion: string;
    serviceName: string;
}

export interface IAuthenticationDetailsBasicAuth {
    userName: string;
    password: string;
}

export interface IAuthenticationDetailsBearerToken {
    token: string;
}

export interface IRestActionBody {
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

export interface IRestActionValidationJsonSchema {
    schema: string;
}

export interface IRestActionValidation {
    type: ValidationType,
    httpCode: number,
    headers: IHeaderTable[];
    body: ValidationTypeBody;
    jsonSchema: IRestActionValidationJsonSchema | undefined;
}

export interface IRestActionRun {
    id: string;
    name: string;
    variables: IVariableTable[];
    secrets: ISecretTable[];
    authentication: IAuthenticationDetails;
    headers: IHeaderTable[];
    parameters: IParamTable[];
    validation: IRestActionValidation;
}

export interface IRestAction {
    id: string;
    name: string;
    verb: RestTypeVerb;
    protocol: HttpProtocol;
    url: string;
    headers: IHeaderTable[];
    parameters: IParamTable[];
    authentication: IAuthenticationDetails;
    body: IRestActionBody;
    runs: IRestActionRun[];
    validation: IRestActionValidation;
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

export interface ILocalRestAction {
    action: IRestAction;
    fullFilename: string;
    dirty: boolean;
    // active: boolean;
    activeTab: boolean;
}

export interface ILocalRestSession {
    collectionGuid: string;
    actions: ILocalRestAction[];
}

export interface IRecentFile {
    name: string;
    fullFileName: string;
    path: string;
}

export interface ICurrentState {
    currentCollection: string;
    sessions: ILocalRestSession[];
    recentCollections: IRecentFile[];
}

export interface IEnvironment {
    name: string;
    id: string;
    variables: IVariableTable[];
    secrets: ISecretTable[];
    auth: IAuthenticationDetails;
}

export interface ICollectionConfig {
    collectionGuid: string
    collectionEnvironment: IEnvironment;
    environments: IEnvironment[];
    selectedEnvironmentId: string;
}

export interface ICollection {
    config: ICollectionConfig;
    filename: string;
    name: string;
    path: string;
}

export interface ITraversedDrectory {
    dir: IDir;
    subdirs: ITraversedDrectory[];
    files: IFile[];
}

export interface IDir {
    name: string;
    path: string;
    fullPath: string;
}

export interface IFile {
    name: string;
    path: string;
    fullPath: string;
}

export interface ISavedAsCompleted {
    id: string;
    fullFilename: string;
    name: string;
}


export function CreateEmptyLocalAction(): ILocalRestAction {
    return { action: CreateEmptyAction(), dirty: false, fullFilename: '', activeTab: false };
  }
  
  export function CreateEmptyAction(): IRestAction {
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
  
  export function CreateEmptyActionBody(): IRestActionBody {
    return { contentType: 'none', body: undefined };
  }
  
  export function CreateEmptyEnvironment(): IEnvironment {
    return {
      name: '',
      id: '',
      variables: [],
      secrets: [],
      auth: CreateEmptyAuthenticationDetails('inherit')
    };
  }
  
  export function CreateEmptyAuthenticationDetails(type: string): IAuthenticationDetails {
    return {
      authentication: type,
      awsSig: CreateEmptyAuthenticationDetailsAwsSig(),
      basicAuth: CreateEmptyAuthenticationDetailsBasicAuth(),
      bearerToken: CreateEmptyAuthenticationDetailsBearerToken()
    };
  }
  
  export function CreateEmptyAuthenticationDetailsAwsSig(): IAuthenticationDetailsAWSSig {
    return { signUrl: false, accessKey: '', secretKey: '', awsRegion: 'eu-central-1', serviceName: '' };
  }
  
  export function CreateEmptyAuthenticationDetailsBasicAuth(): IAuthenticationDetailsBasicAuth {
    return { userName: '', password: '' };
  }
  
  export function CreateEmptyAuthenticationDetailsBearerToken(): IAuthenticationDetailsBearerToken {
    return { token: '' };
  }
  
  export function CreateEmptyCollection(guid: guidGenerator): ICollection {
    return {
      config: CreateEmptyCollectionConfig(guid),
      filename: '',
      name: '',
      path: ''
    };
  }
  
  export function CreateEmptyCollectionConfig(guid: guidGenerator): ICollectionConfig {
    return {
      collectionGuid: guid.generateGUID(),
      collectionEnvironment: CreateEmptyEnvironment(),
      environments: [],
      selectedEnvironmentId: ''
    }
  }
  
  export function CreateEmptyRestActionValidation(valType: ValidationType | undefined): IRestActionValidation {
    return {
      type: valType ?? ValidationType.None,
      headers: [],
      body: ValidationTypeBody.None,
      httpCode: 200,
      jsonSchema: undefined
    }
  };
  
  export function CreateEmptyRestActionRun(guid: guidGenerator, valType: ValidationType | undefined): IRestActionRun {
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
