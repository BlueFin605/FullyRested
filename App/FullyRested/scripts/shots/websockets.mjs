// Shots for the websockets guide (docs/help/09-websockets.md).
const open = async (h) => {
    await h.waitFor('li[role="treeitem"]');
    await h.click('echo-socket');
    await h.waitFor('.open-live');
    await h.sleep(600);
};

export const shots = [
    {
        name: 'ws-editor',
        run: async (h) => {
            await open(h);
            await h.shot('ws-editor');
        }
    },
    {
        name: 'ws-run-pass',
        run: async (h) => {
            await open(h);
            await h.click('button.send');
            await h.sleep(5000);
            await h.click('.name-input');
            await h.sleep(300);
            await h.shot('ws-run-pass', { clip: { x: 260, y: 75, width: 1020, height: 300 } });
        }
    },
    {
        name: 'ws-trigger',
        run: async (h) => {
            await open(h);
            await h.waitFor('[data-section="trigger"]', 15000, true);
            await h.click('select[aria-label="Trigger request"]');
            await h.press('ArrowDown');
            await h.press('ArrowDown');
            await h.press('Enter');
            await h.sleep(500);
            await h.waitFor('select[aria-label="Trigger run"], .clear-trigger', 15000, true);
            await h.shot('ws-trigger', { clip: { x: 260, y: 75, width: 510, height: 705 } });
        }
    },
    {
        name: 'ws-live',
        run: async (h) => {
            await open(h);
            await h.click('.open-live');
            await h.waitFor('.state.open', 20000);
            await h.click('input.draft');
            await h.type('{"ping":1}');
            await h.press('Enter');
            await h.sleep(1500);
            await h.shot('ws-live', { clip: { x: 771, y: 75, width: 509, height: 700 } });
        }
    }
];
