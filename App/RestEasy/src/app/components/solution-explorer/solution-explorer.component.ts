import { Component, OnInit, Injectable } from '@angular/core';
import { TreeviewConfig, TreeviewItem } from '@treeview/ngx-treeview';
import { ActionRepositoryService } from 'src/app/services/action-repository/action-repository.service';
import { TraversedDrectory } from 'src/app/services/action-repository/action-repository.service';
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

  items: TreeviewItem[] = [];

  constructor(private repo: ActionRepositoryService) {
  }

  ngOnInit(): void {
    this.repo.traverseDirectory().then(t => {
      this.items = [this.convertDirToTreeviewItem(t)]; 
      // console.log(this.items);
    });
  }

  convertDirToTreeviewItem(traverse: TraversedDrectory) : TreeviewItem {
    var children = traverse.subdirs.map(s => this.convertDirToTreeviewItem(s));
    children = children.concat(traverse.files.map(f => new TreeviewItem({text: f.name,
                                                                         value: {type: 'file', key: f.fullPath}})));

    return new TreeviewItem({text: traverse.dir.name, 
                            value: {type: 'dir', key: traverse.dir.fullPath}, 
                            children: children
    });
  }

  onSelectedChange($event: any) {

  }

  onFilterChange($event: any) {

  }
}
