// Shots for the in-app Help viewer (F1), referenced from the help README.
export const shots = [
    {
        name: 'help-viewer-home',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.press('F1');
            await h.waitFor('.help-topic', 15000);
            await h.sleep(1000);
            await h.shot('help-viewer-home');
            await h.press('Escape');
        }
    },
    {
        name: 'help-viewer-guide',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.press('F1');
            await h.waitFor('.help-topic', 15000);
            await h.click('Using a value from a previous call');
            await h.sleep(1200);
            await h.shot('help-viewer-guide');
            await h.press('Escape');
        }
    }
];
