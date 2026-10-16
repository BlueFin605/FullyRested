import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, distinctUntilChanged, map } from 'rxjs';
import { TimedActionResult } from '../execute-rest-calls/execute-rest-calls.service';

// A request's key is its collection-relative path; a run adds `#runId`
export function resultKey(path: string, runId?: string): string {
  return runId ? `${path}#${runId}` : path;
}

// The latest result per request or run, shared by the tabs and batch runs. In memory only: history is the
// persistent record. One collection is open at a time, so the path alone identifies a request.
@Injectable({ providedIn: 'root' })
export class LatestResultsService {
  private readonly results = new BehaviorSubject<ReadonlyMap<string, TimedActionResult>>(new Map());

  set(key: string, result: TimedActionResult): void {
    this.results.next(new Map(this.results.value).set(key, result));
  }

  get(key: string): TimedActionResult | undefined {
    return this.results.value.get(key);
  }

  // The current value, then every change to this key (other keys do not emit)
  watch(key: string): Observable<TimedActionResult | undefined> {
    return this.results.pipe(map(m => m.get(key)), distinctUntilChanged());
  }

  clear(): void {
    this.results.next(new Map());
  }
}
