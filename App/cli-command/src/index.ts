#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { Writable } from 'stream';
import { Command } from 'commander';
import { QueryError, caseBody, caseRequest, caseResponse, failures, listRuns, resolveRun, summary } from '@fullyrested/core';
import { RunOptions, UsageError, runCollection, setup, toTestResult } from './run';
import { loadTree } from './files';
import { FsRunStore, RUNS_FOLDER } from './run-store';
import { formatResult, formatSummary, toJUnit } from './report';
import { formatBody, formatEnvironments, formatShown, formatTree, formatFailures, formatRequest, formatResponse, formatRuns, formatSummary as formatQuerySummary, parseRange, truncationNotice } from './query-report';
import { inspectEnvironments, inspectRequest, inspectTree } from './inspect';
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

withQueryOptions(program.command('request').argument('<case>', 'case index or name').argument('[runId]', 'run id (default: the latest)')
  .description('Show the request a case sent'))
  .action(queryAction(async (ref: string, runId: string | undefined, options: QueryOptions) => {
    const result = caseRequest(await resolveRun([openStore(options)], runId), ref);
    printResult(options, result, formatRequest(result));
  }));

withQueryOptions(program.command('response').argument('<case>', 'case index or name').argument('[runId]', 'run id (default: the latest)')
  .description('Show the response a case received')
  .option('--headers <names>', 'show only these headers (comma-separated, any case)'))
  .action(queryAction(async (ref: string, runId: string | undefined, options: QueryOptions & { headers?: string }) => {
    const headers = options.headers === undefined ? true : options.headers.split(',').map(h => h.trim()).filter(h => h !== '');
    const result = caseResponse(await resolveRun([openStore(options)], runId), ref, { headers });
    printResult(options, result, formatResponse(result));
  }));

withQueryOptions(program.command('body').argument('<case>', 'case index or name').argument('[runId]', 'run id (default: the latest)')
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

withInspectOptions(program.command('show').description('Show a request as it would be sent, with where each setting comes from (secrets stay redacted)')
  .requiredOption('-a, --action <file>', 'request file (.frreq)')
  .option('-r, --run <name>', 'one run of the request, by name or id')
  .option('-e, --environment <name>', 'environment name or id (default: the collection selected one)'))
  .action(queryAction(async (options: InspectOptions & { action: string; run?: string; environment?: string }) => {
    const result = await inspectRequest(options, createSecretStore(), w => console.warn(`warning: ${w}`));
    printResult(options, result, formatShown(result));
  }));

program.command('mcp')
  .description('Serve inspect, run and query tools over MCP on stdio (stdout carries the protocol)')
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
function promptHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let muted = false;
    const mutedOutput = new Writable({
      write(chunk, _encoding, callback) {
        if (!muted) process.stdout.write(chunk);
        callback();
      }
    });
    // historySize: 0 so readline never keeps the typed value in its in-memory recall buffer.
    const rl = readline.createInterface({ input: process.stdin, output: mutedOutput, terminal: true, historySize: 0 });
    rl.on('error', reject);
    process.stdout.write(prompt);
    muted = true;
    rl.question('', answer => {
      muted = false;
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const secret = program.command('secret').description('Secret values in the OS keychain');

secret.command('set')
  .description(
    "Store a secret value in the OS keychain for a scope. Does not add the {$secret} reference to the " +
    "document -- use 'fullyrested edit add-secret-ref' for that. The CLI itself never reads this value back."
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
      await createSecretWriter().set(service, options.name, value);

      console.log(`Stored secret '${options.name}' for ${options.scope}`);
      console.log('(the reference itself is added with: fullyrested edit add-secret-ref …)');
    } catch (error) {
      console.error(`error: ${(error as Error).message}`);
      // A single check, not queryAction's two-type one: setup() above has already turned any
      // core QueryError into a UsageError, so UsageError is the only usage case left to catch.
      process.exitCode = error instanceof UsageError ? 2 : 1;
    }
  });

program.parseAsync(process.argv);
