import { Component, OnInit, Injectable, Input, Output, EventEmitter } from '@angular/core';
import { TreeviewConfig, TreeviewItem } from '@treeview/ngx-treeview';
// import { ActionRepositoryService } from 'src/app/services/action-repository/action-repository.service';
import { TraversedDrectory, Solution, ActionRepositoryService, REConstants } from 'src/app/services/action-repository/action-repository.service';

@Injectable()
export class ProductTreeviewConfig extends TreeviewConfig {
  override hasAllCheckBox = true;
  override hasFilter = true;
  override hasCollapseExpand = false;
  // override maxHeight = 400;
  override compact = true;
}

@Component({
  selector: 'app-solution-explorer',
  templateUrl: './solution-explorer.component.html',
  styleUrls: ['./solution-explorer.component.css'],
  providers: [
    { provide: TreeviewConfig, useClass: ProductTreeviewConfig }
  ]
})
export class SolutionExplorerComponent implements OnInit {
  _solution: Solution | undefined;

  @Input()
  set solution(solution: Solution | undefined) {
    if (solution == undefined) {
      this._solution = solution;
      this.items = [];
      return;
    }

    console.log('set solution');
    console.log(solution);
    this._solution = solution;
    this.repo.traverseDirectory(solution.path, [REConstants.ActionExtension]).then(t => {
      this.items = [this.buildTreeview(t, solution.name)];
      this.expandTree(this.items);
      console.log(this.items);
    });
  }

  @Output()
  openFile = new EventEmitter<string>();

  @Output()
  enableMenuOptions = new EventEmitter<string[]>();

  items: TreeviewItem[] = [];

  selected: string = '';

  constructor(private repo: ActionRepositoryService) {
  }

  ngOnInit(): void {
  }

  buildTreeview(traverse: TraversedDrectory, name: string): TreeviewItem {
    var children = [this.systemSettings(), this.convertDirToTreeviewItem(traverse)];

    return new TreeviewItem({
      text: name,
      value: { type: 'dir', key: '__root_dir__' },
      children: children,
      collapsed: true
    });
  }

  systemSettings(): TreeviewItem {
    var systemchildren = [
      new TreeviewItem({ text: 'Variables', value: { type: 'system', subtype: 'variables', key: 'system.settings.variables' }, collapsed: false }),
      new TreeviewItem({ text: 'Authentication', value: { type: 'system', subtype: 'authentication', key: 'system.settings.authentication' }, collapsed: false }),
      new TreeviewItem({ text: 'Environments', value: { type: 'dir', subtype: 'environments', key: 'system.settings.environments', actions: ['createEnvironment'] }, children: this.buildEnvironmentsAsChildren(), collapsed: false }),
    ];

    return new TreeviewItem({
      text: 'Solution Settings',
      value: { type: 'dir', key: 'system.settings' },
      children: systemchildren,
      collapsed: false
    });

  }

  buildEnvironmentsAsChildren(): TreeviewItem[] | undefined {
    return this._solution?.config.environments.map(e => {
      return new TreeviewItem({
        text: e.name,
        value: { type: 'dir', key: `system.settings.environments.${e.name}` },
        children: [      
          new TreeviewItem({ text: 'Variables', value: { type: 'system', subtype: 'variables', key: `system.settings.environments.${e.name}.variables` }, collapsed: false }),
          new TreeviewItem({ text: 'Authentication', value: { type: 'system', subtype: 'authentication', key: `system.settings.environments.${e.name}.authentication` }, collapsed: false }),
        ],
        collapsed: false
      });
    });
  }

  convertDirToTreeviewItem(traverse: TraversedDrectory): TreeviewItem {
    var children = traverse.subdirs.map(s => this.convertDirToTreeviewItem(s));
    children = children.concat(traverse.files.map(f => new TreeviewItem({
      text: f.name,
      value: { type: 'file', key: f.fullPath }
    })));

    return new TreeviewItem({
      text: traverse.dir.name,
      value: { type: 'dir', key: traverse.dir.fullPath },
      children: children,
      collapsed: true
    });
  }

  expandTree(items: TreeviewItem[]): boolean {
    if (items == undefined)
      return false;

    var hasFiles = false;
    //if there are any files then we should expand the folder
    if (items.some(i => i.value.type == 'file' || i.value.type == 'system' || i.value.type == 'environment')) {
      hasFiles = true;
    }

    //if any of the children have files expand the node
    var childrenHaveFles = false;
    items.forEach(i => {
      i.collapsed = !this.expandTree(i.children) || i.value.type == 'system' || i.value.type == 'environment';
      childrenHaveFles = childrenHaveFles || !i.collapsed;
    });

    return hasFiles || childrenHaveFles;
  }

  onSelectedChange($event: any) {
    console.log('onSelectedChange');
    console.log($event);
  }

  onClick($event: TreeviewItem) {
    console.log('onClick');
    console.log($event.value.key);
    this.selected = $event.value.key;
    this.enableMenuOptions.emit($event.value.actions);
  }

  onDblClick($event: TreeviewItem) {
    console.log('onDblClick');

    if ($event.value.type != 'file')
      return;

    console.log($event.value.key);
    this.openFile.emit($event.value.key);
  }

  onFilterChange($event: any) {

  }
}
