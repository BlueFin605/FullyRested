import * as fs from 'fs';
import * as path from 'path';
import { RUNS_FOLDER, RunListing, RunRecord, RunStore, RunStoreHost, fileRunStore } from '@fullyrested/core';

// Re-exported because index.ts and mcp.ts import it from here
export { RUNS_FOLDER };

// The node half of core's run store: every rule about ids, naming, sorting and pruning is core's.
export const nodeRunStoreHost: RunStoreHost = {
  exists: p => fs.existsSync(p),
  readText: p => fs.readFileSync(p, 'utf8'),
  writeText: (p, text) => fs.writeFileSync(p, text),
  // a record file that is a symlink is skipped: it could point at anything outside the runs folder
  readdir: p => fs.readdirSync(p, { withFileTypes: true }).filter(e => !e.isSymbolicLink()).map(e => e.name),
  mkdir: p => { fs.mkdirSync(p, { recursive: true }); },
  remove: p => { fs.rmSync(p, { force: true }); },
  join: (...parts) => path.join(...parts)
};

// The CLI never prunes: a recorded suite an agent is querying must not vanish. No cap is passed.
export class FsRunStore implements RunStore {
  private readonly inner: RunStore;

  constructor(dir: string, onWarning: (m: string) => void = () => { }) {
    this.inner = fileRunStore(nodeRunStoreHost, dir, { onWarning });
  }

  save(record: RunRecord): Promise<void> {
    return this.inner.save(record);
  }

  load(runId: string): Promise<RunRecord | undefined> {
    return this.inner.load(runId);
  }

  list(): Promise<RunListing[]> {
    return this.inner.list();
  }
}
