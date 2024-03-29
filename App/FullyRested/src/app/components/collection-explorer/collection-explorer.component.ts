import { Component, OnInit, Injectable, Input, Output, EventEmitter } from '@angular/core';
import { TreeviewConfig, TreeviewItem } from '@treeview/ngx-treeview';
import { ActionRepositoryService } from 'src/app/services/action-repository/action-repository.service';
import { Collection, CurrentState, REConstants, TraversedDrectory, RestAction, File } from '../../../../../shared/runner';

export interface SelectedTreeItem {
  // id: string;
  key: string;
  runkey: string;
  enabledMenuOptions: string[];
  type: string;
  subtype: string;
  activeTab: boolean;
}

@Injectable()
export class ProductTreeviewConfig extends TreeviewConfig {
  override hasAllCheckBox = true;
  override hasFilter = true;
  override hasCollapseExpand = false;
  // override maxHeight = 400;
  override compact = true;
}

@Component({
  selector: 'app-collection-explorer',
  templateUrl: './collection-explorer.component.html',
  styleUrls: ['./collection-explorer.component.css'],
  providers: [
    { provide: TreeviewConfig, useClass: ProductTreeviewConfig }
  ]
})
export class CollectionExplorerComponent implements OnInit {
  _collection: Collection | undefined;

  @Input()
  state: CurrentState | undefined;

  @Input()
  set collection(collection: Collection | undefined) {
    if (collection == undefined) {
      this._collection = collection;
      this.items = [];
      return;
    }

    console.log('set collection');
    console.log(collection);
    this._collection = collection;
    if (this.state != undefined)
      this.rebuildTree(collection, this.state);
  }

  @Output()
  openFile = new EventEmitter<SelectedTreeItem>();

  @Output()
  openSystem = new EventEmitter<SelectedTreeItem>();

  items: TreeviewItem[] = [];

  @Input()
  selected: string = '';

  @Output()
  selectedChange = new EventEmitter<string>();

  constructor(private repo: ActionRepositoryService) {
  }

  ngOnInit(): void {
  }

  async rebuildTree(collection: Collection, state: CurrentState): Promise<boolean> {
    var dir = await this.repo.traverseDirectory(collection.path, [REConstants.ActionExtension]);
    this.items = [await this.buildTreeview(dir, collection.name, state)];
    this.expandTree(this.items);
    console.log(this.items);
    return true;
  }

  private async buildTreeview(traverse: TraversedDrectory, name: string, state: CurrentState): Promise<TreeviewItem> {
    var children = [this.systemSettings(), await this.convertDirToTreeviewItem(traverse, state)];

    return new TreeviewItem({
      text: name,
      value: { type: 'dir', key: '__root_dir__' },
      children: children,
      collapsed: true
    });
  }

  private systemSettings(): TreeviewItem {
    var systemchildren = [
      new TreeviewItem({ text: 'Variables', value: { type: 'system', subtype: 'variables', key: 'system.settings.variables' }, collapsed: false }),
      new TreeviewItem({ text: 'Authentication', value: { type: 'system', subtype: 'authentication', key: 'system.settings.authentication' }, collapsed: false }),
      new TreeviewItem({ text: 'Secrets', value: { type: 'system', subtype: 'secrets', key: 'system.settings.secrets' }, collapsed: false }),
      new TreeviewItem({ text: 'Environments', value: { type: 'dir', subtype: 'environments', key: 'system.settings.environments', actions: ['createEnvironment'] }, children: this.buildEnvironmentsAsChildren(), collapsed: false }),
    ];

    return new TreeviewItem({
      text: 'Collection Settings',
      value: { type: 'dir', key: 'system.settings' },
      children: systemchildren,
      collapsed: false
    });
  }

  private buildEnvironmentsAsChildren(): TreeviewItem[] | undefined {
    return this._collection?.config.environments.map(e => {
      return new TreeviewItem({
        text: e.name,
        value: { type: 'dir', subtype: 'system.settings.environments', key: `system.settings.environments.${e.id}`, actions: ['deleteEnvironment'] },
        children: [
          new TreeviewItem({ text: 'Variables', value: { type: 'system', subtype: 'variables', key: `system.settings.environments.${e.id}.variables` }, collapsed: false }),
          new TreeviewItem({ text: 'Secrets', value: { type: 'system', subtype: 'secrets', key: `system.settings.environments.${e.id}.secrets` }, collapsed: false }),
          new TreeviewItem({ text: 'Authentication', value: { type: 'system', subtype: 'authentication', key: `system.settings.environments.${e.id}.authentication` }, collapsed: false }),
        ],
        collapsed: false
      });
    });
  }

  private async convertDirToTreeviewItem(traverse: TraversedDrectory, state: CurrentState): Promise<TreeviewItem> {
    var children = await Promise.all(traverse.subdirs.map(async s => this.convertDirToTreeviewItem(s, state)));

    var runChildren = await Promise.all(traverse.files.map(async f => {
      return new TreeviewItem({
        text: f.name,
        value: { type: 'file', key: f.fullPath, actions: ['createRun'] },
        children: await this.BuildRunChildren(f, state)
      })
    }));

    children = children.concat(runChildren);

    return new TreeviewItem({
      text: traverse.dir.name,
      value: { type: 'dir', key: traverse.dir.fullPath },
      children: await children,
      collapsed: true
    });
  }

  private async BuildRunChildren(f: File, state: CurrentState): Promise<TreeviewItem[]> {
    var action: RestAction = await this.LoadAction(f, state);

    var children: TreeviewItem[] = action.runs.map(r => new TreeviewItem({
      text: r.name,
      value: { type: 'run', subtype: 'definition', key: r.id, actionFile: f.fullPath, actions: ['deleteRun'] },
      children: []
    }));

    return children;
  }

  async LoadAction(f: File, state: CurrentState): Promise<RestAction> {
    var recent = state.sessions.find(s => s.collectionGuid == this._collection?.config.collectionGuid);
    if (recent != undefined) {
       var action = recent.actions.find(a => a.fullFilename == f.fullPath);
       if (action != undefined)
          return action.action;
    }

    return this.repo.loadRequest(f.fullPath);
  }

  private expandTree(items: TreeviewItem[]): boolean {
    if (items == undefined)
      return false;

    var hasFiles = false;
    //if there are any files then we should expand the folder
    if (items.some(i => i.value.type == 'file' || i.value.type == 'system' || i.value.type == 'environment' || i.value.type == 'run')) {
      hasFiles = true;
    }

    //if any of the children have files expand the node
    var childrenHaveFles = false;
    items.forEach(i => {
      i.collapsed = !this.expandTree(i.children) || i.value.type == 'system' || i.value.type == 'environment'; // || i.value.type == 'file';
      childrenHaveFles = childrenHaveFles || !i.collapsed;
    });

    return hasFiles || childrenHaveFles;
  }

  onClick($event: TreeviewItem) {
    console.log(`onClick:[${$event.value.key}][${$event.value.type}]`);
    this.selected = $event.value.key;
    this.selectedChange.emit(this.selected);

    if (this.openActionFile(true, $event) == true)
      return;

    if (this.openRun(true, $event) == true)
      return;
    
    this.openSystem.emit({ activeTab: true, key: $event.value.key, runkey: '', type: $event.value.type, subtype: $event.value.subtype, enabledMenuOptions: $event.value.actions });
  }
  
  onDblClick($event: TreeviewItem) {
    console.log(`onDblClick:[${$event.value.key}][${$event.value.type}]`);
    
    if (this.openActionFile(false, $event) == true)
      return;

    if (this.openRun(false, $event) == true)
      return;
  }

  openRun(activeTab: boolean, $event: TreeviewItem) {
    if ($event.value.type == 'run') {
      this.openFile.emit({ activeTab: activeTab, key: $event.value.actionFile, runkey: $event.value.key, type: $event.value.type, subtype: $event.value.subtype, enabledMenuOptions: $event.value.actions });
      return true;
    }

    return false;
  }

  private openActionFile(activeTab: boolean, $event: TreeviewItem): boolean {
    if ($event.value.type == 'file') {
      this.openFile.emit({ activeTab: activeTab, key: $event.value.key, runkey: '', type: $event.value.type, subtype: $event.value.subtype, enabledMenuOptions: $event.value.actions });
      return true;
    }

    return false;
  }
  private onFilterChange($event: any) {

  }
}


