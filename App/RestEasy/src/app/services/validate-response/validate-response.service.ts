import { Injectable } from '@angular/core';
import { OutputUnit, addSchema, validate } from "@hyperjump/json-schema/draft-2020-12";
import { ContentTypeHelperService } from '../content-type-helper/content-type-helper.service';
import { Collection, ValidationType, RestActionValidation, ValidationTypeBody } from '../../../../../shared/runner';
import { IExecuteRestAction, RestActionResult, VariableSubstitution } from '../../../../../shared/builder/src';
import { ResponseValidation } from '../../../../../shared/validator/src';


@Injectable({
  providedIn: 'root'
})
export class ValidateResponseService {

  constructor(private contentTypeHelper: ContentTypeHelperService) { }

  public async validateResponse(action: IExecuteRestAction,
                                response: RestActionResult,
                                collection: Collection | undefined): Promise<ResponseValidation | undefined> {
    
    console.log('validating response json schema')
    console.log(action.validation?.jsonSchema?.schema);
    
    if (action.validation == undefined || action.validation.type == ValidationType.None) {
      console.log('no validation configured');
      return undefined;
    }
    
    console.log('replace variables in validation');
    var validationAsText = JSON.stringify(action.validation);

    validationAsText = new VariableSubstitution().replaceVariables(validationAsText, action.variables, action.secrets);
    var validation = JSON.parse(validationAsText);
    console.log(validation);

    if (validation.httpCode != response.status) {
      return { information: [], errors: [`Http response code does not match '${validation.httpCode}'`], valid: false };
    }

    if (validation.type.includes(ValidationType.Body)) {
      var bValid = await this.validatePayload(validation, response);
      if (bValid.valid == false)
         return bValid;
    }

    if (validation.type.includes(ValidationType.Headers)) {
      return this.validateHeaders(validation, response);
    }

    return { information: [], errors: [], valid: true };
  }

  public async validatePayload(validation: RestActionValidation, response: RestActionResult): Promise<ResponseValidation> {
    console.log('validatePayload');

    if (validation?.body == ValidationTypeBody.None) {
      if (response.body != undefined) {
        return { information: [], errors: [`Response had payload when none was expected`], valid: false };
      }

      return { information: [], errors: [], valid: true };
    }

    if (response.body == undefined) {
      console.log('No response body but has validation');
      return { information: [], errors: ['No response body but has validation'], valid: false };
    }
    // return this.validateJsonString({name: "Alice", age: 25}, action.validation?.jsonSchema?.schema ?? "{}");
    // let schema = {
    //   type: "object",
    //   $schema: "https://json-schema.org/draft/2020-12/schema",
    //   properties: {
    //     name: {
    //       type: "string"
    //     },
    //     age: {
    //       type: "integer"
    //     }
    //   }
    // };

    // var objSchema = {
    //     $schema: "https://json-schema.org/draft/2020-12/schema",
    //     type: "string"
    //   };
    // var objValidate = "string";

    var objValidate = JSON.parse(this.contentTypeHelper.convertArrayBufferToString(response.body.contentType, response.body.body));
    var objSchema = JSON.parse(validation?.jsonSchema?.schema ?? "{}");
    var errors = await this.validateJsonString(objValidate, objSchema);
    return { information: [], errors: errors, valid: errors.length == 0 };
  }


  validateHeaders(validation: RestActionValidation, response: RestActionResult): ResponseValidation | PromiseLike<ResponseValidation | undefined> | undefined {
    console.log('ValidateHeaders');
    console.log(validation?.headers);
    console.log(response.headers);
    // return { information: [], errors: [], valid: true };

    var head = this.getHeadersAsArray(response.headers);
    console.log(head);
    var mismatched = validation?.headers.filter(a => a.active == true && head.find(f => f.key == a.key && f.value == a.value) == undefined).map(m => `incorrect header key[${m.key}] value[${m.value}]`);
    console.log(mismatched);
    return { information:[], errors: mismatched ?? [], valid: mismatched?.length == 0};
  }

  getHeadersAsArray(headers: { [header: string]: string; }): {key: string; value: string;}[] {
    if (headers == undefined)
       return [];
          
    return Object.entries(headers).map(h => {return {key: h[0], value: h[1]}});
  }

  async validateJsonString(jsonObject: any, schemaObject: object): Promise<string[]> {
    addSchema((schemaObject as any), "http://example.com/schemas/string");
    const output = await validate("http://example.com/schemas/string", jsonObject, "DETAILED");
    console.log(output);
    if (output.valid) {
      console.log("Instance is valid :-)");
    } else {
      console.log("Instance is invalid :-(");
    }

    var errors = output?.errors?.map((m: any) => this.getAbsoluteKeywordLocationArray(m)) ?? [];
    // var test = this.getAbsoluteKeywordLocationArray(output.errors).flat(Infinity);
    return errors.flat(Infinity).flatMap(e => `${e.instanceLocation} has failed schema constraint ${e?.absoluteKeywordLocation}`) ?? [];
  }

  getAbsoluteKeywordLocationArray(json: OutputUnit): any[] {
    if (json == undefined)
      return [];

    return [{ instanceLocation: json.instanceLocation, absoluteKeywordLocation: json.absoluteKeywordLocation }, json?.errors?.map(m => this.getAbsoluteKeywordLocationArray(m)) ?? []];
  }

  public httpResponses = [
    { code: 200, desc: 'OK' },
    { code: 100, desc: 'Continue' },
    { code: 101, desc: 'Switching Protocols' },
    { code: 102, desc: 'Processing' },
    { code: 103, desc: 'Early Hints' },
    { code: 201, desc: 'Created' },
    { code: 202, desc: 'Accepted' },
    { code: 203, desc: 'Non-Authoritative Information' },
    { code: 204, desc: 'No Content' },
    { code: 205, desc: 'Reset Content' },
    { code: 206, desc: 'Partial Content' },
    { code: 207, desc: 'Multi-Status' },
    { code: 208, desc: 'Already Reported' },
    { code: 226, desc: 'IM Used' },
    { code: 300, desc: 'Multiple Choices' },
    { code: 301, desc: 'Moved Permanently' },
    { code: 302, desc: 'Found' },
    { code: 303, desc: 'See Other' },
    { code: 304, desc: 'Not Modified' },
    { code: 307, desc: 'Temporary Redirect' },
    { code: 308, desc: 'Permanent Redirect' },
    { code: 400, desc: 'Bad Request' },
    { code: 401, desc: 'Unauthorized' },
    { code: 402, desc: 'Payment Required' },
    { code: 403, desc: 'Forbidden' },
    { code: 404, desc: 'Not Found' },
    { code: 405, desc: 'Method Not Allowed' },
    { code: 406, desc: 'Not Acceptable' },
    { code: 407, desc: 'Proxy Authentication Required' },
    { code: 408, desc: 'Request Timeout' },
    { code: 409, desc: 'Conflict' },
    { code: 410, desc: 'Gone' },
    { code: 411, desc: 'Length Required' },
    { code: 412, desc: 'Precondition Failed' },
    { code: 413, desc: 'Content Too Large' },
    { code: 414, desc: 'URI Too Long' },
    { code: 415, desc: 'Unsupported Media Type' },
    { code: 416, desc: 'Range Not Satisfiable' },
    { code: 417, desc: 'Expectation Failed' },
    { code: 421, desc: 'Misdirected Request' },
    { code: 422, desc: 'Unprocessable Content' },
    { code: 423, desc: 'Locked' },
    { code: 424, desc: 'Failed Dependency' },
    { code: 425, desc: 'Too Early' },
    { code: 426, desc: 'Upgrade Required' },
    { code: 428, desc: 'Precondition Required' },
    { code: 429, desc: 'Too Many Requests' },
    { code: 431, desc: 'Request Header Fields Too Large' },
    { code: 451, desc: 'Unavailable for Legal Reasons' },
    { code: 500, desc: 'Internal Server Error' },
    { code: 501, desc: 'Not Implemented' },
    { code: 502, desc: 'Bad Gateway' },
    { code: 503, desc: 'Service Unavailable' },
    { code: 504, desc: 'Gateway Timeout' },
    { code: 505, desc: 'HTTP Version Not Supported' },
    { code: 506, desc: 'Variant Also Negotiates' },
    { code: 507, desc: 'Insufficient Storage' },
    { code: 508, desc: 'Loop Detected' },
    { code: 511, desc: 'Network Authentication Required' },
    { code: -1, desc: 'Invalid hostname [ENOTFOUND]' },
    { code: -2, desc: 'Connection closed [ECONNRESET]' },
    { code: -3, desc: 'Conection timed out [ETIMEDOUT' },
    { code: -4, desc: 'No service listening [CONNREFUSED' },
    { code: -5, desc: 'Connection aborted [CONNABORTED' },
    { code: -6, desc: 'Host unreachable [HOSTUNREACH' },
    { code: -7, desc: 'DNS Lookup timeout [AI_AGAIN' },
    { code: -8, desc: 'Error no entity [ENOENT' },
  ]
}
