# FullyRested

Purpose: a desktop REST client whose requests are git-friendly JSON files,
with one shared engine behind both the desktop app and a command-line
runner. The intent and the user-facing concepts are in
[`README.md`](README.md).

## Tech stack

Angular 22 (Material) UI in an Electron 44 desktop shell / TypeScript 6 core library
(CommonJS; axios, Ajv, `@smithy/signature-v4`) / Node CLI (commander, vitest).
Nothing is deployed to AWS: the app is a local desktop app.

## Layers

```mermaid
flowchart TB
    subgraph FrontEnds["Front ends"]
        UI["Angular UI<br/>App/FullyRested/src"]
        CLI["CLI<br/>App/cli-command"]
        MCP["MCP server<br/>fullyrested mcp"]
    end
    subgraph Hosts["Hosts: files, keychain, dialogs"]
        Main["Electron main process<br/>App/FullyRested/main.js"]
        CliHost["CLI host<br/>App/cli-command/src"]
    end
    Core["@fullyrested/core<br/>App/core"]
    subgraph Storage["Storage"]
        Files[".frcol / .frreq files<br/>kept in git"]
        Keychain["OS keychain<br/>secret values"]
    end
    UI -->|"IPC via preload.js"| Main
    UI -->|"imports source"| Core
    Main -->|"requires dist"| Core
    CLI -->|"requires dist"| Core
    MCP -->|"requires dist"| Core
    CLI --> CliHost
    MCP --> CliHost
    CliHost -->|"reads and writes"| Files
    CliHost --> Runs[".fullyrested-runs<br/>run records"]
    CliHost --> Keychain
    Main --> Files
    Main --> Keychain
```

| Layer | Where | Job |
|---|---|---|
| Front ends | `App/FullyRested/src` (Angular), `App/cli-command` (CLI commands, plus the MCP server in `mcp.ts`, which shares the CLI host and the same pipeline, and serves the authoring verbs by default) | Collect input and show results. Should hold no request logic of their own |
| Hosts | `App/FullyRested/main.js` + `preload.js`; `App/cli-command/src` (`files.ts`, `secret-store.ts`, `run-store.ts`, `inspect.ts`) | Node-only work: reading and writing files, the keychain (`@napi-rs/keyring`), dialogs, and the process that sends requests. Electron main exposes `listDir` / `readText` / `getSecret` / `saveFolder` over IPC, and `collection-access.js` limits every file and keychain handler to the open collection's folder, request files chosen in a Save As dialog, and the secret services of files it has served; the CLI host reads collections through `FsCollectionSource` and writes them through `FsCollectionSink` (JSON at 4-space indent, so app-saved and agent-saved files do not churn in `git diff`), which resolves every path against the collection folder and refuses anything that escapes it — the same idea as `collection-access.js`, implemented a second time for the CLI. It also writes run records (`FsRunStore`, in `.fullyrested-runs`), and takes secrets from `FULLYRESTED_SECRET_<NAME>` before the keychain; `secret set` is the only path that writes a secret value, and it exists on the CLI alone |
| Core | `App/core/src` | The engine: model, the scope tree (`scope.ts`) and its loader (`tree.ts`, over a host `CollectionSource`), request builder, `{{var}}` / `{{$secret}}` substitution, auth, sending, validation, moving secrets in and out of a `SecretStore`. For AI use: `run-record.ts` (the run record), `redact.ts` (`redactCase`, `secretReplacer`), `run-store.ts` (`RunStore`, `MemoryRunStore`), `query.ts` (summary, failures and case queries, with `json-path.ts` and `query-error.ts`) and `inspect.ts` (tree, environments, settings and show-request views). For authoring: `locator.ts` (parse a scope locator, resolve it against the tree), `collection-sink.ts` (`CollectionSink`, the write sibling of `CollectionSource`, plus `MemoryCollectionSink`), `authoring/` (one file per verb family over the shared `editScope` write path: `edit-scope.ts`, `create.ts`, `settings.ts`, `request-fields.ts`, `validation.ts`, `structure.ts`) with `authoring.ts` as the re-export barrel and only public entry point, and `infer.ts` (JSON Schema inference from a recorded body) |
| Storage | Collection folder on disk + OS keychain | The data. Secrets are held as references in files and as values in the keychain |

Core has no `node:` or `fs` imports, because the Angular build bundles its
source into the renderer. It compiles to CommonJS, which Electron's main
process and the CLI both `require()`. Anything that touches the machine
belongs in a host. `docs/reviews/2026-09-29-review.md`
records why the packages are linked with `file:` rather than npm workspaces.

## The request pipeline: what's shared

The UI and the CLI run one pipeline. Only file access and reporting differ:

| Step | Where it lives |
|---|---|
| Build the tree | core `loadCollectionTree` (`tree.ts`): the renderer over IPC in the app, `FsCollectionSource` in the CLI. Secrets are filled in by core `loadSecrets`, fields missing from older files by `normaliseAction` / `normaliseCollectionConfig` |
| Resolve settings: run → request → folders → environment → collection | `RequestNode.resolve()` / `RunNode.resolve()`, called by `ExecuteRestCallsService.executeNode` and the CLI's `runCase` |
| Show inherited settings | `effectiveSettings()`, used by the Inherited panel under the request and run editors |
| Substitute variables and secrets | core `replaceVariables` / `substituteDeep` |
| Authenticate and send | core `executeRequest`; the app calls it in `main.js` over the `testRest` IPC channel |
| Validate the response | core `validateResponse` |
| Record and query | core `run-record.ts` builds the run record, its cases numbered from 1; core `redact.ts` (`redactCase`) redacts each case, called from the CLI's `run.ts` unless `--include-secrets` is given; a `RunStore` keeps it (`FsRunStore` on disk in the CLI, `MemoryRunStore` in the MCP server); `query.ts` answers run-result (what MCP `run` returns), summary, failures and per-case questions for both the CLI commands and the MCP tools |
| Author: create or change a document | core `authoring/` over `editScope`: resolve the locator, read the document raw through `CollectionSource`, apply the verb, `normalise*`, `storeSecrets`, write through `CollectionSink` — `FsCollectionSink` in the CLI and the MCP server, `MemoryCollectionSink` in tests. The app still has its own write handlers in `main.js` |
| Report | Angular response components; the CLI's `report.ts` (text lines, JUnit XML) |

## Known limitations

Recorded because they are decisions rather than oversights — the code shows
what the guards do, not what they deliberately don't.

**The collection-folder guards are check-then-act.** Both hosts validate a
path and then call `fs`, so there is a window between the check and the
write. A local process that can already write *inside* the collection folder
can swap a checked directory for a symlink in that window, and the write
follows it out. Node offers no portable `O_NOFOLLOW` / `openat`, so closing
it properly needs a platform-specific file-handle API. Not taken: the threat
model is an attacker who already has write access inside the folder, and for
a single-user desktop tool whose collections live in git, `git diff` and
`git checkout` are the real safety net. Revisit if the threat model ever
includes a hostile local process.

What the guards *do* cover — escaping the folder, symlinked ancestors and
dangling symlinks — is core `collection-guard.ts`, shared by both hosts,
with the escape tests beside it.

## Where the plan lives

On the BlueFinWiki kanban board, under initiative **AI Refresh**
(`e58ec7d8-09c2-4d67-81b7-9b1b2e72d989`), with epics for the core engine,
secrets hygiene, the CLI runner, the stack upgrade and cleanup. Home's
`configuration/fullyrested/config.json` maps this repo to that initiative.
The `feature/collection-hierarchy` branch maps to the **Collection Hierarchy**
initiative (`78286444-4af7-4e63-9929-1a63a8b641c7`); `active` stays UI Refresh.
The `feature/ai-interface` branch maps to the **AI First** initiative
(`7cb3c7ac-1344-4db1-8cc9-81f1a14a7212`); its design is
`docs/superpowers/specs/2026-10-11-ai-interface-design.md`.
The `feature/authoring-apis` branch maps to the same **AI First** initiative
(`7cb3c7ac-1344-4db1-8cc9-81f1a14a7212`); its design is
`docs/superpowers/specs/2026-10-11-authoring-apis-design.md`.
The `feature/ai-first-followups` branch maps to the same **AI First**
initiative and carries that board's tail: the review and follow-up tickets
left after the two epics shipped.
The `feature/desktop-distribution` branch maps to the same **AI First**
initiative; its design is
`docs/superpowers/specs/2026-10-15-desktop-distribution-design.md`.
`docs/reviews/` holds dated reviews; they are snapshots, not living docs.

## Running it

Build order: the app's main process and the CLI load core's compiled
`dist/`, so build core before either. The Angular build compiles core's
source directly, through a `paths` mapping in `App/FullyRested/tsconfig.json`.

| Task | Command (from the folder shown) |
|---|---|
| Build core | `App/core`: `npm install && npm run build` |
| Test core (vitest) | `App/core`: `npm test` — `pretest` type-checks first |
| Type-check one package, tests included | `App/core` or `App/cli-command`: `npm run typecheck`. `tsconfig.json` covers `src` only and vitest never type-checks, so this is what catches a type error in a test |
| Run the desktop app | `App/FullyRested`: `npm run electron` (builds core, runs `ng build`, starts Electron) |
| UI only, in a browser | `App/FullyRested`: `ng serve`. With no Electron IPC, the repository and execute services return built-in mock data |
| Angular unit tests | `App/FullyRested`: `npm test`. The specs are still CLI boilerplate |
| Test the main process (node:test) | `App/FullyRested`: `npm run test:main` |
| Package installers | `App/FullyRested`: `npm run make` (electron-forge). Output lands in `out/make/` |
| Cut a release | See [RELEASING.md](RELEASING.md): `npm version x.y.z` in `App/FullyRested`, then `git push --follow-tags` |
| Regenerate the icons | `App/FullyRested`: `npm run icons`, after `npm run icons:master` if `icons/source.png` changed. Output is committed |
| Build and try the CLI | `App/cli-command`: `npm run build` (builds core too), then `node dist/index.js run --help`; `npm link` puts `fullyrested` on the PATH |
| Test the CLI (vitest) | `App/cli-command`: `npm test` |
| Serve the MCP server | `App/cli-command`: `fullyrested mcp [--store <dir>]` (or `node dist/index.js mcp`). Stdout carries the protocol, so warnings go to stderr. Registration and tools are in the README |

Runtime state: the app keeps its open tabs and recent collections in
`current_state.json` in Electron's userData folder, and the request files
saved outside a collection (allowed through the IPC guard) in
`trusted_requests.json` beside it. Secrets are stored under
the keychain services `fullyrested-collection-<collectionGuid>` and
`fullyrested-request-<requestId>`; folder secrets use
`fullyrested-folder-<folderId>`.

## Distribution

Nothing here is deployed to AWS. Installers are published as **GitHub Release
assets** on `BlueFin605/FullyRested`, and that is the only place they are
stored. How a user installs one is in [`README.md`](README.md).

| Workflow | Trigger | Job |
|---|---|---|
| `.github/workflows/build.yml` | push to `master`, every PR | Builds and tests core, the CLI and the app on ubuntu/windows/macos, ending in `electron-forge package` — the step that proves `forge.config.js` still works on each platform |
| `.github/workflows/release.yml` | a `v*` tag, and nothing else | Checks the tag, builds all three platforms into one draft release, then publishes it |

Cutting a release is `npm version <x.y.z>` in `App/FullyRested` followed by
`git push --follow-tags`. `npm version` bumps, commits and tags together, so
the tag and `package.json` cannot drift — which the workflow then asserts,
along with the tagged commit being an ancestor of `master`.

Each platform's runner publishes into the same release, which stays a **draft**
until a final job confirms the Windows `RELEASES`, `*-full.nupkg` and
`Setup.exe` all arrived. Drafts are invisible to `update.electronjs.org`, so a
mistyped tag or a failed matrix leg leaves something to delete rather than
something users receive. Without `RELEASES` in particular, installs work
perfectly and auto-update silently never happens — hence the explicit check.

**Both workflows live in this public repo, not in Home.** That is a deliberate
deviation from the `bluefin-dev` layout, which puts deploy workflows in the
private repo. The split exists to keep environment-specific config and AWS
credentials out of public repos, and there are none here: the release
authenticates with the built-in `GITHUB_TOKEN`. Routing it through Home would
require a personal access token with write access to this repo — strictly
worse.

**The app ships unsigned.** An ACM certificate cannot sign code, and macOS
notarization needs a paid Apple Developer account. `forge.config.js` carries a
signing seam that reads absent environment variables, so adding certificates
later is a change to GitHub secrets rather than to the config. The cost to
users is a SmartScreen warning on Windows and a quarantine flag on macOS; both
are documented in the README.

**Auto-update is Windows only.** `main.js` calls `update-electron-app` against
`update.electronjs.org`, guarded on `app.isPackaged` and `win32`: the service
requires a signed app on macOS, and Squirrel does not apply on Linux. Any
failure is logged and ignored — an update check must never delay or block
startup, because the app has to keep working offline. macOS and Linux users
re-download.

The icons are generated from `App/FullyRested/icons/source.png` and committed,
not built on demand; `scripts/restore-alpha.mjs` explains why `master.png`
exists separately.
