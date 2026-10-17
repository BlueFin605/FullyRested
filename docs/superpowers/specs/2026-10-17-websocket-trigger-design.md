# WebSocket triggers — design

Date: 2026-10-17 · Branch: `feature/websocket-support` · Board: WebSocket Support
Builds on: `docs/superpowers/specs/2026-10-17-websocket-design.md`

## Problem

A websocket test opens a socket, sends its `message`, then waits for `expect.count`
messages. Many servers (BlueFinWiki's realtime endpoint among them) push events only
when *something else* happens — a REST write — and ignore client frames. A single
FullyRested run cannot cause that write: the websocket case blocks until it passes or
times out, and cases in a folder run strictly in sequence.

Today the BlueFinWiki suite works around this with `backend/tests/api/ws-trigger.mjs`,
a script started by hand beside the run. That breaks the "one `run`, any front end"
promise, and blocks the MCP-only full run (ticket `9a7e5b90`).

## Goal

A websocket request can name an HTTP request in the same collection as its **trigger**.
Running the websocket request opens the socket, sends the message, fires the trigger,
and checks the expect rules — in one case, from the CLI, MCP, or the desktop app, with
no outside script.

Out of scope for v1: capturing values from the trigger's response (for example a
created guid) and a paired cleanup request. Both need response capture (ticket
`806ce7a9`). v1 points triggers at idempotent writes (a PUT on a fixture page),
which still produce the events and leave nothing behind.

## Model

`RestAction` (in `core/src/model.ts`) gains one optional field, used only when
`type` is `websocket`:

```ts
export type TriggerRepeat = 'once' | 'until-done';

export interface WebSocketTrigger {
    request: string;        // locator of an http request in the same collection, e.g. "pages/touch fixture"
    run?: string;           // optional run of that request
    repeat: TriggerRepeat;  // default 'until-done'
    interval: number;       // ms between firings when repeating; default 1000
    delay: number;          // ms to wait after the message is sent before the first firing; default 0
}

// on RestAction:
trigger?: WebSocketTrigger;
```

A missing `trigger` means no trigger, so every existing file loads unchanged.

`until-done` is the default because a first firing can race the server's subscription
of the new socket; repeating until the expect rules are met (or the test times out)
removes that race without the user tuning a delay.

Validation on save: `request` must resolve to an **http** request in the same
collection (not itself, not a websocket request); `interval` ≥ 100; `delay` ≥ 0.

## Core owns the trigger loop

`runWebSocketTest(socket, input)` in `core/src/websocket/test-run.ts` gains an
optional `trigger` on its input:

```ts
export interface TriggerFirer {
    repeat: TriggerRepeat;
    interval: number;
    delay: number;
    /** Sends the trigger request once and returns what happened. Never throws. */
    fire(): Promise<TriggerCall>;
}

export interface TriggerCall {
    at: number;            // ms since the test started
    status?: number;       // HTTP status, when a response came back
    error?: string;        // network error or resolve failure
    ms: number;
}
```

After the socket opens and the message is sent, the runner waits `delay`, calls
`fire()`, and — for `until-done` — calls it again every `interval` ms until the test
finishes (pass, fail, or timeout). It never fires after the test finishes, and never
has two firings in flight at once. `TriggerCall`s are returned on the result as
`triggerCalls`.

A trigger failure does not fail the test by itself — the expect rules decide. But the
result's error text names the trigger when the test times out and every trigger call
failed (for example "timed out waiting for 1 message; trigger returned 401 on all 7
calls"), so a timeout explains itself.

The firer is a callback, not a request, so core stays free of host concerns: each host
resolves the trigger request its own way (as it already does for the websocket
request) and hands core a `fire` bound to it. Core keeps sole ownership of timing,
repetition and the "stop when done" rule — the logic every front end must agree on.

## Hosts

### CLI and MCP (`App/cli-command`)

Both already share `ws-run.ts`. `runWebSocketCase` gains:

1. Resolve the trigger locator against the loaded tree (`requestFor`/locator lookup,
   as `run --action` does), with the same environment, and `replaceVariables()`.
2. Build `fire()` around core's `executeRequest`, returning a `TriggerCall`.
3. Pass it to `runWebSocketTest`.

`run` itself needs no change: a websocket case with a trigger is still one case.

Authoring:

- CLI: `fullyrested edit set-trigger --scope <ws request> --request <locator>
  [--run <name>] [--repeat once|until-done] [--interval <ms>] [--delay <ms>]`, and
  `--clear` to remove it.
- MCP: `set_trigger` tool with the same fields (`clear: true` removes it).
- `tree` / `show_request` (MCP) and `edit show` (CLI) show a websocket request's
  `expect` and `trigger`. (Closes the "tree hides expect" gap from the BlueFinWiki
  suite.)

### Desktop app (`App/FullyRested`)

The renderer resolves requests and sends them to the main process over IPC
(`runWsTest`). It adds the resolved trigger request to the payload; `ws-sessions.js`
builds `fire()` with core's `executeRequest` in the main process (where Node HTTP is
available) and passes it to `runWebSocketTest`. The existing `collection-access.js`
guard applies to the payload's `root` as today.

UI:

- **Websocket request editor:** a Trigger section — a dropdown of the collection's
  http requests (and their runs), repeat mode, interval, delay, and a Clear button.
- **Result view:** trigger calls listed under the received messages (time, status).
- **Live panel:** a "Fire request" button with the same dropdown, to send any http
  request while a live session is open. Live sessions are open-ended, so they need no
  repeat logic — this is a one-shot send through the normal HTTP path.

### Live sessions in MCP

No change. An agent can already `ws_session_open`, then `run` an http request, then
`ws_session_events`, because the session stays open between calls. The README's
agent section gains a short example of that pattern.

## Run record

A websocket case's record (`run-record.ts`, `WebSocketRecord`) gains `triggerCalls`,
each `{ at, status?, error?, ms }`. No request or response bodies are recorded for
trigger calls (they are not the thing under test), so redaction has nothing new to
cover beyond the error text, which goes through the existing scrubber.

## Errors

- Trigger locator does not resolve, or names a websocket request: the case errors
  before connecting, with the locator in the message (as a bad `--action` does).
- Trigger request fails to resolve variables or secrets: same, before connecting.
- Trigger HTTP call fails (network error, 4xx, 5xx): recorded as a `TriggerCall`;
  the test continues; see the timeout message rule above.

## Testing

- Core (`test-run.test.ts`, fake socket and fake firer with fake timers): fires after
  send and after `delay`; `once` fires exactly once; `until-done` repeats at
  `interval` and stops on pass, on fail, and on timeout; never overlaps a slow
  `fire`; never fires after finish; trigger calls on the result; timeout message names
  an all-failed trigger.
- Model/authoring: `set_trigger` verb validation (http only, not self, interval
  bounds), defaults, clear; a file without `trigger` loads unchanged.
- CLI: `run` on a websocket request whose trigger is an http request against a local
  test server that pushes a websocket message on each http hit — passes in one run,
  no outside script. `edit set-trigger` round trip.
- MCP: `set_trigger` and a `run` that passes through the in-process harness.
- Electron: main-process test (`npm run test:main`) for `runWsTest` with a trigger
  payload and a fake transport. Renderer checks by hand.
- Dogfood: rewrite the BlueFinWiki `ws` cases to use a trigger on a fixture PUT,
  delete `ws-trigger.mjs`, and run the whole suite through MCP `run` alone
  (unblocks `9a7e5b90`).

## Docs

`README.md` (websocket section and the agent section) and `SYSDOC.md` (core
websocket area and the run record) describe triggers. BlueFinWiki's
`backend/tests/api/README.md` drops the trigger-script instructions.
