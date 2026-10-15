# FullyRested

A desktop REST client, like Postman, built around two ideas:

1. **Requests are plain files.** A collection is a folder of JSON files, so it
   can live in git: branch it, diff it, review it in a pull request.
2. **One engine, two front ends.** A request built and tested in the desktop
   app can be run unchanged from the command line, for example in CI.

## Why

I like Postman, but it falls short in a few places:

- Its version control is its own. You can't back a collection with git.
- Its scripting is complicated, and you can't chain requests together.
- Running a collection outside the app needs a separate tool with its own
  quirks.

## Design goals

- **Layered.** Each layer has one job: files hold the data; a shared core
  builds, sends and checks requests; a thin host layer reads files and the
  keychain; front ends collect input and show results.
- **Same request, UI or CLI.** A request, a run and an environment mean the
  same thing whether you click **Run** in the app or run it from a terminal.
  The CLI's options mirror the app: collection, environment, request and
  run.
- **One implementation.** Resolving a request's settings, substituting
  variables, authentication, sending and validation are written once, in
  `@fullyrested/core`. The desktop app and the CLI both call it, so they
  can't drift apart.
- **No secrets in files.** Files hold `{{$name}}` references. The values
  live in the OS keychain.

## Status

| Part | State |
|---|---|
| Desktop app (Electron + Angular) | Working: edit, run, validate and save requests and collections |
| Shared core (`App/core`) | Holds the model, substitution, authentication, execution, validation and secret handling. Covered by unit tests |
| CLI (`App/cli-command`) | Working: `fullyrested run` sends a request, one run, or a whole collection and reports pass or fail; `fullyrested edit` creates and changes collections, and `fullyrested mcp` serves both over MCP |
| Request chaining | **Not built yet.** Runs (named variants of a request) exist, but one request can't feed values into the next |

## Concepts

| Thing | File | What it is |
|---|---|---|
| **Collection** | `*.frcol` | Collection-wide settings plus named **environments**, one of them selected. Each level holds headers, variables, secrets and authentication |
| **Request** | `*.frreq` | Method, URL, headers, query parameters, body, authentication and validation. Any folder under the collection's folder can hold them |
| **Run** | inside a request | A named variant of a request. It overrides variables, secrets, headers, parameters, auth and validation. Use runs to test one endpoint several ways |
| **Variable** | anywhere above | `{{name}}` in a URL, header, body, auth field or validation |
| **Secret** | anywhere above | `{{$name}}`. The value is stored in the OS keychain, never in the file |

When settings conflict, the most specific one wins. The order is
**run → request → folders → selected environment → collection**.
Authentication set to `inherit` falls through to the next level.

## Folder settings

Any folder may hold a `folder.frfolder` file with variables, secrets, auth and
headers that every request below it inherits. They take part in the order set
out under Concepts, and headers merge by name, ignoring case.
Auth `inherit` passes up to the next level; `none` stops the search.

Edit a folder's settings from the explorer: right-click the folder, then
**Folder settings**. `Test Collection/trademe/folder.frfolder` is an example.
From the CLI, run one folder with `--folder <path>`.

Files from the older Rest Easy app (`.reasycol` / `.reasyreq`) still open.
**Save** keeps a file's name. **Save As** uses the new extensions.

**Request bodies:** JSON, or form fields sent as
`application/x-www-form-urlencoded`.

**Authentication:** none, basic, bearer token and AWS Signature V4 (header or
presigned URL, with a session token for temporary credentials).

**Validation:** status code, response headers, and a JSON Schema check on the
body.

**Response viewers:** JSON, XML, HTML and images.

## Installing

Download the latest build from
[Releases](https://github.com/BlueFin605/FullyRested/releases/latest):

| Platform | File |
|---|---|
| Windows | `FullyRested-x.y.z Setup.exe` |
| macOS | `FullyRested-darwin-arm64-x.y.z.zip` |
| Linux | the `.deb` or `.rpm` |

**FullyRested is not code-signed.** Signing certificates cost money this
project doesn't spend: a code-signing certificate for Windows runs a few
hundred a year, and notarizing on macOS needs a paid Apple Developer account.
So each platform will warn you, and here is exactly what to expect.

**Windows.** The installer shows a blue SmartScreen panel saying it protected
your PC. Choose **More info**, then **Run anyway**. It installs for the
current user only, into `%LOCALAPPDATA%\FullyRested` — no administrator
prompt — and creates Start Menu and Desktop shortcuts. After the first
install it keeps itself up to date: new versions download in the background
and apply the next time you start the app.

**macOS.** Gatekeeper will refuse to open an unsigned, unnotarized app, and on
Apple Silicon the old right-click-and-Open trick no longer works. Move
`FullyRested.app` to `/Applications`, then clear the quarantine flag:

```sh
xattr -d com.apple.quarantine /Applications/FullyRested.app
```

There is no auto-update on macOS — download a new build to upgrade.

**Linux.** Install the `.deb` or `.rpm` as usual. No auto-update; download a
new package to upgrade.

To build it yourself instead, see below.

## Building from source

Prerequisites: Node.js 22 or later (24 is the pinned version, see `.nvmrc`)
and npm.

Build the shared core first. The app and the CLI both load its compiled
output.

```sh
cd App/core
npm install
npm run build
```

Run the desktop app:

```sh
cd App/FullyRested
npm install
npm run electron
```

Then open `Test Collection/my collection.frcol` to try the example requests.

Build the CLI and put `fullyrested` on your PATH:

```sh
cd App/cli-command
npm install
npm run build
npm link
```

(`npm unlink -g fullyrested-cli` removes it again. Without linking, run
`node dist/index.js` in place of `fullyrested`.)

## Command-line runner

```sh
# one request, using the collection's selected environment
fullyrested run -c "Test Collection/my collection.frcol" -a "json/JSON Result.frreq"

# one run of a request, in a named environment
fullyrested run -c api.frcol -e Production -a users/get.frreq -r "not found"

# every request in the collection's folder, with a JUnit report for CI
fullyrested run -c api.frcol --all --junit results.xml
```

| Option | Meaning |
|---|---|
| `-c, --collection <file>` | The collection file. Required |
| `-e, --environment <name>` | Environment by name or id. Default: the one selected in the collection |
| `-a, --action <file>` | One request file. A relative path also resolves from the collection's folder |
| `-r, --run <name>` | One run of that request, by name or id |
| `-f, --folder <path>` | Every request under that folder; `.` is the whole collection. Cannot be combined with `--action` |
| `--all` | Every run of `--action`, or every request under the collection's folder. A request with no runs is sent as it is |
| `--junit <file>` | Also write a JUnit XML report |

It prints one line per test, `PASS|FAIL <name> <status> <time>`, with any
validation errors under it, then a summary. A request with no validation
passes on any HTTP response. The exit code is 0 when everything passes, 1
when anything fails, and 2 for bad options.

**Secrets:** the CLI reads `{{$name}}` from the environment variable
`FULLYRESTED_SECRET_<NAME>` (upper-cased, with anything not a letter or digit
turned into `_`), then from the OS keychain the desktop app saves to. On CI,
set the environment variables.

## Editing a collection

Collections, folders, requests, runs, environments and their settings can be
built and changed from the command line as well as in the app. Each change is
its own verb under `fullyrested edit`, so a command says exactly what it
touches, and the scope it writes is always named rather than inferred.

```sh
# a collection, a request in it, and a run of that request that expects a 404
fullyrested edit new-collection --file api.frcol --environment Production
fullyrested edit new-request -c api.frcol --path "users/get.frreq" --method get --url "{{base}}/users/{{id}}"
fullyrested edit new-run -c api.frcol --request "users/get.frreq" --name "not found"
fullyrested edit set-validation -c api.frcol --scope "run:users/get.frreq#not found" --type ResponseCode --http-code 404
```

Every verb but `new-collection` takes `-c, --collection`, and every verb that
changes an existing thing takes `--scope`: a locator naming the level it edits.

| Locator | What it addresses |
|---|---|
| `collection` | the collection-wide settings in the `.frcol` |
| `env:Production` | one environment in the `.frcol` |
| `folder:users` | `users/folder.frfolder`, created if it isn't there yet |
| `request:users/get.frreq` | that request file |
| `run:users/get.frreq#not found` | the named run inside that request |

A locator is resolved against the collection before anything is written, so a
mistyped folder, request or run name fails with a list of the names that do
exist, and a path holding a `..` segment is refused as
`'<path>' is outside the collection folder` — the same rule that stops any
write landing outside the collection's folder.

| Group | Verbs |
|---|---|
| Create | `new-collection`, `new-folder`, `new-request`, `new-run`, `new-environment`, `select-environment` |
| Settings | `set-header`, `set-param`, `set-variable`, `add-secret-ref`, `set-auth`, `remove-setting` |
| Request | `set-url`, `set-method`, `set-body` |
| Validation | `set-validation`, `set-validation-header`, `validation-from-case` |
| Structure | `rename`, `delete`, `move` |

`fullyrested edit <verb> --help` has the options for one verb. Worth knowing
before you reach for `--help`:

- **Each `set-*` is an upsert**, keyed by name at that scope: it replaces the
  entry of that name or adds it if there is none. `remove-setting --kind` takes
  it away again (`header`, `param`, `variable`, `secret`, `validation-header`).
- **Not every verb takes every locator.** Parameters, url, method, body and
  validation are request- and run-level; variables and secret references are
  not request-level, because a request has nowhere to keep them — put them on
  one of its runs or on the folder above. A mismatch names the locators the
  verb does accept.
- **`set-header`, `set-param` and `set-validation-header` take `--disabled`**
  to write the row switched off. The flag is written either way, so a verb that
  omits it switches a disabled row back on.
- **`set-validation --json-schema <file>`** takes a path to a schema file; the
  MCP tool takes the schema as text instead, since an MCP client shares no
  filesystem with the server.
- **`validation-from-case`** writes the validation for you from a case of a
  recorded run (see **Run records** below): the status it saw, and a JSON
  Schema inferred from the body. The inference fails on regressions rather than
  on growth — `required` is what the sample had, and a field the API adds later
  does not fail the check.
- **Nothing is overwritten silently.** `new-*`, `rename` and `move` onto an
  existing path are refused, and `delete folder:` only goes ahead when the
  folder holds nothing but `.frreq` and `folder.frfolder` files.
- **`--json`** prints the result as JSON. Usage and locator errors exit 2.

### Secrets, end to end

A secret's value lives in the keychain and nothing else writes it:

```sh
fullyrested edit add-secret-ref -c api.frcol --scope collection --name apiPass   # declare the reference
fullyrested edit set-auth -c api.frcol --scope collection --type basicauth \
  --user-name dean --password '{{$apiPass}}'                                     # reference it
fullyrested secret set -c api.frcol --scope collection --name apiPass            # a person types the value
```

`secret set` reads the value from a prompt, from a pipe, or from `--value`, and
stores it under that scope's keychain service — the same one the desktop app
uses. It writes the keychain only; the `{$secret}` reference in the file is the
separate `add-secret-ref` step above. On CI, set
`FULLYRESTED_SECRET_<NAME>` instead of using the keychain at all.

The credential fields — `--password`, `--secret-key` and `--session-token` —
accept a single `{{$name}}` reference and nothing else. A literal, a
`{{variable}}`, an empty string or two references run together are all refused,
so auth can be wired up completely without a value ever passing through the
command line or an agent.

### Known gaps

- **Deleting a scope leaves its keychain entries behind.** `delete` removes the
  file or the entry in it; the secret values stay under that scope's service in
  the OS keychain until you clear them yourself.
- **A secret name must be letters, digits, `-` and `_`.** `{{$api_pass}}` and
  `{{$aws-secret}}` both work. A name holding anything else — a dot, a space —
  can still be declared but never substitutes; opening the collection reports it
  as a warning rather than letting it fail silently at send time.
- **There is no locking.** Nothing detects the desktop app holding the same file
  open with unsaved changes. If both write, the last writer wins — collections
  are plain JSON in git, so `git diff` shows it and `git checkout` undoes it.

## Using FullyRested from an AI agent

`fullyrested mcp` serves the runner and the authoring verbs over MCP on stdio,
so an agent can look at a collection, change it, run it and look into the
results without reading raw output. After `npm link` in `App/cli-command`,
register it:

```sh
claude mcp add fullyrested -- fullyrested mcp [--store <dir>]
```

Reading and running come first — **run**, then the `case_*` tools for any case
that needs a closer look — and the authoring tools are the same verbs the CLI
has:

| Tool | Use |
|---|---|
| `tree`, `environments`, `show_request` | Look at a collection (or one folder of it, with `folder`) and how a request would be sent. Not needed before `run` |
| `run` | Send requests (the whole collection unless `action` or `folder` is given) and get the counts plus only the cases that did not pass, with their failed checks (bodies are never included) |
| `list_runs`, `run_summary`, `failures` | Find an earlier run, list every case, or see which cases failed, grouped by check |
| `case_request`, `case_response`, `case_body` | Drill into one case. `case_body` takes `path`, `outline`, `range` and `full` so a large body is not dumped whole. `case_response` shows only the useful headers unless `headers` is `true` or a list of names |
| `settings` | What is set at every scope, or at one (`scope`), by name only — no values. Answers "is this header already set above me?" |
| `new_collection`, `new_folder`, `new_request`, `new_run`, `new_environment`, `select_environment` | Create things |
| `set_header`, `set_param`, `set_variable`, `add_secret_ref`, `set_auth`, `remove_setting` | Settings, at any scope the locator allows |
| `set_url`, `set_method`, `set_body` | A request's own fields |
| `set_validation`, `set_validation_header`, `validation_from_case` | Turn a request into an assertion. `validation_from_case` infers it from a recorded case; `set_validation` takes `jsonSchema` as text, where the CLI takes a file path |
| `rename`, `delete`, `move` | Structure |

The authoring tools take the same locators the CLI does (see **Editing a
collection**), and the loop is three steps:

1. `tree` — what exists, and which requests and runs still have no real
   validation.
2. `settings` — only when inheritance is in question: is this header, variable
   or auth already set at a scope above?
3. Edit, then `run` — and from then on `tree` and `run`.

**Authoring is live by default**, with no flag to arm it: a verb writes the file
as soon as it is called. Collections are plain JSON in git, so `git diff` is
the review and `git checkout` is the undo. Writes are confined to the
collection's folder, and `secret set` is deliberately not served — a secret
value never crosses the protocol.

The CLI has the same queries for a terminal or a script:

| CLI | Same as |
|---|---|
| `run --record` | `run`, and also saves the run record |
| `runs`, `summary`, `failures` | `list_runs`, `run_summary`, `failures` |
| `request`, `response`, `body` | `case_request`, `case_response`, `case_body` (`response` shows every header unless `--headers <names>` is given) |
| `tree`, `envs`, `show`, `settings` | `tree`, `environments`, `show_request`, `settings` (`tree --folder <path>` for one folder, `settings --scope <locator>` for one scope) |
| `edit <verb>` | The authoring tools, one per verb (see **Editing a collection**) |

Every query command takes `--json`. A case is named by its index, counted
from 1 in the order the run sent it, or by its name.

**Run records.** `run --record` and the MCP `run` tool save each run under
`<store>/.fullyrested-runs`. `--store` defaults to the current directory. The
MCP server keeps its runs in memory (the last 20) unless a store is given:
`fullyrested mcp --store <dir>` or the `run` tool's `store` argument also
writes them to disk. FullyRested never prunes
that folder, and you decide whether to add it to `.gitignore`.

**Secrets** are redacted in run records and in everything the agent sees.
`--include-secrets` keeps them in a record, and exists on the CLI only.

## Project layout

| Path | What |
|---|---|
| `App/core` | `@fullyrested/core`, the shared engine |
| `App/FullyRested` | The desktop app: Electron main process plus an Angular UI |
| `App/cli-command` | The command-line runner |
| `Test Collection` | Example collection and requests |
| `docs/` | Point-in-time reviews |
| `.github/workflows` | Build on every push and pull request; release on a version tag |

See [`SYSDOC.md`](SYSDOC.md) for how the layers fit together and how to
build, test and package each part.

## License

GPL-3.0. See [LICENSE](LICENSE).
