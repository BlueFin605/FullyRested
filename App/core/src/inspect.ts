import { Locator, resolveLocator, ResolvedScope } from './locator';
import {
  AuthenticationDetails, CollectionConfig, CreateEmptyRestActionValidation, RestActionRun, RestActionValidation, ScopeSettings, SecretTable,
  ValidationType,
} from './model';
import { QueryError } from './query-error';
import { maskPresignedUrl, secretReplacer } from './redact';
import { CollectionNode, ContainerNode, EffectiveValue, FolderNode, LoadError, RequestNode, RunNode, SettingSource } from './scope';

export interface TreeError {
  type: 'error';
  file: string;
  message: string;
}

// A request's or run's validation marker, sharper than the bare ValidationType:
//
// - effective resolves ValidationType.Inherit for the two-level chain this app actually has: a
//   run whose own type is Inherit takes its request's type. There is nothing above a request to
//   inherit from -- ScopeSettings (folders, the collection) carries no validation field, so only
//   RestAction and RestActionRun have one -- so a request whose own type is Inherit, or a run
//   whose request is also Inherit, is left unresolved. validateResponse does not treat an
//   unresolved Inherit as "no validation": it early-returns only for undefined or type == None
//   (validate.ts:12-13), so Inherit falls through to the unconditional status check against
//   validation.httpCode (validate.ts:20-21) while skipping the body/header checks (neither
//   'Inherit'.includes('Body') nor .includes('Headers') is true) -- i.e. it behaves exactly like
//   ResponseCode with the default httpCode 200. So an unresolved Inherit resolves to
//   'ResponseCode', not 'None', to report what actually gets checked. effective is only present
//   when type is 'Inherit'.
// - schema/incomplete describe whichever validation is actually in force (own, or inherited): a
//   Body/HeadersBody check with a non-empty jsonSchema.schema sets schema true; one with an empty
//   or absent schema sets schema false and incomplete true -- a mechanical flag on the absence of
//   a schema, not a claim that nothing is checked: when validation.body is None, validateBody
//   still asserts the response has no payload (validate.ts:40-41) even with incomplete true. Both
//   schema and incomplete are false/absent for a type that does not check a body at all
//   (including an unresolved Inherit, which resolves to ResponseCode).
export interface TreeValidation {
  type: string;
  effective?: string;
  schema: boolean;
  incomplete?: true;
}

export interface TreeRun {
  name: string;
  validation: TreeValidation | undefined;
}

export interface TreeRequest {
  type: 'request';
  name: string;
  path: string;
  method: string;
  url: string;
  validation: TreeValidation | undefined;
  runs?: TreeRun[];
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
  folder?: string;
  warnings?: string[];
  children: TreeNodeView[];
}

const toError = (e: LoadError): TreeError => ({ type: 'error', file: e.file, message: e.message });

const checksBody = (type: string) => type === ValidationType.Body || type === ValidationType.HeadersBody;
const hasSchema = (v: RestActionValidation) => (v.jsonSchema?.schema ?? '').length > 0;

// The two-level inherit chain: a run whose own type is Inherit takes its request's type (own);
// nothing above a request carries a validation setting (ScopeSettings has none), so a request's
// own Inherit -- or a run's Inherit under a request that is itself Inherit -- has nothing to
// resolve to. Unlike toExecute() (scope.ts:87-91), which neither recurses nor maps Inherit to
// anything and simply passes it through unchanged, this reports what validate.ts actually
// enforces for an unresolved Inherit: a live status-code check against the default httpCode,
// indistinguishable from ResponseCode (validate.ts:12-21).
function resolveValidation(own: RestActionValidation, above: RestActionValidation | undefined): RestActionValidation {
  if (own.type !== ValidationType.Inherit) return own;
  if (above !== undefined && above.type !== ValidationType.Inherit) return above;
  return CreateEmptyRestActionValidation(ValidationType.ResponseCode);
}

function toTreeValidation(own: RestActionValidation | undefined, above?: RestActionValidation): TreeValidation | undefined {
  if (own == undefined) return undefined;
  const resolved = resolveValidation(own, above);
  const schema = checksBody(resolved.type) && hasSchema(resolved);
  const view: TreeValidation = { type: own.type, schema };
  if (checksBody(resolved.type) && !schema) view.incomplete = true;
  if (own.type === ValidationType.Inherit) view.effective = resolved.type;
  return view;
}

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
    const view: TreeRequest = {
      type: 'request', name: child.name, path: child.path,
      method: action.verb, url: action.url, validation: toTreeValidation(action.validation),
    };
    const runs = child.runs().map(r => ({ name: r.run.name, validation: toTreeValidation(r.run.validation, action.validation) }));
    if (runs.length > 0) view.runs = runs;
    return [view];
  });
}

function folderPaths(nodes: TreeNodeView[]): string[] {
  return nodes.flatMap(n => n.type === 'folder' ? [n.path, ...folderPaths(n.children)] : []);
}

function findFolder(nodes: TreeNodeView[], path: string): TreeFolder | undefined {
  for (const n of nodes) {
    if (n.type !== 'folder') continue;
    if (n.path === path) return n;
    const inner = findFolder(n.children, path);
    if (inner) return inner;
  }
  return undefined;
}

/** The collection's tree, or only the folder at `folder` (a path inside the collection). Empty lists are left out. */
export function treeView(root: CollectionNode, folder?: string): TreeView {
  let children = childrenOf(root);
  const view: TreeView = { collection: root.name, children };
  if (folder !== undefined) {
    const wanted = folder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const found = findFolder(children, wanted);
    if (!found) throw new QueryError(`Folder '${folder}' not found. Folders: ${folderPaths(children).join(', ')}`);
    children = found.children;
    view.folder = found.path;
    view.children = children;
  }
  if (root.warnings.length > 0) view.warnings = root.warnings;
  return view;
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

// One scope's settings, by name only -- never a value. That is what makes this view cheap to
// call and safe to serve over MCP: an agent can ask "is Authorization already set here, or at
// collection level?" without any secret or header value crossing the wire. `scope` is a valid
// locator (see locator.ts), so it can be fed straight back into a write verb.
//
// A request has no `variables` or `secrets` of its own -- ScopeSettings (which carries those) is
// not defined at that level; only `run` and the scopes above a request have them. Both arrays
// are always empty for a request scope, which must not be read as "nothing set here yet".
export interface ScopeSettingNames {
  scope: string;
  headers: string[];
  variables: string[];
  secrets: string[];      // the $secret names, never values
  auth: string;           // the authentication type, e.g. 'inherit', 'bearertoken'
  params?: string[];      // request and run scopes only
}

export interface SettingsView {
  collection: string;
  scopes: ScopeSettingNames[];
}

const headerNames = (s: { headers: { key: string; active: boolean }[] }) => s.headers.filter(h => h.active).map(h => h.key);
const paramNames = (s: { parameters: { key: string; active: boolean }[] }) => s.parameters.filter(p => p.active).map(p => p.key);

function scopeSettingsNames(scope: string, settings: ScopeSettings): ScopeSettingNames {
  return {
    scope,
    headers: headerNames(settings),
    variables: variableNames(settings),
    secrets: secretNames(settings),
    auth: settings.auth.authentication,
  };
}

function requestSettingsNames(request: RequestNode): ScopeSettingNames {
  return {
    scope: `request:${request.path}`,
    headers: headerNames(request.action),
    variables: [],
    secrets: [],
    auth: request.action.authentication.authentication,
    params: paramNames(request.action),
  };
}

function runSettingsNames(request: RequestNode, run: RestActionRun): ScopeSettingNames {
  return {
    scope: `run:${request.path}#${run.name}`,
    headers: headerNames(run),
    variables: variableNames(run),
    secrets: secretNames(run),
    auth: run.authentication.authentication,
    params: paramNames(run),
  };
}

// Every scope in the collection, in resolution order: collection, each environment, each
// folder (depth-first, in tree order), each request, each run.
function allScopes(root: CollectionNode): ScopeSettingNames[] {
  const requests = root.requestNodes();
  return [
    scopeSettingsNames('collection', root.config.collectionEnvironment),
    ...root.config.environments.map(e => scopeSettingsNames(`env:${e.name}`, e)),
    ...root.folderNodes().map(f => scopeSettingsNames(`folder:${f.path}`, f.config)),
    ...requests.map(requestSettingsNames),
    ...requests.flatMap(r => r.action.runs.map(run => runSettingsNames(r, run))),
  ];
}

function singleScope(root: CollectionNode, locator: Locator, resolved: ResolvedScope): ScopeSettingNames {
  if (locator.kind === 'collection') return scopeSettingsNames('collection', root.config.collectionEnvironment);
  if (locator.kind === 'environment') {
    const env = root.config.environments.find(e => e.name === locator.name || e.id === locator.name)!;
    return scopeSettingsNames(`env:${env.name}`, env);
  }
  if (resolved.node instanceof FolderNode) return scopeSettingsNames(`folder:${resolved.node.path}`, resolved.node.config);
  if (resolved.node instanceof RunNode) return runSettingsNames(resolved.node.request, resolved.node.run);
  if (resolved.node instanceof RequestNode) return requestSettingsNames(resolved.node);
  throw new QueryError(`Unsupported locator kind '${locator.kind}'`);
}

/** Every scope's settings by name only, or (with `locator`) just the one scope it addresses. */
export function settingsView(root: CollectionNode, locator?: Locator): SettingsView {
  const scopes = locator === undefined ? allScopes(root) : [singleScope(root, locator, resolveLocator(root, locator))];
  return { collection: root.name, scopes };
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

export const sourceOf = (s: SettingSource) => `${s.kind}:${s.name}`;

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
      url: replace(maskPresignedUrl(`${resolved.protocol}://${resolved.url}`)),
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
