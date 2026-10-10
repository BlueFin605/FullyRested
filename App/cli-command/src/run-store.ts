import * as fs from 'fs';
import * as path from 'path';
import { RunListing, RunRecord, RunStore, listingOf } from '@fullyrested/core';

export const RUNS_FOLDER = '.fullyrested-runs';

// Run records as JSON files in <dir>/.fullyrested-runs, one file per run
export class FsRunStore implements RunStore {
  private readonly folder: string;

  constructor(dir: string, private readonly onWarning: (m: string) => void = () => { }) {
    this.folder = path.join(dir, RUNS_FOLDER);
  }

  private fileOf(runId: string): string {
    return path.join(this.folder, `${runId}.json`);
  }

  private parse(file: string): RunRecord {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as RunRecord;
    } catch (error) {
      throw new Error(`Run file ${file} is corrupt: ${(error as Error).message}`);
    }
  }

  async save(record: RunRecord): Promise<void> {
    fs.mkdirSync(this.folder, { recursive: true });
    fs.writeFileSync(this.fileOf(record.runId), JSON.stringify(record, null, 2));
  }

  async load(runId: string): Promise<RunRecord | undefined> {
    const file = this.fileOf(runId);
    if (!fs.existsSync(file)) return undefined;
    return this.parse(file);
  }

  async list(): Promise<RunListing[]> {
    if (!fs.existsSync(this.folder)) return [];
    const listings: RunListing[] = [];
    for (const name of fs.readdirSync(this.folder)) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(this.folder, name);
      try {
        listings.push(listingOf(this.parse(file)));
      } catch (error) {
        this.onWarning((error as Error).message);
      }
    }
    return listings.sort((a, b) => (a.runId < b.runId ? 1 : a.runId > b.runId ? -1 : 0));
  }
}
