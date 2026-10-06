/* End-to-end integration test: 4 players play a full online game over HTTP.
 * Run: node tools/test-server.js  (server must be running on :3000)
 */
'use strict';
const BASE = 'http://localhost:3000';

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ FAIL: ' + name); }
}

async function api(path, body, method) {
  const res = await fetch(BASE + path, {
    method: method || 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/* Collect SSE events for a player: returns {stop, next} where next() waits for
 * the next state event and resolves with the parsed view. */
function sse(code, playerId) {
  const controller = new AbortController();
  const events = [];
  let notify = null;
  (async function () {
    try {
      const res = await fetch(BASE + '/api/room/' + code + '/events?playerId=' + encodeURIComponent(playerId), {
        signal: controller.signal
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const ev = {};
          frame.split('\n').forEach(function (line) {
            if (line.startsWith('event:')) ev.event = line.slice(6).trim();
            if (line.startsWith('data:')) ev.data = line.slice(5).trim();
          });
          if (ev.event === 'state') {
            events.push(JSON.parse(ev.data));
            if (notify) { const n = notify; notify = null; n(); }
          }
        }
      }
    } catch (e) { /* aborted */ }
  })();
  return {
    events: events,
    next: function () {
      return new Promise(function (resolve) {
        const check = function () {
          if (events.length) resolve(events.shift());
          else notify = check;
        };
        check();
      });
    },
    last: function () { return events[events.length - 1]; },
    /** wait until a view satisfying pred appears (or timeout) */
    waitFor: function (pred, timeoutMs) {
      const started = Date.now();
      return new Promise(function (resolve, reject) {
        (function poll() {
          for (const v of events) if (pred(v)) return resolve(v);
          if (Date.now() - started > (timeoutMs || 5000)) return reject(new Error('waitFor timeout'));
          setTimeout(poll, 25);
        })();
      });
    },
    stop: function () { controller.abort(); }
  };
}

function waitMs(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function main() {
  console.log('== create room ==');
  const host = await api('/api/rooms', { name: 'Ava' });
  ok(host.status === 200 && host.json.roomCode, 'room created: ' + host.json.roomCode);
  const code = host.json.roomCode;
  const hostId = host.json.playerId;

  // host SSE
  const h = sse(code, hostId);
  await h.next();

  console.log('== join players ==');
  const ids = [hostId];
  for (const nm of ['Ben', 'Cara', 'Dan']) {
    const r = await api('/api/rooms/' + code + '/join', { name: nm });
    ok(r.status === 200 && r.json.playerId, nm + ' joined');
    ids.push(r.json.playerId);
  }
  let v = await h.waitFor(function (x) { return x.room.players.length === 4; });
  ok(v.room.players.length === 4, 'lobby shows 4 players');

  console.log('== duplicate name rejected ==');
  const dup = await api('/api/rooms/' + code + '/join', { name: 'ava' });
  ok(dup.status === 409, 'duplicate name rejected');

  console.log('== host sets topic ==');
  let r = await api('/api/room/' + code + '/act', { playerId: ids[1], action: 'setTopic', topicId: 'sports' });
  ok(r.status === 400, 'non-host cannot set topic');
  r = await api('/api/room/' + code + '/act', { playerId: hostId, action: 'setTopic', topicId: 'sports' });
  ok(r.status === 200, 'host sets topic');

  console.log('== start game ==');
  r = await api('/api/room/' + code + '/act', { playerId: ids[1], action: 'start' });
  ok(r.status === 400, 'non-host cannot start');
  r = await api('/api/room/' + code + '/act', { playerId: hostId, action: 'start' });
  ok(r.status === 200, 'host starts game');

  // connect SSE for all players
  const streams = [h, sse(code, ids[1]), sse(code, ids[2]), sse(code, ids[3])];
  const nameOf = function (view, id) { const p = view.players.find(function (p2) { return p2.id === id; }); return p ? p.name : '?'; };

  console.log('== privacy check ==');
  await h.waitFor(function (x) { return x.phase === 'dealing'; });
  let mafiaStream = null, civStream = null, mafiaPlayerId = null, word = null;
  for (let i = 0; i < streams.length; i++) {
    const view = await streams[i].waitFor(function (x) { return x.phase === 'dealing'; });
    ok(!!view.card, 'player ' + i + ' has a card');
    const s = JSON.stringify(view);
    ok(s.indexOf('"secretWord"') === -1 && s.indexOf('"word":') === -1 || view.card.role !== 'mafia', 'player ' + i + ' view has no raw secretWord key');
    if (view.card.role === 'mafia') { mafiaStream = streams[i]; mafiaPlayerId = ids[i]; }
    else { civStream = streams[i]; word = word || view.card.word; }
  }
  ok(!!mafiaStream, 'one mafia found among players');
  const mv = await mafiaStream.waitFor(function (x) { return x.card && x.card.suspects; });
  ok(mv.card.suspects.length === 4, 'mafia sees 4 suspects');
  ok(!mv.card.word, 'mafia does not see the word');
  const cv = await civStream.waitFor(function (x) { return x.card && x.card.word; });
  ok(cv.card.word && !cv.card.suspects, 'civilian sees word, no suspects');
  ok(mv.card.suspects.indexOf(cv.card.word) !== -1, 'the real word is among the mafia\'s suspects');
  const civId = cv.players.find(function (p) { return p.id === ids[1] || p.id === ids[2] || p.id === ids[3]; }).id;

  console.log('== reveal all ==');
  for (let i = 0; i < ids.length; i++) {
    r = await api('/api/room/' + code + '/act', { playerId: ids[i], action: 'revealed' });
    ok(r.status === 200, 'player ' + i + ' revealed');
  }
  v = await h.waitFor(function (x) { return x.phase === 'clues'; });
  ok(true, 'after all reveal → clues phase');

  console.log('== clue phase (order enforcement) ==');
  const notSpeaker = v.speakingOrder[v.speakerIdx] === ids[0] ? ids[1] : ids[0];
  r = await api('/api/room/' + code + '/act', { playerId: notSpeaker, action: 'clue' });
  ok(r.status === 400, 'out-of-turn clue rejected');

  // give clues in order until discussion
  for (let i = 0; i < 4; i++) {
    const view = await h.waitFor(function (x) { return x.phase === 'clues' && x.speakerIdx === i; });
    const spk = view.speakingOrder[view.speakerIdx];
    r = await api('/api/room/' + code + '/act', { playerId: spk, action: 'clue' });
    ok(r.status === 200, 'clue by ' + nameOf(view, spk));
  }
  v = await h.waitFor(function (x) { return x.phase === 'discussion'; });
  ok(true, 'last clue auto-advances to discussion');

  console.log('== vote flow ==');
  r = await api('/api/room/' + code + '/act', { playerId: ids[0], action: 'vote', targetId: ids[1] });
  ok(r.status === 400, 'vote rejected before beginVote');
  r = await api('/api/room/' + code + '/act', { playerId: ids[0], action: 'beginVote' });
  ok(r.status === 200, 'beginVote from discussion');
  await h.waitFor(function (x) { return x.phase === 'vote'; });

  // find mafia's identity via elimination votes: everyone votes for the mafia
  // (test knows who the mafia is from the card views above)
  let voteRes = null;
  for (const voter of ids) {
    r = await api('/api/room/' + code + '/act', { playerId: voter, action: 'vote', targetId: mafiaPlayerId });
    ok(r.status === 200, 'vote cast by ' + nameOf(v, voter));
  }
  v = await h.waitFor(function (x) { return x.phase === 'reveal'; });
  ok(!!v.eliminatedId, 'tally resolved with an elimination');
  ok(v.eliminatedId === mafiaPlayerId, 'mafia eliminated (unanimous)');
  ok(v.eliminatedRole === 'mafia', 'reveal shows the eliminated role');

  console.log('== continue → final guess pause ==');
  r = await api('/api/room/' + code + '/act', { playerId: ids[0], action: 'continue' });
  ok(r.status === 200, 'continue pressed');
  const mgStream = streams[ids.indexOf(mafiaPlayerId)];
  const mgView = await mgStream.waitFor(function (x) { return x.card && x.card.finalGuess; });
  ok(mgView.card.finalGuess.options.length === 6, 'mafia sees 6 final-guess options');
  // civilians must NOT see the options
  const civStream2 = streams[ids.indexOf(ids.find(function (i) { return i !== mafiaPlayerId; }))];
  ok(!(civStream2.last() && civStream2.last().card && civStream2.last().card.finalGuess), 'civilians see no final-guess options');
  // guess wrong on purpose (pick a non-word option)
  const wrongOpt = mgView.card.finalGuess.options.find(function (w) { return w !== cv.card.word; });
  r = await api('/api/room/' + code + '/act', { playerId: mafiaPlayerId, action: 'finalGuess', guess: wrongOpt });
  ok(r.status === 200 && r.json.correct === false, 'wrong final guess accepted');
  // mafia cannot guess twice
  r = await api('/api/room/' + code + '/act', { playerId: mafiaPlayerId, action: 'finalGuess', guess: wrongOpt });
  ok(r.status === 400, 'second final guess rejected');

  console.log('== win screen ==');
  v = await h.waitFor(function (x) { return x.phase === 'win'; });
  ok(v.winner === 'civilians', 'civilians win (mafia caught, guess wrong)');
  ok(v.secretWord === cv.card.word, 'win screen reveals the word');
  ok(Array.isArray(v.mafiaNames) && v.mafiaNames.length === 1, 'win screen names the mafia');

  console.log('== rematch ==');
  r = await api('/api/room/' + code + '/act', { playerId: ids[0], action: 'rematch' });
  ok(r.status === 200, 'rematch works');
  v = await h.waitFor(function (x) { return x.phase === 'dealing'; });
  ok(true, 'rematch → new dealing phase');

  console.log('== mid-game quit: mafia leaves → civilians win ==');
  // reveal all, then mafia quits
  for (let i = 0; i < ids.length; i++) {
    await api('/api/room/' + code + '/act', { playerId: ids[i], action: 'revealed' });
  }
  await h.waitFor(function (x) { return x.phase === 'clues'; });
  // find current mafia (roles reshuffled on rematch)
  let newMafiaId = null;
  for (let i = 0; i < streams.length; i++) {
    const view = await streams[i].waitFor(function (x) { return x.phase === 'clues'; });
    if (view.card && view.card.role === 'mafia') { newMafiaId = ids[i]; break; }
  }
  ok(!!newMafiaId, 'found new mafia after rematch');
  r = await api('/api/room/' + code + '/act', { playerId: newMafiaId, action: 'leave' });
  ok(r.status === 200, 'mafia leaves');
  v = await h.waitFor(function (x) { return x.phase === 'win'; }, 4000).catch(function () { return v; });
  ok(v.winner === 'civilians', 'mafia quit → civilians win');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  for (const st of streams) st.stop();
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('FATAL', e);
  process.exit(1);
});
