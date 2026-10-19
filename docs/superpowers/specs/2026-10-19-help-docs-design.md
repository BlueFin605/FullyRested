# Help docs: design

Board: **Help & Docs** initiative (`53ca2055-5193-4e84-9ca9-0338a9186979`), branch `feature/help-docs`.

## Goal

User-facing help that shows how to use FullyRested, topic by topic, with
screenshots. First as plain markdown files readable in the repo, then embedded
in the Electron client so the same files are the in-app Help.

## Decisions

| Question | Decision |
|---|---|
| Where the files live | `docs/help/*.md`, screenshots in `docs/help/images/*.png`. One source of truth; the app bundles a copy, it does not fork it |
| Relationship to README | README stays the install/overview page and the CLI/agent reference. Help is task-oriented ("how do I set a variable from a previous call"). Help links to README for CLI/MCP detail rather than restating it (no-duplication rule) |
| Topics | getting started, collections and environments, folders and hierarchy, variables and secrets, authentication, validation, capturing a value from a previous call (chaining), websockets, runs, running a folder/collection and run history, command palette and shortcuts. MCP requests and the CLI/AI interface get a short pointer page |
| Examples | Every guide uses a small purpose-built sample collection, `docs/help/sample-collection/`, so the screenshots are reproducible and a reader can open the same collection. It targets a public echo API (httpbin-style) and a public echo websocket, not the author's own services |
| Screenshots | Captured by a script, not by hand: launch the built Electron app with `--remote-debugging-port`, open the sample collection, drive the UI over CDP (`ws` is already a dependency) and call `Page.captureScreenshot`. Re-runnable with `npm run help:screenshots` so they can be refreshed when the UI changes |
| Embedding | An in-app Help viewer: a **Help** entry in the header menu and the command palette, opening a viewer with a topic list and rendered markdown. Markdown is copied into the Angular `assets` at build time (not duplicated in git). Rendering uses a small markdown library if one is already installed, otherwise `marked` added as a dev dependency |
| Offline | Everything is bundled; images are relative links so they work both on GitHub and in the app |

## Phases

1. **Harness and sample collection.** Sample collection, screenshot script, proves one screenshot end to end.
2. **Guides.** One story per topic group; each guide is written against the real UI and README, with its screenshots.
3. **Embed.** Build step to copy help into assets, Help viewer component, menu and palette entries, tests.
4. **Docs and release.** SYSDOC/README pointers, link from the README; Dean merges.

## Out of scope

Search inside help, versioned help per release, translations, video.
