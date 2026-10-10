import { ResponseValidation, ValidationCheck } from './model';
import { RestActionResult } from './builder';
import { PreparedRequest } from './auth';

export interface RecordBody { contentType?: string; bytes: number; text?: string; base64?: string }

export interface CaseRecord {
  index: number;
  name: string;
  requestFile: string;
  runName?: string;
  outcome: 'pass' | 'fail' | 'error';
  ms: number;
  request: { method: string; url: string; headers: Record<string, string>; body?: RecordBody };
  response?: { status: number; statusText?: string; headers: Record<string, string>; body?: RecordBody };
  validation?: { valid: boolean; checks: ValidationCheck[] };
  error?: string;
}

export interface RunRecord {
  runId: string;
  startedAt: string;
  collection: string;
  environment?: string;
  selection: string;
  redacted: boolean;
  cases: CaseRecord[];
}

export interface CaseInput {
  index: number;
  name: string;
  requestFile: string;
  runName?: string;
  ms: number;
  request?: PreparedRequest;          // from prepareRequest(); undefined when resolve failed
  response?: RestActionResult;
  validation?: ResponseValidation;
  error?: string;
}

const TEXTUAL = /json|text|xml|javascript|x-www-form-urlencoded|yaml|csv|html/i;

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find(k => k.toLowerCase() === name);
  return key === undefined ? undefined : headers[key];
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function requestBody(request: PreparedRequest): RecordBody | undefined {
  if (request.body === undefined || request.body === '') return undefined;
  const body: RecordBody = { bytes: new TextEncoder().encode(request.body).length, text: request.body };
  const contentType = headerValue(request.headers, 'content-type');
  if (contentType !== undefined) body.contentType = contentType;
  return body;
}

function responseBody(result: RestActionResult): RecordBody | undefined {
  if (!result.body || result.body.body.byteLength === 0) return undefined;
  const { contentType, body } = result.body;
  const record: RecordBody = { contentType, bytes: body.byteLength };
  if (TEXTUAL.test(contentType ?? '')) record.text = new TextDecoder().decode(body);
  else record.base64 = toBase64(body);
  return record;
}

export function buildCaseRecord(input: CaseInput): CaseRecord {
  const { response, request, validation } = input;
  // A negative or string status means no HTTP response came back
  const status = typeof response?.status === 'number' && response.status >= 0 ? response.status : undefined;
  const noResponse = response !== undefined && status === undefined;

  const sent = response && Object.keys(response.headersSent ?? {}).length > 0 ? response.headersSent : request?.headers ?? {};
  const record: CaseRecord = {
    index: input.index,
    name: input.name,
    requestFile: input.requestFile,
    outcome: 'pass',
    ms: input.ms,
    request: { method: request?.method ?? '', url: request?.url ?? '', headers: { ...sent } }
  };
  if (input.runName !== undefined) record.runName = input.runName;
  const reqBody = request ? requestBody(request) : undefined;
  if (reqBody) record.request.body = reqBody;

  if (response && status !== undefined) {
    record.response = { status, headers: { ...response.headers } };
    if (response.statusText !== undefined) record.response.statusText = response.statusText;
    const body = responseBody(response);
    if (body) record.response.body = body;
  }
  if (validation) record.validation = { valid: validation.valid, checks: validation.checks ?? [] };

  if (input.error !== undefined) {
    record.outcome = 'error';
    record.error = input.error;
  } else if (noResponse) {
    record.outcome = 'error';
    record.error = 'No response: ' + response!.statusText;
  } else if (validation && !validation.valid) {
    record.outcome = 'fail';
  }
  return record;
}

export function toCaseOutcomeCounts(cases: CaseRecord[]): { passed: number; failed: number; errored: number } {
  return {
    passed: cases.filter(c => c.outcome === 'pass').length,
    failed: cases.filter(c => c.outcome === 'fail').length,
    errored: cases.filter(c => c.outcome === 'error').length
  };
}
