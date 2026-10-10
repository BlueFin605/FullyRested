#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { QueryError, caseBody, caseRequest, caseResponse, failures, resolveRun, summary } from '@fullyrested/core';
import { RunOptions, UsageError, runCollection, toTestResult } from './run';
import { FsRunStore, RUNS_FOLDER } from './run-store';
import { formatResult, formatSummary, toJUnit } from './report';
import { formatBody, formatFailures, formatRequest, formatResponse, formatRuns, formatSummary as formatQuerySummary, parseRange, truncationNotice } from './query-report';
import { createSecretStore, secretEnvironmentVariable } from './secret-store';

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
    const runs = await openStore(options).list();
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
  .description('Show the response a case received'))
  .action(queryAction(async (ref: string, runId: string | undefined, options: QueryOptions) => {
    const result = caseResponse(await resolveRun([openStore(options)], runId), ref);
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

program.parseAsync(process.argv);
