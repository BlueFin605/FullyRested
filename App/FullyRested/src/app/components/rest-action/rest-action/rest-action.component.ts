import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ViewChild,
  DoCheck,
  OnDestroy,
} from '@angular/core';
import { EditRequestComponent } from '../request/edit-request/edit-request.component';
import { RestActionRunComponent } from '../rest-action-run/rest-action-run.component';
import { CollectionTreeService } from 'src/app/services/collection-tree/collection-tree.service';
import { ActionRepositoryService } from 'src/app/services/action-repository/action-repository.service';
import { Subscription } from 'rxjs';
import { WsConnectRequest, WsSessionService } from 'src/app/services/ws-session/ws-session.service';
import { LatestResultsService, resultKey } from 'src/app/services/latest-results/latest-results.service';
import { CreateEmptyAction } from '@fullyrested/core';
import { RestAction, Collection } from '@fullyrested/core';
import {
  EmptyActionResult,
  ExecuteRestCallsService,
  TimedActionResult,
} from 'src/app/services/execute-rest-calls/execute-rest-calls.service';

@Component({
  selector: 'app-rest-action',
  templateUrl: './rest-action.component.html',
  styleUrls: ['./rest-action.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class RestActionComponent implements OnInit, DoCheck, OnDestroy {
  _action: RestAction = CreateEmptyAction();
  _laststate: string = '';
  _fullFilename: string = '';
  _originalSource: string = '';

  @Input()
  set action(action: RestAction) {
    this._action = action;
    this._laststate = JSON.stringify(action);
    this.dirtyChange.emit(this._laststate != this._originalSource);
  }

  @Output()
  actionChange = new EventEmitter<RestAction>();

  @Output()
  nameChange = new EventEmitter<string>();

  // A websocket field holds a value that cannot be saved; the request is not saved while true
  @Output()
  invalidChange = new EventEmitter<boolean>();

  @Output()
  dirtyChange = new EventEmitter<boolean>();

  @Input()
  set fullFilename(fullFlename: string) {
    if (this._fullFilename == fullFlename) return;

    this._fullFilename = fullFlename;
    this.repository.loadRequest(fullFlename).then((a) => {
      this._originalSource = JSON.stringify(a);
      var currentstate = JSON.stringify(this._action);
      this.dirtyChange.emit(currentstate != this._originalSource);
    });
  }

  @Input()
  collection: Collection | undefined;

  @Input()
  runId: string | undefined;

  response: TimedActionResult = EmptyActionResult;
  sending = false;
  // set while the live session panel replaces the response pane
  liveRequest: WsConnectRequest | undefined;
  liveMessage: string | undefined;

  constructor(
    private era: ExecuteRestCallsService,
    private repository: ActionRepositoryService,
    private trees: CollectionTreeService,
    private latest: LatestResultsService,
    private wsSessions: WsSessionService,
  ) {}

  @ViewChild(EditRequestComponent) requestEditor: EditRequestComponent | undefined;
  @ViewChild(RestActionRunComponent) runView: RestActionRunComponent | undefined;

  ngOnInit(): void {
    this.bindResults();
  }

  private watching: Subscription | undefined;
  private watchedKey: string | undefined;

  // Follow the shared store for this tab's key; re-keys when the node (path) changes
  private bindResults() {
    const node = this.inheritedNode;
    const key = node ? resultKey(this.trees.openCollection?.filename || this.trees.openCollection?.path, node.path) : undefined;
    if (key === this.watchedKey && this.watching) return;
    this.watching?.unsubscribe();
    this.watchedKey = key;
    this.watching = key === undefined ? undefined : this.latest.watch(key).subscribe((r) => (this.response = r ?? EmptyActionResult));
    if (key === undefined) this.response = EmptyActionResult;
  }

  ngDoCheck(): void {
    this.bindResults();
  }

  ngOnDestroy(): void {
    this.watching?.unsubscribe();
    this.watching = undefined;
  }

  private inheritedCache: { key: unknown[]; node: ReturnType<CollectionTreeService['nodeFor']> } | undefined;

  // Evaluated every change-detection pass, so it returns the same node until an input changes (a new
  // object each pass trips NG0100). A tab mid-switch may not resolve yet, so swallow that.
  get inheritedNode() {
    const key = [this._action, this._fullFilename, this.runId, this.trees.tree.value, this.collection];
    if (this.inheritedCache && this.inheritedCache.key.every((k, i) => k === key[i])) return this.inheritedCache.node;
    try {
      const node = this.trees.nodeFor(this._action, this._fullFilename);
      this.inheritedCache = { key, node };
      return node;
    } catch {
      this.inheritedCache = undefined;
      return undefined;
    }
  }

  get actionId(): string {
    return this._action.id;
  }

  // Ctrl+Enter: send whatever this tab shows, the request or the run
  send() {
    if (this.runView) this.runView.send();
    else this.requestEditor?.test();
  }

  focusUrl() {
    this.requestEditor?.focusUrl();
  }

  async executeAction() {
    if (this.sending) return;
    this.sending = true;
    try {
      const node = this.trees.nodeFor(this._action, this._fullFilename);
      this.response = await this.era.executeNode(node, this.collection?.config.selectedEnvironmentId);
    } catch (error) {
      // a broken folder or collection file refuses to resolve: show why instead of sending without it
      this.response = { ...EmptyActionResult, status: 'error', statusText: (error as Error).message };
    } finally {
      this.sending = false;
    }
  }

  // Opens a live session on this websocket request; a fresh request object each time connects again
  openLiveSession() {
    try {
      const node = this.trees.nodeFor(this._action, this._fullFilename);
      const { request, message } = this.wsSessions.requestFor(node, this.collection?.config.selectedEnvironmentId);
      this.liveMessage = message;
      this.liveRequest = request;
    } catch (error) {
      this.response = { ...EmptyActionResult, status: 'error', statusText: (error as Error).message };
      this.liveRequest = undefined;
    }
  }

  onActionChange(event: RestAction) {
    var currentstate = JSON.stringify(this._action);

    if (currentstate == this._laststate) return;

    this._laststate = currentstate;

    this.dirtyChange.emit(currentstate != this._originalSource);

    //TODO need to store oigin state in @Input nd then do a deep compare and only emit change when they re different
    this.actionChange.emit(this._action);
  }

  onNameChange(name: string) {
    this.nameChange.emit(name);
  }
}
