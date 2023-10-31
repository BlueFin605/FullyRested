import { Component, OnInit, ViewChild } from '@angular/core';
import { LocalRestAction, ActionRepositoryService, CurrentState, CreateEmptyLocalAction } from 'src/app/services/action-repository/action-repository.service'
import { MatTabGroup } from '@angular/material/tabs';

@Component({
  selector: 'app-open-actions',
  templateUrl: './open-actions.component.html',
  styleUrls: ['./open-actions.component.css']
})
export class OpenActionsComponent implements OnInit {
  state: CurrentState = { actions: [] };

  @ViewChild('tabs') tabs!: MatTabGroup;

  constructor(private repo: ActionRepositoryService) { }

  ngOnInit(): void {
    this.repo.getCurrentState().then(s => {
      this.state = s;
      // console.log(`tabs:[${this.tabs}]`)
      this.tabs.selectedIndex = 0;
    });
  }


  ngAfterViewInit() {
    // doesn't work if outside setTimeOut()
    setTimeout(() => {
      this.tabs.selectedIndex = 0;
      this.tabs.realignInkBar(); // re-align the bottom border of the tab
    });
  }

  addAction(event: any) {
    // console.log(`addAction`);
    // console.log(event);
    if (event.index < this.state.actions.length)
      return;

    this.state.actions.push(this.repo.createNewAction());
  }

  removeAction(event: any) {
    var index = this.state.actions.findIndex(i => i.action.id == event);
    this.state.actions.splice(index, 1);
  }

  onActionChange(event: any) {
    // console.log(this.state);
    this.repo.saveCurrentState(this.state);
  }
}
