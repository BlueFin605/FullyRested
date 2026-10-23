// Privacy scrub for help screenshots. scrubText() is pure; scrubPageExpression() builds a
// self-contained script that applies it to everything visible in the page (text nodes, which
// includes virtualised CodeMirror .cm-content lines, plus input values and common attributes).
export const FAKE_IP = '203.0.113.7';
export const FAKE_TRACE = 'Root=1-00000000-000000000000000000000000';

export function scrubText(s) {
    if (typeof s !== 'string' || !s) return s;
    return s
        .replace(/Root=1-[0-9a-fA-F]{8}-[0-9a-fA-F]{24}/g, FAKE_TRACE)
        .replace(/(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.]*\d)/g,
            (m) => (m === '127.0.0.1' || m === '0.0.0.0' ? m : FAKE_IP));
}

export function scrubPageExpression() {
    return `(() => {
        const scrubText = ${scrubText.toString()};
        const FAKE_IP = ${JSON.stringify(FAKE_IP)}, FAKE_TRACE = ${JSON.stringify(FAKE_TRACE)};
        let n = 0;
        // CodeMirror reverts direct DOM edits, so rewrite its document through the EditorView instead.
        for (const c of document.querySelectorAll('.cm-content')) {
            const view = c.cmView?.view || c.cmView?.rootView?.view || c.cmTile?.view || c.cmView?.editorView;
            if (!view || !view.state) continue;
            const changes = [];
            for (let i = 1; i <= view.state.doc.lines; i++) {
                const line = view.state.doc.line(i), to = scrubText(line.text);
                if (to !== line.text) changes.push({ from: line.from, to: line.to, insert: to });
            }
            if (changes.length) { view.dispatch({ changes }); n += changes.length; }
        }
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let t = w.nextNode(); t; t = w.nextNode()) {
            const v = scrubText(t.nodeValue);
            if (v !== t.nodeValue) { t.nodeValue = v; n++; }
        }
        for (const el of document.querySelectorAll('*')) {
            if ('value' in el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                const v = scrubText(el.value);
                if (v !== el.value) { el.value = v; n++; }
            }
            for (const a of ['value', 'title', 'placeholder', 'aria-label']) {
                const cur = el.getAttribute(a);
                if (cur) { const v = scrubText(cur); if (v !== cur) { el.setAttribute(a, v); n++; } }
            }
        }
        return n;
    })()`;
}
