import { Component, OnInit } from '@angular/core';
import { LocalRestAction, ActionRepositoryService, CurrentState, CreateEmptyLocalAction } from 'src/app/services/action-repository/action-repository.service'

@Component({
  selector: 'app-open-actions',
  templateUrl: './open-actions.component.html',
  styleUrls: ['./open-actions.component.css']
})
export class OpenActionsComponent implements OnInit {
  state: CurrentState = { actions: [] };
  selectedIndex: number = 0;
  
  constructor(private repo: ActionRepositoryService) { }

  ngOnInit(): void {
    this.repo.getCurrentState().then(s => {
      this.state = s;
      this.selectedIndex = 0;
    });
  }

  addAction(event: any) {
    console.log(`addAction`);
    console.log(event);
    if (event.index < this.state.actions.length)
       return;

    this.state.actions.push(CreateEmptyLocalAction());
  }

  addTab(event: any) {
    console.log(`addAction`);
    console.log(event);
    if (event.index < this.state.actions.length)
       return;

    this.state.actions.push(CreateEmptyLocalAction());
  }

  onActionChange(event: any) {
    // console.log(event)
    console.log(this.state);
    this.repo.saveCurrentState(this.state);
  }
}
