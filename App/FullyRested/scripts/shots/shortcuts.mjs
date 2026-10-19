// Shots for the shortcuts-and-more guide.
export const shots = [
    {
        name: 'keys-palette',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.press('P', { ctrl: true, shift: true });
            await h.waitFor('[role="dialog"][aria-label="Command palette"]');
            await h.sleep(300);
            await h.shot('keys-palette');
            await h.press('Escape');
        }
    },
    {
        name: 'keys-palette-search',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.press('P', { ctrl: true, shift: true });
            await h.waitFor('[role="dialog"][aria-label="Command palette"]');
            await h.type('theme');
            await h.sleep(300);
            await h.shot('keys-palette-search');
            await h.press('Escape');
        }
    },
    {
        name: 'keys-view-menu',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.click('View');
            await h.waitFor('Theme: Dark');
            await h.sleep(300);
            await h.shot('keys-view-menu', { clip: { x: 0, y: 0, width: 640, height: 320 } });
            await h.press('Escape');
        }
    }
];
