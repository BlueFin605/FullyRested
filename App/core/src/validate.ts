import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { ResponseValidation, RestActionValidation, ValidationType, ValidationTypeBody } from './model';
import { IExecuteRestAction, RestActionResult } from './builder';
import { substituteDeep } from './substitution';
import { bodyToString } from './content-type';

const valid = (): ResponseValidation => ({ information: [], errors: [], valid: true });
const invalid = (errors: string[]): ResponseValidation => ({ information: [], errors, valid: false });

// undefined means "no validation configured"
export function validateResponse(action: IExecuteRestAction, response: RestActionResult): ResponseValidation | undefined {
  if (action.validation == undefined || action.validation.type == ValidationType.None)
    return undefined;

  const validation = substituteDeep(action.validation, action.variables, action.secrets);

  if (validation.httpCode != response.status)
    return invalid([`Http response code does not match '${validation.httpCode}'`]);

  // ValidationType.HeadersBody contains both 'Headers' and 'Body'
  if (validation.type.includes(ValidationType.Body)) {
    const body = validateBody(validation, response);
    if (!body.valid)
      return body;
  }

  if (validation.type.includes(ValidationType.Headers))
    return validateHeaders(validation, response);

  return valid();
}

export function validateBody(validation: RestActionValidation, response: RestActionResult): ResponseValidation {
  const text = bodyToString(response.body?.contentType, response.body?.body);

  if (validation.body == ValidationTypeBody.None)
    return text.length > 0 ? invalid(['Response had payload when none was expected']) : valid();

  if (text.length == 0)
    return invalid(['No response body but has validation']);

  let instance: unknown;
  try {
    instance = JSON.parse(text);
  } catch {
    return invalid(['Response body is not valid JSON']);
  }

  return validateJson(instance, validation.jsonSchema?.schema ?? '{}');
}

// Header names are compared case-insensitively (HTTP clients lower-case them), values exactly
export function validateHeaders(validation: RestActionValidation, response: RestActionResult): ResponseValidation {
  const actual = Object.entries(response.headers ?? {});
  const errors = validation.headers
    .filter(expected => expected.active == true)
    .filter(expected => !actual.some(([key, value]) => key.toLowerCase() == expected.key.toLowerCase() && value == expected.value))
    .map(expected => `incorrect header key[${expected.key}] value[${expected.value}]`);

  return errors.length == 0 ? valid() : invalid(errors);
}

// Every schema is treated as JSON Schema draft 2020-12; its $schema keyword is ignored
export function validateJson(instance: unknown, schemaText: string): ResponseValidation {
  let schema: unknown;
  try {
    schema = JSON.parse(schemaText);
  } catch {
    return invalid(['JSON schema is not valid JSON']);
  }

  if (schema !== null && typeof schema === 'object' && !Array.isArray(schema)) {
    const { $schema: _ignored, ...rest } = schema as { [key: string]: unknown };
    schema = rest;
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  let check;
  try {
    check = ajv.compile(schema as object);
  } catch (error) {
    return invalid([`JSON schema is invalid: ${(error as Error).message}`]);
  }

  if (check(instance))
    return valid();

  return invalid((check.errors ?? []).map(e => `${e.instancePath || '/'} ${e.message}`));
}

// Codes offered in the validation editor. Negative codes are network failures reported by executeRequest.
export const HTTP_RESPONSE_CODES: { code: number, desc: string }[] = [
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
  { code: -3, desc: 'Connection timed out [ETIMEDOUT]' },
  { code: -4, desc: 'No service listening [ECONNREFUSED]' },
  { code: -5, desc: 'Connection aborted [ECONNABORTED]' },
  { code: -6, desc: 'Host unreachable [EHOSTUNREACH]' },
  { code: -7, desc: 'DNS lookup timeout [EAI_AGAIN]' },
  { code: -8, desc: 'Error no entity [ENOENT]' },
];
