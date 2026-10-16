import * as fs from 'fs';
import * as path from 'path';
import {
  CollectionConfig, CollectionNode, ContainerNode, RequestNode, RunNode, SecretStore,
  CaseRecord, RunRecord, TestCase, basenameOf, casesFor, casesForScope, buildCaseRecord, executeRequest, joinPath, newRunId, prepareRequest,
  redactCase, relativePath, validateResponse
} from '@fullyrested/core';
import { loadAction, loadTree } from './files';

export interface RunOptions {
  collection: string;
  environment?: string;
  action?: string;
  run?: string;
  folder?: string;
  all?: boolean;
}

export interface TestResult {
  name: string;
  status: number | string;
  ms: number;
  passed: boolean;
  errors: string[];
}

export class UsageError extends Error { }

// A collection or request file that cannot be loaded is a usage problem (exit 2), not a crash
export async function setup<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    // A programming error is a bug, not a usage problem
    if (error instanceof UsageError || error instanceof TypeError || error instanceof ReferenceError) throw error;
    throw new UsageError((error as Error).message);
  }
}

export function findEnvironment(config: CollectionConfig, name: string | undefined): { id: string | undefined; name: string | undefined } {
  if (name == undefined)
    return { id: undefined, name: config.environments.find(e => e.id == config.selectedEnvironmentId)?.name };

  const env = config.environments.find(e => e.name == name || e.id == name);
  if (env == undefined) {
    const known = config.environments.map(e => e.name).join(', ') || 'none';
    throw new UsageError(`Environment '${name}' not found (known: ${known})`);
  }
  return { id: env.id, name: env.name };
}

function resolveActionFile(file: string, collectionFolder: string): string {
  if (fs.existsSync(file))
    return file;

  const inCollection = path.join(collectionFolder, file);
  return fs.existsSync(inCollection) ? inCollection : file;
}

// Windows and macOS file systems ignore case, so a path typed in another case still names the same file
const caseInsensitive = process.platform == 'win32' || process.platform == 'darwin';

// A collection-relative path spelt the way the tree spells it, as far as the tree has the folders and file it names
function treePath(root: CollectionNode, relative: string): string {
  if (!caseInsensitive)
    return relative;

  let container: ContainerNode = root;
  const segments = relative.split('/').filter(p => p != '');
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const child = container.children.find(c => basenameOf(c.path) == segment)
      ?? container.children.find(c => basenameOf(c.path).toLowerCase() == segment.toLowerCase());
    if (child == undefined)
      return joinPath(container.path, ...segments.slice(i));
    if (!(child instanceof ContainerNode))
      return joinPath(child.path, ...segments.slice(i + 1));
    container = child;
  }
  return container.path;
}

// The tree's node for a request file; a file outside the collection folder inherits from the collection only
export async function requestFor(file: string, root: CollectionNode, collectionFolder: string, store: SecretStore): Promise<RequestNode> {
  const full = path.resolve(resolveActionFile(file, collectionFolder));
  const typed = relativePath(collectionFolder, full);
  const relative = typed == undefined ? undefined : treePath(root, typed);
  const found = relative == undefined ? undefined : root.find(relative);
  if (found instanceof RequestNode)
    return found;

  return root.attach(await loadAction(full, store), relative);
}

// --folder as the user types it: '.' and './' are the collection root
function folderPath(folder: string): string {
  const cleaned = folder.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  return cleaned == '.' ? '' : cleaned;
}

async function selectCases(options: RunOptions, root: CollectionNode, collectionFolder: string, store: SecretStore): Promise<TestCase[]> {
  if (options.folder != undefined) {
    if (options.action != undefined)
      throw new UsageError('Give --folder or --action, not both');

    const folder = root.find(treePath(root, folderPath(options.folder)));
    if (!(folder instanceof ContainerNode))
      throw new UsageError(`Folder '${options.folder}' not found in the collection`);
    return casesForScope(folder);
  }

  if (options.action == undefined) {
    if (options.run != undefined)
      throw new UsageError('--run needs --action');
    if (!options.all)
      throw new UsageError('Give --action <file>, --folder <path> or --all');

    return casesForScope(root);
  }

  const request = await requestFor(options.action, root, collectionFolder, store);
  if (options.run != undefined) {
    const run = request.runs().find(r => r.run.name == options.run || r.run.id == options.run);
    if (run == undefined)
      throw new UsageError(`Run '${options.run}' not found in '${request.name}'`);
    return [{ node: run, name: run.name }];
  }

  return options.all ? casesFor(request) : [{ node: request, name: request.name }];
}

function requestNodeOf(node: RequestNode | RunNode): RequestNode {
  return node instanceof RunNode ? node.request : node;
}

async function runCase(test: TestCase, index: number, environmentId: string | undefined, includeSecrets: boolean): Promise<CaseRecord> {
  const base = {
    index,
    name: test.name,
    requestFile: requestNodeOf(test.node).path,
    ...(test.node instanceof RunNode ? { runName: test.node.run.name } : {})
  };

  let request;
  try {
    request = test.node.resolve({ environmentId }).replaceVariables();
  } catch (error) {
    return buildCaseRecord({ ...base, ms: 0, error: (error as Error).message });
  }

  const prepared = prepareRequest(request);
  const started = Date.now();
  const response = await executeRequest(request);
  const ms = Date.now() - started;

  // A negative or string status means no response came back, so there is nothing to validate.
  // Without validation a request passes when any HTTP response comes back
  const gotResponse = typeof response.status == 'number' && response.status >= 0;
  const validation = gotResponse ? validateResponse(request, response) : undefined;
  const built = buildCaseRecord({ ...base, ms, request: prepared, response, validation });
  const record = includeSecrets ? built : redactCase(built, request.secrets);
  if (!gotResponse)
    noResponseStatus.set(record, response.status);
  return record;
}

// The run's text output and --junit still show the network error status of a case with no response,
// which the record leaves out
const noResponseStatus = new WeakMap<CaseRecord, number | string>();

function describeSelection(options: RunOptions): string {
  if (options.folder != undefined)
    return `--folder ${options.folder}`;
  if (options.action != undefined)
    return [`--action ${options.action}`, options.run != undefined ? `--run ${options.run}` : undefined, options.all ? '--all' : undefined]
      .filter(p => p != undefined).join(' ');
  return '--all';
}

export interface RunHooks {
  onCase?(c: CaseRecord): void;
  onWarning?(message: string): void;
  includeSecrets?: boolean;
}

export async function runCollection(options: RunOptions, store: SecretStore, hooks: RunHooks = {}): Promise<RunRecord> {
  const root = await setup(() => loadTree(options.collection, store));
  root.warnings.forEach(w => hooks.onWarning?.(w));
  const environment = findEnvironment(root.config, options.environment);
  const cases = await setup(() => selectCases(options, root, path.dirname(path.resolve(options.collection)), store));
  const includeSecrets = hooks.includeSecrets ?? false;

  const record: RunRecord = {
    runId: newRunId(),
    startedAt: new Date().toISOString(),
    collection: options.collection,
    selection: describeSelection(options),
    redacted: !includeSecrets,
    cases: []
  };
  if (environment.name != undefined)
    record.environment = environment.name;

  for (const [i, test] of cases.entries()) {
    const c = await runCase(test, i + 1, environment.id, includeSecrets); // case indexes are 1-based
    record.cases.push(c);
    hooks.onCase?.(c);
  }
  return record;
}

export function toTestResult(c: CaseRecord): TestResult {
  return {
    name: c.name,
    status: c.response?.status ?? noResponseStatus.get(c) ?? 'error',
    ms: c.ms,
    passed: c.outcome == 'pass',
    errors: c.error ? [c.error] : c.validation?.checks.flatMap(x => x.errors) ?? []
  };
}

export async function runTests(options: RunOptions, store: SecretStore, onResult: (result: TestResult) => void = () => { }, onWarning: (message: string) => void = () => { }): Promise<TestResult[]> {
  const record = await runCollection(options, store, { onCase: c => onResult(toTestResult(c)), onWarning });
  return record.cases.map(toTestResult);
}
