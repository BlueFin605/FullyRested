// Shots for the runs-and-suites guide.

export const shots = [
    {
        name: 'runs-tree',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.click('status-check');
            await h.sleep(400);
            await h.shot('runs-tree', { clip: { x: 0, y: 440, width: 260, height: 340 } });
        }
    },
    {
        name: 'runs-run-result',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.click('not-found');
            await h.sleep(500);
            await h.click('button.send');
            await h.waitFor('404', 20000);
            await h.click('Response');
            await h.sleep(1200);
            await h.sleep(800);
            await h.shot('runs-run-result');
        }
    },
    {
        name: 'runs-folder-menu',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.rightClick('chain');
            await h.shot('runs-folder-menu', { clip: { x: 0, y: 380, width: 400, height: 260 } });
            
        }
    },
    {
        name: 'runs-scope-status',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            await h.rightClick('chain');
            await h.click('Run');
            await h.waitFor('Run finished', 40000);
            await h.sleep(500);
            await h.shot('runs-scope-status', { clip: { x: 0, y: 420, width: 640, height: 360 } });
            
        }
    },
    {
        name: 'runs-history',
        run: async (h) => {
            await h.waitFor('li[role="treeitem"]');
            // build its own history: one request run, one folder run (each shot runs in a fresh app)
            await h.click('status-check');
            await h.click('button.send');
            await h.sleep(2500);
            await h.rightClick('chain');
            await h.click('Run');
            await h.waitFor('Run finished', 40000);
            await h.sleep(800);
            await h.click('History');
            await h.sleep(1500);
            await h.click('folder:chain');
            await h.sleep(1500);
            await h.shot('runs-history');
        }
    }
];
