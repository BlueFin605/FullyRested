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

**Request bodies:** JSON, form fields sent as
`application/x-www-form-urlencoded`, or `multipart/form-data` (text fields and file parts,
including binary ones; see "Multipart uploads" below).

**Authentication:** none, basic, bearer token and AWS Signature V4 (header or
presigned URL, with a session token for temporary credentials).

**Validation:** status code, response headers, and a JSON Schema check on the
body.

**Response viewers:** JSON, XML, HTML and images.

## WebSocket requests

A request with `"type": "websocket"` (`http` is the default, so every existing
file means what it did) takes a `ws://` or `wss://` URL and opens a socket
instead of sending an HTTP call. It reuses the URL variables, headers, auth,
folder inheritance, environments, secrets and runs of an HTTP request; headers
and auth go on the handshake. Binary frames are not supported.

| Field | Meaning |
|---|---|
| `message` | The text frame sent once the socket opens. `{{variables}}` and `{{$secrets}}` are substituted |
| `expect.count` | How many messages to wait for. Default 1 |
| `expect.match` | `all` (default): each of the first `count` messages must match the schema, and a mismatch fails at once. `any`: pass when one message matches; earlier mismatches are extras |
| `expect.schema` | A JSON Schema, stored as text as for HTTP validation (`{ "schema": "..." }`), checked against each message. A message that is not JSON does not match |
| `expect.extras` | `ignore` (default) or `fail`. An extra is a message past the count, or a mismatch under `any` |
| `expect.timeout` | Overall time limit in milliseconds. Default 5000 |
| `expect.settle` | Milliseconds to keep listening after a pass so a late extra is caught. Default 500; used only with `extras: fail` |

HTTP validation fields are not used, and a run overrides variables, secrets,
headers, parameters and auth but not `message` or `expect`.

```json
{
  "type": "websocket",
  "url": "{{wsBase}}/realtime",
  "message": "{\"action\":\"subscribe\",\"board\":\"main\"}",
  "authentication": { "authentication": "bearertoken", "placement": "token",
                      "bearerToken": { "token": "{{$idToken}}" } },
  "expect": { "count": 1, "match": "all", "timeout": 5000,
              "schema": { "schema": "{\"type\":\"object\",\"required\":[\"type\"]}" } }
}
```

**Auth placement.** A browser cannot set headers on a WebSocket, so some
servers (BlueFinWiki's realtime endpoint) read the token from the query string.
Bearer-token auth has a `placement`: `header` (the default, as for HTTP) or the
name of a query parameter, such as `token`. The token is URL-encoded into the
connect URL. Run records, output and errors show the URL without it, and a
failed connect never prints it.

**Trigger.** A server often pushes a message only after something else
happens, such as an HTTP call that changes data. A websocket request can name
an HTTP request in the same collection to fire after the message is sent:

| Field | Meaning |
|---|---|
| `trigger.request` | The HTTP request to fire, as a path relative to the collection (for example `pages/touch.frreq`). It must exist, be `http`, and not be the websocket request itself |
| `trigger.run` | A run of that request, by name or id. Default: the request itself |
| `trigger.repeat` | `until-done` (default): fire again every `interval` until the test finishes, which avoids racing the server's subscription of the new socket. `once`: fire a single time |
| `trigger.interval` | Milliseconds between firings. Default 1000, at least 100 |
| `trigger.delay` | Milliseconds to wait after the message is sent before the first firing. Default 0 |

The trigger fires with the same environment and secrets as the test and only
during a test (**Run**, `fullyrested run`, the MCP `run` tool), never in a live
session. A failing trigger does not fail the test by itself; the `expect`
rules decide. A timeout where every trigger call failed names the trigger, for
example "trigger returned 401 on all 7 calls", or "trigger call still pending"
when the call never answered. Firing stops as soon as the expected messages
arrive, each call is cut off after the test's timeout or 10 seconds (whichever
is shorter), and a call still in flight when the test ends gets up to 1.5
seconds to answer before it is aborted. Each firing is recorded as a trigger
call (start in ms since the test began, status or error, duration) in the run record and shown in
the app's response pane. In the app, the websocket editor has a **Trigger**
section, and the live panel has a **Fire request** button that sends any
http request of the collection once into a running session.

Set it from a terminal with `fullyrested edit set-trigger` (flags `--request`,
`--run`, `--repeat`, `--interval`, `--delay`, `--clear`; give only what changes)
or from an agent with `set_trigger`. `tree` and `show` print a websocket
request's `expect:` and `trigger:` lines.

**Two ways to use a socket.**

- **A test is bounded.** **Run** in the app, `fullyrested run` and the MCP
  `run` tool send `message`, check what comes back against `expect`, and
  close the socket. It passes or fails (on a mismatch, a timeout, a close or a
  rejected handshake) and is recorded like any other case, with the received
  messages and the close code. It runs in a suite beside HTTP requests.
- **A live session is open-ended.** It stays open until you close it, shows
  each message with a sequence number and time, and lets you send more frames.
  It holds the newest 1,000 events in memory and writes nothing to disk. In the
  app, press **Live** on a websocket request, or type a URL into the panel.
  From a terminal use `fullyrested ws watch`; for an agent, the `ws_session_*`
  MCP tools.

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
| `--timeout <ms>` | Websocket tests: wait this long instead of the request's `expect.timeout`, for this run only (the file is not changed). A positive whole number; ignored with a warning for HTTP requests |

It prints one line per test, `PASS|FAIL <name> <status> <time>`, with any
validation errors under it, then a summary. A request with no validation
passes on any HTTP response. The exit code is 0 when everything passes, 1
when anything fails, and 2 for bad options.

**Secrets:** the CLI reads `{{$name}}` from the environment variable
`FULLYRESTED_SECRET_<NAME>` (upper-cased, with anything not a letter or digit
turned into `_`), then from the OS keychain the desktop app saves to. On CI,
set the environment variables.

### Live websocket sessions

```sh
# watch a websocket request, sending a frame once it opens
fullyrested ws watch -c api.frcol "events/feed.frreq" --send '{"action":"subscribe"}'

# or a bare URL, one JSON line per event
fullyrested ws watch wss://example.com/socket --json
```

`ws watch <target>` takes a websocket request file (with `-c`, and optionally
`-e` and `-r`) or a `ws://` / `wss://` URL. It prints each message to stdout
until the server closes the socket or you press Ctrl+C, and nothing else goes to
stdout; warnings and errors go to stderr. `--send <message...>` sends frames
once the session opens. `--json` prints each event as a JSON line, including a
`close` event with its code and reason; otherwise a close prints as
`[closed <code> <reason>]`. `--timeout` is validated but ignored with a
warning, as a session has nothing to time out. The exit code is 0 after a
normal close or Ctrl+C, 1 after an abnormal close or a failed connect, and 2
for bad options.

`ws send <message>` sends into the session its own process holds. Every CLI
invocation is its own process and a session lives only while `ws watch` runs, so
run on its own it exits 2 with "No open session". To send from the command line,
use `ws watch --send`; to keep a session open between sends, use the MCP tools.

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
| Settings | `set-header`, `set-param`, `set-variable`, `add-secret-ref`, `set-auth`, `set-capture`, `remove-setting` |
| Request | `set-url`, `set-protocol`, `set-method`, `set-body`, `set-runs-only` |
| Validation | `set-validation`, `set-validation-header`, `validation-from-case` |
| Structure | `rename`, `delete`, `move` |

`fullyrested edit <verb> --help` has the options for one verb. Worth knowing
before you reach for `--help`:

- **Each `set-*` is an upsert**, keyed by name at that scope: it replaces the
  entry of that name or adds it if there is none. `remove-setting --kind` takes
  it away again (`header`, `param`, `variable`, `secret`, `validation-header`, `capture`).
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

### Capturing a value from one response for later requests

`set-capture` (MCP `set_capture`) puts a rule on a request or a run: after it is
sent, the value is held in `{{variable}}` for every request that runs after it
in the same run.

```
fullyrested edit set-capture -c api.frcol --scope request:pages/create.frreq --name pageGuid --from body --path '$.guid'
fullyrested edit set-capture -c api.frcol --scope request:pages/create.frreq --name trace --from header --path X-Trace
fullyrested edit set-capture -c api.frcol --scope request:pages/create.frreq --name code --from status
```

- `--from body` takes a JSONPath (`$.id`, `$.items[0].guid`; the first match);
  `header` takes the header name, matched without regard to case; `status` takes no path.
- A captured value overrides the same name set at any other level, and lives
  only for that run: it is never written to a variable table. Run order is tree
  order, so name files to put the creating request first (`1-create.frreq`).
- A request's rules apply to each of its runs; a run's rule for the same
  variable replaces the request's.
- A value may be a whole url, such as a presigned `uploadUrl`: a request url of
  `{{uploadUrl}}` is sent as it is, without the request's protocol put in front.
- A rule that finds nothing (no such path, header, or a non-JSON body) turns the
  case into an `error` naming the rule. A case lists the variables it captured as
  `captured` in the run record, never their values. `show` lists a request's rules.
- Capture works in `run`, the MCP `run` tool and the desktop app's run-folder and
  run-collection. Sending one request alone has nothing earlier to capture from.

### Setup inside the run, empty bodies and cleanup

A case that consumes its fixture (a `DELETE` that succeeds once) or leaves data
behind (every create) needs no per-case setup verb: capture does it. Put the
create first, capture its id, delete with it, and the run owns its fixture end to end.

```
fullyrested edit set-capture -c api.frcol --scope request:comments/1-create.frreq --name commentId --from body --path '$.id'
# comments/2-delete.frreq: DELETE {{host}}/comments/{{commentId}}, expects 200
# comments/3-delete again.frreq: the same url, expects 404 (proves the delete took)
```

Several create/delete pairs in one run work the same way: a later capture of the same
name replaces the earlier one, and the case in between sees the newer value. A create
whose product the endpoint under test does not delete is cleaned up by a trailing
request that deletes `{{commentId}}`.

The same pattern covers a created invite code that a later request revokes: capture
`$.code` on `invites/1-create.frreq`, then `invites/2-revoke.frreq` (200), `3-revoke again`
(409), and a list with the revoked filter. Throwaway users work the same way when the target
app has an endpoint that creates one; FullyRested adds nothing for a target that cannot
(a register that 500s, or a dev profile with no email, role or status is the app's to fix or seed).

`set-body` (MCP `set_body`) also takes a run: a run's body replaces its request's.
`--content-type none` on a run sends no body at all (to test a "Request body is required"
400 beside the happy-path run of the same request); `--content-type inherit` removes the override.

### Content types, protocols and a request with runs

- `set-body --content-type json` (also `xml`, `text`, `html`, `form`, `multipart`, any case) is stored as the media type (`application/json`...), so the header is never a bare `json`. A full media type is kept as written; `none` and `inherit` are not media types.
- A url is https unless it says otherwise: `new-request ... "http://{{host}}/x"` and `set-url` with an `http://` prefix set the protocol to http and keep the `{{host}}` placeholder in the url. A variable cannot carry the scheme. For `{{baseUrl}}/pages` (host from a variable) there is no scheme to split, so pass `new-request --protocol http` or run `edit set-protocol --protocol http` (MCP: `new_request` `protocol`, `set_protocol`). A request that fails with EPROTO (https handshake against a plain-http server) says so and names this fix.
- A request with runs is tested through its runs; the bare request is the base they override and is not a case of its own. Write the happy path as a run (it can change nothing), or run the bare request alone with `--action`.
- A target app that answers a malformed body with an HTML error (Express's default) is the app's to fix; validation cannot assert JSON on a reply that is not JSON.

### Unique values and runs-only requests

`{{$guid}}` (a fresh uuid) and `{{$timestamp}}` (epoch milliseconds) are built in. They are written like a secret,
so a secret you declare with the same name wins. They also expand inside a variable's value, so a run can set
`tagName = api-{{$guid}}` and a create case gets a unique name every time. One request sees one value everywhere
(url, body, validation); the next request gets a new one. Nothing else inside a variable value is expanded.

`set-runs-only on|off` (MCP `set_runs_only`) marks a request runs-only: `--all` and `--folder` (and the desktop's
run-all) test only its runs and never send it bare, and `--action` alone on it is refused (use `--run` or `--all`).
Use it for a DELETE or update whose bare form would destroy a shared fixture. `tree` marks it `[runs-only]`.
A request with no runs that is runs-only has no cases at all.

```
fullyrested edit set-runs-only -c api.frcol --scope request:page-types/delete.frreq on
```

### Multipart uploads and a different url per run

`set-body --content-type multipart/form-data` builds a `multipart/form-data` body. The
boundary and the CRLF framing are generated when the request is sent, so nothing in the
file depends on line endings. The `Content-Type` header gets the boundary; a header you set
yourself as `multipart/form-data` gets it added, and any other value (`application/json`, to
see a 415) is sent as written over the same bytes.

```
# text field + a binary file read from disk (kept in the request as base64) + a part of generated bytes
fullyrested edit set-body -c api.frcol --scope request:attachments/upload.frreq --content-type multipart/form-data   --field kind=note --file 'file=./logo.png;type=image/png'
fullyrested edit set-body -c api.frcol --scope 'run:attachments/upload.frreq#too big' --content-type multipart/form-data   --generate file=6000000
```

- `--field name=value` is a text part; `--file name=path` reads a local file (`;type=<mime>` and
  `;filename=<name>` may follow); `--generate name=bytes` makes a file part of that many bytes, to
  go over a size limit without a big file on disk. MCP `set_body` takes the same as `fields`
  (`filename`, `contentType`, `base64`, `size`, or `path` to read a local file).
- Run records show the body with binary and generated content as `<N bytes>`; `bytes` is the real size.

`set-url` (MCP `set_url`) also takes a run: the run's url replaces its request's for that run
(`http://` or `https://` at the front sets the run's protocol; query parameters still apply).
`--url ''` removes the override. Use it to send the same request to a bad guid or another host.

The upload-then-confirm flow needs no fixture file: presign (capture `uploadUrl` and
`attachmentKey`), PUT to `{{uploadUrl}}` (a captured absolute url is sent as it is), then confirm with
`{{attachmentKey}}` in the body, all in one run. Variable values are substituted in a single
pass on purpose, so a variable that holds `{{another}}` is not expanded: capture the whole value
instead of composing it from other variables.

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
| `set_capture` | Capture a response value (`body` JSONPath, `header` or `status`) into a `{{variable}}` for later requests in the same run; requests and runs only |
| `set_runs_only` | Mark a request runs-only (`runsOnly` true/false): suite runs test only its runs |
| `set_url`, `set_protocol`, `set_method`, `set_body` | A request's own fields. `set_url` and `set_body` also take a `run:` scope, to override the url or body for that run. `set_protocol` takes `http` or `https` (request only). `set_body` takes multipart parts (`fields` with `filename`, `base64`, `size` or `path`) |
| `set_validation`, `set_validation_header`, `validation_from_case` | Turn a request into an assertion. `validation_from_case` infers it from a recorded case; `set_validation` takes `jsonSchema` as text, where the CLI takes a file path |
| `rename`, `delete`, `move` | Structure |
| `set_type`, `set_message`, `set_expect`, `set_trigger` | Websocket requests: switch a request between `http` and `websocket` (switching back keeps `message`, `expect` and `trigger`), set the frame to send, set the expectation (`count`, `match`, `schema` as text, `extras`, `timeout`, `settle`), and set the trigger, an http request in the collection fired to provoke messages (`request`, `run`, `repeat`, `interval`, `delay`, or `clear`); give only the fields to change. `set_auth` also takes `placement`. The CLI has the same as `edit set-type`, `set-message`, `set-expect` and `set-trigger`. `tree` and `show_request` report a websocket request's expect and trigger |
| `ws_session_open` | Open a live websocket session on a websocket request (`target` plus `collection`, optionally `environment` and `run`) or a `ws://` / `wss://` URL. Returns a `sessionId`. A failed connect never reveals the URL or token |
| `ws_session_events` | Read a session's events after a cursor (`after`, default 0). Returns `events`, the new `cursor` and `closed`; pass the cursor back to read only what is new |
| `ws_session_send` | Send a text frame. A session the server has closed returns an error result |
| `ws_session_close` | Close a session and return its close code and reason |

`run` also takes `timeoutMs`, the same override as the CLI's `--timeout`.
Sessions live in the MCP server's memory until closed or the server exits.

**Provoking a message in a live session.** To watch what an HTTP call causes,
open the session first, make the call, then read the events:
`ws_session_open` (a websocket request or URL) -> `run` the HTTP request ->
`ws_session_events` (with the cursor from the last read) -> `ws_session_close`.
For a repeatable test, put the HTTP request in the websocket request's trigger
with `set_trigger` and `run` the websocket request instead.

The authoring tools take the same locators the CLI does (see **Editing a
collection**), and the loop is three steps:

1. `tree` — what exists, and which requests and runs still have no real
   validation. It also names the selected environment and, per request
   and run, the expected status and whether a schema or response headers are
   checked (`[Body(schema) 201]`, `[Headers 200 hdrs:2]`), so a second
   `environments` call is not needed.
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
writes them to disk. Each record is a `<runId>.frrun` file (JSON content). The
CLI and the MCP server never prune that folder. Consider adding `*.frrun` (or
`.fullyrested-runs/`) to `.gitignore`; the app never edits `.gitignore`
itself.

The desktop app records too: every send goes into the open collection's
`.fullyrested-runs`, and its records have ids ending in `-app`. The app keeps
the newest 200 of its own and never prunes anyone else's. Its **History** pane
browses the same folder, so a run recorded by the CLI or an agent shows up
there too. Open History from the sidebar, from **View > Run history**, or with
Ctrl+K.

To run more than one request in the app, right-click a folder or the
collection root and choose **Run**. Everything beneath it runs, the results
appear in Run history and in each request's tab, and **Cancel** stops the run
after the current request.

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
