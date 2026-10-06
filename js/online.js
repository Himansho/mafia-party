/* Mafia Party — online client v2 (Supabase Edge Function backend).
 * Everyone plays from their own home over the internet — no PC server needed.
 * Transport: POST to the edge function + polling (2s).
 */
(function (global) {
  'use strict';
  const { $, $$, el, show, toast, haptic, avatarFor, escapeHtml } = global.UI;
  const Sfx = global.Sfx;
  const Fx = global.Fx;
  const Words = global.Words;

  // Injected at deploy time by tools/build-web.js (or edit here for local dev):
  const CFG = global.__MAFIA_CONFIG__ || { fnUrl: '' };

  const S = {
    playerId: null,
    roomCode: null,
    playerName: null,
    view: null,
    pollTimer: null,
    revealedThisPhase: false
  };
  const LS_KEY = 'mafia-online-session';

  /* ================= transport ================= */

  async function call(body) {
    if (!CFG.fnUrl) throw new Error('Online mode not configured yet');
    const res = await fetch(CFG.fnUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    let json = {};
    try { json = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status));
    return json;
  }

  const act = (action, extra) => call(Object.assign({ op: 'act', code: S.roomCode, playerId: S.playerId, action: action }, extra || {}));
  const getState = () => call({ op: 'state', code: S.roomCode, playerId: S.playerId });

  /* ================= helpers ================= */

  function topicLabel(t) {
    const pack = Words.PACKS[t];
    return pack ? pack.emoji + ' ' + pack.name : t;
  }

  function nameById(view, id) {
    const p = (view.players || []).find(function (p2) { return p2.id === id; });
    return p ? p.name : '…';
  }

  /* ================= home / join ================= */

  function openHome() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      if (saved.name) $('#online-name').value = saved.name;
    } catch (e) { /* ignore */ }
    show('online-home');
  }

  function myName() {
    return ($('#online-name').value || '').trim();
  }

  $('#btn-create-room').addEventListener('click', async function () {
    const name = myName();
    if (!name) { toast('Enter your name first'); Sfx.error(); return; }
    try {
      const r = await call({ op: 'create', name: name });
      enterRoom(r.roomCode, r.playerId, name);
    } catch (e) {
      toast('Could not create room: ' + e.message, 'err');
      Sfx.error();
    }
  });

  $('#btn-join-room').addEventListener('click', async function () {
    const name = myName();
    const code = ($('#join-code').value || '').trim().toUpperCase();
    if (!name) { toast('Enter your name first'); Sfx.error(); return; }
    if (code.length !== 4) { toast('Room code is 4 letters'); Sfx.error(); return; }
    try {
      const r = await call({ op: 'join', code: code, name: name });
      enterRoom(r.roomCode, r.playerId, name);
    } catch (e) {
      toast('Could not join: ' + e.message, 'err');
      Sfx.error();
    }
  });

  function enterRoom(code, playerId, name) {
    S.roomCode = code;
    S.playerId = playerId;
    S.playerName = name;
    S.revealedThisPhase = false;
    localStorage.setItem(LS_KEY, JSON.stringify({ name: name, code: code, playerId: playerId }));
    refresh(true);
    startPolling();
    show('lobby');
  }

  /* ================= state sync ================= */

  let pollBusy = false;
  async function refresh(force) {
    if (pollBusy) return;
    pollBusy = true;
    try {
      const v = await getState();
      handleState(v);
    } catch (e) {
      if (force) toast('Connection problem: ' + e.message, 'err');
    } finally {
      pollBusy = false;
    }
  }

  function startPolling() {
    stopPolling();
    S.pollTimer = setInterval(function () { refresh(false); }, 2000);
  }
  function stopPolling() {
    if (S.pollTimer) { clearInterval(S.pollTimer); S.pollTimer = null; }
  }

  async function actAndRefresh(action, extra) {
    try {
      await act(action, extra);
      await refresh(true);
    } catch (e) {
      toast(e.message, 'err');
      Sfx.error();
      await refresh(false);
    }
  }

  /* ================= phase renderers ================= */

  let lastPhase = null;
  let prevClueCount = -1;
  function handleState(v) {
    if (!v) return;
    const phase = v.room ? v.room.phase : v.phase;
    S.view = v;
    if (phase !== lastPhase) { Sfx.select(); lastPhase = phase; S.revealedThisPhase = false; }
    switch (phase) {
      case 'lobby': return renderLobby(v);
      case 'dealing': return renderDeal(v);
      case 'clues': return renderClues(v);
      case 'discussion': return renderDiscussion(v);
      case 'vote': return renderVote(v);
      case 'reveal': return renderReveal(v);
      case 'win': return renderWin(v);
    }
  }

  /* ---------- lobby ---------- */

  function renderLobby(v) {
    show('lobby');
    $('#room-code').textContent = S.roomCode;
    const players = v.room.players || [];
    $('#lobby-count').textContent = players.length;
    const list = $('#lobby-list');
    list.innerHTML = '';
    for (const p of players) {
      const row = el('div', 'lobby-row' + (p.id === S.playerId ? ' me' : ''));
      const av = el('div', 'avatar');
      av.style.background = avatarFor(p.name);
      av.textContent = (p.name[0] || '?').toUpperCase();
      const nm = el('div', 'l-name', escapeHtml(p.name));
      row.appendChild(av); row.appendChild(nm);
      if (p.id === v.room.hostId) row.appendChild(el('span', 'host-badge', 'HOST'));
      list.appendChild(row);
    }
    const isHost = v.room.hostId === S.playerId;
    $('#btn-online-start').classList.toggle('hidden', !isHost);
    $('#lobby-hint').textContent = isHost
      ? 'Pick a topic and start when everyone is in.'
      : 'Waiting for the host to start…';
    const tr = $('#lobby-topic-row');
    tr.innerHTML = '';
    if (isHost) {
      tr.appendChild(el('div', 'field-label', 'Topic'));
      const chips = el('div', 'topic-grid');
      for (const id of ['mix', 'movies', 'space', 'sports', 'actors', 'anime']) {
        const c = el('button', 'chip' + (v.room.topicId === id ? ' sel' : ''), topicLabel(id));
        c.onclick = function () { actAndRefresh('setTopic', { topicId: id }); };
        chips.appendChild(c);
      }
      tr.appendChild(chips);
    }
  }

  /* ---------- dealing ---------- */

  function renderDeal(v) {
    show('deal');
    // online mode: no cover, no pass-the-phone — each player reveals on their device
    $('#deal-cover').classList.add('hidden');
    $('#deal-card').classList.remove('hidden');
    $('#btn-deal-next').classList.add('hidden');
    $('#btn-deal-finish').classList.add('hidden');
    $('#flip-card').classList.add('flipped');
    if (S.revealedThisPhase || (v.card && v.card.revealed)) {
      renderMyCard(v);
    } else {
      const front = $('#flip-front');
      front.innerHTML = '<button class="btn btn-primary btn-big" id="btn-online-reveal">Tap to reveal 🔒</button>' +
        '<p class="hint-sub">Everyone reveals on their own device.</p>';
      $('#btn-online-reveal').addEventListener('click', function () {
        S.revealedThisPhase = true;
        actAndRefresh('revealed');
      });
    }
  }

  function renderMyCard(v) {
    const front = $('#flip-front');
    const card = v.card || {};
    let html = '';
    if (card.role === 'mafia') {
      Sfx.mafiaReveal();
      html = '<div class="card-title">You are <span class="red">🔴 MAFIA</span></div>' +
        '<div class="card-sub">Topic: ' + escapeHtml(topicLabel(v.concreteTopic)) + '</div>' +
        '<div class="card-title sm">Your suspects — the word is one of these:</div>' +
        '<div class="suspects">' + (card.suspects || []).map(function (w) { return '<span class="suspect-chip">' + escapeHtml(w) + '</span>'; }).join('') + '</div>' +
        '<div class="card-sub">Blend in. Guess from context. Don\'t get caught.</div>';
    } else {
      Sfx.reveal();
      html = '<div class="card-title">You are <span class="gold">⭕ CIVILIAN</span></div>' +
        '<div class="card-sub">Topic: ' + escapeHtml(topicLabel(v.concreteTopic)) + '</div>' +
        '<div class="card-title sm">The secret word:</div>' +
        '<div class="word-big">' + escapeHtml(card.word || '?') + '</div>' +
        '<div class="card-sub">Give clues. Find the mafia.</div>';
    }
    front.innerHTML = html;
    $('#deal-actions').innerHTML = '<p class="hint-sub">Waiting for everyone to see their cards…</p>';
  }

  /* ---------- clues ---------- */

  function renderClues(v) {
    show('clue');
    const isMyTurn = v.speakingOrder && v.speakingOrder[v.speakerIdx] === S.playerId;
    const spkName = v.speakingOrder ? nameById(v, v.speakingOrder[v.speakerIdx]) : '';
    $('#clue-topic').textContent = topicLabel(v.concreteTopic);
    $('#speaker-name').textContent = isMyTurn ? 'YOU' : spkName;
    $('#speaker-card').classList.toggle('my-turn', isMyTurn);
    $('#clue-round').textContent = 'Round ' + v.roundNo;
    // hide offline-only elements
    $('#clue-timer-ring').classList.add('hidden');
    $('#clue-timer-num').classList.add('hidden');
    $('#btn-clue-done').classList.toggle('hidden', !isMyTurn);
    if (isMyTurn) {
      $('#btn-clue-done').textContent = '✅ I said my clue';
      $('#btn-clue-done').onclick = function () { actAndRefresh('clue', { clue: '·' }); };
    }
    const prog = $('#clue-progress');
    prog.innerHTML = '';
    (v.clues || []).forEach(function (c) {
      prog.appendChild(el('div', 'clue-row', '<b>' + escapeHtml(c.name) + ':</b> ' + escapeHtml(c.text)));
    });
  }

  /* ---------- discussion ---------- */

  function renderDiscussion(v) {
    show('discussion');
    $('#clue-recap').innerHTML = (v.clues || []).map(function (c) {
      return '<div class="clue-row"><b>' + escapeHtml(c.name) + ':</b> ' + escapeHtml(c.text) + '</div>';
    }).join('');
    $('#disc-timer-wrap').classList.add('hidden');
    $('#btn-begin-vote').textContent = '🗳️ Start the vote';
    $('#btn-begin-vote').onclick = function () { actAndRefresh('beginVote'); };
  }

  /* ---------- vote ---------- */

  function renderVote(v) {
    show('vote');
    $('#vote-cover').classList.add('hidden');
    $('#vote-ballot').classList.remove('hidden');
    $('#vote-prompt').textContent = 'Who is the Mafia? ' +
      ((v.voteProgress ? v.voteProgress.cast : 0) + '/' + (v.voteProgress ? v.voteProgress.total : '?') + ' votes in');
    const grid = $('#vote-grid');
    grid.innerHTML = '';
    const alive = (v.players || []).filter(function (p) { return p.alive; });
    for (const p of alive) {
      if (p.id === S.playerId) continue;
      const cell = el('button', 'vote-cell' + (v.myVote === p.id ? ' sel' : ''));
      cell.innerHTML = '<span class="vc-name">' + escapeHtml(p.name) + '</span>' +
        '<span class="vc-state">' + (v.myVote === p.id ? '✓ locked' : 'vote') + '</span>';
      cell.onclick = function () { actAndRefresh('vote', { targetId: p.id }); };
      grid.appendChild(cell);
    }
  }

  /* ---------- reveal ---------- */

  function renderReveal(v) {
    show('reveal');
    const tally = $('#tally');
    tally.innerHTML = Object.entries(v.tally || {}).map(function (pair) {
      return '<div class="tally-row"><span>' + escapeHtml(nameById(v, pair[0])) + '</span><b>' + pair[1] + '</b></div>';
    }).join('') || '<div class="tally-row"><span>—</span><b></b></div>';

    const rr = $('#reveal-result');
    $('#final-guess').classList.add('hidden');
    $('#btn-continue').classList.add('hidden');

    if (v.eliminatedId) {
      const p = (v.players || []).find(function (p2) { return p2.id === v.eliminatedId; });
      const role = v.eliminatedRole;
      rr.innerHTML = '<div class="rr-elim">' + escapeHtml(p ? p.name : '?') + ' is out!</div>' +
        '<div class="rr-role ' + role + '">' + (role === 'mafia' ? '🔴 MAFIA!' : '⭕ Civilian') + '</div>';
      if (role === 'mafia') Sfx.mafiaReveal(); else Sfx.error();
      if (v.card && v.card.finalGuess) {
        // we are the mafia — show guess UI
        const fg = $('#final-guess');
        fg.classList.remove('hidden');
        const opts = $('#fg-options');
        opts.innerHTML = '';
        (v.card.finalGuess.options || []).forEach(function (opt) {
          const b = el('button', 'btn btn-secondary fg-opt', escapeHtml(opt));
          b.onclick = function () { actAndRefresh('finalGuess', { guess: opt }); };
          opts.appendChild(b);
        });
      } else if (role === 'mafia') {
        rr.innerHTML += '<div class="rr-sub">The mafia gets one final guess — hold tight…</div>';
      } else {
        $('#btn-continue').classList.remove('hidden');
        $('#btn-continue').textContent = 'Continue →';
        $('#btn-continue').onclick = function () { actAndRefresh('continue'); };
      }
    } else {
      rr.innerHTML = '<div class="rr-elim">No strict majority — nobody eliminated!</div>' +
        '<div class="rr-sub">' + (v.voteNeed || 0) + '+ votes on one player needed.</div>';
      $('#btn-continue').classList.remove('hidden');
      $('#btn-continue').textContent = 'Next round of clues →';
      $('#btn-continue').onclick = function () { actAndRefresh('continue'); };
    }
  }

  /* ---------- win ---------- */

  function renderWin(v) {
    show('win');
    const civWin = v.winner === 'civilians';
    const reasons = {
      'mafia-caught': 'The mafia was voted out and the final guess failed.',
      'word-guessed': 'The caught mafia guessed the word and stole the win!',
      'last-two': 'Only two players remain — the mafia slips away.',
      'word-blurted': 'Someone said the word out loud — mafia wins instantly!'
    };
    $('#win-banner').innerHTML = '<div class="win-title ' + (civWin ? 'civ' : 'mafia') + '">' +
      (civWin ? '⚖️ Civilians win!' : '🔴 Mafia wins!') + '</div>' +
      '<div class="win-sub">' + (reasons[v.winReason] || '') + '</div>';
    $('#win-details').innerHTML =
      'The word was <b>' + escapeHtml(v.secretWord || '') + '</b><br>' +
      'Mafia: <b>' + (v.mafiaNames || []).map(escapeHtml).join(', ') + '</b>';
    $('#scoreboard').innerHTML = '';
    const isHost = v.room && v.room.hostId === S.playerId;
    $('#btn-rematch').classList.toggle('hidden', !isHost);
    $('#btn-rematch').textContent = '🔁 Rematch';
    $('#btn-rematch').onclick = function () { actAndRefresh('rematch'); };
    if (civWin) { Sfx.win(); Fx.celebrate(); } else { Sfx.mafiaReveal(); Fx.sinister(); }
  }

  /* ================= leave ================= */

  $('#btn-leave-room').addEventListener('click', function () {
    stopPolling();
    S.roomCode = null;
    S.playerId = null;
    lastPhase = null;
    show('online-home');
  });

  /* ================= boot ================= */

  (function () {
    const m = location.search.match(/room=([A-Za-z0-9]{4})/);
    if (m) $('#join-code').value = m[1].toUpperCase();
  })();

  global.Online = { openHome: openHome, state: S, refresh: refresh };
})(typeof window !== 'undefined' ? window : globalThis);
