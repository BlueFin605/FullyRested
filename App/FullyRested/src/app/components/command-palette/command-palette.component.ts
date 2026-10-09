import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';

export interface PaletteItem {
  label: string;
  group: string;
  detail?: string;
  icon?: string;
  // shown as a coloured method badge instead of an icon
  verb?: string;
  shortcut?: string;
  run: () => void;
}

// Lower is better; undefined means no match. Letters must appear in order ("nwreq" matches
// "New request"); a plain substring, especially at the start of a word, ranks first.
export function matchScore(label: string, query: string): number | undefined {
  const text = label.toLowerCase();
  const q = query.trim().toLowerCase();
  if (q == '') return 0;

  const index = text.indexOf(q);
  if (index == 0) return 0;
  if (index > 0) return text[index - 1] == ' ' ? 1 : 2;

  let at = -1;
  let gaps = 0;
  for (const ch of q) {
    const next = text.indexOf(ch, at + 1);
    if (next == -1) return undefined;
    gaps += next - at - 1;
    at = next;
  }
  return 3 + gaps;
}

// Ctrl+K: type to find a request, an environment or a command, Enter to run it
@Component({
  selector: 'app-command-palette',
  templateUrl: './command-palette.component.html',
  styleUrls: ['./command-palette.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class CommandPaletteComponent {
  @Input() items: PaletteItem[] = [];
  @Output() closed = new EventEmitter<void>();

  @ViewChild('input', { static: true }) input!: ElementRef<HTMLInputElement>;
  @ViewChild('list') list: ElementRef<HTMLElement> | undefined;

  query = '';
  active = 0;

  ngAfterViewInit() {
    this.input.nativeElement.focus();
  }

  get results(): PaletteItem[] {
    return this.items
      .map((item, order) => ({ item, order, score: matchScore(item.label, this.query) }))
      .filter((r) => r.score != undefined)
      .sort((a, b) => a.score! - b.score! || a.order - b.order)
      .slice(0, 50)
      .map((r) => r.item);
  }

  onQuery(query: string) {
    this.query = query;
    this.active = 0;
  }

  onKey(event: KeyboardEvent) {
    const count = this.results.length;
    switch (event.key) {
      case 'ArrowDown':
        this.active = count == 0 ? 0 : (this.active + 1) % count;
        break;
      case 'ArrowUp':
        this.active = count == 0 ? 0 : (this.active - 1 + count) % count;
        break;
      case 'Enter':
        this.choose(this.results[this.active]);
        break;
      case 'Escape':
        this.closed.emit();
        break;
      default:
        return;
    }
    event.preventDefault();
    setTimeout(() =>
      this.list?.nativeElement.querySelector('.active')?.scrollIntoView({ block: 'nearest' }),
    );
  }

  choose(item: PaletteItem | undefined) {
    if (item == undefined) return;
    this.closed.emit();
    item.run();
  }

  // the group header shows above the first result of each group
  startsGroup(results: PaletteItem[], index: number): boolean {
    return index == 0 || results[index - 1].group != results[index].group;
  }
}
