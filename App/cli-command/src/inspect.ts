import * as path from 'path';
import { SecretStore, environmentsView, showRequest, treeView } from '@fullyrested/core';
import { UsageError, findEnvironment, requestFor } from './run';
import { loadTree } from './files';

// A collection or request file that cannot be loaded is a usage problem (exit 2), not a crash
export async function setup<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    throw error instanceof UsageError ? error : new UsageError((error as Error).message);
  }
}

export async function inspectTree(collection: string, store: SecretStore, onWarning: (m: string) => void) {
  const root = await setup(() => loadTree(collection, store));
  const view = treeView(root);
  view.warnings.forEach(onWarning);
  return view;
}

export async function inspectEnvironments(collection: string, store: SecretStore) {
  const root = await setup(() => loadTree(collection, store));
  return environmentsView(root.config);
}

export interface ShowOptions { collection: string; action: string; run?: string; environment?: string }

export async function inspectRequest(options: ShowOptions, store: SecretStore, onWarning: (m: string) => void) {
  const root = await setup(() => loadTree(options.collection, store));
  root.warnings.forEach(onWarning);
  const request = await setup(() => requestFor(options.action, root, path.dirname(path.resolve(options.collection)), store));
  let node: Parameters<typeof showRequest>[0] = request;
  if (options.run !== undefined) {
    const run = request.runs().find(r => r.run.name === options.run || r.run.id === options.run);
    if (!run) throw new UsageError(`Run '${options.run}' not found in '${request.name}'`);
    node = run;
  }
  return showRequest(node, findEnvironment(root.config, options.environment).id);
}
