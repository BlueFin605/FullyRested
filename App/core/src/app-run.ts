import { PreparedRequest } from './auth';
import { RestActionResult } from './builder';
import { ResponseValidation, SecretTable } from './model';
import { newAppRunId } from './file-run-store';
import { redactCase } from './redact';
import { RunRecord, buildCaseRecord } from './run-record';

// What the app knows about the node it just sent. kind picks the locator; path is the request's
// collection-relative file path, which both RequestNode.path and RunNode.path already give.
export interface AppSendNode {
  kind: 'request' | 'run';
  name: string;
  path: string;
  runName?: string;
}

export interface AppSendInput {
  collection: string;                 // the open collection's .frcol path
  environment?: string;               // the active environment's NAME, omitted when none
  node: AppSendNode;
  request?: PreparedRequest;          // prepareRequest(substituted); undefined when resolve failed
  result?: RestActionResult;
  validation?: ResponseValidation;
  error?: string;
  ms: number;
  secrets: SecretTable[] | undefined; // the resolved node's secrets, so redactCase can mask values
  runId?: string;                     // tests pin these; production leaves them out
  startedAt?: string;
}

export function appSelection(node: AppSendNode): string {
  return node.kind === 'run' ? `run:${node.path}#${node.runName ?? ''}` : `request:${node.path}`;
}

// One send is one run of one case. The app has no --include-secrets, so the record is always redacted.
export function buildAppRunRecord(input: AppSendInput): RunRecord {
  const built = buildCaseRecord({
    index: 1,
    name: input.node.name,
    requestFile: input.node.path,
    runName: input.node.runName,
    ms: input.ms,
    request: input.request,
    response: input.result,
    validation: input.validation,
    error: input.error
  });

  const record: RunRecord = {
    runId: input.runId ?? newAppRunId(),
    startedAt: input.startedAt ?? new Date().toISOString(),
    collection: input.collection,
    selection: appSelection(input.node),
    redacted: true,
    cases: [redactCase(built, input.secrets)]
  };
  if (input.environment !== undefined) record.environment = input.environment;
  return record;
}

export interface AppScopeCase {
  node: AppSendNode;
  request?: PreparedRequest;
  result?: RestActionResult;
  validation?: ResponseValidation;
  error?: string;
  ms: number;
  secrets: SecretTable[] | undefined; // this case's own secrets; redactCase masks only these
}

export interface AppScopeInput {
  collection: string;
  environment?: string;
  selection: string;                  // e.g. 'collection' or 'folder:users'
  cases: AppScopeCase[];
  runId?: string;
  startedAt?: string;
}

// A branch run from the app: one record, one case per request sent, each redacted with its own secrets.
export function buildScopeRunRecord(input: AppScopeInput): RunRecord {
  const cases = input.cases.map((c, i) => redactCase(buildCaseRecord({
    index: i + 1,
    name: c.node.name,
    requestFile: c.node.path,
    runName: c.node.runName,
    ms: c.ms,
    request: c.request,
    response: c.result,
    validation: c.validation,
    error: c.error
  }), c.secrets));

  const record: RunRecord = {
    runId: input.runId ?? newAppRunId(),
    startedAt: input.startedAt ?? new Date().toISOString(),
    collection: input.collection,
    selection: input.selection,
    redacted: true,
    cases
  };
  if (input.environment !== undefined) record.environment = input.environment;
  return record;
}
