// Shots for the authentication guide. Edits are never saved. Each shot is meant to run in a fresh app.
const clip = { x: 261, y: 38, width: 1019, height: 520 };

async function openCollectionAuth(h) {
    await h.waitFor('li[role="treeitem"]');
    await h.click('Authentication');
    await h.waitFor('.method-field');
    await h.sleep(300);
}

async function pick(h, optionText) {
    await h.click('.method-field');
    await h.waitFor('mat-option');
    await h.click(optionText);
    await h.sleep(300);
}

async function openRequestAuth(h) {
    await h.waitFor('li[role="treeitem"]');
    await h.click('list-users.frreq');
    await h.waitFor('.request-tabs');
    await h.click('Auth');
    await h.sleep(300);
}

export const shots = [
    { name: 'auth-collection-none', run: async (h) => {
        await openCollectionAuth(h);
        await pick(h, 'None');
        await h.shot('auth-collection-none', { clip });
    } },
    { name: 'auth-collection-inherit', run: async (h) => {
        await openCollectionAuth(h);
        await pick(h, 'Inherit');
        await h.shot('auth-collection-inherit', { clip });
    } },
    { name: 'auth-collection-basic', run: async (h) => {
        await openCollectionAuth(h);
        await pick(h, 'Basic Auth');
        await h.press('Tab');
        await h.type('dean');
        await h.press('Tab');
        await h.type('{{$apiKey}}');
        await h.shot('auth-collection-basic', { clip });
    } },
    { name: 'auth-collection-bearer', run: async (h) => {
        await openCollectionAuth(h);
        await pick(h, 'Bearer Token');
        await h.press('Tab');
        await h.type('{{$apiKey}}');
        await h.shot('auth-collection-bearer', { clip });
    } },
    { name: 'auth-collection-aws', run: async (h) => {
        await openCollectionAuth(h);
        await pick(h, 'AWS Signature');
        await h.press('Tab'); // Sign Url checkbox
        await h.press('Tab');
        await h.type('{{$apiKey}}'); // AccessKey
        await h.press('Tab');
        await h.type('{{$apiKey}}'); // SecretKey
        await h.press('Tab');
        await h.type('{{$apiKey}}'); // SessionToken
        await h.press('Tab');
        await h.type('eu-central-1');
        await h.press('Tab');
        await h.type('execute-api');
        await h.shot('auth-collection-aws', { clip: { ...clip, height: 640 } });
    } },
    { name: 'auth-collection-aws-presigned', run: async (h) => {
        await openCollectionAuth(h);
        await pick(h, 'AWS Signature');
        await h.click('Sign Url');
        await h.shot('auth-collection-aws-presigned', { clip: { ...clip, height: 640 } });
    } },
    { name: 'auth-request-tab', run: async (h) => {
        await openRequestAuth(h);
        await h.shot('auth-request-tab');
    } },
    { name: 'auth-request-bearer', run: async (h) => {
        await openRequestAuth(h);
        await pick(h, 'Bearer Token');
        await h.press('Tab');
        await h.type('{{$apiKey}}');
        await h.shot('auth-request-bearer');
    } }
];
