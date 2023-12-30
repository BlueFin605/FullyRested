import { AuthenticationDetails, CreateEmptyAuthenticationDetails, CreateEmptyRestActionValidation, RestActionValidation, SecretTable, ValidationType, VariableTable } from '../../runner'
import { ResponseValidation } from '../../validator'

// https://wallis.dev/blog/typescript-project-references
// https://github.com/ashleydavis/sharing-typescript-code-libraries/tree/main/nodejs-example

export interface IExecuteRestAction {
  verb: string;
  protocol: string;
  url: string;
  headers: { [header: string]: string };
  body: any;
  authentication: AuthenticationDetails | undefined;
  secrets: SecretTable[] | undefined;
  variables: VariableTable[] | undefined;
  validation: RestActionValidation | undefined;
};

export class ExecuteRestAction implements IExecuteRestAction
{
  verb: string;
  protocol: string; 
  url: string;
  headers: { [header: string]: string; };
  body: any;
  authentication: AuthenticationDetails | undefined;
  secrets: SecretTable[] | undefined;
  variables: VariableTable[] | undefined;
  validation: RestActionValidation | undefined;

  constructor (copy:IExecuteRestAction) {
    this.verb = copy.verb;
    this.protocol = copy.protocol;
    this.url = copy.url;
    this.headers = copy.headers;
    this.body = copy.body;
    this.authentication = copy.authentication;
    this.secrets = copy.secrets;
    this.variables = copy.variables;
    this.validation = copy.validation;
  }
  
  public static NewExecuteRestAction(): ExecuteRestAction {
    return new ExecuteRestAction({verb:'', 
                                  protocol: '', 
                                  url: '', 
                                  headers: {}, 
                                  body: {}, 
                                  authentication: CreateEmptyAuthenticationDetails('inherit'),
                                  secrets: [],
                                  variables: [],
                                  validation: CreateEmptyRestActionValidation(ValidationType.None)
                                 });
  }

  public setVerb(verb: string) : ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({...me, verb: verb});
  }

  public setProtocol(protocol: string) : ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({...me, protocol: protocol});
  }

  public setUrl(url: string) : ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({...me, url: url});
  }
  
  public setHeaders(headers: { [header: string]: string; }) : ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({...me, headers: headers});
  }
  
  public setBody(body: any) : ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({...me, body: body});
  }

  public setAuthentication(auth: AuthenticationDetails) : ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({...me, authentication: auth});
  }

  public setSecrets(secrets: SecretTable[] | undefined) : ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({...me, secrets: secrets});
  }

  public setVariables(variables: VariableTable[] | undefined) : ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({...me, variables: variables});
  }

  public setValidation(validation: RestActionValidation | undefined) : ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({...me, validation: validation});
  }
}

export interface RestActionResult {
  status: number | string;
  statusText: string | undefined;
  headers: { [header: string]: string };
  headersSent: { [header: string]: string };
  body: RestActionResultBody | undefined;
  validated: ResponseValidation | undefined;
}

export interface RestActionResultBody {
  contentType: string;
  body: ArrayBuffer;
}

// export interface IExecuteRestAction {
//   setVerb(verb: string) : IExecuteRestAction
// };

// IExecuteRestAction.prototype.setVerb = function(verb: string): IExecuteRestAction {
//   return this;
// }