import axios from 'axios';
import { FORM_CONTENT_TYPE, FormField, MULTIPART_CONTENT_TYPE, RestActionBody, RestTypeVerb } from './model';
import { buildMultipart } from './multipart';
import { IExecuteRestAction, RestActionResult } from './builder';
import { applyAuthentication, PreparedRequest } from './auth';

// Status reported in RestActionResult when no HTTP response was received
export const NETWORK_ERROR_STATUS: { [code: string]: number } = {
  ENOTFOUND: -1,
  ECONNRESET: -2,
  ETIMEDOUT: -3,
  ECONNREFUSED: -4,
  ECONNABORTED: -5,
  EHOSTUNREACH: -6,
  EAI_AGAIN: -7,
  ENOENT: -8
};
export const UNKNOWN_ERROR_STATUS = -99;

// Sends a request whose variables have already been substituted (ExecuteRestAction.replaceVariables).
// Never throws: network failures (and an abort through options.signal) come back as a negative status.
export async function executeRequest(action: IExecuteRestAction, options: { signal?: AbortSignal } = {}): Promise<RestActionResult> {
  try {
    const request = await applyAuthentication(prepareRequest(action), action.authentication);

    const response = await axios.request({
      method: request.method,
      url: request.url,
      headers: request.headers,
      data: request.bodyBytes ?? request.body,
      signal: options.signal,
      responseType: 'arraybuffer',
      transformResponse: (data: unknown) => data,
      validateStatus: () => true
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: flattenHeaders(response.headers),
      headersSent: sentHeaders(response.request, request.headers),
      body: { contentType: String(response.headers['content-type'] ?? ''), body: response.data },
      validated: undefined
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    return {
      status: (code && NETWORK_ERROR_STATUS[code]) || UNKNOWN_ERROR_STATUS,
      statusText: code ?? (error as Error).message,
      headers: {},
      headersSent: {},
      body: undefined,
      validated: undefined
    };
  }
}

export function prepareRequest(action: IExecuteRestAction): PreparedRequest {
  const method = (action.verb == RestTypeVerb.option ? 'options' : action.verb).toUpperCase();
  const bodyDetails = action.body as RestActionBody | undefined;
  const headers = { ...action.headers };
  const contentTypeHeader = Object.keys(headers).find(h => h.toLowerCase() == 'content-type');

  if (bodyDetails && bodyDetails.contentType == MULTIPART_CONTENT_TYPE) {
    // The boundary is generated here, so a content-type header that names multipart/form-data without
    // one gets it; any other header (say application/json, to see a 415) is left as written and the
    // multipart bytes are sent under it.
    const multipart = buildMultipart(bodyDetails.body);
    const declared = contentTypeHeader == undefined ? undefined : headers[contentTypeHeader];
    if (declared == undefined || (/^\s*multipart\/form-data\s*(;|$)/i.test(declared) && !/boundary=/i.test(declared)))
      headers[contentTypeHeader ?? 'content-type'] = `${MULTIPART_CONTENT_TYPE}; boundary=${multipart.boundary}`;
    return { method, url: requestUrl(action.protocol, action.url), headers, body: multipart.text, bodyBytes: multipart.bytes };
  }

  const body = serializeBody(bodyDetails);
  if (body !== undefined && contentTypeHeader == undefined && bodyDetails)
    headers['content-type'] = bodyDetails.contentType;

  return { method, url: requestUrl(action.protocol, action.url), headers, body };
}

// The url a request is sent to. A url that already carries its scheme -- a captured presigned
// uploadUrl, say -- is used as it is; otherwise the request's protocol is put in front.
export function requestUrl(protocol: string, url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${protocol}://${url}`;
}

function serializeBody(body: RestActionBody | undefined): string | undefined {
  if (!body || !body.contentType || body.contentType == 'none')
    return undefined;

  if (body.contentType == FORM_CONTENT_TYPE)
    return serializeForm(body.body);

  if (body.body == undefined)
    return undefined;

  return typeof body.body == 'string' ? body.body : JSON.stringify(body.body);
}

// A form body is a table of { key, value, active } fields; inactive and unnamed ones are left out
function serializeForm(fields: unknown): string {
  const form = new URLSearchParams();
  for (const field of Array.isArray(fields) ? fields as FormField[] : [])
    if (field.active && field.key)
      form.append(field.key, field.value ?? '');
  return form.toString();
}

// The headers Node actually sent, including the ones axios added; falls back to what was asked for
function sentHeaders(request: unknown, requested: { [header: string]: string }): { [header: string]: string } {
  const getHeaders = (request as { getHeaders?: () => object } | undefined)?.getHeaders;
  return typeof getHeaders == 'function' ? flattenHeaders(getHeaders.call(request)) : requested;
}

function flattenHeaders(headers: object | undefined): { [header: string]: string } {
  const result: { [header: string]: string } = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value != undefined)
      result[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return result;
}
