# Collection Hierarchy — design

Date: 2026-10-09 · Branch: `feature/collection-hierarchy`

## Goal

A collection behaves the same whether it is built and run in the desktop app
or run from the CLI, and its folder structure is an inheritance hierarchy:
folders carry settings their requests inherit, and core models that hierarchy
as a tree of nodes that resolve by walking up to their parents.

Today folders only group files; settings resolve through a fixed
run → request → environment → collection chain (`core/src/resolve.ts`), the
UI and CLI compose that chain differently, and the directory walk is written
twice (`main.js` `traverseDirectory`, CLI `findActionFiles`).

## File format

### Folder settings

Any folder may hold an optional `folder.frfolder`:

```json
{
  "folderId": "<guid>",
  "variables": [],
  "secrets": [],
  "auth": { "authentication": "inherit", "awsSig": {}, "basicAuth": {}, "bearerToken": {} },
  "headers": []
}
```

- Fields use the existing `VariableTable`, `SecretTable`, `AuthenticationDetails`
  and `HeaderTable` types. A missing field normalises to empty / `inherit`.
- Folder secret values live in the OS keychain under
  `fullyrested-folder-<folderId>`; the file holds references only, as for
  collections and requests.
- The `.frcol` is the root folder's settings. A `folder.frfolder` in the
  collection's root folder is ignored with a warning.
- A folder without the file has an empty settings layer.

### Shared shape

New type `ScopeSettings { variables; secrets; auth; headers }`.
`Environment` becomes `ScopeSettings & { name; id }`, so the collection base
(`collectionEnvironment`) and every environment can carry headers.
`FolderConfig` is `ScopeSettings & { folderId }`. Normalisers fill `headers: []`
on older files.

## Inheritance rules

Order, nearest first:

```
run → request → folders (nearest first) → selected environment → collection base
```

| Kind | Rule |
|---|---|
| Variables, secrets | Nearest active definition of a name wins |
| Auth | First layer whose type is not `inherit` wins; `none` stops the search |
| Headers | Merged by header name, case-insensitive; nearest layer wins. A request cannot remove an inherited header in v1, only override its value |

A request's own query parameters, URL, body and validation are not inherited
from folders (run-over-request behaviour for those is unchanged).

## Core: the scope tree

```
ScopeNode (abstract)   parent?: ScopeNode; error?: Error; layer(): ScopeSettings
 ├─ CollectionNode     wraps CollectionConfig; root; owns environments
 ├─ FolderNode         wraps FolderConfig (or an empty one); name, relative path
 ├─ RequestNode        wraps RestAction + relative file path
 └─ RunNode            wraps RestActionRun; parent is its RequestNode
```

- Nodes wrap the live JSON objects by reference. Unsaved edits in the UI are
  seen by the next `resolve()`. Files stay plain JSON; nodes are never
  serialised.
- `resolve({ environmentId? }): ExecuteRestAction` collects the ancestor chain
  and applies layers in the order above. `environmentId` defaults to the
  collection's `selectedEnvironmentId`. The result feeds `replaceVariables()`
  and `executeRequest()` unchanged.
- `effectiveSettings({ environmentId? })` returns the same merge with each value
  tagged with its source node and whether a nearer layer overrides it. It shares
  the merge code with `resolve()`.
- `resolveRequest`, `applyEnvironment` and `resolveExecuteAction` are removed;
  all callers move to `node.resolve()`.
- Tree helpers on nodes: `find(relativePath)`, `requests()` (all request nodes
  below, stable order), `folders()`, `runs()` on `RequestNode`.

### Building the tree

```ts
interface CollectionSource {
  listDir(path: string): Promise<{ name: string; isDirectory: boolean }[]>;
  readText(path: string): Promise<string>;
}

loadCollectionTree(collectionFile: string, source: CollectionSource, store: SecretStore): Promise<CollectionNode>
```

- Walks the collection file's folder; skips dot-folders and `node_modules`;
  sorts entries by name (locale compare) for a stable order.
- Each `.frcol` / `folder.frfolder` / `.frreq` is parsed, normalised and has its
  secrets filled from `store` with the existing core secret helpers.
- Core still has no `node:`/`fs` imports; path joining uses forward-slash
  relative paths internally and the source maps them to real paths.

### Errors

A file that fails to read, parse or normalise stays in the tree as a node with
`error` set. `resolve()` and `effectiveSettings()` throw when the node or any
ancestor has an error, naming the file:
`Cannot resolve 'logo': trademe/folder.frfolder is invalid: <reason>`.
Broken layers are never skipped silently.

## Hosts

### Electron main (`main.js`)

- Remove `traverseDirectory` / `walkSync`.
- Add IPC handlers `listDir`, `readText`, `getSecret` (exposed in `preload.js`).
- Add `saveFolder`: moves secret values to the keychain via core helpers, then
  writes `folder.frfolder` (same pattern as saving a request). Creates
  `folderId` when absent.
- `testRest` is unchanged.

### CLI (`App/cli-command`)

- `files.ts` becomes `FsCollectionSource` (Node `fs`).
- `run.ts` loads the tree once. Case selection:
  - `--all` → `root.requests()`
  - `--folder <path>` → `root.find(path).requests()` (new option; unknown path is a `UsageError`)
  - `--action <file>` → `root.find(path)`; `--run` as today
- A node whose `resolve()` throws becomes a failed result carrying the error
  message; the run continues.

## Angular UI

- Renderer builds the tree with `loadCollectionTree` over IPC-backed
  `CollectionSource` and `SecretStore`, so the nodes wrap the objects the
  editors are editing.
- **Explorer** renders from the `CollectionNode` tree (replaces
  `TraversedDrectory`). Folders with settings show a marker; nodes with
  `error` show an error badge with the message as tooltip.
- **Folder settings editor**: folder context menu → *Folder settings*. Reuses
  the environment editor (variables, secrets, auth) plus a headers grid.
  Saves through `saveFolder`, then reloads that folder's node.
- **Collection settings** gain the same headers grid.
- **Inherited panel** in the request editor (and run editor): collapsible,
  built from `effectiveSettings()`; lists headers, variables and auth with
  their source; overridden values shown greyed.
- **Execute**: request and run editors emit their node; `ExecuteRestCallsService`
  calls `node.resolve({ environmentId })` then `replaceVariables()`.

## Testing

- Core (vitest), with an in-memory `CollectionSource`:
  - precedence table across run, request, two nested folders, environment,
    collection base — for variables, secrets, auth and headers
  - case-insensitive header merge
  - auth `inherit` fall-through and `none` stop
  - folder secrets filled from `fullyrested-folder-<folderId>`
  - broken folder/request file → `resolve()` throws for descendants only
  - `effectiveSettings()` values and sources agree with `resolve()`
  - stable traversal order; dot-folders and `node_modules` skipped
- CLI (vitest): fixture collection with nested `folder.frfolder`; `--folder`,
  `--all`, unknown folder, broken file reported as a failed case.
- `Test Collection/trademe/folder.frfolder` added as a live example.
- Lint core, CLI and app (`ng lint`) before closing tickets.

## Docs

Update `SYSDOC.md` (layers diagram, pipeline table: tree build and
`node.resolve()` replace the old entry points) and add a *Folder settings*
section to `README.md`.

## Out of scope

- Removing an inherited header from a nearer layer.
- Per-folder environments.
- Folder-level query parameters, base URL or validation defaults.
