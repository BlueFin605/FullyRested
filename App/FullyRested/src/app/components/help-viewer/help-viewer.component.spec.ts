import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HelpViewerComponent } from './help-viewer.component';

const INDEX = [
  { slug: 'help-home', title: 'Help home', file: 'README.md' },
  { slug: 'getting-started', title: 'Getting started', file: '01-getting-started.md' },
  { slug: 'validation', title: 'Validation', file: '06-validation.md' },
];

describe('HelpViewerComponent', () => {
  let http: HttpTestingController;

  function create(topic?: string) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      declarations: [HelpViewerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(HelpViewerComponent);
    if (topic) fixture.componentRef.setInput('topic', topic);
    fixture.detectChanges();
    http.expectOne('assets/help-index.json').flush(INDEX);
    return fixture;
  }

  async function settle(fixture: any) {
    await new Promise(r => setTimeout(r));
    fixture.detectChanges();
  }

  beforeEach(() => localStorage.removeItem('fr.help.lastTopic'));
  afterEach(() => http.verify());

  it('opens help home by default and lists every topic', async () => {
    const f = create();
    http.expectOne('assets/help/README.md').flush('# Home');
    await settle(f);
    expect(f.nativeElement.querySelectorAll('.help-topic').length).toBe(3);
    expect(f.nativeElement.querySelector('.help-body h1').textContent).toContain('Home');
  });

  it('opens the clicked topic and remembers it', async () => {
    const f = create();
    http.expectOne('assets/help/README.md').flush('# Home');
    await settle(f);
    f.nativeElement.querySelectorAll('.help-topic')[2].click();
    http.expectOne('assets/help/06-validation.md').flush('# Validation guide');
    await settle(f);
    expect(f.nativeElement.querySelector('.help-topic.selected').textContent).toContain('Validation');
    expect(localStorage.getItem('fr.help.lastTopic')).toBe('validation');
  });

  it('restores the remembered topic', async () => {
    localStorage.setItem('fr.help.lastTopic', 'validation');
    const f = create();
    http.expectOne('assets/help/06-validation.md').flush('# V');
    await settle(f);
    expect(f.componentInstance.current?.slug).toBe('validation');
  });

  it('prefers the topic input over the remembered topic', async () => {
    localStorage.setItem('fr.help.lastTopic', 'validation');
    const f = create('getting-started');
    http.expectOne('assets/help/01-getting-started.md').flush('# G');
    await settle(f);
    expect(f.componentInstance.current?.slug).toBe('getting-started');
  });

  it('follows in-app guide links, matching the NN- file stem', async () => {
    const f = create();
    http.expectOne('assets/help/README.md').flush('[go](01-getting-started.md)');
    await settle(f);
    f.nativeElement.querySelector('a[data-help-topic]').click();
    http.expectOne('assets/help/01-getting-started.md').flush('# Start');
    await settle(f);
    expect(f.componentInstance.current?.slug).toBe('getting-started');
  });

  it('scrolls in-page anchors without navigating', async () => {
    const f = create();
    http.expectOne('assets/help/README.md').flush('[down](#second)\n\n# First\n\n# Second');
    await settle(f);
    const target = f.nativeElement.querySelector('#second');
    const spy = spyOn(target, 'scrollIntoView');
    f.nativeElement.querySelector('a[data-help-anchor]').click();
    expect(spy).toHaveBeenCalled();
  });

  it('shows an error when the index cannot be loaded', () => {
    TestBed.configureTestingModule({ declarations: [HelpViewerComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(HelpViewerComponent);
    f.detectChanges();
    http.expectOne('assets/help-index.json').flush('', { status: 500, statusText: 'x' });
    f.detectChanges();
    expect(f.nativeElement.querySelector('.help-error').textContent).toContain('Help could not be loaded');
  });

  it('shows an error when a guide cannot be loaded', () => {
    const f = create();
    http.expectOne('assets/help/README.md').flush('', { status: 404, statusText: 'x' });
    f.detectChanges();
    expect(f.nativeElement.querySelector('.help-error')).toBeTruthy();
  });
});
