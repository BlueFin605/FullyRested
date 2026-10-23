// Shots for the variables-and-secrets guide. run(h) gets the helpers from help-screenshots.mjs.
// Nothing here saves: every edit stays unsaved and the sample collection is never touched.
export const shots = [
    {
        name: 'vars-collection-variables',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.click('Collection Settings');
            await h.click('Variables');
            await h.sleep(400);
            await h.shot('vars-collection-variables');
        }
    },
    {
        name: 'vars-collection-secrets',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.click('Collection Settings');
            await h.click('Secrets');
            await h.sleep(400);
            await h.shot('vars-collection-secrets');
        }
    },
    {
        name: 'vars-env-secrets',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            // an environment's Secrets pane: the first match four lists deep resolves to local-test's Secrets row
            await h.click('li[role="treeitem"] li[role="treeitem"] li[role="treeitem"] li[role="treeitem"]:first-child');
            await h.sleep(400);
            await h.shot('vars-env-secrets');
        }
    },
    {
        name: 'vars-request-inherited',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.click('with-secret.frreq');
            await h.click('Inherited');
            await h.sleep(500);
            await h.shot('vars-request-inherited');
        }
    },
    {
        name: 'vars-resolved',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.click('with-secret.frreq');
            await h.press('Enter', { ctrl: true });
            await h.sleep(3500);
            await h.click('Request headers');
            await h.sleep(400);
            await h.shot('vars-resolved');
        }
    },
    {
        name: 'vars-run-variables',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.click('status-check.frreq');
            await h.click('li[role="treeitem"] mat-icon.run');
            await h.click('[role="tab"]:nth-child(4)');
            await h.click('input[placeholder="Add variable"]');
            await h.type('greeting');
            await h.press('Tab');
            await h.type('hello-from-this-run');
            await h.press('Tab');
            await h.sleep(400);
            await h.shot('vars-run-variables');
        }
    }
];
