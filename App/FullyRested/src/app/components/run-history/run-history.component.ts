import { Component, Input } from '@angular/core';
import { Collection } from '@fullyrested/core';

@Component({
  selector: 'app-run-history',
  templateUrl: './run-history.component.html',
  styleUrls: ['./run-history.component.css'],
  standalone: false,
})
export class RunHistoryComponent {
  @Input() collection: Collection | undefined;

  // Shown in the heading so it is obvious what to add to .gitignore: the app never edits it
  get runsFolder(): string {
    return this.collection == undefined ? '' : `${this.collection.path}/.fullyrested-runs`;
  }
}
