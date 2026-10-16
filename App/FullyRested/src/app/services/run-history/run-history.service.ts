import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { RunListing, RunRecord } from '@fullyrested/core';
import { mockRunListings, mockRunRecord } from '../mocks/mock-runs';

// The run history of the open collection, over the main process. No logic lives here: the record is
// built by core's buildAppRunRecord and written by core's file run store. Under `ng serve` there is no
// Electron IPC, so this serves mock runs, the way the repository and execute services already do.
// Every call carries `root`, the collection folder the renderer believes is open: main refuses a stale one.
@Injectable({ providedIn: 'root' })
export class RunHistoryService {
  private readonly savedSubject = new Subject<RunRecord>();

  // each record that reached the disk, so an open History pane can add it without re-listing
  readonly saved$: Observable<RunRecord> = this.savedSubject.asObservable();

  private get ipc(): any {
    return (<any>window).ipc;
  }

  available(): boolean {
    return this.ipc != undefined;
  }

  async save(root: string, record: RunRecord): Promise<void> {
    if (this.ipc == undefined) return;
    await this.ipc.invoke('saveRun', { root, record });
    this.savedSubject.next(record);
  }

  async list(root: string): Promise<RunListing[]> {
    if (this.ipc == undefined) return mockRunListings();
    return this.ipc.invoke('listRuns', { root });
  }

  async load(root: string, runId: string): Promise<RunRecord | undefined> {
    if (this.ipc == undefined) return mockRunRecord(runId);
    return this.ipc.invoke('loadRun', { root, runId });
  }
}
