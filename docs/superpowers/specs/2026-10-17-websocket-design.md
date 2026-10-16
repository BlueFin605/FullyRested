# WebSocket support — design

Date: 2026-10-17 · Branch: `feature/websocket-support`

## Goal

FullyRested sends HTTP calls only. This adds WebSocket support in two modes
that share one connection engine in core:

1. **Tests.** Send a message, then check the messages the server returns against
   a schema. A test is bounded: it passes or times out, and then the socket closes.
   Tests run in a suite the same way HTTP requests do today.
2. **Live sessions.** Open a socket on demand, watch events as they arrive (for
   example, card moves on a BlueFinWiki board triggered from another app), and
   send messages when needed. A session is open-ended and closes when the user
   closes it.

The CLI, the MCP server, and the Electron app are equal front ends. Each calls
core. None holds WebSocket logic of its own.

Out of scope for v1: binary frames, AWS SigV4 on the handshake, scripted
multi-step sessions (the expect list is the planned base for them), and saving
live-session events to disk.

## The request model

A request in a `.frreq` file gains a `type`:

| `type` | URL scheme | Behaviour |
|---|---|---|
| `http` (default, and what every existing file means) | `http://`, `https://` | Unchanged |
| `websocket` | `ws://`, `wss://` | Opens a socket and runs the websocket flow |

A websocket request reuses everything an HTTP request has: a URL with
`{{variables}}`, headers, auth, folder inheritance, environments, secrets, and
runs. Headers and auth are sent on the handshake.

Fields added for `websocket`:

- `message`: the text frame to send after the socket opens. JSON by default.
  Variables and secrets are substituted as they are for HTTP bodies.
- `expect` (test mode only):
  - `count`: the number of messages to wait for (N, at least 1).
  - `match`: `all` (default) or `any`.
  - `schema`: a JSON Schema, stored as text in the same shape as HTTP validation
    (`{ schema: "..." }`). Each received message is checked against it.
  - `extras`: `ignore` (default) or `fail`.
  - `timeout`: overall time limit in milliseconds for the test.
  - `settle`: milliseconds to keep listening after the test passes, so late
    extras are caught. Default 500. Used only when `extras` is `fail`.

Existing HTTP validation fields are not used by websocket requests.

A missing `type` means `http`, so every existing file loads unchanged.

## Test run semantics

1. Resolve settings (run → request → folders → environment → collection), as for HTTP.
2. Open the socket with the resolved URL, headers, and auth.
3. Send `message`.
4. Receive messages and check each one against `schema`:
   - `match: all`: every one of the first N must match. A non-matching message
     fails the test at once.
   - `match: any`: the test passes when one message matches. Non-matching messages
     before that are extras.
   - A message that is not valid JSON does not match.
5. Extras (messages after the count is reached, or non-matching messages under
   `any`):
   - `ignore`: skipped.
   - `fail`: fails the test. The test keeps listening for `settle` ms after it
     would otherwise pass, so an extra that arrives late still counts.
6. Pass when the required matches are met and no failure occurred. Fail on
   timeout, on a non-matching message under `match: all`, on a connection error
   before the count is met, or on an extra under `extras: fail`.
7. Close the socket. Record the result in a run record, as for HTTP. The record
   holds each received message, redacted in the same way as HTTP bodies.

A test that fails because the server closed the socket reports the close code and
reason.

## Live session semantics

- **Open:** from a websocket request (uses its URL, headers, auth, and variables),
  or from a URL typed in directly.
- **Feed:** every received message is appended with a sequence number and a
  timestamp. The feed is held in memory and capped at 1,000 events; the oldest
  events are dropped.
- **Send:** sends a text frame on the open socket.
- **Close:** the user or caller closes the session. Closing records the close
  code and reason in the feed.
- **Persistence:** the feed is not written to disk. Exporting it is a later
  decision.
- **Reading:** a caller reads the feed by cursor (events after sequence N), so
  both the UI and an agent can poll without missing events.
- **Lifetime:** a session lasts while its process runs. The Electron app holds
  sessions for open tabs. The CLI `watch` command holds one until interrupted.
  The MCP server holds sessions until they are closed or the server exits.

## Core

- `model.ts`: add `type` and the websocket fields to the request type, with
  defaults that keep existing files valid.
- `websocket/`: a new folder beside `execute` code.
  - `socket.ts`: the transport interface and a `ws`-backed implementation. The
    interface is what the host gives core, so core stays free of `node:` imports,
    as it is today.
  - `test-run.ts`: runs the test semantics above and returns the result.
  - `session.ts`: the live session, its feed, cursor reads, send, and close. It
    holds the 1,000-event cap.
- `validate.ts`: reuse the existing schema compilation for each message.
- `authoring/`: `set_type`, `set_message`, and `set_expect` verbs, following the
  existing edit-scope pattern.
- `run-record.ts`: a websocket case records the received messages and the
  close code.

The socket transport is the one piece that touches the network. Core takes it as
a dependency, so tests can use an in-memory fake, as the HTTP path does for
axios.

## Hosts and front ends

- **CLI** (`App/cli-command`):
  - `fullyrested run <request>` runs a websocket test, as it runs an HTTP
    request now.
  - `fullyrested ws watch <request|url>` opens a session and streams events to
    stdout until interrupted.
  - `fullyrested ws send <message>` sends into a session started in the same
    process.
  - Stdout carries the stream, so warnings go to stderr.
- **MCP** (`App/cli-command/src/mcp.ts`):
  - `ws_session_open`, `ws_session_events` (events after a cursor),
    `ws_session_send`, `ws_session_close`.
  - Websocket tests come through the existing `run` tool, with no new tool.
  - Sessions live in the MCP process, the same way `MemoryRunStore` does now.
- **Electron** (`App/FullyRested`):
  - A websocket request has a Run button that runs the test, and its results
    show in the same run history.
  - A live panel shows the feed for an open session, with a send box and a
    close button.
  - The main process owns the sockets, because the renderer cannot hold Node
    sockets. The main process holds sessions and streams events to the renderer
    over IPC. Its existing `collection-access.js` guards apply to any file a
    session touches.

## Errors

- Connection refused, DNS failure, or a TLS error: a test fails with the reason.
  A session reports it in the feed and ends.
- A handshake rejected with HTTP 401 or 403: reported with the status code,
  as HTTP responses are.
- A send on a closed socket: an error to the caller. It does not crash the session.
- Invalid `schema` text: caught when the request is saved, as HTTP validation is
  now, through `compileSchema`.

## Testing

- Core unit tests for `test-run.ts` and `session.ts` against an in-memory fake
  socket. Cases: all/any matching, extras ignore/fail, late extras within
  `settle`, timeout, close during the run, non-JSON messages, the 1,000-event cap,
  and cursor reads.
- Authoring verb tests, as for the existing verbs.
- CLI tests: `run` on a websocket request against a local test server, and
  `ws watch` streaming to stdout.
- MCP tests: the four session tools, through the same in-process harness the
  existing tools use.
- Electron: main-process tests for session IPC (`npm run test:main`). Renderer
  checks by hand, as the app has no UI tests beyond boilerplate.

## Open items

- **BlueFinWiki handshake auth.** Confirm how its realtime endpoint authenticates.
  If it needs a token in the query string rather than a header, `ws_session_open`
  needs a variant. This is the first thing to check before building.
- **Settle default.** 500 ms is a guess. Adjust it after the first real test
  against BlueFinWiki.
