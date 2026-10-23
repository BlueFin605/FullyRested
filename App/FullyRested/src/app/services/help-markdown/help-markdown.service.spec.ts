import { TestBed } from '@angular/core/testing';

import { HelpMarkdownService, renderHelpMarkdown } from './help-markdown.service';

describe('HelpMarkdownService', () => {
  const html = (md: string) => renderHelpMarkdown(md, { currentFile: '05-authentication.md' });

  it('returns trusted html from the service', () => {
    const service = TestBed.inject(HelpMarkdownService);
    expect(service.render('# Hi')).toBeTruthy();
  });

  it('resolves relative images to assets/help', () => {
    const out = html('![a](images/x.png)');
    expect(out).toContain('src="assets/help/images/x.png"');
    expect(out).toContain('alt="a"');
  });

  it('turns sibling guide links into in-app navigation', () => {
    const out = html('[Runs](08-runs-and-suites.md) and [v](07-capturing-values.md#order-matters)');
    expect(out).toContain('data-help-topic="08-runs-and-suites"');
    expect(out).toContain('data-help-topic="07-capturing-values" data-help-anchor="order-matters"');
    expect(out).toContain('href="#"');
  });

  it('makes repo-relative links plain text showing the target', () => {
    const out = html('[README](../../README.md#capturing)');
    expect(out).not.toContain('<a ');
    expect(out).toContain('help-repo-link');
    expect(out).toContain('(../../README.md#capturing)');
  });

  it('opens http(s) links externally', () => {
    const out = html('[site](https://example.com/a?b=1&c=2)');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('href="https://example.com/a?b=1&amp;c=2"');
  });

  it('does not render javascript: links as anchors', () => {
    expect(html('[x](javascript:alert(1))')).not.toContain('<a ');
  });

  it('renders fenced code blocks and escapes their content', () => {
    const out = html('```bash\necho "<b>hi</b>"\n```');
    expect(out).toContain('<pre class="help-code"><code class="language-bash">');
    expect(out).toContain('&lt;b&gt;hi&lt;/b&gt;');
  });

  it('renders tables', () => {
    const out = html('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(out).toContain('<table class="help-table">');
    expect(out).toContain('<th>A</th>');
    expect(out).toContain('<td>2</td>');
  });

  it('gives headings ids, de-duplicated', () => {
    const out = html('## Set a rule\n\n## Set a rule');
    expect(out).toContain('id="set-a-rule"');
    expect(out).toContain('id="set-a-rule-1"');
  });

  it('does not pass raw html through', () => {
    const out = html('<script>alert(1)</script>\n\nhi <img src=x onerror=alert(1)> there');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img src=x');
    expect(out).toContain('&lt;script&gt;');
  });
});
