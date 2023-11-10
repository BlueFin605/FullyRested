import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { LocalRestAction, ActionRepositoryService, CurrentState, CreateEmptyLocalAction } from 'src/app/services/action-repository/action-repository.service'
import { MatTabGroup } from '@angular/material/tabs';

@Component({
  selector: 'app-open-actions',
  templateUrl: './open-actions.component.html',
  styleUrls: ['./open-actions.component.css']
})
export class OpenActionsComponent implements OnInit {
  state: CurrentState = { currentSolution: '', actions: [] };

  @ViewChild('tabs') tabs!: MatTabGroup;
  @ViewChild('FileSelectInputDialog') FileSelectInputDialog!: ElementRef;

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

    var count = Math.max(...this.state.actions.filter(f => f.action.name.startsWith('new request'))
      .map(s => s.action.name.substring(12))
      .map(m => m.length == 0 ? 1 : parseInt(m))
      .filter(num => !isNaN(num)));

    this.state.actions.push(this.repo.createNewAction(count + 1));
  }

  removeAction(event: any) {
    var index = this.state.actions.findIndex(i => i.action.id == event);
    this.state.actions.splice(index, 1);
  }

  onActionChange(event: any) {
    // console.log(this.state);
    this.repo.saveCurrentState(this.state);
  }

  openSolution() {
      console.log('openSolution');
      this.repo.loadSolution().then(s => console.log(s));
    }
}
