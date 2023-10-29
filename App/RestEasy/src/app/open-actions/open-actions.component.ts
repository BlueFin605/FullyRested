import { Component, OnInit } from '@angular/core';
import { LocalRestAction, ActionRepositoryService, CurrentState, EmptyLocalAction } from 'src/app/services/action-repository/action-repository.service'

@Component({
  selector: 'app-open-actions',
  templateUrl: './open-actions.component.html',
  styleUrls: ['./open-actions.component.css']
})
export class OpenActionsComponent implements OnInit {
  state: CurrentState = {actions: []};
  activeAction: LocalRestAction = EmptyLocalAction;

  constructor(private repo: ActionRepositoryService) { }

  ngOnInit(): void {
    this.state = this.repo.getCurrentState();
    this.activeAction = this.state.actions[0];
  }

  addAction(event: any) {
    console.log(`addAction`);
    console.log(this.state);
    this.state.actions.push(EmptyLocalAction);
  }

  onActionChange(event: any) {
    console.log(event)
  }
}
