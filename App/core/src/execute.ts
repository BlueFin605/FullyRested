import axios from 'axios';
import { RestActionBody, RestTypeVerb } from './model';
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
// Never throws: network failures come back as a negative status.
export async function executeRequest(action: IExecuteRestAction): Promise<RestActionResult> {
  try {
    const request = await applyAuthentication(prepareRequest(action), action.authentication);

    const response = await axios.request({
      method: request.method,
      url: request.url,
      headers: request.headers,
      data: request.body,
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
  const body = serializeBody(bodyDetails);
  const headers = { ...action.headers };

  const hasContentType = Object.keys(headers).some(h => h.toLowerCase() == 'content-type');
  if (body !== undefined && !hasContentType && bodyDetails)
    headers['content-type'] = bodyDetails.contentType;

  return { method, url: `${action.protocol}://${action.url}`, headers, body };
}

function serializeBody(body: RestActionBody | undefined): string | undefined {
  // application/x-www-form-urlencoded bodies are not implemented yet, so nothing is sent for them
  if (!body || !body.contentType || body.contentType == 'none' || body.contentType == 'application/x-www-form-urlencoded')
    return undefined;

  if (body.body == undefined)
    return undefined;

  return typeof body.body == 'string' ? body.body : JSON.stringify(body.body);
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
