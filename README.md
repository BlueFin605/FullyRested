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
| CLI (`App/cli-command`) | Working: `fullyrested run` sends a request, one run, or a whole collection, and reports pass or fail |
| Request chaining | **Not built yet.** Runs (named variants of a request) exist, but one request can't feed values into the next |

## Concepts

| Thing | File | What it is |
|---|---|---|
| **Collection** | `*.frcol` | Collection-wide settings plus named **environments**, one of them selected. Each level holds variables, secrets and authentication |
| **Request** | `*.frreq` | Method, URL, headers, query parameters, body, authentication and validation. Any folder under the collection's folder can hold them |
| **Run** | inside a request | A named variant of a request. It overrides variables, secrets, headers, parameters, auth and validation. Use runs to test one endpoint several ways |
| **Variable** | anywhere above | `{{name}}` in a URL, header, body, auth field or validation |
| **Secret** | anywhere above | `{{$name}}`. The value is stored in the OS keychain, never in the file |

When settings conflict, the most specific one wins. The order is
**run → request → selected environment → collection**. Authentication set
to `inherit` falls through to the next level.

Files from the older Rest Easy app (`.reasycol` / `.reasyreq`) still open.
**Save** keeps a file's name. **Save As** uses the new extensions.

**Authentication:** none, basic, bearer token and AWS Signature V4 (header or
presigned URL).

**Validation:** status code, response headers, and a JSON Schema check on the
body.

**Response viewers:** JSON, XML, HTML and images.

## Getting started

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

## Project layout

| Path | What |
|---|---|
| `App/core` | `@fullyrested/core`, the shared engine |
| `App/FullyRested` | The desktop app: Electron main process plus an Angular UI |
| `App/cli-command` | The command-line runner |
| `Test Collection` | Example collection and requests |
| `docs/` | Point-in-time reviews |

See [`SYSDOC.md`](SYSDOC.md) for how the layers fit together and how to
build, test and package each part.

## License

GPL-3.0. See [LICENSE](LICENSE).
