/* Full integration test for the Supabase Edge Function game server.
 * Run: node tools/test-edge.js
 */
'use strict';
const FU = 'https://traixahcfznoeqnbhzyu.supabase.co/functions/v1/mafia-room';

let pass = 0, fail = 0;
const ok = (c, name) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL: ' + name); } };

async function call(body) {
  const res = await fetch(FU, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async function main() {
  console.log('== create room ==');
  const r1 = await call({ op: 'create', name: 'Ava' });
  ok(r1.status === 200 && r1.json.roomCode, 'room created: ' + r1.json.roomCode);
  const code = r1.json.roomCode;
  const hostId = r1.json.playerId;

  console.log('== join 3 players ==');
  const ids = [hostId];
  for (const nm of ['Ben', 'Cara', 'Dan']) {
    const r = await call({ op: 'join', code, name: nm });
    ok(r.status === 200 && r.json.playerId, nm + ' joined');
    ids.push(r.json.playerId);
  }

  console.log('== duplicate name / bad code ==');
  let r = await call({ op: 'join', code, name: 'ava' });
  ok(r.status === 409, 'duplicate name rejected (got ' + r.status + ')');
  r = await call({ op: 'join', code: 'ZZZZ', name: 'Eve' });
  ok(r.status === 404, 'bad code rejected');

  console.log('== host gating ==');
  r = await call({ op: 'act', code, playerId: ids[1], action: 'start' });
  ok(r.status === 403, 'non-host cannot start');

  console.log('== start ==');
  r = await call({ op: 'act', code, playerId: hostId, action: 'start' });
  ok(r.status === 200, 'host starts');
  let st = await call({ op: 'state', code, playerId: hostId });
  ok(st.json.phase === 'dealing', 'phase is dealing (got ' + st.json.phase + ')');

  console.log('== privacy: cards ==');
  let mafiaIdx = -1, civWord = null;
  for (let i = 0; i < ids.length; i++) {
    const v = await call({ op: 'state', code, playerId: ids[i] });
    const raw = JSON.stringify(v.json);
    ok(!raw.includes('"secretWord"'), 'player ' + i + ' view has no secretWord key');
    if (v.json.card && v.json.card.suspects) { mafiaIdx = i; }
    if (v.json.card && v.json.card.word && i !== mafiaIdx) { civWord = v.json.card.word; }
  }
  ok(mafiaIdx >= 0, 'one mafia found (index ' + mafiaIdx + ')');
  const mSt = await call({ op: 'state', code, playerId: ids[mafiaIdx] });
  ok(mSt.json.card.suspects.length === 4, 'mafia sees 4 suspects');
  ok(!mSt.json.card.word, 'mafia has no word');
  const civSt = await call({ op: 'state', code, playerId: ids[(mafiaIdx + 1) % 4] });
  ok(!!civSt.json.card.word, 'civilian sees the word');
  ok(mSt.json.card.suspects.includes(civSt.json.card.word), 'the word is among mafia suspects');

  console.log('== reveal all ==');
  for (const id of ids) {
    r = await call({ op: 'act', code, playerId: id, action: 'revealed' });
    ok(r.status === 200, 'revealed');
  }
  st = await call({ op: 'state', code, playerId: hostId });
  ok(st.json.phase === 'clues', 'after all reveal → clues');

  console.log('== clue order enforcement ==');
  const view1 = st.json;
  let speaker = view1.speakingOrder[view1.speakerIdx];
  const nonSpeaker = ids.find((i) => i !== speaker);
  r = await call({ op: 'act', code, playerId: nonSpeaker, action: 'clue', clue: 'x' });
  ok(r.status === 400, 'out-of-turn clue rejected');

  for (let i = 0; i < 4; i++) {
    const v = await call({ op: 'state', code, playerId: hostId });
    speaker = v.json.speakingOrder[v.json.speakerIdx];
    if (!speaker) break;
    r = await call({ op: 'act', code, playerId: speaker, action: 'clue', clue: 'clue' + i });
    ok(r.status === 200, 'clue by ' + v.json.players.find((p) => p.id === speaker).name);
  }
  st = await call({ op: 'state', code, playerId: hostId });
  ok(st.json.phase === 'discussion', 'all clues → discussion');

  console.log('== vote flow ==');
  r = await call({ op: 'act', code, playerId: hostId, action: 'vote', targetId: ids[1] });
  ok(r.status === 400, 'vote before beginVote rejected');
  r = await call({ op: 'act', code, playerId: ids[1], action: 'beginVote' });
  ok(r.status === 200, 'beginVote (any player)');
  for (const id of ids) {
    r = await call({ op: 'act', code, playerId: id, action: 'vote', targetId: ids[mafiaIdx] });
    ok(r.status === 200, 'vote cast');
  }
  st = await call({ op: 'state', code, playerId: hostId });
  ok(st.json.phase === 'reveal', 'after all votes → reveal');
  ok(st.json.eliminatedId === ids[mafiaIdx], 'mafia eliminated (unanimous)');

  console.log('== continue → final guess ==');
  r = await call({ op: 'act', code, playerId: hostId, action: 'continue' });
  ok(r.status === 200, 'continue');
  const mg = await call({ op: 'state', code, playerId: ids[mafiaIdx] });
  ok(mg.json.card && mg.json.card.finalGuess && mg.json.card.finalGuess.options.length === 6, 'mafia sees 6 options');
  const civView2 = await call({ op: 'state', code, playerId: ids[(mafiaIdx + 1) % 4] });
  ok(!(civView2.json.card && civView2.json.card.finalGuess), 'civilians see no options');
  // wrong guess
  const wrong = mg.json.card.finalGuess.options.find((w) => w !== civSt.json.card.word);
  r = await call({ op: 'act', code, playerId: ids[mafiaIdx], action: 'finalGuess', guess: wrong });
  ok(r.status === 200, 'final guess accepted');
  r = await call({ op: 'act', code, playerId: ids[mafiaIdx], action: 'finalGuess', guess: wrong });
  ok(r.status === 400, 'double guess rejected');

  console.log('== win ==');
  st = await call({ op: 'state', code, playerId: hostId });
  ok(st.json.phase === 'win', 'phase is win');
  ok(st.json.winner === 'civilians', 'civilians win');
  ok(st.json.secretWord === civSt.json.card.word, 'word revealed at win');
  ok(Array.isArray(st.json.mafiaNames) && st.json.mafiaNames.length === 1, 'mafia named');

  console.log('== rematch ==');
  r = await call({ op: 'act', code, playerId: hostId, action: 'rematch' });
  ok(r.status === 200, 'rematch');
  st = await call({ op: 'state', code, playerId: hostId });
  ok(st.json.phase === 'dealing', 'rematch → dealing');
  ok(st.json.roundNo === 2, 'round 2');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
