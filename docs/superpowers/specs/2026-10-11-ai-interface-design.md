# AI Interface — design

Date: 2026-10-11 · Branch: `feature/ai-interface`

## Goal

FullyRested's front ends share one engine: the desktop UI and the CLI run the
same pipeline. This adds a third front end for AI agents, so an agent can
inspect a collection, run it, and then ask narrow questions about the results
("which cases failed?", "what headers came back on case 3?") without the
collection files or whole responses passing through its context.

Today the CLI can only run, and `runCase` (`App/cli-command/src/run.ts`) keeps
only `{name, status, ms, passed, errors}`. The request that was sent and the
response that came back are thrown away.

In scope: run records, querying them, and read-only inspection of a
collection, all over both the CLI and an MCP server. Out of scope: see
[Future work](#future-work).

## Architecture

```
core (no fs: unchanged rule)
  ├─ run-record.ts    RunRecord / CaseRecord types; build a CaseRecord from
  │                   (resolved request, response, validation, timing)
  ├─ redact.ts        redact(record, secrets)
  ├─ run-store.ts     RunStore interface + MemoryRunStore
  └─ query.ts         pure functions over a RunRecord (summary, failures,
                      caseRequest, caseResponse, caseBody) and over the tree
                      (tree, environments, showRequest)

cli-command (host: fs, keychain)
  ├─ run.ts           runCase keeps the full request/response → CaseRecord
  ├─ run-store.ts     FsRunStore: <dir>/.fullyrested-runs/<runId>.json
  ├─ index.ts         run --record, runs, summary, failures, request,
  │                   response, body, tree, envs, show, mcp
  └─ mcp.ts           `fullyrested mcp`: stdio MCP server over the same
                      query functions
```

- **Three-way parity.** The query logic is pure functions in core. The CLI,
  the MCP server, and later the app give the same answers because they call
  the same code.
- **Storage is a host concern.** Core defines the `RunStore` interface and an
  in-memory implementation (no `fs` needed). The CLI host supplies the disk
  implementation, in the same way it supplies `FsCollectionSource` today.
- **The MCP server is a subcommand of the CLI package**, not a new package. It
  is one install and reuses the host's collection loading and secret store.

### Where records are stored

| Front end | Default | Override |
|---|---|---|
| CLI | Disk: `<cwd>/.fullyrested-runs/<runId>.json` | `--store <dir>` on `run` and every query command |
| CLI | — | `run --json` prints the whole record to stdout and writes nothing |
| MCP | Memory only: `MemoryRunStore`, the last 20 runs, oldest dropped first | `store: "<dir>"` on the `run` tool also writes to disk; `fullyrested mcp --store <dir>` sets a server default |

The caller chooses the location, so a skill or CLAUDE.md can set the
convention. FullyRested does no pruning and adds no `.gitignore` entries: the
caller owns the folder. An MCP session leaves no files behind unless asked to.
Each CLI command is a separate process, so the CLI has to use disk for one
command to see a run made by another.

MCP query tools look in memory first, then in the given (or default) store
directory.

`run` without `--record` behaves exactly as it does today. Recording is
opt-in on the CLI and always on in MCP.

## The run record

```ts
interface RunRecord {
  runId: string;            // sortable: 20261011-142305-a1b2
  startedAt: string;        // ISO 8601
  collection: string;       // collection file path
  environment?: string;     // environment name
  selection: string;        // what was asked for: "--folder users", "--all", ...
  redacted: boolean;        // false only with CLI --include-secrets
  cases: CaseRecord[];
}

interface CaseRecord {
  index: number;            // 1-based; the case id
  name: string;             // "Get user / happy path"
  requestFile: string;      // collection-relative .frreq
  runName?: string;
  outcome: 'pass' | 'fail' | 'error';   // error = resolve failed or no response
  ms: number;
  request: { method: string; url: string; headers: Record<string, string>; body?: Body };
  response?: { status: number; statusText?: string; headers: Record<string, string>; body?: Body };
  validation?: ValidationResult;
  error?: string;
}

interface Body { contentType?: string; bytes: number; text?: string; base64?: string }
```

A case is identified by its `index` or its `name`. Queries accept either.
A request with no validation configured has no `validation` and passes on
any HTTP response, as it does today.

### Redaction

Secrets are redacted by default. The CLI's `run --include-secrets` keeps them,
for local debugging. The MCP server does not offer that option, so an agent
using MCP can never read secret values.

`redact(record, secrets)` uses the resolved request's `SecretTable[]`
(name + value):

- It replaces every occurrence of each secret value in the URL, headers and
  bodies with `{{$secret:name}}`.
- Auth headers are computed at send time, so a secret value never appears in
  them literally. The `Authorization` header is therefore always masked, with
  its scheme kept: `Basic ***`, `Bearer ***`,
  `AWS4-HMAC-SHA256 Credential=<access key id>/***`. `X-Amz-Security-Token`
  is masked as `***`.
- Secret values shorter than 4 characters are not replaced, so that a secret
  such as `1` does not mangle every body.

The record is redacted before it is stored or returned.

## Validation reports every check

`validateResponse` (`App/core/src/validate.ts`) currently stops at the first
failure: status code, then body, then headers. It will run every configured
check and collect them all:

```ts
interface ValidationResult {
  valid: boolean;
  checks: { check: 'status' | 'body' | 'headers'; passed: boolean; errors: string[] }[];
}
```

`ResponseValidation` gains `checks` beside its existing `errors`, and
`errors` becomes the concatenation of every failed check's errors, so current
callers (the Angular response components, the CLI's text and JUnit output)
keep working and now show every failure.

The only dependency between checks: if the body isn't JSON, the body check
reports "Response body is not valid JSON" and does no schema validation. The
header check runs regardless.

Across cases nothing changes: a run already continues through every case
whatever earlier cases did.

## Commands and tools

The CLI and MCP use the same names and arguments. CLI commands print
human-readable text, or JSON with `--json`. MCP tools return JSON. `run` and every
query command take `--store <dir>`; the inspect commands (`tree`, `envs`,
`show`) read no run records and take no `--store`.

### Inspect (read-only, no network)

| CLI | MCP tool | Returns |
|---|---|---|
| `tree -c <frcol>` | `tree` | Folders → requests → runs, as names and paths only, with a validation-type marker per run |
| `envs -c <frcol>` | `environments` | Environment names, the selected one, and variable names (no values) |
| `show -c <frcol> -a <frreq> [-r run] [-e env]` | `show_request` | Effective resolved settings: method, substituted URL, headers, auth type, validation config, and the scope each value came from. Built on `effectiveSettings()`. Secrets always appear as `{{$secret:name}}` |

### Run

| CLI | MCP tool | Returns |
|---|---|---|
| `run … --record [--include-secrets] [--json]` | `run` (action / run / folder / all / environment, plus optional `store`) | Run id + summary. The record goes to the store, or to stdout with `--json` |

The existing text output and `--junit` are unchanged.

### Query a run

`[runId]` defaults to the latest run; `<case>` is an index or a name.

| CLI | MCP tool | Returns |
|---|---|---|
| `runs` | `list_runs` | Run id, time, selection, pass/fail counts |
| `summary [runId]` | `run_summary` | One line per case: index, name, outcome, status, ms |
| `failures [runId]` | `failures` | Failed or errored cases, with their failed checks and errors |
| `request <case> [runId]` | `case_request` | Method, URL, headers, body metadata (content type, bytes) |
| `response <case> [runId]` | `case_response` | Status, headers, body metadata, ms |
| `body <case> [runId] [--request] [--path <p>] [--outline] [--range a:b] [--full]` | `case_body` | The body |

Bodies only come back from `case_body`, so an agent sees the content type and
size first and fetches the body only when it needs it. `case_body`:

- returns the response body, or the request body with `--request`;
- `--path`: a JSONPath subset (dot keys, `[n]`, `[*]`) on JSON bodies;
- `--outline`: the JSON's shape (keys, types, array lengths, short sample
  values) instead of its content;
- `--range a:b`: a character range of a text body;
- returns at most 32 KB unless `--full` is given. A truncated result says so
  and gives the full size.

The MCP tool descriptions are short and give the intended flow:
`run` → `failures` → drill down with `case_*`.

## Errors

- **Unknown run id or case:** the message lists what exists (the last 5 run
  ids, or the case count and the first few names). The CLI exits 2; MCP
  returns an `isError` result with the same text so the agent can correct
  itself.
- **Setup failures** (the collection won't load, an unknown environment) are
  handled the same way.
- **Per-case failures** (a resolve error, no response, a timeout) are
  recorded as `outcome: 'error'` with `error` set, and the run continues.
- **The store directory isn't writable:** a warning, the run still completes
  and prints its results, and the record is lost.
- **A corrupt record file** is skipped by `runs` with a warning. Reading it
  directly reports the error.

## MCP plumbing

- `@modelcontextprotocol/sdk` over stdio.
- `fullyrested mcp [--store <dir>]`.
- It uses the same secret store as the CLI (`FULLYRESTED_SECRET_<NAME>`
  environment variables, then the OS keychain).
- The README documents registering it:
  `claude mcp add fullyrested -- fullyrested mcp`.

## Testing (vitest, test-first)

- **core:**
  - `redact`: literal values in the URL, headers and JSON bodies; Basic,
    Bearer and SigV4 `Authorization` masking; the short-value skip.
  - `validateResponse`: status, body and headers all failing at once; the
    non-JSON body.
  - Query functions: summary, failures, the `case_body` cap / path / outline /
    range.
  - `MemoryRunStore` dropping the oldest run.
- **cli:**
  - `FsRunStore` read, write and list against a temp directory.
  - `run --record` against a local `http.createServer`, then every query
    command's output and exit codes.
  - `--include-secrets` is honoured; `--json` writes no file.
- **mcp:** an in-process client/server pair over the SDK's in-memory
  transport, covering run → failures → case_body, memory-only (no files
  written) and `store` writing to disk. `include-secrets` is not exposed.
- **app:** the response components still show the validation errors.

## Future work

These are placeholders, each to get its own spec and kanban card:

1. **Authoring APIs.** Create and edit collections, folders, requests, runs
   and environments through CLI commands and MCP tools, written through core
   so the files stay valid. This needs a write path in the CLI host, which is
   read-only today. (The read-only half, inspection, is in this spec.)
2. **The app writes and browses run records.** Runs started from the desktop
   UI write a `RunRecord` to the same store, so an agent can be asked about a
   run done in the app, and the app gets a run-history panel built on the
   core query functions.
