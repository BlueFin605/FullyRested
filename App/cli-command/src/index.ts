#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { Readable, Writable } from 'stream';
import { Command } from 'commander';
import {
  AuthFields, AuthoringContext, EditResult, LOCATOR_FORMS, QueryError, SettingKind, ValidationFields,
  addSecretRef, caseBody, caseRequest, caseResponse, failures, listRuns, move, newCollection, newEnvironment,
  newFolder, newRequest, newRun, remove, removeSetting, rename, resolveRun, selectEnvironment, setAuth, setBody,
  setHeader, setMethod, setParam, setUrl, setValidation, setValidationHeader, setVariable, summary, validationFromCase
} from '@fullyrested/core';
import { RunOptions, UsageError, runCollection, setup, toTestResult } from './run';
import { edit } from './authoring';
import { loadTree } from './files';
import { FsRunStore, RUNS_FOLDER } from './run-store';
import { formatResult, formatSummary, toJUnit } from './report';
import {
  formatBody, formatEdit, formatEnvironments, formatShown, formatTree, formatFailures, formatRequest,
  formatResponse, formatRuns, formatSettings, formatSummary as formatQuerySummary, parseRange, truncationNotice
} from './query-report';
import { inspectEnvironments, inspectRequest, inspectSettings, inspectTree } from './inspect';
import { startMcp } from './mcp';
import { createSecretStore, createSecretWriter, secretEnvironmentVariable, secretServiceForScope, stripTrailingNewline } from './secret-store';

const program = new Command();

program
  .name('fullyrested')
  .description('Runs FullyRested requests from the command line')
  .version(require('../package.json').version);

program
  .command('run')
  .description('Send requests and check their validation. Exits 1 if any fail.')
  .requiredOption('-c, --collection <file>', 'collection file (.frcol)')
  .option('-e, --environment <name>', 'environment name or id (default: the collection\'s selected one)')
  .option('-a, --action <file>', 'request file (.frreq); relative paths also resolve from the collection folder')
  .option('-r, --run <name>', 'one run of the request, by name or id')
  .option('-f, --folder <path>', 'every request under a folder of the collection (path relative to the collection file)')
  .option('--all', 'every run of --action, or every request in the collection')
  .option('--junit <file>', 'also write a JUnit XML report')
  .option('--record', 'save the run record to <store>/.fullyrested-runs')
  .option('--store <dir>', 'folder holding .fullyrested-runs for --record (default: the current directory)')
  .option('--include-secrets', 'keep secret values in the run record instead of redacting them')
  .option('--json', 'print only the run record as JSON on stdout')
  .addHelpText('after', `
Secrets come from environment variables first, then the OS keychain the
desktop app uses. A secret named "api key" is read from ${secretEnvironmentVariable('api key')}.`)
  .action(async (options: RunOptions & { junit?: string; record?: boolean; store?: string; includeSecrets?: boolean; json?: boolean }) => {
    try {
      const record = await runCollection(options, createSecretStore(), {
        onCase: options.json ? undefined : c => console.log(formatResult(toTestResult(c))),
        onWarning: w => console.warn(`warning: ${w}`),
        includeSecrets: options.includeSecrets
      });
      const results = record.cases.map(toTestResult);

      if (options.json)
        console.log(JSON.stringify(record, null, 2));
      else
        console.log(formatSummary(results));

      if (options.record) {
        const store = new FsRunStore(options.store ?? process.cwd(), w => console.warn(`warning: ${w}`));
        try {
          await store.save(record);
          if (!options.json)
            console.log(`recorded run ${record.runId} in ${path.join(path.resolve(options.store ?? process.cwd()), RUNS_FOLDER)}`);
        } catch (error) {
          console.warn(`warning: could not record run: ${(error as Error).message}`);
        }
      }

      if (options.junit)
        fs.writeFileSync(options.junit, toJUnit(path.basename(options.collection), results));

      process.exitCode = results.every(r => r.passed) ? 0 : 1;
    } catch (error) {
      console.error(`error: ${(error as Error).message}`);
      process.exitCode = error instanceof UsageError ? 2 : 1;
    }
  });

interface QueryOptions { store?: string; json?: boolean }

const openStore = (options: QueryOptions) =>
  new FsRunStore(options.store ?? process.cwd(), w => console.warn(`warning: ${w}`));

// Shared wrapper: query/usage errors print "error: <msg>" and exit 2, anything else exits 1
function queryAction<A extends unknown[]>(fn: (...args: A) => Promise<void>) {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (error) {
      console.error(`error: ${(error as Error).message}`);
      process.exitCode = error instanceof UsageError || error instanceof QueryError ? 2 : 1;
    }
  };
}

const printResult = (options: QueryOptions, result: unknown, text: string) =>
  console.log(options.json ? JSON.stringify(result, null, 2) : text);

const withQueryOptions = (c: Command) => c
  .option('--store <dir>', 'folder holding .fullyrested-runs (default: the current directory)')
  .option('--json', 'print the result as JSON');

withQueryOptions(program.command('runs').description('List recorded runs, newest first'))
  .action(queryAction(async (options: QueryOptions) => {
    const runs = await listRuns([openStore(options)]);
    printResult(options, runs, formatRuns(runs));
  }));

withQueryOptions(program.command('summary').argument('[runId]', 'run id (default: the latest)')
  .description('Show every case of a run with its outcome'))
  .action(queryAction(async (runId: string | undefined, options: QueryOptions) => {
    const result = summary(await resolveRun([openStore(options)], runId));
    printResult(options, result, formatQuerySummary(result));
  }));

withQueryOptions(program.command('failures').argument('[runId]', 'run id (default: the latest)')
  .description('Show the failing and errored cases of a run'))
  .action(queryAction(async (runId: string | undefined, options: QueryOptions) => {
    const result = failures(await resolveRun([openStore(options)], runId));
    printResult(options, result, formatFailures(result));
  }));

withQueryOptions(program.command('request').argument('<case>', 'case index, full name, or bare run name if unique').argument('[runId]', 'run id (default: the latest)')
  .description('Show the request a case sent'))
  .action(queryAction(async (ref: string, runId: string | undefined, options: QueryOptions) => {
    const result = caseRequest(await resolveRun([openStore(options)], runId), ref);
    printResult(options, result, formatRequest(result));
  }));

withQueryOptions(program.command('response').argument('<case>', 'case index, full name, or bare run name if unique').argument('[runId]', 'run id (default: the latest)')
  .description('Show the response a case received')
  .option('--headers <names>', 'show only these headers (comma-separated, any case)'))
  .action(queryAction(async (ref: string, runId: string | undefined, options: QueryOptions & { headers?: string }) => {
    const headers = options.headers === undefined ? true : options.headers.split(',').map(h => h.trim()).filter(h => h !== '');
    const result = caseResponse(await resolveRun([openStore(options)], runId), ref, { headers });
    printResult(options, result, formatResponse(result));
  }));

withQueryOptions(program.command('body').argument('<case>', 'case index, full name, or bare run name if unique').argument('[runId]', 'run id (default: the latest)')
  .description('Show the response body of a case (or the request body with --request)')
  .option('--request', 'show the request body instead')
  .option('--path <path>', 'extract a path from a JSON body')
  .option('--outline', 'show the shape of a JSON body')
  .option('--range <a:b>', 'character range of a text body')
  .option('--full', 'do not truncate'))
  .action(queryAction(async (ref: string, runId: string | undefined,
    options: QueryOptions & { request?: boolean; path?: string; outline?: boolean; range?: string; full?: boolean }) => {
    let range: [number, number] | undefined;
    if (options.range !== undefined) {
      range = parseRange(options.range);
      if (!range) throw new UsageError(`--range must be two non-negative integers like 0:100, got '${options.range}'`);
    }
    const result = caseBody(await resolveRun([openStore(options)], runId), ref,
      { request: options.request, path: options.path, outline: options.outline, range, full: options.full });
    printResult(options, result, formatBody(result));
    const notice = truncationNotice(result);
    if (notice) console.error(notice);
  }));

interface InspectOptions { collection: string; json?: boolean }

const withInspectOptions = (c: Command) => c
  .requiredOption('-c, --collection <file>', 'collection file (.frcol)')
  .option('--json', 'print the result as JSON');

withInspectOptions(program.command('tree').description('List the folders, requests and runs of a collection')
  .option('--folder <path>', 'show only this folder'))
  .action(queryAction(async (options: InspectOptions & { folder?: string }) => {
    const view = await inspectTree(options.collection, createSecretStore(), w => console.warn(`warning: ${w}`), options.folder);
    printResult(options, view, formatTree(view));
  }));

withInspectOptions(program.command('envs').description('List the environments of a collection (names only)'))
  .action(queryAction(async (options: InspectOptions) => {
    const view = await inspectEnvironments(options.collection, createSecretStore());
    printResult(options, view, formatEnvironments(view));
  }));

// An inspect command, not an edit one: it writes nothing, it only names what is set where.
withInspectOptions(program.command('settings').description('List what is set in every scope of a collection, by name only (no values)')
  .option('--scope <locator>', `only this scope; ${LOCATOR_FORMS}`))
  .action(queryAction(async (options: InspectOptions & { scope?: string }) => {
    const view = await inspectSettings(options.collection, createSecretStore(), options.scope);
    printResult(options, view, formatSettings(view));
  }));

withInspectOptions(program.command('show').description('Show a request as it would be sent, with where each setting comes from (secrets stay redacted)')
  .requiredOption('-a, --action <file>', 'request file (.frreq)')
  .option('-r, --run <name>', 'one run of the request, by name or id')
  .option('-e, --environment <name>', 'environment name or id (default: the collection selected one)'))
  .action(queryAction(async (options: InspectOptions & { action: string; run?: string; environment?: string }) => {
    const result = await inspectRequest(options, createSecretStore(), w => console.warn(`warning: ${w}`));
    printResult(options, result, formatShown(result));
  }));

// ---------------------------------------------------------------------------------------------
// edit namespace: one subcommand per authoring verb, all under `fullyrested edit <verb>` so they
// do not crowd the top-level --help (see the design spec). Every subcommand but new-collection
// shares -c/--collection and --json; editCommand()/withScope() wire those up once rather than in
// 21 near-identical copies. Each action runs the verb through authoring.ts's edit(), which already
// collapses a bad collection path or a core QueryError into the UsageError queryAction maps to
// exit 2 -- so there is nothing new to catch here.
// ---------------------------------------------------------------------------------------------

const editNamespace = program.command('edit').description('Create and edit collections, folders, requests, runs and their settings');

interface EditOptions { collection: string; json?: boolean }

const withEditOptions = (c: Command): Command =>
  c.requiredOption('-c, --collection <file>', 'collection file (.frcol)').option('--json', 'print the EditResult as JSON');

const editCommand = (name: string, description: string): Command =>
  withEditOptions(editNamespace.command(name).description(description));

// --scope's description is LOCATOR_FORMS itself, the same string parseLocator's own error quotes,
// so the two can never drift apart.
const withScope = (c: Command): Command => c.requiredOption('--scope <locator>', LOCATOR_FORMS);

async function runEdit(options: EditOptions, run: (ctx: AuthoringContext) => Promise<EditResult>): Promise<void> {
  const result = await edit(options.collection, createSecretStore(), run);
  printResult(options, result, formatEdit(result));
}

// --field is repeatable (set-body --field a=1 --field b=2): each occurrence appends rather than
// replacing the previous one. Parsing is deferred to parseField below so a malformed one is
// reported before any file is touched.
function collectField(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

// Splits on the FIRST '=' only, so a value that itself contains '=' (e.g. a URL query string) is
// kept whole rather than cut short; an argument with no '=' at all is a usage error naming it,
// since silently treating it as a valueless field would hide a typo.
function parseField(text: string): { name: string; value: string } {
  const eq = text.indexOf('=');
  if (eq < 0)
    throw new UsageError(`--field needs name=value (got '${text}')`);
  return { name: text.slice(0, eq), value: text.slice(eq + 1) };
}

function parseBool(flag: string, value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new UsageError(`${flag} must be true or false (got '${value}')`);
}

function parseHttpCode(value: string): number {
  const code = Number(value);
  if (!Number.isInteger(code))
    throw new UsageError(`--http-code must be an integer (got '${value}')`);
  return code;
}

const SETTING_KINDS: SettingKind[] = ['header', 'param', 'variable', 'secret', 'validation-header'];

editNamespace.command('new-collection')
  .description('Create a new collection file; has no -c, since the file does not exist yet')
  .requiredOption('--file <path>', 'collection file to create (.frcol)')
  .option('--environment <name...>', 'environment(s) to create', [] as string[])
  .option('--json', 'print the EditResult as JSON')
  .action(queryAction(async (options: { file: string; environment: string[]; json?: boolean }) => {
    const result = await edit(options.file, createSecretStore(),
      ctx => newCollection(ctx, path.basename(options.file), options.environment));
    printResult(options, result, formatEdit(result));
  }));

editCommand('new-folder', 'Create a folder')
  .requiredOption('--path <path>', 'folder path, relative to the collection')
  .action(queryAction(async (options: EditOptions & { path: string }) =>
    runEdit(options, ctx => newFolder(ctx, options.path))));

editCommand('new-request', 'Create a request file')
  .requiredOption('--path <path>', 'request path, relative to the collection (.frreq)')
  .requiredOption('--method <verb>', 'HTTP method (get, post, patch, option, delete, put)')
  .requiredOption('--url <url>', 'request url (may hold {{variables}})')
  .action(queryAction(async (options: EditOptions & { path: string; method: string; url: string }) =>
    runEdit(options, ctx => newRequest(ctx, options.path, options.method, options.url))));

editCommand('new-run', 'Add a run to a request')
  .requiredOption('--request <path>', 'request path, relative to the collection (.frreq)')
  .requiredOption('--name <name>', 'run name')
  .action(queryAction(async (options: EditOptions & { request: string; name: string }) =>
    runEdit(options, ctx => newRun(ctx, options.request, options.name))));

editCommand('new-environment', 'Add an environment to the collection')
  .requiredOption('--name <name>', 'environment name')
  .action(queryAction(async (options: EditOptions & { name: string }) =>
    runEdit(options, ctx => newEnvironment(ctx, options.name))));

editCommand('select-environment', "Select the collection's active environment")
  .requiredOption('--name <name>', 'environment name or id')
  .action(queryAction(async (options: EditOptions & { name: string }) =>
    runEdit(options, ctx => selectEnvironment(ctx, options.name))));

withScope(editCommand('set-header', 'Set (or add) a header'))
  .requiredOption('--name <name>', 'header name')
  .requiredOption('--value <value>', 'header value')
  .option('--disabled', 'create the header disabled (default: enabled)')
  .action(queryAction(async (options: EditOptions & { scope: string; name: string; value: string; disabled?: boolean }) =>
    runEdit(options, ctx => setHeader(ctx, options.scope, options.name, options.value, !options.disabled))));

withScope(editCommand('set-param', 'Set (or add) a query parameter (requests and runs only)'))
  .requiredOption('--name <name>', 'parameter name')
  .requiredOption('--value <value>', 'parameter value')
  .option('--disabled', 'create the parameter disabled (default: enabled)')
  .action(queryAction(async (options: EditOptions & { scope: string; name: string; value: string; disabled?: boolean }) =>
    runEdit(options, ctx => setParam(ctx, options.scope, options.name, options.value, !options.disabled))));

withScope(editCommand('set-variable', 'Set (or add) a variable'))
  .requiredOption('--name <name>', 'variable name')
  .requiredOption('--value <value>', 'variable value')
  .action(queryAction(async (options: EditOptions & { scope: string; name: string; value: string }) =>
    runEdit(options, ctx => setVariable(ctx, options.scope, options.name, options.value))));

withScope(editCommand('add-secret-ref', 'Add a reference to a secret ({$secret}), never its value'))
  .requiredOption('--name <name>', 'secret name, as used in {{$name}}')
  .action(queryAction(async (options: EditOptions & { scope: string; name: string }) =>
    runEdit(options, ctx => addSecretRef(ctx, options.scope, options.name))));

withScope(editCommand('set-auth', 'Set the authentication of a scope'))
  .requiredOption('--type <type>', 'inherit | none | basicauth | bearertoken | awssig (case-insensitive)')
  .option('--user-name <name>', 'basicauth: user name')
  .option('--password <ref>', 'basicauth: password, as a secret reference only, e.g. {{$apiPass}}')
  .option('--token <token>', 'bearertoken: token')
  .option('--access-key <key>', 'awssig: access key id')
  .option('--secret-key <ref>', 'awssig: secret access key, as a secret reference only')
  .option('--session-token <ref>', 'awssig: session token, as a secret reference only')
  .option('--aws-region <region>', 'awssig: AWS region')
  .option('--service-name <name>', 'awssig: AWS service name')
  .option('--sign-url <true|false>', 'awssig: sign the url (query string) instead of headers', (v: string) => parseBool('--sign-url', v))
  .action(queryAction(async (options: EditOptions & { scope: string; type: string } & AuthFields) => {
    const fields: AuthFields = {
      userName: options.userName, password: options.password, token: options.token,
      accessKey: options.accessKey, secretKey: options.secretKey, sessionToken: options.sessionToken,
      awsRegion: options.awsRegion, serviceName: options.serviceName, signUrl: options.signUrl
    };
    await runEdit(options, ctx => setAuth(ctx, options.scope, options.type, fields));
  }));

withScope(editCommand('remove-setting', 'Remove one header, parameter, variable, secret reference or validation header'))
  .requiredOption('--kind <kind>', `setting kind (${SETTING_KINDS.join(', ')})`)
  .requiredOption('--name <name>', 'setting name')
  .action(queryAction(async (options: EditOptions & { scope: string; kind: string; name: string }) => {
    if (!SETTING_KINDS.includes(options.kind as SettingKind))
      throw new UsageError(`--kind must be one of ${SETTING_KINDS.join(', ')} (got '${options.kind}')`);
    await runEdit(options, ctx => removeSetting(ctx, options.scope, options.kind as SettingKind, options.name));
  }));

withScope(editCommand('set-url', 'Set the url of a request'))
  .requiredOption('--url <url>', 'request url (may hold {{variables}})')
  .action(queryAction(async (options: EditOptions & { scope: string; url: string }) =>
    runEdit(options, ctx => setUrl(ctx, options.scope, options.url))));

withScope(editCommand('set-method', 'Set the method of a request'))
  .requiredOption('--method <verb>', 'HTTP method (get, post, patch, option, delete, put)')
  .action(queryAction(async (options: EditOptions & { scope: string; method: string }) =>
    runEdit(options, ctx => setMethod(ctx, options.scope, options.method))));

withScope(editCommand('set-body', 'Set the body of a request'))
  .requiredOption('--content-type <type>', "content type, or 'none' to clear the body")
  .option('--text <text>', 'body text (every content type but the form one)')
  .option('--field <name=value>', 'form field, for the form content type (repeatable; splits on the first \'=\')', collectField, [] as string[])
  .action(queryAction(async (options: EditOptions & { scope: string; contentType: string; text?: string; field: string[] }) => {
    const content: { text?: string; fields?: { name: string; value: string }[] } = {};
    if (options.text !== undefined) content.text = options.text;
    if (options.field.length > 0) content.fields = options.field.map(parseField);
    await runEdit(options, ctx => setBody(ctx, options.scope, options.contentType, content));
  }));

withScope(editCommand('set-validation', 'Set the validation of a request or run'))
  .option('--type <type>', 'Inherit | None | ResponseCode | Headers | Body | HeadersBody (case-insensitive)')
  .option('--http-code <code>', 'expected HTTP status code', parseHttpCode)
  .option('--body <body>', 'None | JsonSchema (case-insensitive)')
  .option('--json-schema <file>', 'path to a JSON Schema file to check the response body against')
  .action(queryAction(async (options: EditOptions & { scope: string; type?: string; httpCode?: number; body?: string; jsonSchema?: string }) => {
    const fields: ValidationFields = {
      type: options.type,
      httpCode: options.httpCode,
      body: options.body,
      jsonSchema: options.jsonSchema === undefined ? undefined : fs.readFileSync(options.jsonSchema, 'utf8')
    };
    await runEdit(options, ctx => setValidation(ctx, options.scope, fields));
  }));

withScope(editCommand('set-validation-header', 'Set (or add) a header the response must have'))
  .requiredOption('--name <name>', 'header name')
  .requiredOption('--value <value>', 'header value')
  .option('--disabled', 'create the check disabled, so it is not enforced (default: enabled)')
  .action(queryAction(async (options: EditOptions & { scope: string; name: string; value: string; disabled?: boolean }) =>
    runEdit(options, ctx => setValidationHeader(ctx, options.scope, options.name, options.value, !options.disabled))));

withScope(editCommand('validation-from-case', 'Learn a validation from one recorded case of a run'))
  .requiredOption('--case <index-or-name>', 'case index (1-based) or name')
  .option('--run-id <id>', 'run id (default: the latest)')
  .option('--store <dir>', 'folder holding .fullyrested-runs (default: the current directory)')
  .action(queryAction(async (options: EditOptions & { scope: string; case: string; runId?: string; store?: string }) => {
    const stores = [openStore(options)];
    await runEdit(options, ctx => validationFromCase(ctx, stores, options.scope, options.case, options.runId));
  }));

withScope(editCommand('rename', 'Rename an environment, folder, request or run'))
  .requiredOption('--name <name>', 'new (bare) name; a path is an error -- use move for a path')
  .action(queryAction(async (options: EditOptions & { scope: string; name: string }) =>
    runEdit(options, ctx => rename(ctx, options.scope, options.name))));

withScope(editCommand('delete', 'Delete an environment, folder, request or run'))
  .action(queryAction(async (options: EditOptions & { scope: string }) =>
    runEdit(options, ctx => remove(ctx, options.scope))));

withScope(editCommand('move', 'Move a request or folder to a new path'))
  .requiredOption('--to <path>', 'new path, relative to the collection')
  .action(queryAction(async (options: EditOptions & { scope: string; to: string }) =>
    runEdit(options, ctx => move(ctx, options.scope, options.to))));

program.command('mcp')
  .description('Serve the inspect, run, query and authoring tools over MCP on stdio (stdout carries the protocol)')
  .option('--store <dir>', 'folder holding .fullyrested-runs, read and written by default')
  .action(async (options: { store?: string }) => {
    try {
      await startMcp({ defaultStore: options.store, secrets: createSecretStore() });
    } catch (error) {
      console.error(`error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

// No --value: a TTY prompts without echoing keystrokes; a pipe is read to EOF with exactly one
// trailing newline stripped, so `echo -n value | fullyrested secret set ...` works in a script
// and a value that itself contains a newline is read whole rather than cut at the first one.
function readSecretValue(): Promise<string> {
  return process.stdin.isTTY ? promptHidden('Secret value: ') : readPipedValue();
}

function readPipedValue(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => resolve(stripTrailingNewline(Buffer.concat(chunks).toString('utf8'))));
    process.stdin.on('error', reject);
  });
}

// readline echoes each typed keystroke by writing it back to `output`; muting that stream after
// writing the prompt ourselves hides the secret as it is typed without hiding the prompt itself.
// input/output default to the real TTY streams but take injected ones in tests, so the no-echo
// behaviour -- the most security-relevant part of this command -- can be verified directly rather
// than only read.
export function promptHidden(prompt: string, input: Readable = process.stdin, output: Writable = process.stdout): Promise<string> {
  return new Promise((resolve, reject) => {
    let muted = false;
    const mutedOutput = new Writable({
      write(chunk, _encoding, callback) {
        if (!muted) output.write(chunk);
        callback();
      }
    });
    // historySize: 0 so readline never keeps the typed value in its in-memory recall buffer.
    const rl = readline.createInterface({ input, output: mutedOutput, terminal: true, historySize: 0 });
    // Close the interface on error too: otherwise stdin is left in raw mode and the interface
    // stays open, and the process can hang after the error is printed.
    rl.on('error', error => {
      rl.close();
      reject(error);
    });
    output.write(prompt);
    muted = true;
    rl.question('', answer => {
      muted = false;
      rl.close();
      output.write('\n');
      resolve(answer);
    });
  });
}

const secret = program.command('secret').description('Secret values in the OS keychain');

// Exported so the exact wording can be asserted directly in a test, without running the CLI or
// touching any keychain.
export function formatSecretSetSuccess(name: string, scope: string): string {
  return `Stored secret '${name}' for ${scope}\n` +
    '(the reference itself is added with: fullyrested edit add-secret-ref …)';
}

secret.command('set')
  .description(
    "Store a secret value in the OS keychain for a scope. Does not add the {$secret} reference to the " +
    "document -- use 'fullyrested edit add-secret-ref' for that. The CLI reads this value back only to use " +
    "it (e.g. substituting it into a request with 'run') -- it never prints it."
  )
  .requiredOption('-c, --collection <file>', 'collection file (.frcol)')
  .requiredOption('--scope <locator>', 'collection | env:<name> | folder:<path> | request:<path> | run:<path>#<run name>')
  .requiredOption('--name <name>', 'the secret name, as used in {{$name}}')
  .option('--value <value>', 'the secret value (default: read from stdin -- a TTY prompts without echo, a pipe is read whole)')
  .action(async (options: { collection: string; scope: string; name: string; value?: string }) => {
    try {
      const service = await setup(async () => {
        const root = await loadTree(options.collection, createSecretStore());
        return secretServiceForScope(root, options.scope);
      });

      const value = options.value ?? await readSecretValue();
      if (value === '')
        throw new UsageError('Secret value must not be empty.');

      await createSecretWriter().set(service, options.name, value);

      console.log(formatSecretSetSuccess(options.name, options.scope));
    } catch (error) {
      console.error(`error: ${(error as Error).message}`);
      // A single check, not queryAction's two-type one: setup() above has already turned any
      // core QueryError into a UsageError, so UsageError is the only usage case left to catch.
      process.exitCode = error instanceof UsageError ? 2 : 1;
    }
  });

// Guarded so a test can import this module's exported helpers (promptHidden, formatSecretSetSuccess)
// without the import itself running the CLI against the test runner's own argv.
if (require.main == module)
  program.parseAsync(process.argv);
