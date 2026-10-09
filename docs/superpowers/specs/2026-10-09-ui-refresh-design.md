# UI Refresh — design

Date: 2026-10-09. Board: BlueFinWiki initiative **UI Refresh**
(`7babaafd-064d-4776-969d-35d44c6cb242`). Branch: `feature/ui-refresh`.

## Goal

Bring FullyRested's look and feel up to the standard of Postman, Bruno,
Insomnia and Yaak **without leaving the layout people already know**.
Usability is the deciding test for every change.

## Research summary (2026-10)

What the leading clients share:

- **Layout:** collection tree on the left, request tabs across the top,
  request and response side by side with a draggable divider (with a
  top/bottom option), and a thin status bar at the bottom.
- **The URL bar is the main control:** a colored method dropdown, the URL
  (protocol included) and Send, all in one row. `{{variables}}` are
  highlighted. Ctrl+Enter sends.
- **Tabs:** preview tabs (a single click opens one, the next single click
  replaces it, shown in italics), a dot for unsaved changes, middle-click to
  close, Ctrl+W to close and Ctrl+Tab to switch.
- **Sub-tabs show counts**, for example "Headers (3)".
- **Response:** status, time and size as colored pills; pretty and raw views;
  search; and an empty state that tells you to send.
- **Look:** dense, quiet and IDE-like. Monospace for URLs and bodies, thin 1px
  borders instead of shadows, and color only where it carries meaning
  (method, status, unsaved). Light and dark themes are treated equally.
- **Keyboard first:** Ctrl+Enter send, Ctrl+S save, Ctrl+N new request,
  Ctrl+B toggle sidebar, Ctrl+L focus the URL bar, F2 rename.

## Decisions (agreed with Dean)

| Topic | Decision |
|---|---|
| How far | Keep the familiar layout; restyle Material and rebuild the shell where usability needs it (no exotic layouts) |
| Runs | A run is a set of overrides layered on one request. It stays a child of its request in the tree (the way Postman and Bruno show examples), opens in its own tab, and shows inherited request values greyed out |
| Theme | Light and dark treated equally, following the OS by default (`color-scheme: light dark`), with a manual override (System / Light / Dark) kept in `localStorage` |
| Editor | CodeMirror 6 for request and response bodies, the schema editor and the single-line URL bar (variable highlighting). Replaces `jsoneditor` |
| Staging | Foundation → Shell → Request editor → Response viewer → Tree and tabs → Keyboard |
| Mockups | None; Dean will judge the built result |

## Design

### 1. Foundation
- `src/styles.scss` replaces `styles.css` and the indigo-pink prebuilt theme.
  It uses Material 3's `mat.theme` with `theme-type: color-scheme`, so one set of
  rules covers light and dark, at density `-3`.
- App design tokens are CSS custom properties on `:root`, set with
  `light-dark()`: surfaces, borders, text, accent, and the colors for each
  method and status level. Components use only the tokens.
- Fonts: the system UI font stack (Segoe UI on Windows) for text, and a
  monospace stack (Cascadia Code, Consolas, …) for code.
- `ThemeService` applies System / Light / Dark by setting
  `color-scheme` on `<html>`.
- `CodeEditorComponent` (CodeMirror 6) has inputs for `value`, `language`
  (`json`, `xml`, `html` or `text`), `readOnly`, `singleLine` and
  `placeholder`, and a `valueChange` output. It highlights `{{var}}` and
  `{{$secret}}`, takes its colors from the tokens, and supports Ctrl+F search
  and folding.

### 2. App shell
- One slim title row: the app name, then the File and Collection menus,
  flexible space, the environment selector and a theme toggle. The empty
  toolbar rows and the stray icons go.
- The explorer is a resizable panel (default 260px, kept in `localStorage`)
  and can be hidden with Ctrl+B.
- A status bar at the bottom shows the collection path, the active
  environment and a hint about Ctrl+Enter.
- Inside a request: request and response side by side, with a draggable
  splitter and a layout toggle (side by side / stacked). The choice is kept
  in `localStorage`.

### 3. Request editor
- The URL bar is one row: a colored method dropdown, the URL in a single-line
  CodeMirror (protocol shown inline, with the existing parsing kept), and a
  Send button.
- The request name moves into the tab label. F2 or double-click renames it,
  and it can still be edited from a small name field above the URL bar.
- Sub-tabs show counts: Params (n), Headers (n), Body (type), Auth (type),
  Validation.
- Key/value tables are compact grid rows with a checkbox, key, value and
  delete. They always end with an empty "add" row: typing in it adds a
  new row.
- The body type is a compact button group (none / form / JSON). The JSON
  body uses `CodeEditorComponent`.
- A run uses the same URL bar but read-only: the method and URL come from
  the request, and the run's own parameters are added. Its sub-tabs show
  counts, and the request's inherited headers and params appear greyed out
  above the run's overrides.

### 4. Response viewer
- A status line of pills: status (colored by level), time in ms and size, plus
  a validation pill (Passed / Failed n).
- Sub-tabs: Body, Headers (n), Request headers (n). Validation errors show as
  a list inside the body tab.
- Body views: Pretty (CodeMirror, read-only, with the language picked from
  the content type), Raw, and Preview for HTML and images. There's also a
  copy button.
- Empty state: "Send a request to see the response" with a Ctrl+Enter hint.
  While waiting: a spinner and a Cancel-free "Sending…" label.
- Time is measured in `ExecuteRestCallsService` around the send (no core
  change is needed).

### 5. Tree and tabs
- Tree rows: a colored method badge for requests (GET, POST, …), a run icon
  for runs, a folder icon for folders and a gear for settings.
  Hover highlights the row and the selected row is accented. The filter box
  is styled to match.
- Right-click menu on a request: Open, New run. On a run: Delete run. On an
  environment: Delete. On Environments: New environment.
- Request tabs:
  - a method badge and the name; preview tabs in italics; a dot for unsaved
    changes that turns into × on hover
  - middle-click closes a tab; a + button adds one
  - a run tab is labelled "request › run"

### 6. Keyboard
- A global shortcut service with Ctrl+Enter send, Ctrl+S save, Ctrl+N new
  request, Ctrl+W close tab, Ctrl+Tab / Ctrl+Shift+Tab switch tab, Ctrl+B
  sidebar, Ctrl+L focus URL.
- Menus show the shortcuts alongside their items.
- A command palette (Ctrl+K): open a request by name, switch environment,
  and run any menu command.

## Out of scope
- Folder-level settings files (the core has no folder layer yet). The
  inheritance display covers request → run, plus Auth "inherit" showing
  where the value comes from.
- Cookies, timeline and scripting.

## Testing
- Karma specs for `CodeEditorComponent`, `ThemeService`, the shortcut service,
  the URL bar, and the key/value table's add-row behaviour.
- `ng build` and `ng test` stay green. A manual smoke run is Dean's task.
