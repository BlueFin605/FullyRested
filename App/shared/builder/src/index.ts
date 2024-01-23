import { IAuthenticationDetails, CreateEmptyAuthenticationDetails, CreateEmptyRestActionValidation, IHeaderTable, IRestActionValidation, ISecretTable, ValidationType, IVariableTable, IRestActionValidationJsonSchema, ValidationTypeBody } from '../../runner'
import { IResponseValidation } from '../../validator'
import { RestTypeVerb, HttpProtocol } from '../../runner'

const regexp = /\{\{(\$?[0-9a-zA-Z]*?)\}\}/g;

// https://wallis.dev/blog/typescript-project-references
// https://github.com/ashleydavis/sharing-typescript-code-libraries/tree/main/nodejs-example

export interface IExecuteRestAction {
  verb: RestTypeVerb;
  protocol: HttpProtocol;
  url: string;
  headers: { [header: string]: string };
  body: any;
  authentication: IAuthenticationDetails | undefined;
  secrets: ISecretTable[] | undefined;
  variables: IVariableTable[] | undefined;
  validation: IRestActionValidation | undefined;
};

export class ExecuteRestAction implements IExecuteRestAction {
  verb: RestTypeVerb;
  protocol: HttpProtocol;
  url: string;
  headers: { [header: string]: string; };
  body: any;
  authentication: IAuthenticationDetails | undefined;
  secrets: ISecretTable[] | undefined;
  variables: IVariableTable[] | undefined;
  validation: IRestActionValidation | undefined;

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
  }


  private convertHeaderArraysAsValues(headers: IHeaderTable[]): { [header: string]: string } {
    var reverse = headers.reverse();
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

  public setHeadersFromArray(headers: IHeaderTable[]): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    var values = this.convertHeaderArraysAsValues(headers);
    return new ExecuteRestAction({ ...me, headers: values });
  }

  public setBody(body: any): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({ ...me, body: body });
  }

  public authentication_pushBack(auth: IAuthenticationDetails | undefined): ExecuteRestAction {
    if (auth == undefined)
      return this;

    if (this.authentication?.authentication != 'inherit')
      return this;

    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({ ...me, authentication: auth });
  }

  public authentication_pushFront(auth: IAuthenticationDetails | undefined): ExecuteRestAction {
    if (auth == undefined || auth.authentication == 'inherit')
      return this;

    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({ ...me, authentication: auth });
  }

  public variables_pushBack(variables: IVariableTable[] | undefined): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    var mergedVars: IVariableTable[] = this.variables?.slice() ?? [];
    variables?.forEach(v => {
      //only use variable if it is not known
      if (mergedVars.find(f => f.variable == v.variable) != undefined)
        return;

      mergedVars.push(v);
    });
    return new ExecuteRestAction({ ...me, variables: mergedVars });
  }

  public variables_pushFront(variables: IVariableTable[] | undefined): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    var mergedVars: IVariableTable[] = this.variables?.slice() ?? [];
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


  public secrets_pushBack(secrets: ISecretTable[] | undefined): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    var mergedSecrets: ISecretTable[] = this.secrets?.slice() ?? [];
    secrets?.forEach(v => {
      //only use variable if it is not known
      if (mergedSecrets.find(f => f.$secret == v.$secret) != undefined)
        return;

      mergedSecrets.push(v);
    });
    return new ExecuteRestAction({ ...me, secrets: mergedSecrets });
  }

  public secret_pushFront(secrets: ISecretTable[] | undefined): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    var mergedSecrets: ISecretTable[] = this.secrets?.slice() ?? [];
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

  public setValidation(validation: IRestActionValidation | undefined): ExecuteRestAction {
    var me: ExecuteRestAction = this;
    return new ExecuteRestAction({ ...me, validation: validation });
  }

  public replaceVariables(): ExecuteRestAction {
    var text = JSON.stringify(this);
    var replacedText = new VariableSubstitution().replaceVariables(text, this.variables, this.secrets);
    var replaced:ExecuteRestAction = JSON.parse(replacedText);
    return replaced;
  }
}

export interface RestActionResult {
  status: number | string;
  statusText: string | undefined;
  headers: { [header: string]: string };
  headersSent: { [header: string]: string };
  body: RestActionResultBody | undefined;
  validated: IResponseValidation | undefined;
}

export interface RestActionResultBody {
  contentType: string;
  body: ArrayBuffer;
}

export class VariableSubstitution {
  public replaceVariables(text: string, variables: IVariableTable[] | undefined, secrets: ISecretTable[] | undefined): string {
    console.log(`replaceVariables[${text}]`);
    var matches = [...text.matchAll(regexp)];

    console.log(matches);
    matches.forEach(m => {
      text = this.substituteValue(text, m[0], m[1], variables, secrets);
    });

    return text;
  }

  private substituteValue(text: string, search: string, valueKey: string, overrideVariables: IVariableTable[] | undefined, overrideSecrets: ISecretTable[] | undefined): string {
    var variables = overrideVariables?.filter(f => f.active == true);
    var secrets = overrideSecrets?.filter(f => f.active == true);
    var replaced = text.replace(search, this.findVariable(valueKey, variables, secrets));
    return replaced;
  }

  private findVariable(value: string, variables: IVariableTable[] | undefined, secrets: ISecretTable[] | undefined): string {
    console.log(`findVariable(${value})`)
    if (value.startsWith('$')) {
      value = value.substring(1);
      return secrets?.find(v => v.$secret == value)?.$value ?? "";
    } else {
      return variables?.find(v => v.variable == value)?.value ?? "";
    }
  }
}


export class RestActionValidation implements IRestActionValidation {
  type: ValidationType = ValidationType.None;
  httpCode: number = 200;
  headers: IHeaderTable[] = [];
  body: ValidationTypeBody = ValidationTypeBody.None;
  jsonSchema: IRestActionValidationJsonSchema | undefined;

  constructor(copy: IRestActionValidation) {
    this.type = copy.type;
    this.httpCode = copy.httpCode;
    this.headers = copy.headers;
    this.body = copy.body;
    this.jsonSchema = copy.jsonSchema;
  }

  public setType(type: ValidationType): RestActionValidation {
    var me: RestActionValidation = this;
    return new RestActionValidation({ ...me, type: type });
  }

  public setHttpCode(httpCode: number): RestActionValidation {
    var me: RestActionValidation = this;
    return new RestActionValidation({ ...me, httpCode: httpCode });
  }

  public setHeaders(headers: IHeaderTable[]): RestActionValidation {
    var me: RestActionValidation = this;
    return new RestActionValidation({ ...me, headers: headers });
  }

  public setJsonSchema(schema: IRestActionValidationJsonSchema | undefined): RestActionValidation {
    var me: RestActionValidation = this;
    if (schema == undefined)
      return new RestActionValidation({ ...me, jsonSchema: undefined, body: ValidationTypeBody.None });

    return new RestActionValidation({ ...me, jsonSchema: schema, body: ValidationTypeBody.JsonSchema });
  }
}

