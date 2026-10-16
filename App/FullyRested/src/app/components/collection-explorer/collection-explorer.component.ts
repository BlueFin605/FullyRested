import {
  Component,
  OnInit,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ViewChild,
} from '@angular/core';
import { MatMenuTrigger } from '@angular/material/menu';
import { CollectionTreeService } from 'src/app/services/collection-tree/collection-tree.service';
import {
  Collection,
  CollectionNode,
  CurrentState,
  FolderNode,
  RequestNode,
  RestAction,
  basenameOf,
  hostPath,
} from '@fullyrested/core';

export interface SelectedTreeItem {
  // id: string;
  key: string;
  runkey: string;
  enabledMenuOptions: string[];
  type: string;
  subtype: string;
  activeTab: boolean;
}

// A context-menu action on a tree row: createRun, deleteRun, createEnvironment, deleteEnvironment
export interface ExplorerCommand {
  name: string;
  item: SelectedTreeItem;
}

const COMMANDS: { [name: string]: { label: string; icon: string } } = {
  createRun: { label: 'New run', icon: 'add' },
  deleteRun: { label: 'Delete run', icon: 'delete' },
  createEnvironment: { label: 'New environment', icon: 'add' },
  deleteEnvironment: { label: 'Delete environment', icon: 'delete' },
  folderSettings: { label: 'Folder settings', icon: 'tune' },
};

// One row of the explorer tree. value holds what the row is (type, subtype, key, menu actions, ...)
export class TreeviewItem {
  text: string;
  value: any;
  children: TreeviewItem[] | undefined;
  collapsed: boolean;

  constructor(item: {
    text: string;
    value: any;
    children?: TreeviewItem[];
    collapsed?: boolean;
  }) {
    this.text = item.text;
    this.value = item.value;
    this.children =
      item.children != undefined && item.children.length > 0
        ? item.children
        : undefined;
    this.collapsed = item.collapsed ?? false;
  }
}

@Component({
  selector: 'app-collection-explorer',
  templateUrl: './collection-explorer.component.html',
  styleUrls: ['./collection-explorer.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class CollectionExplorerComponent implements OnInit {
  _collection: Collection | undefined;

  private root: CollectionNode | undefined;
  private _state: CurrentState | undefined;

  @Input()
  set state(state: CurrentState | undefined) {
    this._state = state;
    this.rebuild();
  }
  get state(): CurrentState | undefined {
    return this._state;
  }

  @Input()
  set collection(collection: Collection | undefined) {
    this._collection = collection;
    this.rebuild();
  }

  @Output()
  openFile = new EventEmitter<SelectedTreeItem>();

  @Output()
  openSystem = new EventEmitter<SelectedTreeItem>();

  @Output()
  command = new EventEmitter<ExplorerCommand>();

  @ViewChild('contextTrigger') contextTrigger: MatMenuTrigger | undefined;
  contextItem: TreeviewItem | undefined;
  contextPosition = { x: 0, y: 0 };

  items: TreeviewItem[] = [];

  @Input()
  selected: string = '';

  @Output()
  selectedChange = new EventEmitter<string>();

  constructor(private trees: CollectionTreeService) {
    this.trees.tree.subscribe((root) => {
      this.root = root;
      this.rebuild();
    });
  }

  ngOnInit(): void {}

  refresh() {
    this.rebuild();
  }

  private rebuild() {
    if (this.root == undefined || this._collection == undefined || this._state == undefined) {
      this.items = [];
      return;
    }

    this.items = [
      new TreeviewItem({
        text: this._collection.name,
        value: { type: 'dir', key: '__root_dir__', error: this.root.loadError?.message },
        children: [this.systemSettings(), ...this.root.children.map((c) => this.convertNode(c, this._state!))],
        collapsed: true,
      }),
    ];
    this.expandTree(this.items);
  }

  private systemSettings(): TreeviewItem {
    var systemchildren = [
      new TreeviewItem({
        text: 'Variables',
        value: {
          type: 'system',
          subtype: 'variables',
          key: 'system.settings.variables',
        },
        collapsed: false,
      }),
      new TreeviewItem({
        text: 'Authentication',
        value: {
          type: 'system',
          subtype: 'authentication',
          key: 'system.settings.authentication',
        },
        collapsed: false,
      }),
      new TreeviewItem({
        text: 'Headers',
        value: { type: 'system', subtype: 'headers', key: 'system.settings.headers' },
        collapsed: false,
      }),
      new TreeviewItem({
        text: 'Secrets',
        value: {
          type: 'system',
          subtype: 'secrets',
          key: 'system.settings.secrets',
        },
        collapsed: false,
      }),
      new TreeviewItem({
        text: 'History',
        value: { type: 'system', subtype: 'history', key: 'system.history' },
        collapsed: false,
      }),
      new TreeviewItem({
        text: 'Environments',
        value: {
          type: 'dir',
          subtype: 'environments',
          key: 'system.settings.environments',
          actions: ['createEnvironment'],
        },
        children: this.buildEnvironmentsAsChildren(),
        collapsed: false,
      }),
    ];

    return new TreeviewItem({
      text: 'Collection Settings',
      value: { type: 'dir', key: 'system.settings' },
      children: systemchildren,
      collapsed: false,
    });
  }

  private buildEnvironmentsAsChildren(): TreeviewItem[] | undefined {
    return this._collection?.config.environments.map((e) => {
      return new TreeviewItem({
        text: e.name,
        value: {
          type: 'dir',
          subtype: 'system.settings.environments',
          key: `system.settings.environments.${e.id}`,
          actions: ['deleteEnvironment'],
        },
        children: [
          new TreeviewItem({
            text: 'Variables',
            value: {
              type: 'system',
              subtype: 'variables',
              key: `system.settings.environments.${e.id}.variables`,
            },
            collapsed: false,
          }),
          new TreeviewItem({
            text: 'Secrets',
            value: {
              type: 'system',
              subtype: 'secrets',
              key: `system.settings.environments.${e.id}.secrets`,
            },
            collapsed: false,
          }),
          new TreeviewItem({
            text: 'Authentication',
            value: {
              type: 'system',
              subtype: 'authentication',
              key: `system.settings.environments.${e.id}.authentication`,
            },
            collapsed: false,
          }),
          new TreeviewItem({
            text: 'Headers',
            value: { type: 'system', subtype: 'headers', key: `system.settings.environments.${e.id}.headers` },
            collapsed: false,
          }),
        ],
        collapsed: false,
      });
    });
  }

  private convertNode(node: FolderNode | RequestNode, state: CurrentState): TreeviewItem {
    const key = hostPath(this._collection!.path, node.path);
    if (node instanceof FolderNode)
      return new TreeviewItem({
        text: node.name,
        value: {
          type: 'dir',
          subtype: 'folder',
          key,
          hasSettings: node.hasSettingsFile,
          error: node.loadError?.message,
          actions: ['folderSettings'],
        },
        children: node.children.map((c) => this.convertNode(c, state)),
        collapsed: true,
      });

    const action = this.openCopy(key, state) ?? node.action;
    return new TreeviewItem({
      text: basenameOf(node.path),
      value: { type: 'file', key, verb: action.verb, error: node.loadError?.message, actions: ['createRun'] },
      children: this.buildRunChildren(key, action),
      collapsed: true,
    });
  }

  private buildRunChildren(actionFile: string, action: RestAction): TreeviewItem[] {
    return action.runs.map(
      (r) =>
        new TreeviewItem({
          text: r.name,
          value: { type: 'run', subtype: 'definition', key: r.id, actionFile, actions: ['deleteRun'] },
          children: [],
        }),
    );
  }

  // The open tab's copy of a request, which may have unsaved changes
  private openCopy(fullFilename: string, state: CurrentState): RestAction | undefined {
    const session = state.sessions.find((s) => s.collectionGuid == this._collection?.config.collectionGuid);
    return session?.actions.find((a) => a.fullFilename == fullFilename)?.action;
  }

  private expandTree(items: TreeviewItem[] | undefined): boolean {
    if (items == undefined) return false;

    var hasFiles = false;
    //if there are any files then we should expand the folder
    if (
      items.some(
        (i) =>
          i.value.type == 'file' ||
          i.value.type == 'system' ||
          i.value.type == 'environment' ||
          i.value.type == 'run',
      )
    ) {
      hasFiles = true;
    }

    //if any of the children have files expand the node
    var childrenHaveFles = false;
    items.forEach((i) => {
      i.collapsed =
        !this.expandTree(i.children) ||
        i.value.type == 'system' ||
        i.value.type == 'environment'; // || i.value.type == 'file';
      childrenHaveFles = childrenHaveFles || !i.collapsed;
    });

    return hasFiles || childrenHaveFles;
  }

  onClick($event: TreeviewItem) {
    this.selected = $event.value.key;
    this.selectedChange.emit(this.selected);

    if (this.openActionFile(true, $event) == true) return;

    if (this.openRun(true, $event) == true) return;

    // A plain folder has nothing to show, so a click opens or closes it
    if ($event.value.subtype == 'folder' && $event.children)
      this.toggle($event);

    this.openSystem.emit({
      activeTab: true,
      key: $event.value.key,
      runkey: '',
      type: $event.value.type,
      subtype: $event.value.subtype,
      enabledMenuOptions: $event.value.actions,
    });
  }

  onDblClick($event: TreeviewItem) {
    if (this.openActionFile(false, $event) == true) return;

    if (this.openRun(false, $event) == true) return;
  }

  openRun(activeTab: boolean, $event: TreeviewItem) {
    if ($event.value.type == 'run') {
      this.openFile.emit({
        activeTab: activeTab,
        key: $event.value.actionFile,
        runkey: $event.value.key,
        type: $event.value.type,
        subtype: $event.value.subtype,
        enabledMenuOptions: $event.value.actions,
      });
      return true;
    }

    return false;
  }

  private openActionFile(activeTab: boolean, $event: TreeviewItem): boolean {
    if ($event.value.type == 'file') {
      this.openFile.emit({
        activeTab: activeTab,
        key: $event.value.key,
        runkey: '',
        type: $event.value.type,
        subtype: $event.value.subtype,
        enabledMenuOptions: $event.value.actions,
      });
      return true;
    }

    return false;
  }
  filter: string = '';

  // Every request file in the tree, for the command palette
  requestFiles(): { name: string; key: string; verb: string }[] {
    const files: { name: string; key: string; verb: string }[] = [];
    const walk = (items: TreeviewItem[] | undefined) =>
      (items ?? []).forEach((i) => {
        if (i.value.type == 'file')
          files.push({ name: i.text, key: i.value.key, verb: i.value.verb });
        walk(i.children);
      });
    walk(this.items);
    return files;
  }

  onContextMenu(event: MouseEvent, item: TreeviewItem) {
    const hasOpen = item.value.type == 'file' || item.value.type == 'run';
    if (!hasOpen && (item.value.actions ?? []).length == 0) return;

    event.preventDefault();
    this.contextItem = item;
    this.contextPosition = { x: event.clientX, y: event.clientY };
    this.selected = item.value.key;
    this.selectedChange.emit(this.selected);
    // let the anchor move before the menu measures it
    setTimeout(() => this.contextTrigger?.openMenu());
  }

  emitCommand(name: string, item: TreeviewItem) {
    const isRun = item.value.type == 'run';
    this.command.emit({
      name,
      item: {
        activeTab: false,
        key: isRun ? item.value.actionFile : item.value.key,
        runkey: isRun ? item.value.key : '',
        type: item.value.type,
        subtype: item.value.subtype,
        enabledMenuOptions: item.value.actions ?? [],
      },
    });
  }

  commandLabel(name: string): string {
    return COMMANDS[name]?.label ?? name;
  }

  commandIcon(name: string): string {
    return COMMANDS[name]?.icon ?? 'chevron_right';
  }

  systemIcon(subtype: string): string {
    switch (subtype) {
      case 'variables':
        return 'data_object';
      case 'secrets':
        return 'key';
      case 'authentication':
        return 'lock';
      case 'headers':
        return 'view_list';
      case 'history':
        return 'history';
      default:
        return 'settings';
    }
  }

  folderIcon(item: TreeviewItem): string {
    if (item.value.key == '__root_dir__') return 'inventory_2';
    if (item.value.key == 'system.settings') return 'settings';
    if (item.value.subtype == 'environments') return 'layers';
    if (item.value.subtype == 'system.settings.environments') return 'public';
    return this.isExpanded(item) ? 'folder_open' : 'folder';
  }

  toggle(item: TreeviewItem) {
    item.collapsed = !item.collapsed;
  }

  // While filtering, a row shows when its text or anything below it matches, and matching branches are open
  isVisible(item: TreeviewItem): boolean {
    const filter = this.filter.trim().toLowerCase();
    return filter == '' || this.matches(item, filter);
  }

  isExpanded(item: TreeviewItem): boolean {
    return (
      item.children != undefined &&
      (this.filter.trim() != '' || !item.collapsed)
    );
  }

  private matches(item: TreeviewItem, filter: string): boolean {
    return (
      item.text.toLowerCase().includes(filter) ||
      (item.children ?? []).some((c) => this.matches(c, filter))
    );
  }
}
