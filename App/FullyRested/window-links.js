// Keeps the app window on its own file:// pages: http(s) links (such as the help guides'
// external links) open in the system browser instead of inside the window.
function isExternal(url) {
    try {
        const u = new URL(url);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function applyExternalLinkGuards(webContents, openExternal) {
    webContents.setWindowOpenHandler(({ url }) => {
        if (isExternal(url)) openExternal(url);
        return { action: 'deny' };
    });
    webContents.on('will-navigate', (event, url) => {
        if (!isExternal(url)) return;
        event.preventDefault();
        openExternal(url);
    });
}

module.exports = { isExternal, applyExternalLinkGuards };
