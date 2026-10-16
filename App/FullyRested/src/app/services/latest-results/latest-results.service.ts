import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, distinctUntilChanged, map } from 'rxjs';
import { TimedActionResult } from '../execute-rest-calls/execute-rest-calls.service';

// A request's key is its collection plus its collection-relative path; a run adds `#runId`. The collection
// part keeps two collections that share a request path from sharing a result.
export function resultKey(collection: string | undefined, path: string, runId?: string): string {
  const key = `${collection ?? ''}|${path}`;
  return runId ? `${key}#${runId}` : key;
}

// The latest result per request or run, shared by the tabs and batch runs. In memory only: history is the
// persistent record. Keys carry the collection, so results never collide across collections.
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
