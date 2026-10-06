/* Inject word packs from js/words.js into the edge function source.
 * Run: node tools/inject-words.js  (before deploying the function)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Words = require(path.join(__dirname, '..', 'js', 'words.js'));

const packs = {};
for (const id of Object.keys(Words.PACKS)) {
  packs[id] = Words.PACKS[id].words;
}
const fnPath = path.join(__dirname, '..', 'supabase', 'functions', 'mafia-room', 'index.ts');
let src = fs.readFileSync(fnPath, 'utf8');
const block = 'const TOPICS: Record<string, string[]> = {\n' +
  Object.keys(packs).map(function (id) {
    return '  ' + JSON.stringify(id) + ': ' + JSON.stringify(packs[id]) + ',';
  }).join('\n').replace(/,$/, '') + '\n};';
src = src.replace(
  /const TOPICS: Record<string, string\[\]> = \{[\s\S]*?\};/,
  block
);
fs.writeFileSync(fnPath, src);
console.log('injected ' + Object.keys(packs).length + ' packs, ' +
  Object.values(packs).reduce(function (a, b) { return a + b.length; }, 0) + ' words into index.ts');
console.log('function size: ' + src.length + ' chars');
