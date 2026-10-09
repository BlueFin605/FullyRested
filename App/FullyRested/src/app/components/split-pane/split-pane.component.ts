import { ChangeDetectionStrategy, Component, ElementRef, ViewChild } from '@angular/core';
import { LayoutService } from 'src/app/services/layout/layout.service';
import { SplitterMove } from '../splitter/splitter.directive';

// Two panes with a draggable divider: request beside (or above) response.
// Orientation and ratio are shared by every tab and remembered between sessions.
@Component({
  selector: 'app-split-pane',
  template: `
    <div class="split" [attr.data-orientation]="layout.splitOrientation()" #container>
      <div class="split-pane first" [style.flex-basis.%]="layout.splitRatio() * 100">
        <ng-content select="[splitFirst]"></ng-content>
      </div>
      <div
        [appSplitter]="layout.splitOrientation()"
        (splitterMove)="onMove($event)"
        (splitterReset)="layout.setSplitRatio(0.5)"
        aria-label="Resize request and response"
      ></div>
      <div class="split-pane second">
        <ng-content select="[splitSecond]"></ng-content>
      </div>
    </div>
  `,
  styles: [
    `
      :host { display: block; height: 100%; contain: inline-size; }
      .split { display: flex; height: 100%; }
      .split[data-orientation='vertical'] { flex-direction: column; }
      .split-pane { min-width: 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
      .split-pane.first { flex-grow: 0; flex-shrink: 0; }
      .split-pane.second { flex: 1; }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class SplitPaneComponent {
  @ViewChild('container', { static: true }) container!: ElementRef<HTMLElement>;

  constructor(public layout: LayoutService) {}

  onMove(move: SplitterMove) {
    const rect = this.container.nativeElement.getBoundingClientRect();
    const ratio =
      this.layout.splitOrientation() == 'horizontal'
        ? (move.clientX - rect.left) / rect.width
        : (move.clientY - rect.top) / rect.height;
    this.layout.setSplitRatio(ratio);
  }
}
