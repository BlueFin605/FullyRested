import { AuthenticationDetails, CollectionConfig, SecretTable } from './model';
import { QueryError } from './query-error';
import { secretReplacer } from './redact';
import { CollectionNode, ContainerNode, EffectiveValue, FolderNode, LoadError, RequestNode, RunNode, SettingSource } from './scope';

export interface TreeError {
  type: 'error';
  file: string;
  message: string;
}

export interface TreeRun {
  name: string;
  validation: string | undefined;
}

export interface TreeRequest {
  type: 'request';
  name: string;
  path: string;
  method: string;
  url: string;
  validation: string | undefined;
  runs: TreeRun[];
}

export interface TreeFolder {
  type: 'folder';
  name: string;
  path: string;
  children: TreeNodeView[];
}

export type TreeNodeView = TreeFolder | TreeRequest | TreeError;

export interface TreeView {
  collection: string;
  warnings: string[];
  children: TreeNodeView[];
}

const toError = (e: LoadError): TreeError => ({ type: 'error', file: e.file, message: e.message });

function childrenOf(container: ContainerNode): TreeNodeView[] {
  return container.children.flatMap((child): TreeNodeView[] => {
    if (child instanceof FolderNode) {
      const inner = childrenOf(child);
      return [{
        type: 'folder', name: child.name, path: child.path,
        children: child.loadError ? [toError(child.loadError), ...inner] : inner,
      }];
    }
    if (child.loadError) return [toError(child.loadError)];
    const action = child.action;
    return [{
      type: 'request', name: child.name, path: child.path,
      method: action.verb, url: action.url, validation: action.validation?.type,
      runs: child.runs().map(r => ({ name: r.run.name, validation: r.run.validation?.type })),
    }];
  });
}

export function treeView(root: CollectionNode): TreeView {
  return { collection: root.name, warnings: root.warnings, children: childrenOf(root) };
}

export interface EnvironmentsView {
  selected: string;
  collection: { variables: string[]; secrets: string[] };
  environments: { id: string; name: string; variables: string[]; secrets: string[] }[];
}

const variableNames = (e: { variables: { variable: string; active: boolean }[] }) => e.variables.filter(v => v.active).map(v => v.variable);
const secretNames = (e: { secrets: { $secret: string; active: boolean }[] }) => e.secrets.filter(s => s.active).map(s => s.$secret);

export function environmentsView(config: CollectionConfig): EnvironmentsView {
  const selected = config.environments.find(e => e.id === config.selectedEnvironmentId);
  return {
    selected: selected?.name ?? '',
    collection: { variables: variableNames(config.collectionEnvironment), secrets: secretNames(config.collectionEnvironment) },
    environments: config.environments.map(e => ({ id: e.id, name: e.name, variables: variableNames(e), secrets: secretNames(e) })),
  };
}

export interface ShownRequest {
  name: string;
  method: string;
  url: string;
  headers: { key: string; value: string; source: string; overridden: boolean }[];
  variables: { variable: string; value: string; source: string; overridden: boolean }[];
  secrets: { name: string; source: string; overridden: boolean }[];
  auth: { type: string; source: string } | undefined;
  validation: unknown;
}

const sourceOf = (s: SettingSource) => `${s.kind}:${s.name}`;

function redactDeep<T>(value: T, replace: (s: string) => string): T {
  if (typeof value === 'string') return replace(value) as T;
  if (Array.isArray(value)) return value.map(v => redactDeep(v, replace)) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v, replace)])) as T;
  return value;
}

export function showRequest(node: RequestNode | RunNode, environmentId?: string): ShownRequest {
  try {
    const resolved = node.resolve({ environmentId }).replaceVariables();
    const eff = node.effectiveSettings({ environmentId });
    const request = node instanceof RunNode ? node.request : node;
    const replace = secretReplacer(eff.secrets.map((s: EffectiveValue<SecretTable>) => s.value), 1);
    // A raw {{$name}} reference to one of the effective secrets reads as {{$secret:name}}
    // Each is swapped for a sentinel first so redaction cannot match inside the placeholder text
    const secretNames = [...new Set(eff.secrets.map(s => s.value.$secret))];
    const sentinel = (i: number) => `\u0000${String.fromCharCode(0xE000 + i)}\u0000`;
    const label = (text: string) => {
      const marked = text.replace(/\{\{\$([^{}]+)\}\}/g, (ref, name: string) => {
        const i = secretNames.indexOf(name);
        return i < 0 ? ref : sentinel(i);
      });
      return secretNames.reduce((out, name, i) => out.split(sentinel(i)).join(`{{$secret:${name}}}`), replace(marked));
    };
    const auth: EffectiveValue<AuthenticationDetails> | undefined = eff.auth;
    return {
      name: node.name,
      method: request.action.verb,
      url: replace(`${resolved.protocol}://${resolved.url}`),
      headers: eff.headers.map(h => ({ key: h.value.key, value: label(h.value.value), source: sourceOf(h.source), overridden: h.overridden })),
      variables: eff.variables.map(v => ({ variable: v.value.variable, value: label(v.value.value), source: sourceOf(v.source), overridden: v.overridden })),
      secrets: eff.secrets.map(s => ({ name: s.value.$secret, source: sourceOf(s.source), overridden: s.overridden })),
      auth: auth ? { type: auth.value.authentication, source: sourceOf(auth.source) } : undefined,
      validation: redactDeep(resolved.validation, replace),
    };
  } catch (e) {
    if (e instanceof TypeError || e instanceof ReferenceError) throw e;
    throw new QueryError((e as Error).message);
  }
}
