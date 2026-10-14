# Authoring APIs — design

Date: 2026-10-11 · Branch: `feature/authoring-apis`

## Goal

The AI interface gave an agent a read-only view of a collection: inspect it,
run it, query the results. This adds the write half, so an agent can create
and change collections, folders, requests, runs and environments through the
CLI and MCP, with core keeping every file valid.

The motivating use case is **test authoring**: taking a collection someone
built by hand and turning it into a test suite — adding run variants and
filling in the validation that makes a request an assertion rather than a
call. The API itself is general CRUD, because a narrower one would have had
to be widened the first time a request was missing.

Today the only write path in the repo is the Electron main process
(`saveRequest`, `saveCollection`, `saveFolder`), each going through
`storeSecrets` and the `collection-access.js` guard. The CLI host is
read-only: `CollectionSource` offers `listDir` and `readText` and nothing
else.

In scope: authoring verbs in core, a write host for the CLI, full CLI and MCP
coverage, and schema inference from a recorded run. Out of scope: the desktop
app adopting these verbs in place of its own write path (it becomes possible,
but is not done here), and any form of concurrent-edit locking.

## Shape of the API

**Intention verbs, not patches.** Each operation is its own named verb —
`set_header`, `set_url`, `new_run` — rather than a merge-patch over a
document. Every call is unambiguous about what it touches, which matters most
for the caller that cannot see the file it is editing.

**One verb set, addressed by a scope locator.** Every level of the hierarchy
holds headers, variables, secrets and auth, so those verbs are shared across
levels and take a locator rather than being duplicated five ways:

| Locator | Target document |
|---|---|
| `collection` | the `.frcol`'s `collectionEnvironment` (collection-wide settings) |
| `env:Production` | one `Environment` in the `.frcol` |
| `folder:users` | `users/folder.frfolder`, created if absent |
| `request:users/get.frreq` | that `.frreq` |
| `run:users/get.frreq#not found` | the named run inside that `.frreq` |

A locator resolves against the loaded tree, so a mistyped folder or run name
fails before anything is written and the error lists what does exist. A
`folder:` locator never points at the collection root: root-level settings
belong in the `.frcol`, and `tree.ts` already warns about a `folder.frfolder`
sitting next to the collection file.

**Full parity.** Every verb is both a `fullyrested edit <verb>` command and an
MCP tool, as inspect and query already are — it keeps the three-way-parity
rule intact and gives the core verbs a test harness that needs no MCP client.
The CLI commands sit under one `edit` namespace so that ~20 new verbs do not
crowd the top-level `--help`.

The single exception is `secret set`, which exists only on the CLI.

## Architecture

```
core (still no fs)
  |- locator.ts    parse a scope locator; resolve it against the tree
  |- authoring.ts  re-export barrel: the only public entry point
  |- authoring/    one function per verb, over a shared editScope helper,
  |                one file per verb family (edit-scope, create, settings,
  |                request-fields, validation, structure)
  |- infer.ts      JSON Schema inference from a recorded response body
  +- run-store.ts  (existing) read by validation_from_case

cli-command (host: fs, keychain)
  |- files.ts      FsCollectionSink: the only code that writes, confined to
  |                the collection folder
  |- index.ts      fullyrested edit <verb>; fullyrested secret set
  +- mcp.ts        every verb except secret set, served by default
```

### The write path

Core gains the write sibling of `CollectionSource`:

```ts
export interface CollectionSink {
  writeText(path: string, text: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
```

Paths are collection-relative, like `CollectionSource`'s. Core keeps its rule
of no `node:` or `fs` imports, because the Angular build bundles its source
into the renderer.

Every verb runs the same five steps, written once in a shared `editScope`
helper so the guard and the secret handling live in exactly one place:

1. **Resolve** the locator to a target document and a path (`.frcol`,
   `folder.frfolder` or `.frreq`), reusing `loadCollectionTree`.
2. **Read** that document raw, via `CollectionSource.readText` — raw rather
   than the resolved view, so nothing inherited is baked into the file.
3. **Apply** the intention, then `normalise*` the result, so fields missing
   from an older file are filled in and the document written is always valid.
4. **`storeSecrets`**, moving any `{$secret, $value}` pair into the keychain
   exactly as the app's save path does. Over MCP there is never a `$value`,
   so this is a no-op there.
5. **Write** through `CollectionSink`.

`FsCollectionSink` (`App/cli-command/src/files.ts`) resolves every path
against the collection folder and refuses anything that escapes it — the CLI
equivalent of `collection-access.js`. It writes JSON at 4-space indent to
match what the app produces, so app-saved and agent-saved files do not churn
in `git diff`.

### Write access and concurrency

Authoring is served by `fullyrested mcp` **by default**. Collections are
plain JSON in git, so `git diff` and `git checkout` are the real safety net,
and a flag the agent cannot set is a flag that gets forgotten. Confinement to
the collection folder is the hard guard.

There is **no locking** and no detection of the desktop app holding the same
file open with unsaved changes. If both write, the last writer wins and
`git diff` shows it. This is a single-user desktop tool whose files are in
version control; the cost of being wrong is a `git checkout`.

## The verbs

CLI: `fullyrested edit <kebab-case verb> -c <frcol> …`. MCP: the tool name
below.

### Create (5)

| Verb | Arguments |
|---|---|
| `new_collection` | file, name?, environments? |
| `new_folder` | path |
| `new_request` | path, method, url |
| `new_run` | request, name |
| `new_environment` | name |

Each mints the ids the model requires (`collectionGuid`, request `id`, run
`id`, environment `id`) and writes a fully normalised document, so a created
file opens in the desktop app immediately.

### Settings (6)

| Verb | Arguments |
|---|---|
| `set_header` | scope, name, value, enabled? (default true) |
| `set_param` | scope, name, value, enabled? (default true) |
| `set_variable` | scope, name, value |
| `add_secret_ref` | scope, name |
| `set_auth` | scope, type, plus the fields that type needs (secret fields as references) |
| `remove_setting` | scope, kind (`header \| param \| variable \| secret \| validation-header`), name |

Each `set_*` is an upsert: it replaces the entry of that name at that scope,
or adds it if there is none. Folding four removals into one `remove_setting`
keeps the tool surface down without losing explicitness.

### Request-only (3)

`set_url`, `set_method`, `set_body`. These are request-level by
construction: `RestActionRun` has no url, method or body, so a `run:` locator
on them is an error rather than a silent no-op.

### Validation (3)

`set_validation` (type, httpCode, body mode, jsonSchema),
`set_validation_header`, `validation_from_case`. Both `request:` and `run:`
locators are accepted.

### Structure (4)

`rename` (environment, run, request, folder), `delete` (the same four),
`move` (request, folder — a file or directory move), `select_environment`.

### Which locator each verb accepts

| Verb group | collection | env | folder | request | run |
|---|---|---|---|---|---|
| headers, auth | yes | yes | yes | yes | yes |
| variables, secrets | yes | yes | yes | — | yes |
| params | — | — | — | yes | yes |
| url, method, body | — | — | — | yes | — |
| validation | — | — | — | yes | yes |

Variables and secrets are deliberately absent from `request:`. `RestAction`
has no `variables` or `secrets` field and `RequestNode.layers()` contributes
only `headers` and `auth`, so a request-level variable has nowhere to live: a
variable that belongs to one request belongs on one of its runs, or on the
folder holding it. `set_variable` and `add_secret_ref` with a `request:`
locator are therefore a verb/locator mismatch error, and the message says to
use a `run:` or `folder:` locator instead.

## Secrets

The AI-interface spec guarantees that an agent over MCP can never read a
secret value. Writing keeps the same line:

- **MCP writes references only.** `add_secret_ref(scope, name)` puts
  `{$secret: name}` into the document. The keychain is out of reach in both
  directions.
- **Values are set by hand.** The CLI gains
  `fullyrested secret set --scope <scope> --name <name>`, which reads the
  value from a prompt (or stdin) and stores it under the right service —
  `fullyrested-collection-<guid>`, `fullyrested-folder-<folderId>` or
  `fullyrested-request-<requestId>`. `FULLYRESTED_SECRET_<NAME>` still works
  as it does today.
- **Credential fields are reference-only.** A reference substitutes only where
  it is physically stored, so `set_auth` has to be able to write the field
  that holds a credential. `password`, `secretKey` and `sessionToken` take a
  single `{{$name}}` and nothing else — a literal, a `{{variable}}`, an empty
  string and two references run together are all refused. The field is
  writable, so `basicauth` and `awssig` can be finished by an agent; it cannot
  hold a value, so the guarantee holds by construction rather than by leaving
  the field out.

So an agent can wire up a secret completely — reference it in a header, auth
block or body — and still never sees or sets the value.

## Reading before writing

Authoring is a burst at setup and near-zero afterwards; the read side runs in
every session. Two read changes make "do I already have what I need?" cheap
to answer:

- **`tree` reports validation more usefully.** It already emits
  `ValidationType` per request and run (`Inherit | None | ResponseCode |
  Headers | Body | HeadersBody`). It gains a flag for a row that declares a
  body check whose `jsonSchema.schema` is empty, and `Inherit` is resolved
  through the scope chain so a row never merely says "Inherit". One `tree`
  call then shows exactly which requests and runs still need work.
- **A new `settings(scope?)` read verb** returns the setting *names* defined
  at each scope and nothing else: headers, variables, secret references, auth
  type. Names only, no values — cheap, and it leaks nothing. It answers "is
  `Authorization` already set at collection level, or do I add it here?" in
  one call. It generalises the existing `environments` view, which already
  returns environment names plus variable names without values. On the CLI it
  joins the existing inspect commands as `fullyrested settings -c <frcol>
  [--scope <locator>]`, not the `edit` namespace, because it writes nothing.

No raw-document getter is added: `show_request` already reports the scope
each effective value came from, which answers the question authoring needs —
"is this header on the run, or inherited?"

The authoring loop is therefore `tree` → `settings` if inheritance is in
question → write → and from then on `tree` and `run`.

### A note on tool count

This adds 22 MCP tools (21 authoring verbs plus `settings`) to the ~10 the
server has today. That is the direct price of intention verbs over patches.
An MCP server cannot stage its own tool list — everything in `tools/list`
arrives at connect — so the mitigation is to keep each one cheap for a client
that defers schemas: short names, one-line descriptions, no prose. The
intended flow is documented in the README, not repeated across 22
descriptions.

## Schema inference

`validation_from_case(scope, case, runId?)` is the one authoring verb that
reads the run store (memory, then the store directory under MCP; `--store` on
the CLI). From the recorded case it sets `httpCode` to the recorded status,
`type` to `Body` — or `HeadersBody` when header checks are already
configured — `body` to `JsonSchema`, and `jsonSchema.schema` to the inferred
schema.

The rules are chosen to fail on regressions rather than on growth:

| Observed | Inferred |
|---|---|
| object | `type: object`, `properties` per key, `required` = the keys present. `additionalProperties` is left unset, so a field the API adds later does not fail the test |
| array | `type: array`, `items` = the merge of every element: `properties` unioned, `required` intersected. An empty array yields no `items` |
| string, boolean | `type` only — no `enum`, `format`, `pattern` or length, which would over-fit a single sample |
| number | `integer` when every observed value is integral, otherwise `number` |
| null | the type unioned with `"null"` |

Output is draft 2020-12, matching `Ajv2020({allErrors: true, strict: false})`
in `validate.ts`. The one deliberate over-fit is `integer`: it is a one-word
hand-edit when wrong, and it is the check most likely to catch a real change
in an API.

Recorded bodies are already redacted, so a secret that was echoed back
appears as `{{$secret:name}}` and infers as `type: string`. Nothing leaks
into a committed schema.

The verb refuses, naming the alternative, for a non-JSON body, a case with
`outcome: 'error'`, or a case with no response: all three tell the caller to
use `set_validation` directly.

## Errors

The convention set by the query layer holds: the message lists what does
exist, the CLI exits 2, and MCP returns an `isError` result with the same
text so the agent can correct itself.

- **A locator that does not resolve** lists the siblings that do.
- **A verb/locator mismatch** names the locators that verb accepts.
- **A path that escapes the collection folder** is refused by the sink.
- **`new_*` onto an existing path**, and `rename` or `move` onto one, are
  refused. Nothing is ever silently overwritten.
- **`delete folder:`** succeeds only when the folder holds nothing but
  `.frreq` and `folder.frfolder` files; otherwise it is refused and names the
  stray files, so an agent never removes something it did not put there.
- **A sink that cannot be written** fails the verb and says so. Unlike a lost
  run record, a lost write cannot be shrugged off.

## Testing (vitest, test-first)

**core**

- Locator parsing and resolution, including every failure message.
- Each verb's document transform, against golden documents.
- A `normalise` round-trip proving a created file matches what the app
  writes, down to `JSON.stringify(…, 4)`.
- The inference table case by case: nested objects, mixed-shape arrays,
  nulls, empty arrays, integral versus fractional numbers, non-JSON.
- Every verb/locator mismatch.
- A new `MemoryCollectionSink`, the write sibling of `MemoryRunStore`, keeps
  all of this free of `fs`.

**cli**

- `FsCollectionSink` against a temp directory, including `../`,
  absolute-path and symlink escape attempts.
- The loop end to end: `new_collection` → `new_request` → `new_run` →
  `set_validation` → `run` against a local `http.createServer`, asserting the
  run passes.
- `secret set` stores the value under the right keychain service.

**mcp**

- An in-process client/server pair: the authoring tools are registered and
  `secret set` is not; a write outside the collection folder is refused;
  `tree` → `new_run` → `validation_from_case` → `tree` shows the changed
  validation marker.

**app**

- A fixture written by the core verbs loads through the app's parse path
  unchanged.

## Future work

- **The desktop app adopts these verbs**, replacing its own write handlers
  with a `CollectionSink` in the Electron main process. The guard logic in
  `collection-access.js` and the sink's confinement rule would become one
  implementation.
- **Concurrent-edit detection** between the app and an agent, if
  last-writer-wins ever actually bites.
