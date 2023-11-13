import { Component, OnInit, Injectable, Input } from '@angular/core';
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
      this.items = [this.convertDirToTreeviewItem(t)];
      this.expandTree(this.items);
      console.log(this.items);
    });
  }

  items: TreeviewItem[] = [];

  constructor(private repo: ActionRepositoryService) {
  }

  ngOnInit(): void {
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
      collapsed: true,
    });
  }

  expandTree(items: TreeviewItem[]): boolean {
    if (items == undefined)
       return false;
      
    var hasFiles = false;
    //if there are any files then we should expand the folder
    if (items.some(i => i.value.type == 'file')) {
      hasFiles = true;
    }

    //if any of the children have files expand the node
    var childrenHaveFles = items.some(i => {
      i.collapsed = !this.expandTree(i.children);
      return !i.collapsed;
    });

    return hasFiles || childrenHaveFles;
  }

  onSelectedChange($event: any) {

  }

  onFilterChange($event: any) {

  }
}
