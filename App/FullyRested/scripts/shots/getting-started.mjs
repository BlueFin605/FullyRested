// Shots for the getting-started and collections-and-environments guides.
// run(h) gets the helpers from help-screenshots.mjs. Nothing here saves the sample collection.
const ready = async (h) => { await h.waitFor('li[role="treeitem"]'); await h.sleep(300); };

export const shots = [
    {
        name: 'explorer-sample-collection',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.shot('explorer-sample-collection');
        }
    },
    {
        name: 'gs-file-menu',
        run: async (h) => {
            await ready(h);
            await h.click('.menu-trigger');
            await h.sleep(400);
            await h.shot('gs-file-menu', { clip: { x: 0, y: 0, width: 520, height: 400 } });
            await h.press('Escape');
        }
    },
    {
        name: 'gs-collection-menu',
        run: async (h) => {
            await ready(h);
            await h.click('Collection');
            await h.sleep(400);
            await h.shot('gs-collection-menu', { clip: { x: 0, y: 0, width: 520, height: 300 } });
            await h.press('Escape');
        }
    },
    {
        name: 'gs-request-open',
        run: async (h) => {
            await ready(h);
            await h.click('status-check.frreq');
            await h.waitFor('.send');
            await h.sleep(500);
            await h.shot('gs-request-open');
        }
    },
    {
        name: 'gs-response',
        run: async (h) => {
            await ready(h);
            await h.click('validated.frreq');
            await h.waitFor('.send');
            await h.click('.send');
            await h.waitFor('200 OK', 20000);
            await h.sleep(600);
            await h.shot('gs-response');
        }
    },
    {
        name: 'gs-collection-variables',
        run: async (h) => {
            await ready(h);
            await h.click('Variables');
            await h.sleep(600);
            await h.shot('gs-collection-variables');
        }
    },
    {
        name: 'gs-environment-picker',
        run: async (h) => {
            await ready(h);
            await h.click('.env-select');
            await h.sleep(500);
            await h.shot('gs-environment-picker', { clip: { x: 780, y: 0, width: 500, height: 200 } });
            await h.press('Escape');
        }
    },
    {
        name: 'gs-environment',
        run: async (h) => {
            await ready(h);
            await h.click('staging');
            await h.sleep(600);
            await h.shot('gs-environment');
        }
    }
];
