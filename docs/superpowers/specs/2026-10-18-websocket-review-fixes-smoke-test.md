# WebSocket review fixes — manual smoke test

Date: 2026-10-18 · Branch: `feature/websocket-support` (PR #37) · Fix commits: `accd953`, `1fb1296`
Specs: `2026-10-17-websocket-design.md`, `2026-10-17-websocket-trigger-design.md`

This is a step-by-step manual check of the review fixes. Every fix already has a
unit test. This run shows the behaviour against a real local server, through the CLI
(Part B) and through the desktop app (Part C).

On 2026-10-18 the CLI steps in Part B were run exactly as written, and the
**Expected** lines are what they printed. The desktop steps in Part C were not run
by Claude; they are based on the editor and service code.

## What is being checked

| # | Fix | Where in code | CLI step | Desktop step |
|---|---|---|---|---|
| 1 | Redaction regex masked only up to the first `s` | `core/src/redact.ts:102` | — (unit test only, see "Not covered") | — |
| 2 | `{{$guid}}`/`{{$timestamp}}` frozen across trigger firings | `core/src/websocket/test-run.ts` `fireTriggerRequest`, `cli-command/src/ws-run.ts` `buildTriggerFirer`, `execute-rest-calls.service.ts` `resolveTrigger` | B1 | C1 |
| 3 | A different `{{$guid}}` in the url, message and expect of one case | `ws-run.ts` `resolveWebSocketTarget`, `execute-rest-calls.service.ts` `sendWebSocket`, `core/src/builder.ts` `replaceVariables` | B3 | C3 |
| 4a | Interval measured from the end of the previous call instead of a fixed beat | `test-run.ts` `startTrigger` | B2 | C2 |
| 4b | No run-time minimum interval (0 fired back-to-back) | `test-run.ts` `startTrigger`, `core/src/model.ts` `MIN_TRIGGER_INTERVAL_MS` | B5 | — |
| 5 | An MCP target was called "a websocket request" | `core/src/authoring/websocket.ts:213`, `ws-run.ts`, `execute-rest-calls.service.ts` | B6 | — (unit test) |
| 6 | A hidden interval error blocked saving when Repeat = Once | `edit-request-websocket.component.ts` `onTriggerChange` | — | C5 |
| 7 | Timeout note reported only the last call's status as if every call returned it | `test-run.ts` `triggerFailureNote` | B4 | C4 |
| 8 | Duplicate node resolve in `runWebSocketCase` | `ws-run.ts` | (no visible behaviour, refactor only) | — |

---

## Part A — Automated checks (run this first)

```bash
cd ~/Development/Projects/Home/FullyRested/App/cli-command
npm run smoke
```

This builds the CLI (which also builds core), starts `smoke/smoke-server.mjs` on port
8787, builds the test collection in a temp folder with `smoke/make-collection.mjs`, runs
every check in Part B against the server's own `/log`, then stops the server. It takes
about 20 seconds and needs no manual steps.

**Pass:** the last line reads `N checks passed, 0 failed` and the exit code is 0.
**Fail:** each failed check prints the value it saw. The scratch folder and the server
output are kept and their paths printed.

Options: `PORT=9000 npm run smoke` for another port (the server and the checks both use
it). `SMOKE_KEEP=1` keeps the scratch folder on success too.

The checks are not timing-exact. Gaps allow about ±150 ms, and the note counts allow ±1
call for timing. The old-bug values in Part B are far outside those windows.

---

## Part B — What `npm run smoke` checks

Each row is one check in `smoke/run-smoke.mjs`. The "old bug" column is what the
check would have caught before the fix. The check fails when that behaviour comes back.

| Check | Expected now | Old bug |
|---|---|---|
| **B1** `watch-fresh` passes; 3 `/fire` calls, all 200, 3 distinct guids | pass, three guids (fix 2) | one 200, then 409s with the same guid, timeout |
| **B2** `watch-beat` passes; gaps between firings about 1000 ms (850–1250) | pass in ~3.7 s (fix 4a) | gaps about 1600 ms |
| **B3** `watch-room` passes; url, message and expect share one guid | pass (fix 3) | "did not match the schema" |
| **B4** `watch-flaky` fails; note reads `trigger returned 500 ×N, 401 ×M across K calls`; totals and per-status counts match the server log (±1) | fail with per-status note (fix 7) | `trigger returned 500 on all 4 calls` |
| **B5** `watch-clamp` (interval 0 in the file) fails on timeout; 5–15 `/fire` calls; no gap under 90 ms | clamped to 100 ms at run time (fix 4b) | hundreds of calls, back-to-back |
| **B6** `set-trigger` to an mcp request is refused with `is a mcp request`; nothing saved (fix 5) | refused (fix 5) | `is a websocket request` |

Not automated: B7 (the `fullyrested` MCP server in a fresh Claude Code session) and all of
Part C. Those stay manual.

---

## Part C — Desktop app checks

The desktop app has its own code path for websocket runs (`execute-rest-calls.service.ts`)
and its own editor, so it needs its own checks. Keep the server running and the helpers
loaded in Terminal 2.

### Setup (once per session)

The app opens `C:\Users\mitch\fr-smoke\smoke.frcol`. Build it with the same generator
the automated run uses (run from Git Bash):

```bash
cd ~/Development/Projects/Home/FullyRested/App/cli-command
npm run build                                   # if dist is stale
node smoke/make-collection.mjs ~/fr-smoke       # writes ~/fr-smoke/smoke.frcol
node smoke/smoke-server.mjs                     # Terminal 1, leave it running
```

Check the file exists before you open the app: `ls ~/fr-smoke/smoke.frcol`. The
generator rebuilds it every time, so rerunning this is always safe.

Terminal 2 helpers, to paste in for this part:

```bash
log()   { curl -s localhost:8787/log | node -e 'for (const e of JSON.parse(require("fs").readFileSync(0))) console.log(`${e.at}ms  gap ${e.gap}  ${e.path} ${e.status} ${e.id ?? ""}`)'; }
reset() { curl -s -X POST localhost:8787/reset > /dev/null; }
```

### C0. Start the app on this branch (Terminal 3)

```bash
cd ~/Development/Projects/Home/FullyRested/App/FullyRested
npm start            # builds core, then electron-forge start
```

1. In the app: menu **File → Open Collection… (Ctrl+O)**.
2. Pick `C:\Users\mitch\fr-smoke\smoke.frcol`.
3. - [ ] The sidebar lists `fire-guid`, `fire-slow`, `flaky`, `mcp-call`, `watch-beat`,
         `watch-clamp`, `watch-flaky`, `watch-fresh`, `watch-room`.

On a websocket request the request bar's main button reads **Run** instead of Send, and
Ctrl+Enter also runs it.

### C1. Fresh guid per firing (fix 2, desktop path)

1. Terminal 2: `reset`
2. In the sidebar, click **watch-fresh**, then press **Run**.
3. In the response pane:
   - [ ] The result is a **pass**
   - [ ] 3 received messages, each `{"fired":"<guid>"}`, with **three different** guids
   - [ ] The trigger calls list has **3 calls, all status 200**
4. Terminal 2: `log`
   - [ ] 3 `/fire 200` lines with different guids and **no 409**

**What the old bug looked like:** one 200 and then 409s in the trigger calls list,
followed by a timeout failure.

### C2. Fixed beat (fix 4a, desktop path)

1. Terminal 2: `reset`
2. Click **watch-beat** and press **Run**.
3. - [ ] It passes in about 3.7 s
   - [ ] The trigger calls list shows start times of **about 0, 1000, 2000, 3000 ms**
   - [ ] Terminal 2 `log` shows gaps of about 1000

**What the old bug looked like:** start times of about 0, 1600, 3200, 4800.

### C3. Shared guid (fix 3, desktop path)

1. Click **watch-room** and press **Run**.
2. - [ ] It passes
   - [ ] The received message shows `urlRoom` and `msgRoom` with **the same** guid

**What the old bug looked like:** a fail with "did not match the schema", and two
different guids in the message.

### C4. Mixed-failure note (fix 7, desktop path)

1. Terminal 2: `reset`
2. Click **watch-flaky** and press **Run**.
3. - [ ] It fails, and the error reads like
         `trigger returned 500 ×3, 401 ×1 across 4 calls`
   - [ ] The trigger calls list shows the individual 500s and 401s

### C5. A hidden interval no longer blocks saving (fix 6)

1. Click **watch-fresh**. In the request editor, scroll to the **Trigger** section. It shows
   Request `fire-guid`, Repeat **Until done**, **Interval (ms)** `500`, **Delay (ms)** `0`.
2. Clear **Interval (ms)** and type `50`.
   - [ ] A validation error appears at the interval field (the minimum is 100)
   - [ ] Pressing **Ctrl+S** does **not** save, because the editor is invalid
3. Click **Once** in the **Repeat** toggle.
   - [ ] The **Interval (ms)** field disappears
   - [ ] **No error is left showing** anywhere in the editor
4. Press **Ctrl+S**.
   - [ ] It saves: the tab's unsaved/dirty marker clears
5. Terminal 2:
   ```bash
   grep -A5 '"trigger"' watch-fresh.frreq
   ```
   - [ ] `"repeat": "once"`
   - [ ] `"interval": 500`. The hidden, invalid 50 was **never written**.
6. Click **Until done** in the **Repeat** toggle.
   - [ ] The Interval field comes back. If it shows `50` with the error, that is correct,
         because the hidden value is being validated again.
7. Set **Interval (ms)** to `500` and press **Ctrl+S**.
   - [ ] Terminal 2: `grep -A5 '"trigger"' watch-fresh.frreq` shows `"repeat": "until-done"` and `"interval": 500`

**What the old bug looked like:** at step 4 the save did nothing and nothing on screen
said why, because the interval error stayed set while its field was hidden.

---

## Not covered by hand (unit tests only)

| Fix | Why there is no manual step | Covering test |
|---|---|---|
| 1 — redaction regex | Trigger errors you can cause locally (ECONNREFUSED, a status code) never include the request URL, so a presigned URL can't be made to show up in output | `App/core/test/redact.test.ts`: "maskPresignedText > fully masks a security token that contains s or S", "stops the masked value at whitespace" |
| 5 — MCP label in the desktop | The desktop trigger picker only offers http requests, and the CLI refuses to save an MCP target (B6), so there's no way to reach the run-time path | desktop spec "names the real type when the trigger request is an mcp request"; cli "buildTriggerFirer > names the real type when the trigger request is not http" |
| 8 — duplicate resolve | Refactor with no visible behaviour | cli "resolveWebSocketTarget > returns the resolved secrets with the target" |

## Automated suites (re-run before merging)

```bash
cd ~/Development/Projects/Home/FullyRested/App/core         && npx vitest run                         # 754 passed
cd ../cli-command                                            && npm test                               # 241 passed
cd ../FullyRested                                            && npx ng test --watch=false --browsers=ChromeHeadless   # 286 passed
cd ../FullyRested                                            && npm run test:main                      # 62 passed, 1 skipped (pre-existing)
```
None of these packages has a lint target (`ng lint` reports no lint target), so lint
can't be run.

## Cleanup

1. Ctrl+C the server in Terminal 1 and close the app.
2. `rm -rf ~/fr-smoke`

