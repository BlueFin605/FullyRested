import { AuthenticationDetails, CreateEmptyAuthenticationDetails, McpExpect, CreateEmptyRestActionValidation, HeaderTable, HttpProtocol, ResponseValidation, RestActionValidation, RestTypeVerb, SecretTable, ValidationType, VariableTable } from './model';
import { newBuiltIns, substituteDeep } from './substitution';

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
  // Set for an MCP request: the body already holds the JSON-RPC envelope; this drives the handshake
  // and the MCP check. Absent for http.
  mcp?: ExecuteMcp;
};

export interface ExecuteMcp {
  method: string;
  handshake: boolean;
  expect: McpExpect;
}

export class ExecuteRestAction implements IExecuteRestAction {
  verb: RestTypeVerb;
  protocol: HttpProtocol;
  url: string;
  headers: { [header: string]: string; };
  body: any;
  authentication: AuthenticationDetails | undefined;
  secrets: SecretTable[] | undefined;
  variables: VariableTable[] | undefined;
  validation: RestActionValidation | undefined;
  mcp?: ExecuteMcp;

  constructor(copy: IExecuteRestAction) {
    this.verb = copy.verb;
    this.protocol = copy.protocol;
    this.url = copy.url;
    this.headers = copy.headers;
    this.body = copy.body;
    this.authentication = copy.authentication;
    this.secrets = copy.secrets;
    this.variables = copy.variables;
    this.validation = copy.validation;
    if (copy.mcp != undefined)
      this.mcp = copy.mcp;
  }


  private convertHeaderArraysAsValues(headers: HeaderTable[]): { [header: string]: string } {
    var reverse = headers.slice().reverse();
    headers = reverse.filter((item, index) => reverse.findIndex(i => i.key == item.key) === index).reverse();
    var converted: { [headers: string]: string } = {};
    headers.filter(f => f.active == true && f.key != '' && f.value != '').forEach(v => converted[v.key] = v.value);
    return converted;
  }

  public static NewExecuteRestAction(): ExecuteRestAction {
    return new ExecuteRestAction({
      verb: RestTypeVerb.get,
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

  public setVerb(verb: RestTypeVerb): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({ ...me, verb: verb });
  }

  public setProtocol(protocol: HttpProtocol): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({ ...me, protocol: protocol });
  }

  public setUrl(url: string): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({ ...me, url: url });
  }

  public setHeaders(headers: { [header: string]: string; }): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({ ...me, headers: headers });
  }

  public setHeadersFromArray(headers: HeaderTable[]): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    var values = this.convertHeaderArraysAsValues(headers);
    return new ExecuteRestAction({ ...me, headers: values });
  }

  public setBody(body: any): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({ ...me, body: body });
  }

  public authentication_pushBack(auth: AuthenticationDetails | undefined): ExecuteRestAction {
    if (auth == undefined)
      return this;

    if (this.authentication?.authentication != 'inherit')
      return this;

    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({ ...me, authentication: auth });
  }

  public authentication_pushFront(auth: AuthenticationDetails | undefined): ExecuteRestAction {
    if (auth == undefined || auth.authentication == 'inherit')
      return this;

    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({ ...me, authentication: auth });
  }

  public variables_pushBack(variables: VariableTable[] | undefined): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    var mergedVars: VariableTable[] = this.variables?.slice() ?? [];
    variables?.forEach(v => {
      //only use variable if it is not known
      if (mergedVars.find(f => f.variable == v.variable) != undefined)
        return;

      mergedVars.push(v);
    });
    return new ExecuteRestAction({ ...me, variables: mergedVars });
  }

  public variables_pushFront(variables: VariableTable[] | undefined): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    var mergedVars: VariableTable[] = this.variables?.slice() ?? [];
    variables?.forEach(v => {
      //always use the variable
      var foundIndex = mergedVars.findIndex(f => f.variable == v.variable);
      if (foundIndex == -1)
        mergedVars.push(v);
      else
        mergedVars[foundIndex] = v;
    });
    return new ExecuteRestAction({ ...me, variables: mergedVars });
  }


  public secrets_pushBack(secrets: SecretTable[] | undefined): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    var mergedSecrets: SecretTable[] = this.secrets?.slice() ?? [];
    secrets?.forEach(v => {
      //only use variable if it is not known
      if (mergedSecrets.find(f => f.$secret == v.$secret) != undefined)
        return;

      mergedSecrets.push(v);
    });
    return new ExecuteRestAction({ ...me, secrets: mergedSecrets });
  }

  public secret_pushFront(secrets: SecretTable[] | undefined): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    var mergedSecrets: SecretTable[] = this.secrets?.slice() ?? [];
    secrets?.forEach(v => {
      //always use the variable
      var foundIndex = mergedSecrets.findIndex(f => f.$secret == v.$secret);
      if (foundIndex == -1)
        mergedSecrets.push(v);
      else
        mergedSecrets[foundIndex] = v;
    });
    return new ExecuteRestAction({ ...me, secrets: mergedSecrets });
  }

  public setMcp(mcp: ExecuteMcp | undefined): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({ ...me, mcp });
  }

  public setValidation(validation: RestActionValidation | undefined): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({ ...me, validation: validation });
  }

  // Substitutes {{variables}} and {{$secrets}} everywhere a request value can appear.
  // The variable and secret tables themselves are left as-is.
  public replaceVariables(): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    const builtins = newBuiltIns();   // one {{$guid}} per request, the same in url, body and validation
    return new ExecuteRestAction({
      ...me,
      url: substituteDeep(this.url, this.variables, this.secrets, builtins),
      headers: substituteDeep(this.headers, this.variables, this.secrets, builtins),
      body: substituteDeep(this.body, this.variables, this.secrets, builtins),
      authentication: substituteDeep(this.authentication, this.variables, this.secrets, builtins),
      validation: substituteDeep(this.validation, this.variables, this.secrets, builtins)
    });
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

