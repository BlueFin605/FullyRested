import { RunRecord } from './run-record';
import { RunListing, RunStore, listingOf } from './run-store';

export const RUNS_FOLDER = '.fullyrested-runs';

// A run id is a file name, so it may hold nothing that could escape the runs folder
const VALID_RUN_ID = /^[A-Za-z0-9_-]+$/;

// The file primitives a run store needs. core cannot import node:fs -- the Angular build bundles its
// source into the renderer -- so each host supplies these: node:fs in the CLI and in Electron's main
// process. The same arrangement as guardedRealTarget's host in collection-guard.ts.
export interface RunStoreHost {
  exists(p: string): boolean;
  readText(p: string): string;
  writeText(p: string, text: string): void;
  readdir(p: string): string[];
  mkdir(p: string): void;          // recursive
  remove(p: string): void;
  join(...parts: string[]): string;
}

export interface FileRunStoreOptions {
  onWarning?: (message: string) => void;
}

export function fileRunStore(host: RunStoreHost, dir: string, options: FileRunStoreOptions = {}): RunStore {
  const folder = host.join(dir, RUNS_FOLDER);
  const warn = options.onWarning ?? (() => { });
  const fileOf = (runId: string) => host.join(folder, `${runId}.json`);

  const parse = (file: string): RunRecord => {
    try {
      const value: unknown = JSON.parse(host.readText(file));
      if (typeof value !== 'object' || value === null) throw new Error('not a JSON object');
      return value as RunRecord;
    } catch (error) {
      throw new Error(`Run file ${file} is corrupt: ${(error as Error).message}`);
    }
  };

  return {
    async save(record: RunRecord): Promise<void> {
      if (!VALID_RUN_ID.test(record.runId)) throw new Error(`Invalid run id '${record.runId}'`);
      host.mkdir(folder);
      host.writeText(fileOf(record.runId), JSON.stringify(record, null, 2));
    },

    async load(runId: string): Promise<RunRecord | undefined> {
      if (!VALID_RUN_ID.test(runId)) return undefined;
      const file = fileOf(runId);
      if (!host.exists(file)) return undefined;
      return parse(file);
    },

    async list(): Promise<RunListing[]> {
      if (!host.exists(folder)) return [];
      const listings: RunListing[] = [];
      for (const name of host.readdir(folder)) {
        if (!name.endsWith('.json')) continue;
        try {
          listings.push(listingOf(parse(host.join(folder, name))));
        } catch (error) {
          warn((error as Error).message);
        }
      }
      return listings.sort((a, b) => (a.runId < b.runId ? 1 : a.runId > b.runId ? -1 : 0));
    }
  };
}
