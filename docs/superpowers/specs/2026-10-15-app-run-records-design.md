# The app writes and browses run records

Date: 2026-10-15
Board: **AI First** (`7cb3c7ac-1344-4db1-8cc9-81f1a14a7212`), epic *App writes
and browses run records*
Branch: `feature/app-run-records`

## Goal

Every send from the desktop app writes a redacted `RunRecord` to the open
collection's `.fullyrested-runs` folder — the same store the CLI's
`run --record` and the MCP `run` tool write — and the app gains a History
pane that browses what is in that folder, app runs and agent runs alike,
through the same core query functions the MCP tools use.

Two things follow from that. An agent can be asked about a call the user made
by hand ("why did that last POST fail?"), and the user can see what an agent
ran. The store becomes the shared ground between the person and the agent,
which is the point of the AI First initiative.

Prior specs this builds on: `2026-10-11-ai-interface-design.md` (the run
record, the stores, the query functions) and
`2026-10-11-authoring-apis-design.md` (the locator syntax reused for
`selection`).

## What a run is, in the app

One send is one run with one case.

The app has no batch runner — `ExecuteRestCallsService.executeNode` sends a
single `RequestNode` or `RunNode` — and this spec does not add one. Each
Send therefore produces a `RunRecord` whose `cases` array holds exactly one
`CaseRecord` at `index: 1`. The History pane is a chronological log of
individual sends, interleaved with whatever multi-case runs the CLI or an
agent recorded into the same folder.

Recording is unconditional: there is no toggle to arm. The cost of a forgotten
toggle is the one case you wanted, and the folder is kept bounded by pruning
instead (below).

## Where the records go

`<collection folder>/.fullyrested-runs/<runId>.json` — the directory
`fullyrested run --record --store <collection folder>` already writes to, so
an agent pointed at the collection sees app runs and CLI runs in one `list_runs`.

A send with **no collection open** is not recorded. The path cannot be
resolved, so the renderer skips the save and the History pane says so. The
send itself is unaffected.

The app never edits `.gitignore`. The pane's header shows the runs folder
path, so what to ignore is obvious; the README's line about the user deciding
whether to ignore it stays true.

## Architecture

```
renderer (core bundled)                 main process                  disk
─────────────────────────               ──────────────────            ─────────────────────
ExecuteRestCallsService
  node.resolve({environmentId})  ──► resolved (carries .secrets)
  .replaceVariables()            ──► substituted
  invoke('testRest') ───────────────► executeRequest() ──────────────► network
                     ◄──────────────── RestActionResult (incl. headersSent)
  validateResponse()
  buildCaseRecord(...)
  redactCase(case, resolved.secrets)
  RunRecord { runId: newRunId()+'-app', redacted: true, cases:[case] }
  invoke('saveRun') ────────────────► access.runsPath() ─────────────► .fullyrested-runs/<id>-app.json
                                       store.save(); store.prune()
  invoke('listRuns') ◄─────────────── store.list()
  invoke('loadRun', id) ◄──────────── store.load(id)
```

### The record is built and redacted in the renderer

Only the renderer holds all four inputs at once: the resolved node (which
carries `.secrets`, what `redactCase` needs), the substituted request, the
response, and the validation. Core is bundled into the renderer, so
`buildCaseRecord`, `redactCase` and `newRunId` are already in reach there.

The building itself is a **pure core function**, `buildAppRunRecord`, not
logic inside the Angular service. Two reasons: the repo's rule that a front
end holds no request logic of its own, and testability —
`App/FullyRested`'s `ng test` runs Karma against an interactive Chrome
(`browsers: ['Chrome']`, `singleRun: false`), so a renderer unit test is not
runnable by an agent or in CI, while core's vitest suite is. The Angular
service is then a few lines: call the function, hand the result to the IPC
wrapper, swallow failures.

`main.js` is then a dumb writer. It refuses any record whose `redacted` is not
exactly `true` and otherwise hands it to the store. The check cannot *prove*
redaction — the renderer is our own code — but it keeps the MCP server's
invariant ("a record not marked redacted is never served") from being broken
by an accident on the app side.

### No second prepareRequest

The CLI calls `prepareRequest` and passes the result to `buildCaseRecord`. The
app cannot: signing already happened inside `executeRequest` in the main
process, and re-signing in the renderer would record an `Authorization` header
that differs from the one sent (SigV4 is time-dependent).

Instead the renderer synthesises the `PreparedRequest` from the substituted
request plus `response.headersSent` — which `buildCaseRecord` already prefers
over `request.headers` when it is non-empty. When `headersSent` is absent
(no response at all), the substituted request's own headers are used, which is
exactly the existing fallback.

### fileRunStore moves into core

`FsRunStore` lives in `App/cli-command/src/run-store.ts` and the app's main
process cannot reach it: they are separate packages, and `main.js` only
`require()`s core's compiled `dist/`.

Core gains `fileRunStore(host, dir)` holding every decision that is not about
`fs`: run-id validation, `<runId>.json` naming, the corrupt-file error message,
listing, the newest-first sort, and the prune. `host` is a small fs-shaped
interface the caller supplies:

```ts
export interface RunStoreHost {
  exists(p: string): boolean;
  readText(p: string): string;
  writeText(p: string, text: string): void;
  readdir(p: string): string[];
  mkdir(p: string): void;        // recursive
  remove(p: string): void;
  join(...parts: string[]): string;
}
```

`join` is on the host rather than taken from core's `joinPath`, because
`joinPath` joins with forward slashes — right for the in-collection relative
paths it was written for, wrong for building a real OS path on Windows. Path
rules stay with the host that owns the filesystem.

`save` prunes after a successful write, when the store was constructed with a
cap; a store built without one never prunes, which is how the CLI keeps its
documented "FullyRested never prunes that folder" behaviour.

This is the `guardedRealTarget` / `guardHost` pattern already in the repo:
core stays free of `node:` imports (the Angular build bundles its source into
the renderer), and each host supplies the primitives. `FsRunStore` becomes a
thin wrapper over `fileRunStore` with a `node:fs` host, and `main.js` supplies
the same host a second time.

The CLI's existing `run-store.test.ts` must keep passing **unchanged**. That
is the evidence the move preserved behaviour, and it is a requirement of the
task, not a nice-to-have.

### collection-access.js owns the path

`CollectionAccess` gains `runsPath(runId?)`, resolving
`<open collection folder>/.fullyrested-runs[/<runId>.json]` through the
existing `realTarget` guard, and throwing when no collection is open or when
the resolved path escapes the collection folder.

Three IPC channels are added to `preload.js`'s `invoke` whitelist and handled
in `main.js`, each going through `runsPath` so they are confined exactly as
`readText` and `listDir` are:

| Channel | Argument | Returns |
|---|---|---|
| `saveRun` | a `RunRecord` | nothing; refuses `redacted !== true` |
| `listRuns` | nothing | `RunListing[]`, newest first |
| `loadRun` | `{ runId }` | `RunRecord \| undefined` |

A corrupt file in the folder is skipped from `listRuns` with a warning (the
existing `onWarning` path), and throws from `loadRun` with the file named.

## Run ids, and the `-app` marker

`VALID_RUN_ID` is `/^[A-Za-z0-9_-]+$/`, so an app record's id is
`newRunId() + '-app'`, e.g. `20261015-143207-ab12-app`. No type changes, and
every existing tool — `load`, `resolveRun`, `run_summary`, `failures` — accepts
it as-is.

The marker earns its place in the prune. Because app records are identifiable
from the **filename alone**, the prune costs one `readdir` and no parsing:
list the folder, take the names ending `-app.json`, sort (run ids sort
lexicographically by time), delete all but the newest 200. Parsing every
record on every send would mean re-reading megabytes of recorded bodies to
decide what to delete.

CLI- and agent-written records have no `-app` suffix and are never pruned, so a
recorded suite an agent is partway through querying cannot vanish underneath
it. The cap is a constant in core, not a user setting.

## The record for one send

| Field | Value |
|---|---|
| `runId` | `<newRunId()>-app` |
| `startedAt` | ISO time of the send |
| `collection` | the open collection's `.frcol` path |
| `environment` | the active environment's name; omitted when none is selected |
| `selection` | the node locator: `request:users/create.frreq`, or `run:users/create.frreq#happy` for a run |
| `redacted` | always `true` — the app has no `--include-secrets` equivalent |
| `cases` | exactly one: `index: 1`, `name` = the node name, `requestFile` = path relative to the collection folder, `runName` set when a run was sent |

## RunListing gains ms and status

So the History list can draw a row without loading every record:

```ts
export interface RunListing {
  // ... existing fields
  ms: number;         // sum of the case times
  status?: number;    // only when the run has exactly one case and it got a response
}
```

`status` is deliberately single-case-only: for a multi-case run there is no one
status to show, and the pane shows the pass/fail/error counts instead. MCP's
`list_runs` gets both fields for free.

## The History pane

### How it opens

The explorer's system rows carry `type: 'system'` plus a `subtype`; History is
`subtype: 'history'`. `open-actions.component.ts` gains a `historyVisible()`
guard and `open-actions.component.html` a `.pane` beside Variables, Headers,
Secrets and Authentication. The View menu and the command palette get entries,
both routed through the existing `openSystem`.

### What it shows

List above, detail below, in one pane:

```
History
Runs - Test Collection          .fullyrested-runs        [refresh]
-----------------------------------------------------------------
ok  14:32:07  request:users/list.frreq          200   42ms
X   14:31:55  request:users/create.frreq        422   61ms
ok  14:28:02  request:health.frreq              200   11ms
>   11:02:44  --folder users            cli   6 cases  412ms
-----------------------------------------------------------------
Case 1 - POST /users - fail
[Request] [Response] [Validation]
status 422   61ms   1.2 KB
X  body.$.id   expected string
```

- **Row:** outcome dot, local time (the date shown only when it is not today),
  `selection`, status, ms. A `cli` chip marks any run whose id lacks `-app`.
  A multi-case run shows "N cases" and expands to its case list.
- **Detail:** `Request` / `Response` / `Validation` tabs over the selected
  `CaseRecord`, read-only, bodies rendered with the existing `code-editor`
  component.
- The live response components are **not** retrofitted. They are bound to
  `TimedActionResult`, which is not a `CaseRecord`, and sharing them would drag
  editing concerns into a read-only view.

### It answers through core's query functions

`runSummary`, `caseRequest`, `caseResponse` and `caseBody` — the functions the
MCP tools call — are what the pane calls, rather than reading fields off the
record itself. That makes the AI-interface spec's promise ("the CLI, the MCP
server, and later the app give the same answers") true by construction, and
`caseBody`'s existing path / outline / range / cap handling is what keeps a
5 MB recorded body from reaching the DOM.

### Refresh, empty states, failure

- The list loads when the pane opens, and a send prepends its row while the
  pane is open (the renderer knows it just saved).
- A manual refresh button covers records an agent or the CLI wrote while the
  app sat open. No file watcher.
- No collection open → "Open a collection to see its run history". Collection
  open, nothing recorded → the runs folder path and one line about what lands
  there.
- Under `ng serve`, with no Electron IPC, the service returns mock runs — the
  behaviour the repository and execute services already have.
- **Recording must never fail a send.** Every `saveRun` failure (no collection,
  a write error, a full disk) is caught in the renderer, logged with
  `console.warn`, and otherwise ignored. The response the user asked for is
  shown exactly as today.

## Testing

| Layer | What |
|---|---|
| core | New `fileRunStore` tests against a memory host: round-trip, the corrupt-file message, newest-first sort, traversal and absolute ids refused, and the prune — deletes only `-app` files, keeps the newest 200, leaves CLI records alone. `listingOf` tests for `ms` and the single-case-only `status`. |
| core, no-regression | `App/cli-command/test/run-store.test.ts` passes **unchanged**. |
| record building | `buildAppRunRecord` in core's vitest suite: the record has `redacted: true`, one case at `index: 1`, a `-app` run id, `selection` as the locator for both a request and a run, `requestFile` collection-relative, and a secret value in the URL redacted to `{{$secret:NAME}}`. |
| renderer | No unit test: `ng test` needs an interactive Chrome. The Angular service is kept to a wrapper thin enough that its only untested behaviour is "a failing save does not fail the send", which is one `try`/`catch` and is covered in Dean's end-to-end pass. |
| main process | `npm run test:main`: `saveRun` refuses a record without `redacted === true`, refuses a traversal run id, writes under the collection folder, prunes only `-app` files; `listRuns` / `loadRun` refuse a path outside it. |
| end to end | Dean, in the real app against `Test Collection`: send, open History, click the case; then `fullyrested runs --store "<collection folder>"` shows the app's record. |

Commands: `App/core` → `npm test` and `npm run typecheck`;
`App/cli-command` → `npm test`, `npm run typecheck`;
`App/FullyRested` → `npm run test:main`, `ng lint`.

The main-process work is **not** written inline in `main.js`, which has no
seam a test can reach (its handlers are registered inside
`app.whenReady()`). It goes in a new `App/FullyRested/run-records.js`
exporting the `fs` host and a store factory; `main.js` only wires it to the
three IPC channels, and `main-tests/` exercises the module directly — the
shape `collection-access.js` and its test already have.

## Out of scope

- **A batch runner in the app** (run a folder or collection from the UI). The
  History pane renders multi-case records because the CLI writes them; the app
  does not create them. Its own spec if it is ever wanted.
- **Per-request response history** in the response pane. The pane covers the
  need; a second view over the same records can follow if it turns out to be
  missed.
- **A record-on/off setting**, and a configurable cap.
- **`--include-secrets` in the app.** The app writes redacted records only.
- **Editing or re-sending from a record** ("replay this case").
- **A file watcher** on the runs folder.
- **Touching `.gitignore`.**

## Docs to update when this lands

- `README.md`: the Run records paragraph — the app records every send, where,
  the `-app` marker and the 200 cap.
- `SYSDOC.md`: the layers table (`fileRunStore` in core, the app's run-store
  host, the three IPC channels and `runsPath`), the pipeline table's
  "Record and query" row, and the "Where the plan lives" branch list.
