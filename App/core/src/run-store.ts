import { RunRecord, toCaseOutcomeCounts } from './run-record';

export interface RunListing {
  runId: string;
  startedAt: string;
  selection: string;
  environment?: string;
  passed: number;
  failed: number;
  errored: number;
}

export interface RunStore {
  save(record: RunRecord): Promise<void>;
  load(runId: string): Promise<RunRecord | undefined>;
  list(): Promise<RunListing[]>; // newest first
}

export function listingOf(r: RunRecord): RunListing {
  const listing: RunListing = {
    runId: r.runId,
    startedAt: r.startedAt,
    selection: r.selection,
    ...toCaseOutcomeCounts(r.cases)
  };
  if (r.environment !== undefined) listing.environment = r.environment;
  return listing;
}

// UTC 'YYYYMMDD-HHMMSS-xxxx'; lexical order matches time order.
export function newRunId(now = new Date(), random = () => Math.random().toString(16).slice(2, 6).padEnd(4, '0')): string {
  const p = (n: number, width = 2) => String(n).padStart(width, '0');
  const date = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}`;
  const time = `${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
  return `${date}-${time}-${random()}`;
}

export class MemoryRunStore implements RunStore {
  private readonly runs = new Map<string, RunRecord>();

  constructor(private readonly limit = 20) {}

  async save(record: RunRecord): Promise<void> {
    this.runs.set(record.runId, record);
    while (this.runs.size > this.limit) {
      const oldest = this.runs.keys().next().value as string;
      this.runs.delete(oldest);
    }
  }

  async load(runId: string): Promise<RunRecord | undefined> {
    return this.runs.get(runId);
  }

  async list(): Promise<RunListing[]> {
    return [...this.runs.values()]
      .sort((a, b) => (a.runId < b.runId ? 1 : a.runId > b.runId ? -1 : 0))
      .map(listingOf);
  }
}
