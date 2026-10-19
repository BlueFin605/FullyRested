import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnInit, SimpleChanges, ViewChild, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SafeHtml } from '@angular/platform-browser';
import { HelpMarkdownService } from '../../services/help-markdown/help-markdown.service';

export interface HelpTopic {
  slug: string;
  title: string;
  file: string;
}

const LAST_TOPIC_KEY = 'fr.help.lastTopic';
const HOME_SLUG = 'help-home';

@Component({
  selector: 'app-help-viewer',
  templateUrl: './help-viewer.component.html',
  styleUrls: ['./help-viewer.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class HelpViewerComponent implements OnInit, OnChanges {
  /** Slug (or guide file stem) to open; overrides the remembered topic. */
  @Input() topic?: string;

  @ViewChild('content') content?: ElementRef<HTMLElement>;

  topics: HelpTopic[] = [];
  current: HelpTopic | undefined;
  html: SafeHtml | undefined;
  loading = true;
  error: string | undefined;

  private readonly http = inject(HttpClient);
  private readonly markdown = inject(HelpMarkdownService);
  private readonly cdr = inject(ChangeDetectorRef);
  private token = 0;
  private pendingAnchor: string | undefined;

  ngOnInit() {
    this.http.get<HelpTopic[]>('assets/help-index.json').subscribe({
      next: topics => {
        this.topics = topics;
        this.openTopic(this.topic ?? this.remembered() ?? HOME_SLUG);
      },
      error: () => this.fail(),
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['topic'] && !changes['topic'].firstChange && this.topic) this.openTopic(this.topic);
  }

  /** Opens a topic by index slug, or by guide file stem (`01-getting-started`) as markdown links use. */
  openTopic(slug: string, anchor?: string) {
    const found = this.find(slug) ?? this.find(HOME_SLUG) ?? this.topics[0];
    if (!found) return;
    this.current = found;
    this.remember(found.slug);
    this.pendingAnchor = anchor;
    const token = ++this.token;
    this.loading = true;
    this.error = undefined;
    this.http.get('assets/help/' + found.file, { responseType: 'text' }).subscribe({
      next: md => {
        if (token != this.token) return;
        this.html = this.markdown.render(md, { currentFile: found.file });
        this.loading = false;
        this.cdr.markForCheck();
        setTimeout(() => this.afterRender());
      },
      error: () => {
        if (token == this.token) this.fail();
      },
    });
  }

  onContentClick(event: MouseEvent) {
    const link = (event.target as HTMLElement | null)?.closest?.('a[data-help-topic], a[data-help-anchor]') as HTMLElement | null;
    if (!link) return;
    event.preventDefault();
    const anchor = link.dataset['helpAnchor'] || undefined;
    const topic = link.dataset['helpTopic'];
    if (topic) this.openTopic(topic, anchor);
    else if (anchor) this.scrollToAnchor(anchor);
  }

  private find(key: string): HelpTopic | undefined {
    const stem = key.replace(/\.md$/, '');
    return this.topics.find(t => t.slug == stem || t.file.replace(/\.md$/, '') == stem)
      ?? (stem.toLowerCase() == 'readme' ? this.topics.find(t => t.slug == HOME_SLUG) : undefined);
  }

  private afterRender() {
    const el = this.content?.nativeElement;
    if (!el) return;
    if (!this.pendingAnchor || !this.scrollToAnchor(this.pendingAnchor)) el.scrollTop = 0;
    this.pendingAnchor = undefined;
  }

  private scrollToAnchor(anchor: string): boolean {
    const el = this.content?.nativeElement;
    const target = el && Array.from(el.querySelectorAll<HTMLElement>('[id]')).find(e => e.id == anchor);
    if (!target) return false;
    target.scrollIntoView?.({ block: 'start' });
    return true;
  }

  private fail() {
    this.loading = false;
    this.error = 'Help could not be loaded';
    this.cdr.markForCheck();
  }

  private remembered(): string | undefined {
    try {
      return localStorage.getItem(LAST_TOPIC_KEY) ?? undefined;
    } catch {
      return undefined;
    }
  }

  private remember(slug: string) {
    try {
      localStorage.setItem(LAST_TOPIC_KEY, slug);
    } catch {
      /* storage unavailable: the topic is simply not remembered */
    }
  }
}
