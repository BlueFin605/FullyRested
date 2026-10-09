#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { RunOptions, UsageError, runTests } from './run';
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
  .option('--all', 'every run of --action, or every request in the collection folder')
  .option('--junit <file>', 'also write a JUnit XML report')
  .addHelpText('after', `
Secrets come from environment variables first, then the OS keychain the
desktop app uses. A secret named "api key" is read from ${secretEnvironmentVariable('api key')}.`)
  .action(async (options: RunOptions & { junit?: string }) => {
    try {
      const results = await runTests(options, createSecretStore(), r => console.log(formatResult(r)));
      console.log(formatSummary(results));

      if (options.junit)
        fs.writeFileSync(options.junit, toJUnit(path.basename(options.collection), results));

      process.exitCode = results.every(r => r.passed) ? 0 : 1;
    } catch (error) {
      console.error(`error: ${(error as Error).message}`);
      process.exitCode = error instanceof UsageError ? 2 : 1;
    }
  });

program.parseAsync(process.argv);
