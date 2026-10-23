import { Injectable, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Marked, Tokens } from 'marked';

export interface HelpRenderOptions {
  /** Guide being rendered, e.g. `07-capturing-values.md`. Reserved for context-aware rewrites. */
  currentFile?: string;
}

const HELP_ASSET_ROOT = 'assets/help/';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

const isExternal = (href: string) => /^https?:\/\//i.test(href);
const hasScheme = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');

function buildMarked(): Marked {
  const marked = new Marked({ gfm: true, breaks: false });
  const seen = new Map<string, number>();

  marked.use({
    renderer: {
      // No raw HTML passthrough: block and inline html are shown as escaped text.
      html({ text }: Tokens.HTML | Tokens.Tag): string {
        return escapeHtml(text);
      },
      heading(this: any, { tokens, depth, text }: Tokens.Heading): string {
        const base = slugify(text) || 'section';
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        const id = n === 0 ? base : `${base}-${n}`;
        return `<h${depth} id="${escapeHtml(id)}" class="help-heading">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      code({ text, lang }: Tokens.Code): string {
        const language = (lang ?? '').trim().split(/\s+/)[0].replace(/[^\w-]/g, '');
        const cls = language ? ` class="language-${language}"` : '';
        return `<pre class="help-code"><code${cls}>${escapeHtml(text)}</code></pre>\n`;
      },
      codespan({ text }: Tokens.Codespan): string {
        return `<code class="help-inline-code">${text}</code>`;
      },
      table(this: any, token: Tokens.Table): string {
        const cell = (c: Tokens.TableCell, tag: string) => {
          const align = c.align ? ` style="text-align:${c.align}"` : '';
          return `<${tag}${align}>${this.parser.parseInline(c.tokens)}</${tag}>`;
        };
        const head = `<tr>${token.header.map((c) => cell(c, 'th')).join('')}</tr>`;
        const body = token.rows.map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('');
        return `<table class="help-table"><thead>${head}</thead><tbody>${body}</tbody></table>\n`;
      },
      image({ href, text }: Tokens.Image): string {
        const alt = escapeHtml(text);
        if (isExternal(href) || hasScheme(href) || href.split('/').includes('..')) {
          return `<span class="help-image-missing">${alt}</span>`;
        }
        const src = HELP_ASSET_ROOT + href.replace(/^\.?\//, '');
        return `<img class="help-image" src="${escapeHtml(src)}" alt="${alt}" loading="lazy">`;
      },
      link(this: any, { href, tokens }: Tokens.Link): string {
        const inner = this.parser.parseInline(tokens);
        if (isExternal(href)) {
          return `<a class="help-link help-link-external" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
        }
        if (href.startsWith('#')) {
          return `<a class="help-link help-link-anchor" href="#" data-help-anchor="${escapeHtml(href.slice(1))}">${inner}</a>`;
        }
        const guide = /^(?:\.\/)?([\w.-]+)\.md(?:#(.*))?$/.exec(href);
        if (guide && !hasScheme(href)) {
          const anchor = guide[2] ? ` data-help-anchor="${escapeHtml(guide[2])}"` : '';
          return `<a class="help-link help-link-guide" href="#" data-help-topic="${escapeHtml(guide[1])}"${anchor}>${inner}</a>`;
        }
        // Repo-relative (../../README.md#x) or anything else: only meaningful on GitHub.
        return `<span class="help-repo-link" title="Only available in the repository">${inner} <span class="help-repo-target">(${escapeHtml(href)})</span></span>`;
      },
    },
  });
  return marked;
}

/** Pure renderer: markdown to an HTML string. Safe because raw HTML and every attribute value are escaped. */
export function renderHelpMarkdown(markdown: string, _options: HelpRenderOptions = {}): string {
  return buildMarked().parse(markdown, { async: false }) as string;
}

@Injectable({ providedIn: 'root' })
export class HelpMarkdownService {
  private readonly sanitizer = inject(DomSanitizer);

  render(markdown: string, options: HelpRenderOptions = {}): SafeHtml {
    // The renderer escapes raw HTML and attribute values itself; Angular's sanitizer would strip the data-help-* hooks.
    return this.sanitizer.bypassSecurityTrustHtml(renderHelpMarkdown(markdown, options));
  }
}
