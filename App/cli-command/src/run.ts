import * as fs from 'fs';
import * as path from 'path';
import {
  CollectionConfig, RestAction, SecretStore,
  executeRequest, resolveExecuteAction, validateResponse
} from '@fullyrested/core';
import { findActionFiles, loadAction, loadCollection } from './files';

export interface RunOptions {
  collection: string;
  environment?: string;
  action?: string;
  run?: string;
  all?: boolean;
}

export interface TestResult {
  name: string;
  status: number | string;
  ms: number;
  passed: boolean;
  errors: string[];
}

interface TestCase {
  action: RestAction;
  runId?: string;
  name: string;
}

export class UsageError extends Error { }

function findEnvironmentId(config: CollectionConfig, name: string | undefined): string | undefined {
  if (name == undefined)
    return undefined;

  const env = config.environments.find(e => e.name == name || e.id == name);
  if (env == undefined) {
    const known = config.environments.map(e => e.name).join(', ') || 'none';
    throw new UsageError(`Environment '${name}' not found (known: ${known})`);
  }
  return env.id;
}

// A request with runs is tested once per run; one without runs is tested as it is
function casesFor(action: RestAction): TestCase[] {
  if (action.runs.length == 0)
    return [{ action, name: action.name }];

  return action.runs.map(r => ({ action, runId: r.id, name: `${action.name} › ${r.name}` }));
}

function resolveActionFile(file: string, collectionFolder: string): string {
  if (fs.existsSync(file))
    return file;

  const inCollection = path.join(collectionFolder, file);
  return fs.existsSync(inCollection) ? inCollection : file;
}

async function selectCases(options: RunOptions, collectionFolder: string, store: SecretStore): Promise<TestCase[]> {
  if (options.action == undefined) {
    if (options.run != undefined)
      throw new UsageError('--run needs --action');
    if (!options.all)
      throw new UsageError('Give --action <file> or --all');

    const cases: TestCase[] = [];
    for (const file of findActionFiles(collectionFolder))
      cases.push(...casesFor(await loadAction(file, store)));
    return cases;
  }

  const action = await loadAction(resolveActionFile(options.action, collectionFolder), store);
  if (options.run != undefined) {
    const run = action.runs.find(r => r.name == options.run || r.id == options.run);
    if (run == undefined)
      throw new UsageError(`Run '${options.run}' not found in '${action.name}'`);
    return [{ action, runId: run.id, name: `${action.name} › ${run.name}` }];
  }

  return options.all ? casesFor(action) : [{ action, name: action.name }];
}

async function runCase(test: TestCase, config: CollectionConfig, environmentId: string | undefined): Promise<TestResult> {
  const request = resolveExecuteAction({ collection: config, environmentId, action: test.action, runId: test.runId }).replaceVariables();

  const started = Date.now();
  const response = await executeRequest(request);
  const ms = Date.now() - started;

  if (typeof response.status != 'number' || response.status < 0)
    return { name: test.name, status: response.status, ms, passed: false, errors: [`No response: ${response.statusText ?? 'unknown error'}`] };

  // Without validation a request passes when any HTTP response comes back
  const validation = validateResponse(request, response);
  const errors = validation?.errors ?? [];
  return { name: test.name, status: response.status, ms, passed: validation == undefined || validation.valid, errors };
}

export async function runTests(options: RunOptions, store: SecretStore, onResult: (result: TestResult) => void = () => { }): Promise<TestResult[]> {
  const config = await loadCollection(options.collection, store);
  const environmentId = findEnvironmentId(config, options.environment);
  const cases = await selectCases(options, path.dirname(path.resolve(options.collection)), store);

  const results: TestResult[] = [];
  for (const test of cases) {
    const result = await runCase(test, config, environmentId);
    results.push(result);
    onResult(result);
  }
  return results;
}
