import { Injectable, signal } from '@angular/core';
import { RunListing, RunRecord } from '@fullyrested/core';
import { mockRunListings, mockRunRecord } from '../mocks/mock-runs';

// The run history of the open collection, over the main process. No logic lives here: the record is
// built by core's buildAppRunRecord and written by core's file run store. Under `ng serve` there is no
// Electron IPC, so this serves mock runs, the way the repository and execute services already do.
@Injectable({ providedIn: 'root' })
export class RunHistoryService {
  // bumped after each save, so an open History pane can reload itself
  readonly changed = signal(0);

  private get ipc(): any {
    return (<any>window).ipc;
  }

  available(): boolean {
    return this.ipc != undefined;
  }

  async save(record: RunRecord): Promise<void> {
    if (this.ipc == undefined) return;
    await this.ipc.invoke('saveRun', record);
    this.changed.update(n => n + 1);
  }

  async list(): Promise<RunListing[]> {
    if (this.ipc == undefined) return mockRunListings();
    return this.ipc.invoke('listRuns');
  }

  async load(runId: string): Promise<RunRecord | undefined> {
    if (this.ipc == undefined) return mockRunRecord(runId);
    return this.ipc.invoke('loadRun', { runId });
  }
}
