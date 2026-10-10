import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  MemoryRunStore, QueryError, RunListing, RunStore, SecretStore,
  caseBody, caseRequest, caseResponse, failures, resolveRun, summary
} from '@fullyrested/core';
import { inspectEnvironments, inspectRequest, inspectTree } from './inspect';
import { FsRunStore } from './run-store';
import { runCollection } from './run';

// The SDK's CJS entry points resolve under module node16, so plain static imports are used.
export interface McpOptions { defaultStore?: string; secrets: SecretStore }

const warn = (m: string) => console.error(`warning: ${m}`); // stdout belongs to the protocol

const caseRef = z.union([z.string(), z.number()]).describe('Case index or name');
const store = z.string().optional().describe('Folder holding .fullyrested-runs (default: this server\'s, else memory only)');
const runId = z.string().optional().describe('Run id (default: the latest)');

export function createServer(opts: McpOptions): McpServer {
  const server = new McpServer({ name: 'fullyrested', version: require('../package.json').version });
  const memory = new MemoryRunStore(20);

  const fsStore = (dir?: string): FsRunStore | undefined => {
    const d = dir ?? opts.defaultStore;
    return d === undefined ? undefined : new FsRunStore(d, warn);
  };
  const storesFor = (dir?: string): RunStore[] => {
    const disk = fsStore(dir);
    return disk ? [memory, disk] : [memory];
  };

  // One text item holding JSON; known errors come back as isError results instead of protocol errors
  const respond = async (fn: () => Promise<unknown> | unknown) => {
    try {
      return { content: [{ type: 'text' as const, text: JSON.stringify(await fn()) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }] };
    }
  };

  server.registerTool('tree', {
    description: 'List the folders, requests and runs of a collection.',
    inputSchema: { collection: z.string().describe('Path to the .frcol file') }
  }, ({ collection }) => respond(() => inspectTree(collection, opts.secrets, warn)));

  server.registerTool('environments', {
    description: 'List the environments of a collection (names only).',
    inputSchema: { collection: z.string() }
  }, ({ collection }) => respond(() => inspectEnvironments(collection, opts.secrets)));

  server.registerTool('show_request', {
    description: 'Show a request as it would be sent, with where each setting comes from.',
    inputSchema: { collection: z.string(), action: z.string().describe('Request file (.frreq)'), run: z.string().optional(), environment: z.string().optional() }
  }, args => respond(() => inspectRequest(args, opts.secrets, warn)));

  server.registerTool('run', {
    description: 'Send requests of a collection and return the run summary. Then call failures, and case_* to drill in. Bodies are only returned by case_body.',
    inputSchema: {
      collection: z.string(), environment: z.string().optional(), action: z.string().optional(),
      run: z.string().optional(), folder: z.string().optional(), all: z.boolean().optional(), store
    }
  }, ({ store: dir, ...options }) => respond(async () => {
    const record = await runCollection(options, opts.secrets, { onWarning: warn, includeSecrets: false });
    await memory.save(record);
    const disk = fsStore(dir);
    if (disk) {
      try {
        await disk.save(record);
      } catch (error) {
        warn(`could not record run: ${(error as Error).message}`);
      }
    }
    return summary(record);
  }));

  server.registerTool('list_runs', {
    description: 'List recorded runs, newest first.',
    inputSchema: { store }
  }, ({ store: dir }) => respond(async () => {
    const byId = new Map<string, RunListing>();
    for (const s of storesFor(dir))
      for (const l of await s.list()) if (!byId.has(l.runId)) byId.set(l.runId, l);
    return [...byId.values()].sort((a, b) => (a.runId < b.runId ? 1 : a.runId > b.runId ? -1 : 0));
  }));

  server.registerTool('run_summary', {
    description: 'Show every case of a run with its outcome.',
    inputSchema: { runId, store }
  }, a => respond(async () => summary(await resolveRun(storesFor(a.store), a.runId))));

  server.registerTool('failures', {
    description: 'Show the failing and errored cases of a run.',
    inputSchema: { runId, store }
  }, a => respond(async () => failures(await resolveRun(storesFor(a.store), a.runId))));

  server.registerTool('case_request', {
    description: 'Show the request a case sent.',
    inputSchema: { case: caseRef, runId, store }
  }, a => respond(async () => caseRequest(await resolveRun(storesFor(a.store), a.runId), a.case)));

  server.registerTool('case_response', {
    description: 'Show the response a case received, without its body.',
    inputSchema: { case: caseRef, runId, store }
  }, a => respond(async () => caseResponse(await resolveRun(storesFor(a.store), a.runId), a.case)));

  server.registerTool('case_body', {
    description: 'Show the response body of a case (or the request body), optionally by JSON path, outline or range.',
    inputSchema: {
      case: caseRef, runId, store,
      request: z.boolean().optional().describe('Show the request body instead'),
      path: z.string().optional().describe('Extract a path from a JSON body'),
      outline: z.boolean().optional().describe('Show the shape of a JSON body'),
      range: z.object({ start: z.number().int().min(0), end: z.number().int().min(0) }).optional().describe('Character range of a text body'),
      full: z.boolean().optional().describe('Do not truncate')
    }
  }, a => respond(async () => caseBody(await resolveRun(storesFor(a.store), a.runId), a.case, {
    request: a.request, path: a.path, outline: a.outline, full: a.full,
    range: a.range ? [a.range.start, a.range.end] : undefined
  })));

  return server;
}

export async function startMcp(opts: McpOptions): Promise<void> {
  await createServer(opts).connect(new StdioServerTransport());
}
