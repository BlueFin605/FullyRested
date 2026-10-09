import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ViewChild,
} from '@angular/core';
import { EditRequestRunComponent } from '../request/edit-request-run/edit-request-run.component';
import { CollectionTreeService } from 'src/app/services/collection-tree/collection-tree.service';
import {
  Collection,
  RestAction,
  RestActionRun,
  ValidationType,
} from '@fullyrested/core';
import { ActionRepositoryService } from 'src/app/services/action-repository/action-repository.service';
import { CreateEmptyRestActionRun, CreateEmptyAction } from '@fullyrested/core';
import { SystemSupportService } from 'src/app/services/system-support/system-support.service';
import {
  EmptyActionResult,
  ExecuteRestCallsService,
  TimedActionResult,
} from 'src/app/services/execute-rest-calls/execute-rest-calls.service';

@Component({
  selector: 'app-rest-action-run',
  templateUrl: './rest-action-run.component.html',
  styleUrls: ['./rest-action-run.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class RestActionRunComponent implements OnInit {
  _runId: String = '';
  run: RestActionRun = CreateEmptyRestActionRun(
    this.systemSupport,
    ValidationType.Inherit,
  );

  @Input()
  action: RestAction = CreateEmptyAction();

  @Output()
  actionChange = new EventEmitter<RestAction>();

  @Input()
  set runId(id: string) {
    this._runId = id;
    this.run = this.activeRun(id);
  }

  @Input()
  collection: Collection | undefined;

  // the tab's file: places the run under its folders
  @Input()
  fullFilename = '';

  @Output()
  nameChange = new EventEmitter<string>();

  response: TimedActionResult = EmptyActionResult;
  sending = false;

  constructor(
    private era: ExecuteRestCallsService,
    private repository: ActionRepositoryService,
    private trees: CollectionTreeService,
    private systemSupport: SystemSupportService,
  ) {}

  @ViewChild(EditRequestRunComponent) runEditor: EditRequestRunComponent | undefined;

  ngOnInit(): void {}

  send() {
    this.runEditor?.test();
  }

  onRunChange(event: RestActionRun) {
    this.actionChange.emit(this.action);
  }

  private inheritedCache: { key: unknown[]; node: ReturnType<CollectionTreeService['nodeFor']> } | undefined;

  // Evaluated every change-detection pass, so it returns the same node until an input changes (a new
  // object each pass trips NG0100). A deleted run makes nodeFor throw, so show nothing.
  get inheritedNode() {
    const key = [this.action, this.fullFilename, this._runId, this.trees.tree.value, this.collection];
    if (this.inheritedCache && this.inheritedCache.key.every((k, i) => k === key[i])) return this.inheritedCache.node;
    try {
      const node = this.trees.nodeFor(this.action, this.fullFilename, this._runId as string);
      this.inheritedCache = { key, node };
      return node;
    } catch {
      this.inheritedCache = undefined;
      return undefined;
    }
  }

  onNameChange(name: string) {
    this.nameChange.emit(name);
  }

  async executeAction() {
    if (this.sending) return;
    this.sending = true;
    try {
      const node = this.trees.nodeFor(this.action, this.fullFilename, this._runId as string);
      this.response = await this.era.executeNode(node, this.collection?.config.selectedEnvironmentId);
    } catch (error) {
      // a broken folder or collection file refuses to resolve: show why instead of sending without it
      this.response = { ...EmptyActionResult, status: 'error', statusText: (error as Error).message };
    } finally {
      this.sending = false;
    }
  }

  activeRun(id: string): RestActionRun {
    var active = this.action.runs.find((r) => r.id == id);
    if (active != undefined) {
      return active;
    }

    return CreateEmptyRestActionRun(this.systemSupport, ValidationType.Inherit);
  }
}
