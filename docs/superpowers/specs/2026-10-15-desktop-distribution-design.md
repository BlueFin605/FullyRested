# Desktop distribution: build, release and auto-update

Date: 2026-10-15
Initiative: AI First (`7cb3c7ac-1344-4db1-8cc9-81f1a14a7212`)
Branch: `feature/desktop-distribution`

## Problem

FullyRested is an Electron app with no CI and no distribution. The only way
to run it is `npm run electron` from a clone, which builds core, builds the
Angular renderer and starts Electron. There is no `.github` directory in the
repository at all, so nothing is built or tested on a push, and
`forge.config.js` has never been exercised — `SYSDOC.md` records that
`npm run make` is "not yet checked against the `file:../core` link".

Wanted: an installed app on Windows and macOS, launched from a Start Menu or
Desktop shortcut, that updates itself.

## Decisions

### Unsigned, published openly

Code signing is out of scope. An ACM certificate cannot sign code — it is a
TLS server certificate with different key usage and a trust path Windows does
not accept for Authenticode. AWS Signer signs only Lambda, IoT and container
artifacts. AWS Private CA certificates are not in the Windows trusted root
store. macOS notarization requires an Apple Developer account. There is no
route to signed binaries without paying, and paying is out of scope.

So: installers are published unsigned, and the README says plainly what users
will see. First install on Windows shows a SmartScreen warning that needs
"More info → Run anyway". On macOS an unsigned downloaded app needs
`xattr -d com.apple.quarantine` from a terminal — Gatekeeper on Apple Silicon
no longer accepts right-click-open for unsigned apps.

`forge.config.js` keeps a signing seam: `osxSign`, `osxNotarize` and
`windowsSign` read from environment variables that are absent today. Adding
certificates later is setting three GitHub secrets, not a redesign.

### Platforms

Windows is the real target. macOS is best-effort unsigned — buildable and
usable on a developer's own machine. Linux deb/rpm are a freebie: the makers
are already configured, a Linux runner costs nothing, and Linux has no
gatekeeping.

### Packaged renderer, not a cloud-hosted one

A thin Electron shell loading the renderer from CloudFront was considered and
rejected on three grounds:

1. **It dies offline.** FullyRested exists to call APIs, frequently
   `localhost` ones, often without usable internet. A REST client that needs
   the network to *open* is a worse product.
2. **It inverts the security model.** `collection-access.js` and core's
   `collection-guard.ts` assume the renderer is local, packaged, trusted
   code. Handing a remote origin `getSecret` / `readText` / `saveFolder`
   over preload means an S3 or DNS compromise reads the OS keychain. That is
   against least privilege.
3. **Core would exist twice.** The Angular build bundles core's *source*
   into the renderer; `main.js` `require()`s core's compiled `dist`. Today
   they are the same commit. Split the renderer into the cloud and the engine
   in the browser can skew from the engine in the shell, with nothing to
   detect it.

The thing wanted from that idea — not having to think about updates — comes
from Squirrel's background delta updates instead.

### The free update service, not self-hosted infrastructure

`update.electronjs.org` is operated by the Electron project, free for public
GitHub repositories, and reads GitHub Releases directly. A self-hosted
Squirrel feed on S3 + CloudFront under `bluefin605.com` would fit the house
style, but needs a CDK stack, a Home deploy workflow, AWS credentials and
manual infrastructure deployment — real work and a second thing to remember
in two years, to replace a free service that does the same job. If the
dependency ever becomes a problem, the publisher is config and the swap is
localised.

### No Home workflow — a deliberate deviation

`bluefin-dev` puts build workflows in the public repo and deploy workflows in
the private Home repo. That split exists to keep environment-specific config
and AWS credentials out of public repos. FullyRested has neither: nothing is
deployed to AWS, and the release authenticates with the built-in
`GITHUB_TOKEN`. Routing the release through Home would require a PAT with
write access to the public repo — strictly worse. Both workflows therefore
live in the FullyRested repository, and `SYSDOC.md` records why.

### Tag-triggered release honours the manual-trigger rule

`bluefin-dev` says deployment actions are manually triggered, never
automatic. Pushing a version tag *is* the manual act. The rule exists because
infrastructure changes are hard to reverse; shipping `v1.2.4` after `v1.2.3`
is not.

## Design

### Continuous integration

`.github/workflows/build.yml` — generic, no secrets, no deploy.

Triggers on push to `master` and on every pull request. Matrix over
`ubuntu-latest`, `windows-latest` and `macos-latest`, Node 24 from `.nvmrc`.

Steps run in dependency order, because both the Electron main process and the
CLI load core's compiled `dist`:

| Step | Command (from the package folder) |
|---|---|
| core | `npm ci && npm test` (its `pretest` type-checks) |
| cli-command | `npm ci && npm test` |
| app renderer | `npm ci && npm run build` |
| app main process | `npm run test:main` |
| package smoke | `npx electron-forge package` |

The package smoke step is the one that matters. It proves the
`packageAfterPrune` hook and the `@napi-rs/keyring` native module survive
packaging on each platform, on the pull request rather than on release day,
and it is what makes the "not yet checked" note in `SYSDOC.md` removable.

Angular's `npm test` (karma/jasmine) is deliberately excluded: `SYSDOC.md`
records that those specs are still CLI boilerplate, so headless Chrome in CI
would assert nothing.

### Versioning

`App/FullyRested/package.json` is at `0.0.0`. It becomes the app's real
version, bumped with `npm version`, which commits and tags in one step so the
repository and the tag cannot drift. `@fullyrested/core` and
`fullyrested-cli` keep their own independent versions; neither is shipped
separately.

### Packaging

Configuration of what `forge.config.js` already has.

- **Windows** — `maker-squirrel`. The installer creates the Start Menu entry
  and the Desktop shortcut itself, and `electron-squirrel-startup` (already a
  dependency) handles the shortcut lifecycle across install, update and
  uninstall. Needs an application icon and `setupIcon`; there is no icon in
  the repository today.
- **macOS** — `maker-zip`, unsigned, built on `macos-latest`.
- **Linux** — `maker-deb` and `maker-rpm`, built on `ubuntu-latest`.

### Release

`.github/workflows/release.yml` — triggers on `push` of tags matching `v*`,
and nothing else.

Cutting a release:

```
cd App/FullyRested
npm version 1.2.3          # bumps package.json, commits, tags v1.2.3
git push --follow-tags
```

The workflow then:

1. Verifies the tag matches the version in `App/FullyRested/package.json`,
   and fails loudly if not — this catches a hand-rolled `git tag` that
   skipped the bump.
2. Verifies the tagged commit is reachable from `master`, so a tag pushed
   from a feature branch cannot ship.
3. Matrix-builds on all three runners, each running `electron-forge publish`
   with `@electron-forge/publisher-github` against the same **draft**
   release.
4. A final job publishes the draft once all three platforms have uploaded.

The draft is what makes an automatic trigger safe. A mistyped tag or a failed
matrix leg leaves an unpublished draft that `update.electronjs.org` never
sees, and it can be deleted. The workflow is the only thing that ever
publishes, so no partial build reaches users.

Authentication is the built-in `GITHUB_TOKEN` with `contents: write`. No
secrets, no AWS credentials, nothing in Home.

### Auto-update

`update-electron-app` initialised in `main.js` after `app.whenReady()`:

- Guarded on `app.isPackaged`, so it never runs under `npm run electron`.
- Guarded on `process.platform === 'win32'`. The service requires a signed
  app on macOS, and Squirrel does not apply on Linux; both log one line to
  stderr and carry on.
- Wrapped so any failure — service unreachable, no network, offline
  entirely — logs and continues. **An update check must never delay or block
  app start.** The correct behaviour for a REST client with no internet is
  "works normally", not "will not open".
- `updateInterval: '1 hour'`, default notification behaviour: download in the
  background, prompt on next restart.

macOS and Linux users re-download from GitHub Releases.

## Testing

CI covers this structurally: the `electron-forge package` step exercises
packaging on all three platforms on every pull request.

The update path cannot be meaningfully automated — it needs two real
published releases and a real Windows installation. It is a one-off manual
verification: install `v0.1.0`, publish `v0.1.1`, confirm the running app
picks it up and restarts into the new version. Once confirmed, Squirrel is
Squirrel.

No new unit tests. There is no new logic beyond configuration and one
guarded call.

## Docs impact — affected

- **`SYSDOC.md`** — the "Running it" table gains the release commands; a new
  short section covers distribution, the unsigned posture, and the
  no-Home-workflow decision with its reasoning. The line saying `npm run
  make` is "not yet checked" is removed, because CI now checks it.
- **`README.md`** — install instructions: where to download, the SmartScreen
  "More info → Run anyway" step on Windows, and the
  `xattr -d com.apple.quarantine` step on macOS.

Invoke `bluefin-docs` when writing these.

## Out of scope

- Code signing and notarization on any platform. The seam exists; the
  certificates do not.
- A self-hosted S3 + CloudFront update feed.
- Auto-update on macOS or Linux.
- Publishing `fullyrested-cli` to npm.
