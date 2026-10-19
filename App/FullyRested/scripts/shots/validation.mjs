// Shots for the validation guide. run(h) gets the helpers from help-screenshots.mjs.
// Edits made here (the expected status) are never saved.
export const shots = [
    {
        name: 'valid-status-code',
        run: async (h) => {
            await h.click('status-check.frreq');
            await h.click('Validation');
            await h.sleep(400);
            await h.shot('valid-status-code', { clip: { x: 261, y: 75, width: 510, height: 330 } });
        }
    },
    {
        name: 'valid-headers-body',
        run: async (h) => {
            await h.click('validated.frreq');
            await h.click('Validation');
            await h.sleep(600);
            await h.shot('valid-headers-body', { clip: { x: 261, y: 75, width: 510, height: 700 } });
        }
    },
    {
        name: 'valid-pass',
        run: async (h) => {
            await h.click('validated.frreq');
            await h.press('Enter', { ctrl: true });
            await h.waitFor('.fr-pill[data-level="ok"]', 30000);
            await h.sleep(500);
            await h.shot('valid-pass', { clip: { x: 771, y: 75, width: 509, height: 400 } });
        }
    },
    {
        name: 'valid-run-expects-404',
        run: async (h) => {
            await h.click('not-found');
            await h.click('Validation');
            await h.sleep(500);
            await h.press('Enter', { ctrl: true });
            await h.waitFor('.fr-pill[data-level="ok"]', 30000);
            await h.sleep(600);
            await h.shot('valid-run-expects-404');
        }
    },
    {
        name: 'valid-fail',
        run: async (h) => {
            await h.click('status-check.frreq');
            await h.click('Validation');
            await h.click('200 - OK');
            await h.click('404');
            await h.sleep(300);
            await h.press('Enter', { ctrl: true });
            await h.waitFor('.validation-errors', 30000);
            await h.sleep(600);
            await h.shot('valid-fail');
        }
    }
];
