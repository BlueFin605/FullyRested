#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { RunOptions, UsageError, runCollection, toTestResult } from './run';
import { FsRunStore, RUNS_FOLDER } from './run-store';
import { formatResult, formatSummary, toJUnit } from './report';
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

program.parseAsync(process.argv);
