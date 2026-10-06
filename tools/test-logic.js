/* Logic smoke tests for game.js — run: node tools/test-logic.js */
'use strict';
const path = require('path');
const Game = require(path.join(__dirname, '..', 'js', 'game.js'));
const Words = require(path.join(__dirname, '..', 'js', 'words.js'));

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ FAIL: ' + name); }
}

// deterministic rng
let seed = 42;
function rng() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }

console.log('== words.js ==');
ok(Object.keys(Words.PACKS).length === 5, '5 topics');
Object.keys(Words.PACKS).forEach(function (t) {
  const pack = Words.PACKS[t];
  ok(pack.words.length >= 60, t + ': ' + pack.words.length + ' words (>=60)');
  const uniq = new Set(pack.words.map(w => w.toLowerCase()));
  ok(uniq.size === pack.words.length, t + ': no duplicates');
});
ok(Words.resolve('mix', rng) !== 'mix', 'mix resolves');
ok(Words.pickHint('sports', 'Football', () => 0.99) !== 'Football', 'pickHint helper differs from secret word');
ok(Words.pickDecoys('sports', 'Football', 3, rng).every(w => w !== 'Football'), 'decoys never equal secret word');

console.log('== game creation ==');
const names = ['Ava', 'Ben', 'Cara', 'Dan', 'Eli'];
const players = names.map((n, i) => ({ id: 'p' + i, name: n }));
const g = Game.createGame({ players, topicId: 'sports', mafiaCount: 1, finalGuess: true, rng });
ok(g.phase === 'dealing', 'starts in dealing');
ok(g.players.length === 5, '5 players');
ok(g.mafiaIds.length === 1, '1 mafia');
const mafia = g.players.find(p => p.role === 'mafia');
ok(!!mafia, 'a mafia exists');
ok(g.secretWord, 'secret word chosen');
ok(g.mafiaSuspects.length === 4, 'mafia sees 4 suspects');
ok(g.mafiaSuspects.indexOf(g.secretWord) !== -1, 'real word is among suspects');
ok(new Set(g.mafiaSuspects).size === 4, 'suspects unique');

console.log('== reveal/deal ==');
g.players.forEach(p => { const r = Game.markRevealed(g, p.id); });
const r5 = Game.markRevealed(g, 'p0');
ok(r5.allRevealed === true, 'all revealed');
Game.beginClues(g);
ok(g.phase === 'clues', 'clues phase');

console.log('== clue round ==');
let res;
const order = g.speakingOrder.slice();
for (const pid of order) {
  res = Game.giveClue(g, pid, 'clue-' + pid);
}
ok(res.finished === true, 'all clues collected');
ok(g.clues.length === 5, '5 clues recorded');

console.log('== discussion & vote ==');
Game.beginDiscussion(g);
ok(g.phase === 'discussion', 'discussion phase');
Game.beginVote(g);
ok(g.phase === 'vote', 'vote phase');

// 3 vote for the mafia, 2 scatter → strict majority (3 of 5 needed)
const others = g.players.filter(p => p.id !== mafia.id);
let tres;
tres = Game.castVote(g, others[0].id, mafia.id);
tres = Game.castVote(g, others[1].id, mafia.id);
ok(tres.allIn === false, 'votes pending until all in');
tres = Game.castVote(g, others[2].id, mafia.id);
tres = Game.castVote(g, others[3].id, others[0].id);
tres = Game.castVote(g, mafia.id, others[0].id);
ok(tres.allIn === true, 'all votes in → tally');
ok(tres.eliminated === mafia.id, 'mafia has strict majority (3/5) → eliminated');

console.log('== final guess ==');
const rres = Game.resolveElimination(g);
ok(rres && rres.pendingFinalGuess === true, 'final guess pending (enabled)');
let threw = false;
try { Game.resolveFinalGuess(g, g.decoys[0]); } catch (e) { threw = true; }
ok(threw === false, 'decoy guess accepted');
ok(g.winner === 'civilians' && g.winReason === 'mafia-caught', 'wrong guess → civilians win');
ok(g.phase === 'win', 'win phase');

console.log('== no-majority → continue ==');
const g2 = Game.createGame({ players, topicId: 'mix', mafiaCount: 1, finalGuess: false, rng });
g2.players.forEach(p => Game.markRevealed(g2, p.id));
Game.beginClues(g2);
for (const pid of g2.speakingOrder.slice()) Game.giveClue(g2, pid, 'c-' + pid);
Game.beginDiscussion(g2); Game.beginVote(g2);
// scattered: no majority
Game.castVote(g2, 'p0', 'p1');
Game.castVote(g2, 'p1', 'p2');
Game.castVote(g2, 'p2', 'p0');
Game.castVote(g2, 'p3', 'p0');
Game.castVote(g2, 'p4', 'p1');
// p0:2, p1:2, p2:1 → no strict majority (need 3)
const r2 = Game.resolveElimination(g2);
ok(g2.phase === 'clues', 'no elimination → back to clues');
ok(g2.speakingOrder.length === 5, 'all still alive');
ok(g2.clues.length === 0, 'clues reset');

console.log('== last-two rule ==');
const g3 = Game.createGame({ players, topicId: 'sports', mafiaCount: 1, finalGuess: false, rng });
const m3 = g3.players.find(p => p.role === 'mafia');
// simulate: eliminate 3 civilians one by one
let alive = g3.players.filter(p => p.role !== 'mafia');
for (const civ of alive.slice(0, 3)) {
  g3.players.forEach(p => { p.clue = null; });
  g3.clues = []; g3.speakerIdx = 0;
  g3.phase = 'vote'; g3.votes = {}; g3.votesCast = 0;
  const voters = g3.players.filter(p => p.alive);
  let last;
  for (const v of voters) last = Game.castVote(g3, v.id, civ.id);
  Game.resolveElimination(g3);
}
ok(g3.players.filter(p => p.alive).length === 2, 'down to 2');
ok(g3.winner === 'mafia' && g3.winReason === 'last-two', 'mafia wins at last two');

console.log('== word-blurted forfeit ==');
const g4 = Game.createGame({ players, topicId: 'sports', mafiaCount: 1, finalGuess: false, rng });
g4.players.forEach(p => Game.markRevealed(g4, p.id));
Game.beginClues(g4);
const first = Game.nextSpeaker(g4);
const r4 = Game.giveClue(g4, first, g4.secretWord);
ok(r4.invalid === true && r4.finished === true, 'blurted word → auto-forfeit');
ok(g4.winner === 'civilians' && g4.winReason === 'word-blurted', 'civilians win on blurt');

console.log('== privacy views ==');
const g5 = Game.createGame({ players, topicId: 'sports', mafiaCount: 1, finalGuess: false, rng });
const m5 = g5.players.find(p => p.role === 'mafia');
const civ5 = g5.players.find(p => p.role !== 'mafia');
const vm = Game.playerView(g5, m5.id);
const vc = Game.playerView(g5, civ5.id);
ok(vm.card.role === 'mafia' && vm.card.suspects && !vm.card.word, 'mafia sees suspects, not word');
ok(vc.card.role === 'civilian' && vc.card.word, 'civilian sees word');
const pub = JSON.stringify(Game.publicView(g5));
ok(pub.indexOf('secretWord') === -1 && pub.indexOf(g5.secretWord) === -1, 'public view leaks no secret word');
const civStr = JSON.stringify(Game.playerView(g5, civ5.id));
ok(civStr.indexOf('suspects') === -1, 'civilian view leaks no suspects');
ok(!vm.players.some(p => p.role), 'public view hides roles');

console.log('== player limits ==');
let threwCount = false;
try { Game.createGame({ players: players.slice(0, 2), topicId: 'sports', rng }); } catch (e) { threwCount = true; }
ok(threwCount, '2 players rejected');
let threwCount2 = false;
try { Game.createGame({ players: Array.from({length: 21}, (_, i) => ({id:'x'+i,name:'X'+i})), topicId: 'sports', rng }); } catch (e) { threwCount2 = true; }
ok(threwCount2, '21 players rejected');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
