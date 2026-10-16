import { WebSocketExpect } from '../model';
import { compileSchema } from '../validate';
import { SocketConnectError, SocketTransport } from './socket';

export interface WebSocketTestInput {
  url: string;
  headers: { [header: string]: string };
  /** Text frame sent once the socket opens. Nothing is sent when undefined or empty. */
  message?: string;
  expect: WebSocketExpect;
}

export interface ReceivedMessage {
  text: string;
  /** True when the message is JSON and passes the schema (true for any JSON when there is no schema). */
  matched: boolean;
}

export interface WebSocketTestResult {
  passed: boolean;
  errors: string[];
  messages: ReceivedMessage[];
  /** Set when the server closed the socket during the run. */
  closeCode?: number;
  closeReason?: string;
  /** Set when the connect failed with a rejected handshake (e.g. 401). */
  connectStatus?: number;
}

/** Runs one bounded websocket test (spec "Test run semantics" steps 2-7) on the given transport. */
export function runWebSocketTest(socket: SocketTransport, input: WebSocketTestInput): Promise<WebSocketTestResult> {
  const { expect } = input;
  const required = Math.max(1, expect.count);
  const messages: ReceivedMessage[] = [];
  const errors: string[] = [];
  const result: WebSocketTestResult = { passed: false, errors, messages };

  let check: ((v: unknown) => boolean) | undefined;
  if (expect.schema?.schema) {
    try {
      check = compileSchema(JSON.parse(expect.schema.schema)) as (v: unknown) => boolean;
    } catch (error) {
      errors.push('JSON schema is invalid: ' + (error as Error).message);
      return Promise.resolve(result);
    }
  }

  const matches = (text: string): boolean => {
    let instance: unknown;
    try { instance = JSON.parse(text); } catch { return false; }
    return check ? check(instance) : true;
  };

  return new Promise<WebSocketTestResult>(resolve => {
    let done = false;
    let matchedCount = 0;
    let requirementReached = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (passed: boolean, error?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timeoutTimer);
      clearTimeout(settleTimer);
      if (error) errors.push(error);
      result.passed = passed && errors.length == 0;
      try { socket.close(); } catch { /* already closed */ }
      resolve(result);
    };

    const reached = () => {
      requirementReached = true;
      clearTimeout(timeoutTimer);
      // Keep listening for late extras only when they would fail the test
      if (expect.extras == 'fail' && expect.settle > 0)
        settleTimer = setTimeout(() => finish(true), expect.settle);
      else
        finish(true);
    };

    socket.onMessage(text => {
      if (done) return;
      const matched = matches(text);
      messages.push({ text, matched });

      if (requirementReached) { // an extra, only seen while settling
        if (expect.extras == 'fail') finish(false, 'Unexpected extra message: ' + text);
        return;
      }

      if (matched) {
        matchedCount++;
        if (matchedCount >= required) reached();
      } else if (expect.match == 'all') {
        finish(false, 'Message ' + messages.length + ' did not match the schema: ' + text);
      } else if (expect.extras == 'fail') {
        finish(false, 'Extra message (did not match the schema): ' + text);
      }
    });

    socket.onClose((code, reason) => {
      if (done) return;
      result.closeCode = code;
      result.closeReason = reason;
      if (requirementReached) finish(true); // closed while settling: nothing more can arrive
      else finish(false, 'Server closed the socket (code ' + code + (reason ? ', ' + reason : '') + ') after '
        + matchedCount + ' of ' + required + ' expected messages');
    });

    socket.onError(error => {
      if (done || requirementReached) return;
      finish(false, 'Socket error: ' + error.message);
    });

    timeoutTimer = setTimeout(() => {
      finish(false, 'Timed out after ' + expect.timeout + 'ms with ' + matchedCount + ' of ' + required + ' expected messages');
    }, expect.timeout);

    socket.connect(input.url, input.headers).then(
      () => {
        if (done) return;
        try {
          if (input.message) socket.send(input.message);
        } catch (error) {
          finish(false, 'Send failed: ' + (error as Error).message);
        }
      },
      (error: Error) => {
        const status = error instanceof SocketConnectError ? error.status : undefined;
        if (status != undefined) result.connectStatus = status;
        finish(false, 'Connect failed: ' + error.message + (status != undefined ? ' (status ' + status + ')' : ''));
      });
  });
}
