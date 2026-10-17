# BlueFinWiki full API suite — design

Kanban ticket: "Full run through of FullyTested using MCP" (page `9a7e5b90-c733-4faf-90f7-0565b259c4b5`, under epic "Docs and verification").

## Goals

1. A complete FullyRested test suite for the BlueFinWiki REST API, plus the websocket events its writes trigger, run against local Aspire.
2. Dogfood FullyRested: author and run the suite only through FullyRested's own MCP tools (`new_request`, `set_validation`, `run`, `failures`, ...). Every place where that is impossible, awkward or hard to maintain becomes a Backlog ticket.

The focus is the BlueFinWiki API. BlueFinWiki's own `/mcp` endpoint gets a light smoke check at most; it is not a coverage target.

## Findings that shape the design (read from code, 2026-10-17)

- Backend: Express wrapper over Lambda handlers, `http://localhost:3000`, no `/api` prefix. Started by Aspire (`dotnet run --project aspire/BlueFinWiki.AppHost`, or `start-aspire.ps1`).
- Local auth: `Authorization: Bearer mock-jwt-token` = Admin user `local-dev-user-id`. Other tokens are decoded, not verified.
- ~55 REST routes: pages, comments, attachments, auth/profile, admin invitations/users, tags, page types, search, fetch-url, imdb, health, admin rebuild.
- Websocket: `ws://localhost:3000/ws?token=<any>`. Server pushes only `invalidate {tags, origin}` and `upsert {pages, tags, origin}` to every socket; sends nothing on connect; ignores client messages.
- Existing collection `backend/tests/api/bluefinwiki.frcol` (BluefinWiki submodule) has 4 requests and depends on a seeded `pageGuid`.
- FullyRested has a websocket request type on `feature/websocket-support`; it has no MCP-client request type.
- Suspected BlueFinWiki bugs (unconfirmed): `GET /pages/search` is registered after `GET /pages/:guid`; `DELETE /admin/invitations/:invitationCode` passes a param the handler does not read; `POST /admin/rebuild-page-index` has no auth.

## Design

1. **Layout.** Extend `backend/tests/api/bluefinwiki.frcol` with one folder per area: pages, comments, attachments, auth, admin, tags, page-types, search-and-utilities, health, plus small `mcp` and `ws` folders. Each request has cases for the happy path and every documented error code (400/401/403/404/409/413/415 as applicable).
2. **Test data.** Each folder creates its own pages/comments via the API and cleans up. No dependency on the seeded `pageGuid`. Admin-only routes use `mock-jwt-token`; Standard-role 403 cases use a hand-crafted unsigned JWT (if the backend rejects it, that is a gap ticket).
3. **Websockets.** The `ws` folder holds bounded tests: connect to `/ws?token=mock-jwt-token`, trigger a REST write, assert the `invalidate` or `upsert` message and its tags. Built against `feature/websocket-support`; merging that branch stays Dean's decision. REST work does not depend on it.
4. **Authoring method.** Suite built and run through FullyRested's MCP tools only. A running log of friction goes to the Backlog as tickets: impossible = ticket; difficult/unintuitive/hard to maintain = ticket.
5. **BlueFinWiki bugs found.** Not fixed in this ticket. Each gets a Backlog ticket; the failing case stays in the suite as a known failure.
6. **Running.** One command against local Aspire; suite must pass (apart from known failures) on a clean local stack, and be order-independent.
7. **Out of scope.** CI gating (needs Aspire/LocalStack in CI; separate ticket), full coverage of the 19 BlueFinWiki MCP tools, fixing BlueFinWiki bugs.

## Definition of done

- Every REST route has happy path plus each documented error code.
- Both websocket message types asserted, triggered by real writes.
- Suite passes on a clean local Aspire stack, order-independent, apart from documented known failures.
- Backlog tickets raised for each FullyRested gap and each BlueFinWiki bug found.

## Process

Work lands on a feature branch (never master): FullyRested spec/changes on `feature/websocket-support`; the collection in a new branch in the BluefinWiki submodule. Plan goes to the Kanban board via `bluefin-kanban`.
