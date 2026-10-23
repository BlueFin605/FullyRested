// Shots for the capturing-values guide (07).

async function ready(h) {
    await h.sleep(1500);
    await h.waitFor('1-create.frreq', 30000); // the chain folder starts expanded
}

export const shots = [
    {
        name: 'capture-request',
        run: async (h) => {
            await ready(h);
            await h.click('1-create.frreq');
            await h.sleep(300);
            const { y } = await h.waitFor('Validation', 15000, true);
            await h.clickAt(537, y);
            await h.sleep(500);
            await h.shot('capture-request');
        }
    },
    {
        name: 'capture-run-result',
        run: async (h) => {
            await ready(h);
            await h.click('1-create.frreq'); // open it so its response shows after the run
            await h.sleep(300);
            await h.rightClick('chain');
            await h.click('Run');
            await h.sleep(6000);
            await h.shot('capture-run-result');
        }
    }
];
