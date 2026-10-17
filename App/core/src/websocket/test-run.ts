import { TriggerRepeat, WebSocketExpect } from '../model';
import { IExecuteRestAction } from '../builder';
import { executeRequest } from '../execute';
import { compileSchema } from '../validate';
import { SocketConnectError, SocketTransport } from './socket';

export interface TriggerCall {
  /** Ms since the test started when the call started. */
  at: number;
  status?: number;
  error?: string;
  ms: number;
}

/** What one firing returned; the runner stamps `at` (and `ms` when the firer leaves it out). */
export interface TriggerOutcome {
  status?: number;
  error?: string;
  ms?: number;
}

/** Fires the trigger request once; must resolve with the outcome rather than throw. */
export interface TriggerFirer {
  repeat: TriggerRepeat;
  interval: number;
  delay: number;
  /** The signal aborts when the call times out or is still pending after the test finished. */
  fire(signal?: AbortSignal): Promise<TriggerOutcome>;
}

/** Longest a single trigger call may take (capped further by the test's own timeout). */
export const TRIGGER_CALL_TIMEOUT_MS = 10000;
/** How long a finished test waits for an in-flight trigger call to settle so it can be recorded. */
export const TRIGGER_FINISH_GRACE_MS = 1500;

/** Sends a resolved http request once as a trigger firing. Never throws. */
export async function fireTriggerRequest(
  request: IExecuteRestAction, signal?: AbortSignal, execute: typeof executeRequest = executeRequest
): Promise<TriggerOutcome> {
  const started = Date.now();
  let response;
  try {
    response = await execute(request, { signal });
  } catch (error) {
    return { error: String((error as Error)?.message ?? error), ms: Date.now() - started };
  }
  const ms = Date.now() - started;
  return typeof response.status == 'number' && response.status >= 0
    ? { status: response.status, ms }
    : { error: String(response.statusText || response.status), ms };
}

export interface WebSocketTestInput {
  url: string;
  headers: { [header: string]: string };
  /** Text frame sent once the socket opens. Nothing is sent when undefined or empty. */
  message?: string;
  expect: WebSocketExpect;
  /** Optional HTTP request fired after the message is sent, repeated until the test finishes. */
  trigger?: TriggerFirer;
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
  /** Every trigger firing, in order; empty when there is no trigger. */
  triggerCalls: TriggerCall[];
  /** Set when the server closed the socket during the run. */
  closeCode?: number;
  closeReason?: string;
  /** Set when the connect failed with a rejected handshake (e.g. 401). */
  connectStatus?: number;
}

/** Runs one bounded websocket test (spec "Test run semantics" steps 2-7) on the given transport. */
export function runWebSocketTest(socket: SocketTransport, input: WebSocketTestInput): Promise<WebSocketTestResult> {
  const { expect } = input;
  const testStart = Date.now();
  const required = Math.max(1, expect.count);
  const messages: ReceivedMessage[] = [];
  const errors: string[] = [];
  const result: WebSocketTestResult = { passed: false, errors, messages, triggerCalls: [] };

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
    let triggerStopped = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let triggerTimer: ReturnType<typeof setTimeout> | undefined;
    /** The firing in flight: settles (never rejects) once its call is recorded. */
    let inFlight: { started: number; controller: AbortController; settled: Promise<void>; cancel: () => void } | undefined;

    const stopTrigger = () => {
      triggerStopped = true;
      clearTimeout(triggerTimer);
    };

    const finish = (passed: boolean, error?: string | (() => string)) => {
      if (done) return;
      done = true;
      clearTimeout(timeoutTimer);
      clearTimeout(settleTimer);
      stopTrigger();
      try { socket.close(); } catch { /* already closed */ }

      const complete = (pending: boolean) => {
        const text = typeof error == 'function' ? error() : error;
        if (text) errors.push(text);
        if (pending && inFlight) {
          // Record the abandoned call; it can no longer change the result
          const call = inFlight;
          inFlight = undefined;
          call.cancel();
          result.triggerCalls.push({ at: call.started - testStart, error: 'still pending when the test finished', ms: Date.now() - call.started });
        }
        result.passed = passed && errors.length == 0;
        resolve(result);
      };

      if (!inFlight) { complete(false); return; }
      // Give the call that is in flight (usually the one that caused the pass) a moment to be recorded
      let grace: ReturnType<typeof setTimeout> | undefined;
      Promise.race([
        inFlight.settled.then(() => false),
        new Promise<boolean>(r => { grace = setTimeout(() => r(true), TRIGGER_FINISH_GRACE_MS); })
      ]).then(pending => { clearTimeout(grace); complete(pending); });
    };

    const fireOnce = (trigger: TriggerFirer): Promise<void> => {
      const started = Date.now();
      const controller = new AbortController();
      const limit = Math.min(expect.timeout, TRIGGER_CALL_TIMEOUT_MS);
      let callTimer: ReturnType<typeof setTimeout> | undefined;
      // Registered before fire() runs: a message it provokes synchronously can finish the test at once
      let markSettled!: () => void;
      const call = { started, controller, settled: new Promise<void>(r => { markSettled = r; }), cancel: () => { clearTimeout(callTimer); controller.abort(); } };
      inFlight = call;
      const timedOut = new Promise<TriggerOutcome>(r => {
        callTimer = setTimeout(() => {
          if (done) return; // the finish grace decides; it records the call as still pending
          controller.abort();
          r({ error: 'timed out after ' + limit + 'ms' });
        }, limit);
      });
      const attempt = (async (): Promise<TriggerOutcome> => {
        try { return await trigger.fire(controller.signal); }
        catch (error) { return { error: (error as Error)?.message ?? String(error) }; }
      })();
      return Promise.race([attempt, timedOut]).then(outcome => {
        clearTimeout(callTimer);
        if (inFlight !== call) return; // abandoned at finish, already recorded
        inFlight = undefined;
        const record: TriggerCall = { at: started - testStart, ms: outcome.ms ?? Date.now() - started };
        if (outcome.status != undefined) record.status = outcome.status;
        if (outcome.error != undefined) record.error = outcome.error;
        result.triggerCalls.push(record);
        markSettled();
      });
    };

    const startTrigger = () => {
      const trigger = input.trigger;
      if (!trigger) return;
      const schedule = (wait: number) => {
        triggerTimer = setTimeout(async () => {
          if (done || triggerStopped) return;
          await fireOnce(trigger);
          if (done || triggerStopped || trigger.repeat != 'until-done') return;
          schedule(trigger.interval);
        }, wait);
      };
      schedule(trigger.delay);
    };

    const triggerFailureNote = (pending: boolean): string => {
      const calls = result.triggerCalls;
      const stillPending = pending ? '; trigger call still pending' : '';
      if (calls.length == 0 || !calls.every(c => c.error != undefined || (c.status ?? 0) >= 400)) return stillPending;
      const last = calls[calls.length - 1];
      return '; trigger returned ' + (last.error != undefined ? last.error : last.status) + ' on all ' + calls.length + ' calls' + stillPending;
    };

    const reached = () => {
      requirementReached = true;
      clearTimeout(timeoutTimer);
      // The expect rules are met: provoking more messages could only turn the pass into an extras failure
      stopTrigger();
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
      // Built once the in-flight call has had its grace, so the note reflects what the trigger did
      finish(false, () => 'Timed out after ' + expect.timeout + 'ms with ' + matchedCount + ' of ' + required + ' expected messages'
        + triggerFailureNote(inFlight != undefined));
    }, expect.timeout);

    socket.connect(input.url, input.headers).then(
      () => {
        if (done) return;
        try {
          if (input.message) socket.send(input.message);
        } catch (error) {
          finish(false, 'Send failed: ' + (error as Error).message);
          return;
        }
        startTrigger();
      },
      (error: Error) => {
        const status = error instanceof SocketConnectError ? error.status : undefined;
        if (status != undefined) result.connectStatus = status;
        finish(false, 'Connect failed: ' + error.message + (status != undefined ? ' (status ' + status + ')' : ''));
      });
  });
}
