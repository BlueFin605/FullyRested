import * as fs from 'fs';
import * as path from 'path';
import {
  CollectionConfig, CollectionNode, ContainerNode, RequestNode, RunNode, SecretStore,
  basenameOf, executeRequest, joinPath, relativePath, validateResponse
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

interface TestCase {
  node: RequestNode | RunNode;
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
function casesFor(request: RequestNode): TestCase[] {
  const runs = request.runs();
  if (runs.length == 0)
    return [{ node: request, name: request.name }];

  return runs.map(r => ({ node: r, name: r.name }));
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
async function requestFor(file: string, root: CollectionNode, collectionFolder: string, store: SecretStore): Promise<RequestNode> {
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
    return folder.requestNodes().flatMap(casesFor);
  }

  if (options.action == undefined) {
    if (options.run != undefined)
      throw new UsageError('--run needs --action');
    if (!options.all)
      throw new UsageError('Give --action <file>, --folder <path> or --all');

    return root.requestNodes().flatMap(casesFor);
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

async function runCase(test: TestCase, environmentId: string | undefined): Promise<TestResult> {
  let request;
  try {
    request = test.node.resolve({ environmentId }).replaceVariables();
  } catch (error) {
    return { name: test.name, status: 'error', ms: 0, passed: false, errors: [(error as Error).message] };
  }

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

export async function runTests(options: RunOptions, store: SecretStore, onResult: (result: TestResult) => void = () => { }, onWarning: (message: string) => void = () => { }): Promise<TestResult[]> {
  const root = await loadTree(options.collection, store);
  root.warnings.forEach(onWarning);
  const environmentId = findEnvironmentId(root.config, options.environment);
  const cases = await selectCases(options, root, path.dirname(path.resolve(options.collection)), store);

  const results: TestResult[] = [];
  for (const test of cases) {
    const result = await runCase(test, environmentId);
    results.push(result);
    onResult(result);
  }
  return results;
}
