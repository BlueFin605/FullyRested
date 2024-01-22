import { AuthenticationDetails, CreateEmptyAuthenticationDetails, CreateEmptyRestActionValidation, HeaderTable, RestActionValidation, SecretTable, ValidationType, VariableTable } from '../../runner'
import { ResponseValidation } from '../../validator'
import { RestTypeVerb, HttpProtocol } from '../../runner'

// https://wallis.dev/blog/typescript-project-references
// https://github.com/ashleydavis/sharing-typescript-code-libraries/tree/main/nodejs-example

export interface IExecuteRestAction {
  verb: RestTypeVerb;
  protocol: HttpProtocol;
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
  verb: RestTypeVerb;
  protocol: HttpProtocol; 
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
  

  private convertHeaderArraysAsValues(headers: HeaderTable[]): { [header: string]: string } {
    var reverse = headers.reverse();
    headers = reverse.filter((item, index) => reverse.findIndex(i => i.key == item.key) === index).reverse();
    var converted: { [headers: string]: string } = {};
    headers.filter(f => f.active == true && f.key != '' && f.value != '').forEach(v => converted[v.key] = v.value);
    return converted;
  }

  public static NewExecuteRestAction(): ExecuteRestAction {
    return new ExecuteRestAction({verb: RestTypeVerb.get, 
                                  protocol: HttpProtocol.https, 
                                  url: '', 
                                  headers: {}, 
                                  body: {}, 
                                  authentication: CreateEmptyAuthenticationDetails('inherit'),
                                  secrets: undefined,
                                  variables: undefined,
                                  validation: CreateEmptyRestActionValidation(ValidationType.None)
                                 });
  }

  public setVerb(verb: RestTypeVerb) : ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({...me, verb: verb});
  }

  public setProtocol(protocol: HttpProtocol) : ExecuteRestAction {
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
  
  public setHeadersFromArray(headers: HeaderTable[]) : ExecuteRestAction {
    var me: ExecuteRestAction = this;
    var values = this.convertHeaderArraysAsValues(headers);
    return new ExecuteRestAction({...me, headers: values});
  }
  
  public setBody(body: any) : ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({...me, body: body});
  }

  public authentication_pushBack(auth: AuthenticationDetails | undefined) : ExecuteRestAction {
    if (auth == undefined)
      return this;
  
    if (this.authentication?.authentication != 'inherit')
      return this;

    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({...me, authentication: auth});
  }

  public authentication_pushFront(auth: AuthenticationDetails | undefined) : ExecuteRestAction {
    if (auth == undefined || auth.authentication == 'inherit')
      return this;
  
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