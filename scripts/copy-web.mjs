// Copies the web app into www/ so Capacitor can package it into the Android app.
// The service worker (sw.js) is left out on purpose: the Android app already contains all its files.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const item of ['index.html', 'app.js', 'app.css', 'manifest.webmanifest', 'fonts', 'icons']) {
  const from = join(root, item);
  if (!existsSync(from)) {
    console.error('Missing file or folder: ' + item);
    process.exit(1);
  }
  cpSync(from, join(out, item), { recursive: true });
}

console.log('Copied the web app into www/');
