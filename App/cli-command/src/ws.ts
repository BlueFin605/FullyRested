import * as path from 'path';
import {
  LiveSession, RequestNode, SecretStore, SessionEvent, SocketFactory
} from '@fullyrested/core';
import { loadTree } from './files';
import { findEnvironment, requestFor, setup, UsageError } from './run';
import { isWebSocketRequest, newTransport, resolveWebSocketTarget } from './ws-run';

export interface WatchOptions {
  collection?: string;
  environment?: string;
  run?: string;
  /** Messages to send as soon as the session opens, in order. */
  send?: string[];
  json?: boolean;
}

export interface WatchIo {
  /** The event stream. Nothing else is written here. */
  out(line: string): void;
  /** Warnings and errors. */
  warn(line: string): void;
}

const POLL_MS = 25;

// The one session this process holds. `ws send` writes into it; it exists only while `ws watch` runs.
let active: LiveSession | undefined;

export function activeSession(): LiveSession | undefined {
  return active;
}

/** Sends into the session this process is watching. Throws a UsageError when there is none. */
export function sendToActiveSession(message: string): void {
  if (active == undefined || active.closed)
    throw new UsageError('No open session in this process. A session lives only while `ws watch` runs; use `ws watch --send <message>` to send into it.');
  const result = active.send(message);
  if (!result.ok)
    throw new Error(result.error);
}

export function formatEvent(event: SessionEvent, json: boolean): string {
  if (json)
    return JSON.stringify(event);
  return event.kind == 'message'
    ? event.text
    : `[closed ${event.code}${event.reason ? ' ' + event.reason : ''}]`;
}

const isUrl = (target: string) => /^wss?:\/\//i.test(target);

async function resolveTarget(target: string, options: WatchOptions, store: SecretStore): Promise<{ connectUrl: string; headers: { [h: string]: string } }> {
  if (isUrl(target))
    return { connectUrl: target, headers: {} };

  if (options.collection == undefined)
    throw new UsageError('Give a ws:// or wss:// url, or a request file with -c <collection>');

  const collection = options.collection;
  return setup(async () => {
    const root = await loadTree(collection, store);
    const environment = findEnvironment(root.config, options.environment);
    const request: RequestNode = await requestFor(target, root, path.dirname(path.resolve(collection)), store);
    if (!isWebSocketRequest(request))
      throw new UsageError(`'${request.name}' is not a websocket request (set its type with 'edit set-type')`);
    const node = options.run == undefined ? request : request.run(options.run);
    const resolved = await resolveWebSocketTarget(node, environment.id);
    return { connectUrl: resolved.connectUrl, headers: resolved.headers };
  });
}

/**
 * Opens a session on a websocket request or url and streams its events through io.out until the
 * server closes it or `stop` aborts (Ctrl+C), then closes the session. Resolves with true when the
 * session ended cleanly (normal close or interrupt). Rejects when the connect fails.
 */
export async function watchSession(
  target: string,
  options: WatchOptions,
  store: SecretStore,
  io: WatchIo,
  stop: AbortSignal,
  factory: SocketFactory = newTransport
): Promise<boolean> {
  const { connectUrl, headers } = await resolveTarget(target, options, store);
  // The url may carry a token, so the connect error is reported without it
  let session: LiveSession;
  try {
    session = await LiveSession.open(factory(), connectUrl, headers);
  } catch (error) {
    throw new Error(`Could not connect: ${(error as Error).message.split(connectUrl).join('<url>')}`);
  }
  active = session;

  try {
    for (const message of options.send ?? []) {
      const sent = session.send(message);
      if (!sent.ok)
        io.warn(`warning: could not send: ${sent.error}`);
    }

    let cursor = 0;
    let clean = true;
    const drain = () => {
      const read = session.readEvents(cursor);
      cursor = read.lastSeq;
      for (const event of read.events) {
        io.out(formatEvent(event, options.json === true));
        if (event.kind == 'close' && event.code != 1000 && event.code != 1005)
          clean = false;
      }
      return read.closed;
    };

    await new Promise<void>(resolve => {
      const done = () => { clearInterval(timer); stop.removeEventListener('abort', done); resolve(); };
      const timer = setInterval(() => { if (drain()) done(); }, POLL_MS);
      stop.addEventListener('abort', done);
      if (stop.aborted) done();
    });

    if (!session.closed)
      session.close();
    drain();
    return clean;
  } finally {
    active = undefined;
  }
}
