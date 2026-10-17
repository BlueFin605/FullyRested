import {
  CaseRecord, ExecuteRestAction, RequestNode, RunNode, SocketFactory, SocketTransport, WebSocketExpect, applyAuthentication,
  buildWebSocketCaseRecord, normaliseExpect, redactCase, runWebSocketTest, substituteDeep, validateTimeoutMs, withQueryToken
} from '@fullyrested/core';
import { WsTransport } from './ws-transport';

export const newTransport: SocketFactory = () => new WsTransport();

export function isWebSocketRequest(node: RequestNode): boolean {
  return node.action.type == 'websocket';
}

export interface WebSocketTarget {
  /** The url without any query-string token. Safe to record and print. */
  url: string;
  /** The url to connect to: `url` plus the token when auth placement is a query parameter. */
  connectUrl: string;
  headers: { [header: string]: string };
  message: string;
  expect: WebSocketExpect;
}

/**
 * Resolves a websocket request (or one of its runs) into what the transport needs: variables and
 * secrets substituted, header auth applied, and a query-placed token added to the connect url.
 * Throws when the request cannot be resolved.
 */
export async function resolveWebSocketTarget(node: RequestNode | RunNode, environmentId: string | undefined): Promise<WebSocketTarget> {
  const request: ExecuteRestAction = node.resolve({ environmentId }).replaceVariables();
  const action = (node instanceof RunNode ? node.request : node).action;
  const url = request.url;
  const auth = request.authentication;
  const placement = auth?.placement ?? 'header';

  let headers = { ...request.headers };
  let connectUrl = url;
  if (auth?.authentication == 'bearertoken' && placement != 'header') {
    connectUrl = withQueryToken(url, placement, auth.bearerToken.token);
  } else {
    headers = (await applyAuthentication({ method: 'GET', url, headers, body: undefined }, auth)).headers;
  }

  return {
    url,
    connectUrl,
    headers,
    message: substituteDeep(action.message ?? '', request.variables, request.secrets),
    expect: normaliseExpect(action.expect)
  };
}

/** Runs one websocket request as a test case and returns its (redacted unless includeSecrets) record. */
export async function runWebSocketCase(
  base: { index: number; name: string; requestFile: string; runName?: string },
  node: RequestNode | RunNode,
  environmentId: string | undefined,
  includeSecrets: boolean,
  transport: SocketTransport = newTransport(),
  timeoutMs?: number
): Promise<CaseRecord> {
  let target: WebSocketTarget;
  let secrets;
  try {
    target = await resolveWebSocketTarget(node, environmentId);
    // A run-time override only: the saved request is not touched
    if (timeoutMs != undefined)
      target.expect = { ...target.expect, timeout: validateTimeoutMs(timeoutMs, 'timeout') };
    secrets = node.resolve({ environmentId }).secrets;
  } catch (error) {
    return buildWebSocketCaseRecord({ ...base, ms: 0, url: '', headers: {}, error: (error as Error).message });
  }

  const started = Date.now();
  const result = await runWebSocketTest(transport, {
    url: target.connectUrl, headers: target.headers, message: target.message, expect: target.expect
  });
  const record = buildWebSocketCaseRecord({
    ...base, ms: Date.now() - started, url: target.url, headers: target.headers, message: target.message, result
  });
  return includeSecrets ? record : redactCase(record, secrets);
}
