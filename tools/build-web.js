/* Build the deployable web bundle for GitHub Pages / Vercel / any static host.
 * Injects the Supabase edge-function URL into index.html.
 * Usage: node tools/build-web.js <fnUrl>
 * Output: web/ folder (gitignored) — copy contents to your host.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const fnUrl = process.argv[2] || '';
const root = path.join(__dirname, '..');
const out = path.join(root, 'web');

if (!fnUrl) {
  console.error('Usage: node tools/build-web.js <edge-function-url>');
  console.error('e.g.  node tools/build-web.js https://traixahcfznoeqnbhzyu.supabase.co/functions/v1/mafia-room');
  process.exit(1);
}

if (fs.existsSync(out)) fs.rmSync(out, { recursive: true });
fs.mkdirSync(out, { recursive: true });

// files/folders to copy
const items = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons'];
for (const it of items) {
  fs.cpSync(path.join(root, it), path.join(out, it), { recursive: true });
}

// inject config
let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const cfg = '<script>window.__MAFIA_CONFIG__ = { fnUrl: ' + JSON.stringify(fnUrl) + ' };</script>';
if (!html.includes('__MAFIA_CONFIG__')) {
  html = html.replace('</head>', '  ' + cfg + '\n</head>');
} else {
  html = html.replace(/window\.__MAFIA_CONFIG__[^<]*;/, 'window.__MAFIA_CONFIG__ = { fnUrl: ' + JSON.stringify(fnUrl) + ' };');
}
fs.writeFileSync(path.join(out, 'index.html'), html);

console.log('web bundle built in web/');
console.log('  fnUrl: ' + fnUrl);
console.log('  deploy web/* to any static host (GitHub Pages, Vercel, Netlify...)');
