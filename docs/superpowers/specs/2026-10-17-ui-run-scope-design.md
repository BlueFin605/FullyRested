# Run a branch from the UI — design

Date: 2026-10-17 · Branch: `feature/ui-refresh` · Initiative: UI Refresh

## Goal

The collection is a tree, so the UI should be able to run any branch of it —
a folder, or the whole collection — the way the CLI (`run --folder`, `--all`)
and the MCP `run` tool already can. Today the UI runs one request or one run,
through the Send button in an open tab.

## Scope

| Scope | CLI | MCP | UI today | UI after |
|---|---|---|---|---|
| Whole collection | yes | yes | no | yes |
| One folder | yes | yes | no | yes |
| One request / one run | yes | yes | yes | yes (unchanged) |

Out of scope: parallel execution, request chaining, scheduling, a live
progress panel beyond a status line.

## Design

### 1. Shared case enumeration (core)

`casesFor` and `selectCases` currently live in `App/cli-command/src/run.ts`.
Move them to core so the CLI, MCP and UI expand a scope to cases identically:
one case per run of a request, or one case for a request with no runs, in tree
order. The CLI imports them from `@fullyrested/core`; its behaviour and option
validation do not change.

Add a multi-case builder beside `buildAppRunRecord` (`core/src/app-run.ts`)
that assembles a `RunRecord` from finished cases, numbered from 1. The
single-Send path keeps using `buildAppRunRecord`.

Core stays free of `node:` and `fs` imports.

### 2. Running a scope (UI service)

`ExecuteRestCallsService.executeScope(node, environmentId)` takes the
collection root or any folder node.

- Expand to cases with the core function; run them one at a time, in order,
  using the selected environment.
- Each case goes through the existing `executeNode`, so resolution,
  substitution, auth, sending and validation are unchanged.
- A failed validation or a transport error is a failed case; the batch never
  stops early.
- Cancel is a flag checked between cases. A cancelled run keeps the cases it
  finished.
- At the end, save one multi-case record through `RunHistoryService.save` and
  the existing `saveRun` IPC channel. An unsaved collection skips this, as
  single Sends do today; failures only warn.
- Single Sends inside a batch must not each write their own record; the batch
  writes exactly one.

### 3. Per-request results (shared store)

New `LatestResultsService` holds the latest result per request or run, keyed
by file path plus run id.

- Send in a request or run tab, and `executeScope`, both write to it.
- The request and run tabs read their response from the store instead of
  holding it privately. Open tabs update live; a tab opened later shows the
  stored result. A batch opens no tabs.
- In memory only; it resets on restart. History is the persistent record.

### 4. Triggering it (explorer)

- Add a **Run** command to the context menu of every folder row and of the
  collection root row (`COMMANDS` in `collection-explorer.component.ts`,
  handled in `onExplorerCommand` in `open-actions.component.ts`).
- While running, a status line shows "Running 7 of 40" with a Cancel button.
  When done it links to the new record in the Run history pane, which already
  shows multi-case records.

## Errors and edge cases

- Empty folder: nothing to run; say so, save no record.
- No selected environment: behave as a single Send does today.
- A second run started while one is going: the Run command is disabled until
  it finishes or is cancelled.
- Unsaved collection: results show in tabs but no record is written.

## Testing

- Core: unit tests for the moved enumeration (runs, no-runs, ordering,
  nested folders) and the multi-case builder.
- CLI and MCP suites pass unchanged — they are the regression check for the
  move.
- App: specs for `executeScope` (order, cancel, exactly one saved record,
  failure does not stop the batch) and for `LatestResultsService`.
- There is no e2e harness and no lint script in this repo. The end-to-end
  check (right-click a folder → Run → results in Run history and in an
  already-open request tab) is a manual smoke test for Dean in the desktop
  app. Every package must still build (`App/core` and `App/cli-command`
  `npm run build`, `App/FullyRested` `ng build`) and pass its tests.
