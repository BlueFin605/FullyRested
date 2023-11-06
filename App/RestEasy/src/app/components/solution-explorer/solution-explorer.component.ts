import { Component, OnInit, Injectable } from '@angular/core';
import { TreeviewConfig, TreeviewItem } from '@treeview/ngx-treeview';


@Injectable()
export class ProductTreeviewConfig extends TreeviewConfig {
  override hasAllCheckBox = true;
  override hasFilter = true;
  override hasCollapseExpand = false;
  override maxHeight = 400;
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

  constructor() {
  }

  ngOnInit(): void {
  }

  onSelectedChange($event: any) {

  }

  onFilterChange($event: any) {

  }
}
