// Shots for the folders-and-hierarchy guide.

const treeClip = { x: 0, y: 0, width: 1280, height: 800 };

export const shots = [
    {
        name: 'hier-folder-menu',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.rightClick('users');
            await h.waitFor('Folder settings');
            await h.shot('hier-folder-menu', { clip: { x: 0, y: 400, width: 640, height: 400 } });
            await h.press('Escape');
        }
    },
    {
        name: 'hier-folder-settings',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.rightClick('users');
            await h.click('Folder settings');
            await h.waitFor('Folder settings ·');
            await h.sleep(500);
            await h.shot('hier-folder-settings');
        }
    },
    {
        name: 'hier-inherited',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.click('list-users');
            await h.waitFor('.inherited-bar');
            await h.click('.inherited-bar');
            await h.waitFor('accept-language');
            await h.sleep(400);
            await h.shot('hier-inherited');
        }
    },
    {
        name: 'hier-run-folder',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.rightClick('users');
            await h.click('play_arrow');
            await h.waitFor('Run finished', 40000);
            await h.sleep(400);
            await h.shot('hier-run-folder', { clip: { x: 0, y: 520, width: 780, height: 280 } });
        }
    }
];
