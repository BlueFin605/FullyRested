import * as path from 'path';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  AuthoringContext, EditResult, LOCATOR_FORMS, LiveSession, MemoryRunStore, QueryError, RunRecord, RunStore, SecretStore, SettingKind,
  addSecretRef, caseBody, caseRequest, caseResponse, failures, listRuns, move, newCollection, newEnvironment, newFolder,
  newRequest, newRun, remove, removeSetting, rename, resolveRun, runResult, selectEnvironment, setAuth, setBody, setCapture, setHeader,
  setExpect, setTrigger, setMessage, setMethod, setParam, setType, setUrl, setValidation, setValidationHeader, setVariable, summary, validationFromCase
} from '@fullyrested/core';
import { edit } from './authoring';
import { readFileField } from './body-parts';
import { inspectEnvironments, inspectRequest, inspectSettings, inspectTree } from './inspect';
import { FsRunStore } from './run-store';
import { runCollection } from './run';
import { connectSession } from './ws';

// The SDK's CJS entry points resolve under module node16, so plain static imports are used.
export interface McpOptions { defaultStore?: string; secrets: SecretStore }

const warn = (m: string) => console.error(`warning: ${m}`); // stdout belongs to the protocol

const caseRef = z.union([z.string(), z.number()]).describe("Case index, full 'request › run' name, or the bare run name when only one case holds it");
const store = z.string().optional().describe('Folder holding .fullyrested-runs (default: this server\'s, else memory only)');
const runId = z.string().optional().describe('Run id (default: the latest)');
const collection = z.string().describe('Path to the .frcol file');
// The locator grammar is carried once, here, by the shared scope schema -- no authoring tool's
// description repeats it, and this is the same string parseLocator's own error quotes.
const scope = z.string().describe(`Scope to edit: ${LOCATOR_FORMS}`);
const settingName = z.string().describe('Setting name');
const settingValue = z.string().describe('Setting value');
const SETTING_KINDS = ['header', 'param', 'variable', 'secret', 'validation-header', 'capture'] as const;

export function createServer(opts: McpOptions): McpServer {
  const server = new McpServer({ name: 'fullyrested', version: require('../package.json').version });
  const memory = new MemoryRunStore(20);
  // Live websocket sessions live in this process, like the run store, until closed or the server exits
  const sessions = new Map<string, LiveSession>();
  const sessionFor = (id: string): LiveSession => {
    const session = sessions.get(id);
    if (session === undefined)
      throw new Error(`No open session '${id}' (it was never opened, or has been closed)`);
    return session;
  };

  const fsStore = (dir?: string): FsRunStore | undefined => {
    const d = dir ?? opts.defaultStore;
    return d === undefined ? undefined : new FsRunStore(d, warn);
  };
  const storesFor = (dir?: string): RunStore[] => {
    const disk = fsStore(dir);
    return disk ? [memory, disk] : [memory];
  };

  // A record kept with --include-secrets holds secret values, so it is never served to an agent
  const servedRun = async (dir: string | undefined, id: string | undefined): Promise<RunRecord> => {
    const record = await resolveRun(storesFor(dir), id);
    if (record.redacted !== true)
      throw new QueryError(`Run ${record.runId} is not marked as redacted (recorded with --include-secrets?); it is not served over MCP`);
    return record;
  };

  // One text item holding JSON; known errors come back as isError results instead of protocol errors
  const respond = async (fn: () => Promise<unknown> | unknown) => {
    try {
      return { content: [{ type: 'text' as const, text: JSON.stringify(await fn()) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }] };
    }
  };

  // Every authoring tool goes through this one write path, so a bad collection path or a core
  // QueryError comes back as an isError result holding the same text the CLI prints -- which is
  // what lets an agent correct a mistyped locator without help.
  const runEdit = (file: string, run: (ctx: AuthoringContext) => Promise<EditResult>) =>
    respond(() => edit(file, opts.secrets, run));

  server.registerTool('tree', {
    description: 'List the folders, requests and runs of a collection, or of one folder in it. Not needed before run.',
    inputSchema: {
      collection,
      folder: z.string().optional().describe('Show only this folder (a path inside the collection)')
    }
  }, a => respond(() => inspectTree(a.collection, opts.secrets, warn, a.folder)));

  server.registerTool('environments', {
    description: 'List the environments of a collection (names only).',
    inputSchema: { collection }
  }, a => respond(() => inspectEnvironments(a.collection, opts.secrets)));

  server.registerTool('settings', {
    description: 'List what is set in every scope of a collection, or in one scope, by name only (no values).',
    inputSchema: { collection, scope: scope.optional() }
  }, a => respond(() => inspectSettings(a.collection, opts.secrets, a.scope)));

  server.registerTool('show_request', {
    description: 'Show a request as it would be sent, with where each setting comes from.',
    inputSchema: { collection, action: z.string().describe('Request file (.frreq)'), run: z.string().optional(), environment: z.string().optional() }
  }, args => respond(() => inspectRequest(args, opts.secrets, warn)));

  server.registerTool('run', {
    description: 'Send requests of a collection: one request file (action, optionally one of its runs), a folder, or everything (the default). Returns the pass/fail/error counts plus only the cases that did not pass, with their failed checks; run_summary lists every case, and case_* drill into one. Bodies are only returned by case_body. Authoring loop: tree, edit, run.',
    inputSchema: {
      collection, environment: z.string().optional(), action: z.string().optional(),
      run: z.string().optional(), folder: z.string().optional(), all: z.boolean().optional(), store,
      timeoutMs: z.number().optional().describe('Websocket tests: wait this many ms instead of the request expect.timeout, for this run only (the file is not changed). A positive whole number.')
    }
  }, ({ store: dir, timeoutMs, ...rest }) => respond(async () => {
    const options = { ...rest, ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }) };
    // Unlike the CLI, no selection means the whole collection, so an agent's first call is not wasted
    const selected = options.action !== undefined || options.folder !== undefined || options.all !== undefined;
    const record = await runCollection(selected ? options : { ...options, all: true }, opts.secrets, { onWarning: warn, includeSecrets: false });
    await memory.save(record);
    const disk = fsStore(dir);
    if (disk) {
      try {
        await disk.save(record);
      } catch (error) {
        warn(`could not record run: ${(error as Error).message}`);
      }
    }
    return runResult(record);
  }));

  // Websocket sessions. Websocket tests go through `run`; these hold a connection open to read and send.
  const sessionId = z.string().describe('Session id from ws_session_open');

  server.registerTool('ws_session_open', {
    description: 'Open a live websocket session on a websocket request (with collection) or a ws:// or wss:// url; returns a session id.',
    inputSchema: {
      target: z.string().describe('A ws:// or wss:// url, or a websocket request file (.frreq) with collection'),
      collection: collection.optional(), environment: z.string().optional(), run: z.string().optional()
    }
  }, a => respond(async () => {
    const session = await connectSession(a.target, { collection: a.collection, environment: a.environment, run: a.run }, opts.secrets);
    const id = randomUUID();
    sessions.set(id, session);
    return { sessionId: id };
  }));

  server.registerTool('ws_session_events', {
    description: 'Read the events of a session after a cursor (default 0, all held); returns the events, the new cursor and whether it is closed.',
    inputSchema: { sessionId, after: z.number().int().min(0).optional().describe('Cursor from the previous read') }
  }, a => respond(() => {
    const read = sessionFor(a.sessionId).readEvents(a.after ?? 0);
    return { events: read.events, cursor: read.lastSeq, closed: read.closed };
  }));

  server.registerTool('ws_session_send', {
    description: 'Send a text frame into an open session; a closed session returns an error result.',
    inputSchema: { sessionId, message: z.string().describe('Text frame to send') }
  }, a => respond(() => {
    const result = sessionFor(a.sessionId).send(a.message);
    if (!result.ok)
      throw new Error(result.error);
    return { sent: true };
  }));

  server.registerTool('ws_session_close', {
    description: 'Close a session and return its close code and reason.',
    inputSchema: { sessionId }
  }, a => respond(() => {
    const session = sessionFor(a.sessionId);
    session.close();
    sessions.delete(a.sessionId);
    const close = session.readEvents(0).events.reverse().find(e => e.kind === 'close');
    return close?.kind === 'close' ? { closed: true, code: close.code, reason: close.reason } : { closed: true };
  }));

  server.registerTool('list_runs', {
    description: 'List recorded runs, newest first.',
    inputSchema: { store }
  }, ({ store: dir }) => respond(() => listRuns(storesFor(dir))));

  server.registerTool('run_summary', {
    description: 'Show every case of a run with its outcome (run already returns the cases that did not pass).',
    inputSchema: { runId, store }
  }, a => respond(async () => summary(await servedRun(a.store, a.runId))));

  server.registerTool('failures', {
    description: 'Show the failing and errored cases of an earlier run (run already returns these for the run it sends).',
    inputSchema: { runId, store }
  }, a => respond(async () => failures(await servedRun(a.store, a.runId))));

  server.registerTool('case_request', {
    description: 'Show the request a case sent.',
    inputSchema: { case: caseRef, runId, store }
  }, a => respond(async () => caseRequest(await servedRun(a.store, a.runId), a.case)));

  server.registerTool('case_response', {
    description: 'Show the response a case received, without its body. Only the useful headers are shown (headersOmitted counts the rest) unless headers is given.',
    inputSchema: {
      case: caseRef, runId, store,
      headers: z.union([z.literal(true), z.array(z.string())]).optional().describe('true for every header, or a list of header names')
    }
  }, a => respond(async () => caseResponse(await servedRun(a.store, a.runId), a.case, { headers: a.headers })));

  server.registerTool('case_body', {
    description: 'Show the response body of a case (or the request body), optionally by JSON path, outline or range.',
    inputSchema: {
      case: caseRef, runId, store,
      request: z.boolean().optional().describe('Show the request body instead'),
      path: z.string().optional().describe('Extract a path from a JSON body'),
      outline: z.boolean().optional().describe('Show the shape of a JSON body'),
      range: z.object({ start: z.number().int().min(0), end: z.number().int().min(0) }).optional().describe('Character range of a text body'),
      full: z.boolean().optional().describe('Do not truncate')
    }
  }, a => respond(async () => caseBody(await servedRun(a.store, a.runId), a.case, {
    request: a.request, path: a.path, outline: a.outline, full: a.full,
    range: a.range ? [a.range.start, a.range.end] : undefined
  })));

  // -------------------------------------------------------------------------------------------
  // The authoring verbs: one tool each, named as the design spec names them. `secret set` is
  // deliberately NOT registered -- a secret value must never cross the protocol, and the keychain
  // is out of an agent's reach by design. add_secret_ref below writes the reference only; the
  // value is set by a human with `fullyrested secret set`. Do not add it here for symmetry.
  // Descriptions stay one short line: the shared `scope` schema carries the locator grammar once.
  // -------------------------------------------------------------------------------------------

  server.registerTool('new_collection', {
    description: 'Create a new collection file, optionally with environments.',
    inputSchema: {
      file: z.string().describe('Collection file to create (.frcol)'),
      environments: z.array(z.string()).optional().describe('Environments to create')
    }
  }, a => runEdit(a.file, ctx => newCollection(ctx, path.basename(a.file), a.environments ?? [])));

  server.registerTool('new_folder', {
    description: 'Create a folder in a collection.',
    inputSchema: { collection, path: z.string().describe('Folder path, relative to the collection') }
  }, a => runEdit(a.collection, ctx => newFolder(ctx, a.path)));

  server.registerTool('new_request', {
    description: 'Create a request file with a method and url.',
    inputSchema: {
      collection,
      path: z.string().describe('Request path, relative to the collection (.frreq)'),
      method: z.string().describe('HTTP method (get, post, patch, option, delete, put)'),
      url: z.string().describe('Request url (may hold {{variables}})')
    }
  }, a => runEdit(a.collection, ctx => newRequest(ctx, a.path, a.method, a.url)));

  server.registerTool('new_run', {
    description: 'Add a run to a request.',
    inputSchema: {
      collection,
      request: z.string().describe('Request path, relative to the collection (.frreq)'),
      name: z.string().describe('Run name')
    }
  }, a => runEdit(a.collection, ctx => newRun(ctx, a.request, a.name)));

  server.registerTool('new_environment', {
    description: 'Add an environment to the collection.',
    inputSchema: { collection, name: z.string().describe('Environment name') }
  }, a => runEdit(a.collection, ctx => newEnvironment(ctx, a.name)));

  server.registerTool('select_environment', {
    description: "Select the collection's active environment.",
    inputSchema: { collection, name: z.string().describe('Environment name or id') }
  }, a => runEdit(a.collection, ctx => selectEnvironment(ctx, a.name)));

  server.registerTool('set_header', {
    description: 'Set (or add) a header on a scope.',
    inputSchema: { collection, scope, name: settingName, value: settingValue, enabled: z.boolean().optional().describe('Default: true') }
  }, a => runEdit(a.collection, ctx => setHeader(ctx, a.scope, a.name, a.value, a.enabled ?? true)));

  server.registerTool('set_param', {
    description: 'Set (or add) a query parameter (requests and runs only).',
    inputSchema: { collection, scope, name: settingName, value: settingValue, enabled: z.boolean().optional().describe('Default: true') }
  }, a => runEdit(a.collection, ctx => setParam(ctx, a.scope, a.name, a.value, a.enabled ?? true)));

  server.registerTool('set_variable', {
    description: 'Set (or add) a variable on a scope.',
    inputSchema: { collection, scope, name: settingName, value: settingValue }
  }, a => runEdit(a.collection, ctx => setVariable(ctx, a.scope, a.name, a.value)));

  server.registerTool('set_capture', {
    description: 'Capture a response value (body JSONPath, header or status) into a {{variable}} for later requests in the same run; requests and runs only. May hold an absolute url.',
    inputSchema: {
      collection, scope,
      name: z.string().describe("Variable to capture into: letters, digits, '-' and '_' only"),
      from: z.enum(['body', 'header', 'status']).describe('Where the value comes from'),
      path: z.string().optional().describe('body: a JSONPath such as $.id or $.items[0].guid; header: the header name; unused for status')
    }
  }, a => runEdit(a.collection, ctx => setCapture(ctx, a.scope, a.name, a.from, a.path)));

  // No value parameter, and there never may be one: this writes the reference, nothing else.
  server.registerTool('add_secret_ref', {
    description: 'Add a reference to a secret, never its value; a human stores the value with the CLI.',
    inputSchema: { collection, scope, name: z.string().describe("Secret name, as used in {{$name}}: letters, digits, '-' and '_' only, or it will never substitute") }
  }, a => runEdit(a.collection, ctx => addSecretRef(ctx, a.scope, a.name)));

  server.registerTool('set_auth', {
    description: 'Set the authentication of a scope; give only the fields the type needs.',
    inputSchema: {
      collection, scope,
      type: z.string().describe('inherit | none | basicauth | bearertoken | awssig'),
      userName: z.string().optional().describe('basicauth: user name'),
      password: z.string().optional().describe('basicauth: password as a secret reference only, e.g. {{$apiPass}}; add_secret_ref first, a human sets the value'),
      token: z.string().optional().describe('bearertoken: token (use {{$name}} for a secret)'),
      accessKey: z.string().optional().describe('awssig: access key id'),
      secretKey: z.string().optional().describe('awssig: secret access key as a secret reference only, e.g. {{$awsSecret}}'),
      sessionToken: z.string().optional().describe('awssig: session token as a secret reference only, e.g. {{$awsSession}}'),
      awsRegion: z.string().optional().describe('awssig: AWS region'),
      serviceName: z.string().optional().describe('awssig: AWS service name'),
      signUrl: z.boolean().optional().describe('awssig: sign the url instead of headers'),
      placement: z.string().optional().describe("Where the token goes on a websocket handshake: 'header' (default) or a query parameter name such as 'token'")
    }
  }, a => runEdit(a.collection, ctx => setAuth(ctx, a.scope, a.type, {
    userName: a.userName, password: a.password, token: a.token,
    accessKey: a.accessKey, secretKey: a.secretKey, sessionToken: a.sessionToken,
    awsRegion: a.awsRegion, serviceName: a.serviceName, signUrl: a.signUrl, placement: a.placement
  })));

  server.registerTool('remove_setting', {
    description: 'Remove one header, parameter, variable, secret reference, validation header or capture rule.',
    inputSchema: { collection, scope, kind: z.enum(SETTING_KINDS).describe('Setting kind'), name: settingName }
  }, a => runEdit(a.collection, ctx => removeSetting(ctx, a.scope, a.kind as SettingKind, a.name)));

  server.registerTool('set_url', {
    description: "Set the url of a request, or of a run (which overrides its request's for that run).",
    inputSchema: { collection, scope, url: z.string().describe("Url (may hold {{variables}}); on a run, '' removes the override") }
  }, a => runEdit(a.collection, ctx => setUrl(ctx, a.scope, a.url)));

  server.registerTool('set_method', {
    description: 'Set the HTTP method of a request.',
    inputSchema: { collection, scope, method: z.string().describe('get, post, patch, option, delete, put') }
  }, a => runEdit(a.collection, ctx => setMethod(ctx, a.scope, a.method)));

  server.registerTool('set_body', {
    description: "Set the body of a request or run (a run's overrides). 'none' sends no body; 'inherit' (runs only) drops a run's override. multipart/form-data takes parts, including binary file parts.",
    inputSchema: {
      collection, scope,
      contentType: z.string().describe("Content type, 'none' to send no body, or 'inherit' to drop a run's override"),
      text: z.string().optional().describe('Body text (every content type but the form one)'),
      fields: z.array(z.object({
        name: z.string(), value: z.string(),
        filename: z.string().optional().describe('multipart/form-data: makes this a file part'),
        contentType: z.string().optional().describe("multipart/form-data: the file part's own Content-Type"),
        base64: z.string().optional().describe('multipart/form-data: binary content of the file part'),
        size: z.number().optional().describe('multipart/form-data: file part of this many generated bytes (e.g. to go over a size limit)'),
        path: z.string().optional().describe('multipart/form-data: read the file part from this local file (stored in the request as base64)')
      })).optional().describe('Form fields for application/x-www-form-urlencoded, or parts for multipart/form-data (text field, or a file part with filename/base64/size/path)')
    }
  }, a => runEdit(a.collection, ctx => setBody(ctx, a.scope, a.contentType, { text: a.text, fields: a.fields?.map(readFileField) })));

  server.registerTool('set_validation', {
    description: 'Set the validation of a request or run.',
    inputSchema: {
      collection, scope,
      type: z.string().optional().describe('Inherit | None | ResponseCode | Headers | Body | HeadersBody'),
      httpCode: z.number().int().optional().describe('Expected HTTP status code'),
      body: z.string().optional().describe('None | JsonSchema'),
      jsonSchema: z.string().optional().describe('JSON Schema to check the response body against, as text')
    }
  }, a => runEdit(a.collection, ctx => setValidation(ctx, a.scope, {
    type: a.type, httpCode: a.httpCode, body: a.body, jsonSchema: a.jsonSchema
  })));

  server.registerTool('set_validation_header', {
    description: 'Set (or add) a header the response must have.',
    inputSchema: { collection, scope, name: settingName, value: settingValue, enabled: z.boolean().optional().describe('Default: true') }
  }, a => runEdit(a.collection, ctx => setValidationHeader(ctx, a.scope, a.name, a.value, a.enabled ?? true)));

  server.registerTool('validation_from_case', {
    description: 'Learn a validation from one recorded case of a run.',
    inputSchema: { collection, scope, case: caseRef, runId, store }
  }, a => runEdit(a.collection, ctx => validationFromCase(ctx, storesFor(a.store), a.scope, a.case, a.runId)));

  server.registerTool('set_type', {
    description: 'Set whether a request is plain http or a websocket.',
    inputSchema: { collection, scope, type: z.string().describe('http | websocket') }
  }, a => runEdit(a.collection, ctx => setType(ctx, a.scope, a.type)));

  server.registerTool('set_message', {
    description: 'Set the text frame a websocket request sends once the socket opens.',
    inputSchema: { collection, scope, message: z.string().describe('Message text (may hold {{variables}})') }
  }, a => runEdit(a.collection, ctx => setMessage(ctx, a.scope, a.message)));

  server.registerTool('set_expect', {
    description: 'Set what a websocket test waits for; give only the fields to change.',
    inputSchema: {
      collection, scope,
      count: z.number().int().optional().describe('Messages to wait for (at least 1)'),
      match: z.string().optional().describe('all | any'),
      schema: z.string().optional().describe('JSON Schema each message is checked against, as text; empty clears it'),
      extras: z.string().optional().describe('ignore | fail'),
      timeout: z.number().int().optional().describe('Overall time limit in ms'),
      settle: z.number().int().optional().describe('ms to keep listening after a pass (extras: fail only)')
    }
  }, a => runEdit(a.collection, ctx => setExpect(ctx, a.scope, {
    count: a.count, match: a.match, schema: a.schema, extras: a.extras, timeout: a.timeout, settle: a.settle
  })));

  server.registerTool('set_trigger', {
    description: 'Set or clear the http request a websocket request fires to provoke its messages; give only the fields to change.',
    inputSchema: {
      collection, scope,
      request: z.string().optional().describe('The http request to fire, a path in this collection (e.g. orders/list.frreq)'),
      run: z.string().optional().describe('A run of that request; empty clears it'),
      repeat: z.string().optional().describe('once | until-done'),
      interval: z.number().int().optional().describe('ms between firings when repeating (at least 100)'),
      delay: z.number().int().optional().describe('ms to wait after the message is sent before the first firing'),
      clear: z.boolean().optional().describe('Remove the trigger (give nothing else)')
    }
  }, a => runEdit(a.collection, ctx => setTrigger(ctx, a.scope, {
    request: a.request, run: a.run, repeat: a.repeat, interval: a.interval, delay: a.delay, clear: a.clear
  })));

  server.registerTool('rename', {
    description: 'Rename an environment, folder, request or run; use move for a new path.',
    inputSchema: { collection, scope, name: z.string().describe('New (bare) name; a path is an error') }
  }, a => runEdit(a.collection, ctx => rename(ctx, a.scope, a.name)));

  server.registerTool('delete', {
    description: 'Delete an environment, folder, request or run.',
    inputSchema: { collection, scope }
  }, a => runEdit(a.collection, ctx => remove(ctx, a.scope)));

  server.registerTool('move', {
    description: 'Move a request or folder to a new path.',
    inputSchema: { collection, scope, to: z.string().describe('New path, relative to the collection') }
  }, a => runEdit(a.collection, ctx => move(ctx, a.scope, a.to)));

  return server;
}

export async function startMcp(opts: McpOptions): Promise<void> {
  await createServer(opts).connect(new StdioServerTransport());
}
