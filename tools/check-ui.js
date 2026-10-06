/* Static consistency check: DOM ids referenced in JS exist in index.html.
 * Run: node tools/check-ui.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const jsDir = path.join(__dirname, '..', 'js');
let pass = 0, fail = 0;
const seen = new Set();
const ok = (c, name) => {
  if (seen.has(name)) return;
  seen.add(name);
  if (c) { pass++; console.log('  OK  ' + name); }
  else { fail++; console.log('  MISSING: ' + name); }
};

// collect all ids defined in HTML
const htmlIds = new Set();
const idRe = /id="([^"]+)"/g;
let m;
while ((m = idRe.exec(html)) !== null) htmlIds.add(m[1]);

const screens = new Set();
const screenRe = /id="screen-([^"]+)"/g;
while ((m = screenRe.exec(html)) !== null) screens.add(m[1]);

const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
for (const f of files) {
  const src = fs.readFileSync(path.join(jsDir, f), 'utf8');

  // Pattern 1: $('#some-id')
  const selRe = /\$\('#([A-Za-z0-9_-]+)'\)/g;
  while ((m = selRe.exec(src)) !== null) {
    if (m[1] === 'btn-online-reveal') continue; // created dynamically by online.js
    ok(htmlIds.has(m[1]), f + ' -> #' + m[1]);
  }

  // Pattern 2: plain '#id' string literals (e.g. wireSeg('#seg-mafia', ...))
  // skip hex colors (# followed by 3/6 hex digits)
  const litRe = /'(#)([A-Za-z0-9_-]+)'/g;
  while ((m = litRe.exec(src)) !== null) {
    const id = m[2];
    if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(id)) continue; // hex color
    if (id === 'btn-online-reveal') continue; // created dynamically by online.js
    ok(htmlIds.has(id), f + ' -> ' + m[1] + id + ' (literal)');
  }

  // Pattern 3: show('screen')
  const showRe = /show\('([a-z-]+)'\)/g;
  while ((m = showRe.exec(src)) !== null) {
    ok(screens.has(m[1]), f + ' -> screen-' + m[1]);
  }
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
