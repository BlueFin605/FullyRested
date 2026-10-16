import { RunRecord } from './run-record';
import { RunListing, RunStore, listingOf, newRunId } from './run-store';

export const RUNS_FOLDER = '.fullyrested-runs';
export const RUN_FILE_EXTENSION = '.frrun';

// A run id is a file name, so it may hold nothing that could escape the runs folder
const VALID_RUN_ID = /^[A-Za-z0-9_-]+$/;
const isRunId = (value: unknown): value is string => typeof value === 'string' && VALID_RUN_ID.test(value);

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

export const APP_RUN_SUFFIX = '-app';

// The app records every send, so its records are capped; the CLI's and an agent's are not, since a
// suite being queried must not vanish underneath it.
export const APP_RUN_CAP = 200;

export function newAppRunId(now?: Date): string {
  return newRunId(now) + APP_RUN_SUFFIX;
}

export function isAppRunId(runId: string): boolean {
  return runId.endsWith(APP_RUN_SUFFIX);
}

export interface FileRunStoreOptions {
  /** prune to this many app-written records after each save; undefined never prunes */
  cap?: number;
  onWarning?: (message: string) => void;
}

export function fileRunStore(host: RunStoreHost, dir: string, options: FileRunStoreOptions = {}): RunStore {
  const folder = host.join(dir, RUNS_FOLDER);
  const warn = options.onWarning ?? (() => { });
  const fileOf = (runId: string) => host.join(folder, `${runId}${RUN_FILE_EXTENSION}`);

  const parse = (file: string): RunRecord => {
    try {
      const value: unknown = JSON.parse(host.readText(file));
      if (typeof value !== 'object' || value === null) throw new Error('not a JSON object');
      return value as RunRecord;
    } catch (error) {
      throw new Error(`Run file ${file} is corrupt: ${(error as Error).message}`);
    }
  };

  // Classification is by file name alone: parsing every record to decide what to delete would mean
  // re-reading every recorded body on every send. Run ids start with a UTC timestamp, so a plain
  // string sort is oldest-first.
  const prune = () => {
    if (options.cap === undefined) return;
    try {
      const names = host.readdir(folder)
        .filter(n => n.endsWith(`${APP_RUN_SUFFIX}${RUN_FILE_EXTENSION}`))
        .sort()
        .reverse();
      for (const name of names.slice(options.cap)) host.remove(host.join(folder, name));
    } catch (error) {
      warn(`Could not prune ${folder}: ${(error as Error).message}`);
    }
  };

  return {
    async save(record: RunRecord): Promise<void> {
      if (!isRunId(record?.runId)) throw new Error(`Invalid run id '${String(record?.runId)}'`);
      host.mkdir(folder);
      host.writeText(fileOf(record.runId), JSON.stringify(record, null, 2));
      prune();
    },

    async load(runId: string): Promise<RunRecord | undefined> {
      if (!isRunId(runId)) return undefined;
      const file = fileOf(runId);
      if (!host.exists(file)) return undefined;
      return parse(file);
    },

    async list(): Promise<RunListing[]> {
      if (!host.exists(folder)) return [];
      const listings: RunListing[] = [];
      for (const name of host.readdir(folder)) {
        if (!name.endsWith(RUN_FILE_EXTENSION)) continue;
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
