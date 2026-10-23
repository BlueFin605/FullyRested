// Collects the shot definitions of every guide. One file per guide in ./shots, each exporting
// `shots = [{ name, run: async (h) => {...} }]`; run(h) receives the helpers from
// help-screenshots.mjs (click, type, press, waitFor, setWindowSize, shot, sleep). The app starts
// with the sample collection open at 1280x800.
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');
const files = readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort();
export const shots = (await Promise.all(files.map((f) => import(pathToFileURL(path.join(dir, f)).href))))
    .flatMap((m) => m.shots);
