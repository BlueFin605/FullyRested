# Releasing FullyRested

Cutting a release is: get the work onto `master`, bump the version, push the
tag. GitHub Actions builds the installers for Windows, macOS and Linux and
publishes them. Nothing else starts a release.

## Steps

1. **Merge the work to `master`.** The release workflow refuses a tag that is
   not on `master`. `build.yml` runs the tests and builds every installer on
   each PR and each push to `master`, so check it is green first.

2. **Update and clean `master` locally.**

   ```sh
   git checkout master
   git pull
   git status        # must be clean: npm version refuses a dirty tree
   ```

3. **Bump the version and tag it.** One command, from the app folder. It edits
   `App/FullyRested/package.json`, commits, and creates the tag `v<version>`.

   ```sh
   cd App/FullyRested
   npm version 0.1.1          # or: npm version patch | minor | major
   ```

4. **Push the commit and the tag.** Pushing the tag is the trigger.

   ```sh
   git push --follow-tags
   ```

   If `master` is branch-protected and rejects the version-bump commit, push the
   bump through a short PR, merge it, then tag the merge commit by hand
   (`git tag v0.1.1 <sha>` then `git push origin v0.1.1`). The tag must match
   `package.json` and sit on `master`.

5. **Watch the `Release` workflow** in the repo's Actions tab. It runs three
   stages:

   | Job | What it does |
   |---|---|
   | `guard` | Fails fast if the tag does not match `package.json`, or is not on `master` |
   | `build` | Builds core and the renderer, then `electron-forge publish` on Windows, macOS and Linux, each uploading to the **same draft** release |
   | `finalise` | Checks the Windows auto-update assets (`RELEASES`, `*-full.nupkg`, `Setup.exe`) arrived, then flips the draft to published |

6. **Check the published release** under
   [Releases](https://github.com/BlueFin605/FullyRested/releases): it should
   hold the Windows `Setup.exe` (plus `RELEASES` and the `.nupkg`), the macOS
   `.zip`, and the Linux `.deb` and `.rpm`.

7. **Windows only: confirm auto-update works** on a real machine. Install the
   previous version, publish the new one, and the running app should download
   it in the background and apply it on the next start. This cannot be
   automated. Auto-update is Windows-only; macOS and Linux users download the
   new build.

## When something goes wrong

- **A job failed, or the tag was mistyped.** The release is still a *draft*,
  which `update.electronjs.org` never sees, so nothing reached users. Delete the
  draft release and the tag, fix the cause, and tag again:

  ```sh
  git push --delete origin v0.1.1
  git tag -d v0.1.1
  ```

  Then re-run from step 3. Do not reuse a version number that was published.
- **`finalise` says the Windows assets are missing.** Without `RELEASES`,
  installs work but auto-update silently never happens, so the workflow leaves
  the release as a draft. Re-run the failed Windows `build` job, or delete the
  draft and the tag and start again.
- **Tag does not match `package.json`.** Always use `npm version` rather than
  tagging by hand; it bumps and tags together.

## Building installers locally

To check packaging without releasing:

```sh
cd App/FullyRested
npm run make          # output lands in out/make/
```

This needs `App/core` built first (`npm run make` does that for you). On Linux
you also need `rpm` installed for the `.rpm` maker.

## Worth knowing

- **Installers are unsigned.** Windows shows a SmartScreen warning and macOS
  needs `xattr -d com.apple.quarantine`. The README's *Installing* section tells
  users what to expect. Signing can be added later via GitHub secrets without
  changing `forge.config.js`.
- **The workflow files are the source of truth** for the exact steps:
  `.github/workflows/release.yml` and `build.yml`. Packaging is configured in
  `App/FullyRested/forge.config.js`. The reasoning behind the design is in
  `docs/superpowers/specs/2026-10-15-desktop-distribution-design.md`.
