import { Component, OnInit } from '@angular/core';
import { TreeviewConfig, TreeviewItem } from '@treeview/ngx-treeview';

@Component({
  selector: 'app-solution-explorer',
  templateUrl: './solution-explorer.component.html',
  styleUrls: ['./solution-explorer.component.css']
})
export class SolutionExplorerComponent implements OnInit {
  //   private config: TreeviewConfig = {
  //     hasAllCheckBox: true,
  //     hasFilter: false,
  //     hasCollapseExpand: false,
  //     decoupleChildFromParent: false,
  //     maxHeight: 500
  //  }
  itCategory = new TreeviewItem(
    {
      text: "Software",
      value: 9,
      children:
        [
          {
            text: "Programming",
            value: 91,
            children: [
              {
                text: "Frontend",
                value: 911,
                children: [
                  { text: "Angular 12", value: 9112 },
                  { text: "Angular 13", value: 9113 },
                  { text: "Angular 14", value: 9114 },
                  { text: "Angular 15", value: 9115, disabled: true },
                  { text: "ReactJS", value: 9120 },
                ],
              },
              {
                text: "Backend",
                value: 912,
                children: [
                  { text: "C#", value: 9121 },
                  { text: "Java", value: 9122 },
                  { text: "Python", value: 9123, checked: false },
                ],
              },
            ],
          },
        ]
    }
  );

  itNetworking = new TreeviewItem(
    {
      text: "Networking",
      value: 92,
      children: [
        { text: "Internet", value: 921 },
        { text: "Security", value: 922 },
        { text: "Switches", value: 923 },
      ],
    });

  items: TreeviewItem[] = [this.itCategory, this.itNetworking];

  constructor(public config: TreeviewConfig) {
    this.config.hasAllCheckBox = false;
    this.config.hasFilter = true;
    this.config.hasCollapseExpand = false;
    this.config.decoupleChildFromParent = false;
    this.config.maxHeight = 500;
  }

  ngOnInit(): void {
  }

  onSelectedChange($event: any) {

  }

  onFilterChange($event: any) {

  }
}
