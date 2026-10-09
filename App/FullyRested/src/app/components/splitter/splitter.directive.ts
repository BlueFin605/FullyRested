import { Directive, EventEmitter, HostBinding, HostListener, Input, Output } from '@angular/core';

export interface SplitterMove {
  clientX: number;
  clientY: number;
}

// A drag handle between two panes. It reports pointer positions while dragging;
// the owner turns them into sizes, so the directive knows nothing about layout.
@Directive({
  selector: '[appSplitter]',
  standalone: false,
})
export class SplitterDirective {
  // 'horizontal' panes sit side by side, so the handle is a vertical bar dragged left/right
  @Input('appSplitter') orientation: 'horizontal' | 'vertical' = 'horizontal';

  @Output() splitterMove = new EventEmitter<SplitterMove>();
  @Output() splitterReset = new EventEmitter<void>();

  @HostBinding('class.fr-splitter') readonly splitterClass = true;
  @HostBinding('class.dragging') dragging = false;
  @HostBinding('attr.data-orientation') get dataOrientation() {
    return this.orientation;
  }
  @HostBinding('attr.role') readonly role = 'separator';

  @HostListener('pointerdown', ['$event'])
  onDown(event: PointerEvent) {
    if (event.button != 0) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.dragging = true;
    document.body.classList.add(
      this.orientation == 'horizontal' ? 'fr-resizing-x' : 'fr-resizing-y',
    );
    event.preventDefault();
  }

  @HostListener('pointermove', ['$event'])
  onMove(event: PointerEvent) {
    if (!this.dragging) return;
    this.splitterMove.emit({ clientX: event.clientX, clientY: event.clientY });
  }

  @HostListener('pointerup', ['$event'])
  @HostListener('pointercancel', ['$event'])
  onUp(event: PointerEvent) {
    if (!this.dragging) return;
    this.dragging = false;
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    document.body.classList.remove('fr-resizing-x', 'fr-resizing-y');
  }

  @HostListener('dblclick')
  onDoubleClick() {
    this.splitterReset.emit();
  }
}
