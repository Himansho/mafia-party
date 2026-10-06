/* Mafia Party — online room client.
 * Transport: SSE (server→client push) + POST /api/room/:code/act (client→server).
 * Zero dependencies. Auto-reconnect built into EventSource.
 */
(function (global) {
  'use strict';
  const { $, $$, el, show, toast, haptic, avatarFor, escapeHtml } = global.UI;
  const Sfx = global.Sfx;
  const Fx = global.Fx;
  const Words = global.Words;
  const Game = global.Game;

  const S = {
    playerId: null,
    roomCode: null,
    playerName: null,
    es: null,
    lastView: null,
    revealedThisPhase: false
  };
  const LS_KEY = 'mafia-online-session';

  /* ================= api helpers ================= */

  async function post(action, data) {
    const body = Object.assign({ playerId: S.playerId, action: action }, data || {});
    const res = await fetch('/api/room/' + S.roomCode + '/act', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    let json = {};
    try { json = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) throw new Error(json.error || ('HTTP ' + res.status));
    return json;
  }

  function topicLabel(t) {
    const pack = Words.PACKS[t];
    return pack ? pack.emoji + ' ' + pack.name : t;
  }

  function nameById(view, id) {
    const p = view.players.find(function (p2) { return p2.id === id; });
    return p ? p.name : '…';
  }

  /* ================= entry points ================= */

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
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
      }).then(function (r) { return r.json(); });
      if (res.error) throw new Error(res.error);
      enterRoom(res.roomCode, res.playerId, name);
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
      const res = await fetch('/api/rooms/' + code + '/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
      }).then(function (r) { return r.json(); });
      if (res.error) throw new Error(res.error);
      enterRoom(res.roomCode, res.playerId, name);
    } catch (e) {
      toast('Could not join: ' + e.message, 'err');
      Sfx.error();
    }
  });

  function enterRoom(code, playerId, name) {
    S.roomCode = code;
    S.playerId = playerId;
    S.playerName = name;
    localStorage.setItem(LS_KEY, JSON.stringify({ name: name, code: code, playerId: playerId }));
    connectSSE();
    show('lobby');
  }

  /* ================= SSE connection ================= */

  function connectSSE() {
    if (S.es) { S.es.close(); S.es = null; }
    const es = new EventSource('/api/room/' + S.roomCode + '/events?playerId=' + encodeURIComponent(S.playerId));
    S.es = es;
    es.addEventListener('state', function (ev) {
      let payload;
      try { payload = JSON.parse(ev.data); } catch (e) { return; }
      handleState(payload);
    });
    es.addEventListener('kicked', function () {
      toast('You were removed from the room');
      leaveRoom(false);
    });
    es.onopen = function () { discoBanner(false); };
    es.onerror = function () { if (S.es) discoBanner(true); };
  }

  let discoEl = null;
  function discoBanner(on) {
    if (on && !discoEl) {
      discoEl = el('div', 'disco-band', '⚠ Connection lost — reconnecting…');
      document.body.appendChild(discoEl);
    } else if (!on && discoEl) {
      discoEl.remove(); discoEl = null;
    }
  }

  function leaveRoom(callServer) {
    if (callServer) post('leave', {}).catch(function () {});
    if (S.es) { S.es.close(); S.es = null; }
    S.roomCode = null; S.playerId = null;
    discoBanner(false);
    show('home');
  }

  /* ================= state dispatch ================= */

  function handleState(view) {
    if (!view || !view.room) return;
    S.lastView = view;
    const phase = view.room.phase;
    if (phase === 'lobby') renderLobby(view);
    else if (phase === 'dealing') renderDeal(view);
    else if (phase === 'clues') renderClues(view);
    else if (phase === 'discussion') renderDiscussion(view);
    else if (phase === 'vote') renderVote(view);
    else if (phase === 'reveal') renderReveal(view);
    else if (phase === 'win') renderWin(view);
  }

  /* ================= lobby ================= */

  function renderLobby(view) {
    const room = view.room;
    show('lobby');
    $('#room-code').textContent = room.code;
    const list = $('#lobby-list');
    list.innerHTML = '';
    room.players.forEach(function (p) {
      const av = avatarFor(p.name);
      const row = el('div', 'lobby-row' + (p.id === S.playerId ? ' me' : '') + (p.connected ? '' : ' disconnected'));
      row.innerHTML =
        '<div class="avatar" style="background:' + av.color + '2e;color:' + av.color + '">' + escapeHtml(av.initial) + '</div>' +
        '<span class="l-name">' + escapeHtml(p.name) + (p.id === S.playerId ? ' (you)' : '') + '</span>' +
        (p.isHost ? '<span class="host-badge">HOST</span>' : '');
      list.appendChild(row);
    });
    $('#lobby-count').textContent = room.players.length;
    const isHost = room.hostId === S.playerId;
    const topicRow = $('#lobby-topic-row');
    if (isHost) {
      topicRow.innerHTML = '<div class="field-label" style="text-align:center;width:100%">Topic</div>';
      const wrap = el('div', 'topic-choose-row');
      const topics = [{ id: 'mix', label: '🎲 Mix' }].concat(Words.TOPIC_IDS.map(function (t) {
        return { id: t, label: Words.PACKS[t].emoji + ' ' + Words.PACKS[t].name };
      }));
      topics.forEach(function (t) {
        const chip = el('div', 't-chip' + (room.topicId === t.id ? ' on' : ''), escapeHtml(t.label));
        chip.addEventListener('click', function () {
          post('setTopic', { topicId: t.id }).catch(function (e) { toast(e.message, 'err'); });
        });
        wrap.appendChild(chip);
      });
      topicRow.appendChild(wrap);
    } else {
      topicRow.innerHTML = '';
    }
    const canStart = isHost && room.players.length >= Game.MIN_PLAYERS;
    $('#btn-online-start').classList.toggle('hidden', !isHost);
    $('#btn-online-start').disabled = !canStart;
    $('#lobby-hint').textContent = isHost
      ? (room.players.length < 3 ? 'Need at least 3 players to start.' : 'Ready when you are!')
      : 'Waiting for the host to start…';
  }

  $('#btn-share-room').addEventListener('click', function () {
    const url = location.origin + '/?room=' + S.roomCode;
    if (navigator.share) {
      navigator.share({ title: 'Mafia Party', text: 'Join my Mafia Party room!', url: url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () { toast('Link copied 📋', 'ok'); });
    } else {
      toast(url);
    }
  });

  $('#btn-online-start').addEventListener('click', async function () {
    try { await post('start', {}); } catch (e) { toast(e.message, 'err'); Sfx.error(); }
  });

  $('#btn-leave-room').addEventListener('click', function () { leaveRoom(true); });

  /* ================= in-game: deal ================= */

  function renderDeal(view) {
    show('deal');
    const room = view.room;
    // track "revealed" per phase
    if (view.roundStamp !== S.lastRoundStamp) {
      S.lastRoundStamp = view.roundStamp;
      S.revealedThisPhase = false;
    }
    const card = view.card || {};
    const revealed = !!card.revealed || S.revealedThisPhase;
    $('#deal-cover').classList.add('hidden');
    $('#deal-card').classList.remove('hidden');
    const flip = $('#flip-card');
    const front = $('#flip-front');
    if (card.role === 'mafia') {
      const suspectsHtml = (card.suspects || []).map(function (w) {
        return '<span class="suspect">' + escapeHtml(w) + '</span>';
      }).join('');
      front.classList.add('mafia-card');
      front.innerHTML =
        '<div class="card-role red">🔴 You are the MAFIA</div>' +
        '<div class="card-topic">Topic: ' + escapeHtml(topicLabel(card.topic)) + '</div>' +
        '<div class="suspects-label">The word is ONE of these:</div>' +
        '<div class="suspects">' + suspectsHtml + '</div>';
    } else if (card.word) {
      front.classList.remove('mafia-card');
      front.innerHTML =
        '<div class="card-role gold">YOUR WORD</div>' +
        '<div class="card-word">' + escapeHtml(card.word) + '</div>' +
        '<div class="card-topic">Topic: ' + escapeHtml(topicLabel(card.topic)) + '</div>';
    }
    if (revealed) {
      flip.classList.add('flipped');
      $('#deal-actions').innerHTML = '<p class="hint-sub">Waiting for everyone to reveal… (' +
        (room.revealedCount || 0) + '/' + room.players.length + ')</p>';
    } else {
      flip.classList.remove('flipped');
      $('#deal-actions').innerHTML =
        '<button class="btn btn-primary btn-big" id="btn-online-reveal">Tap to reveal 🔒</button>';
      $('#btn-online-reveal').addEventListener('click', function () {
        S.revealedThisPhase = true;
        post('revealed', {}).catch(function (e) { toast(e.message, 'err'); });
        flip.classList.add('flipped');
        Sfx.reveal(); haptic(30);
      });
    }
  }

  /* ================= in-game: clues ================= */

  function renderClues(view) {
    show('clue');
    $('#clue-topic').textContent = topicLabel(view.concreteTopic);
    $('#clue-round').textContent = 'Round ' + (view.roundNo || 1);
    const currentId = view.speakingOrder[view.speakerIdx];
    const isMyTurn = currentId === S.playerId;
    $('#speaker-name').textContent = nameById(view, currentId);
    document.querySelector('.speaker-instruction').innerHTML = isMyTurn
      ? 'Say <b>one word</b> as your clue — out loud!'
      : 'Listen… <b>' + escapeHtml(nameById(view, currentId)) + '</b> is giving a clue.';
    $('#clue-ring').style.display = 'none';
    $('#clue-timer-num').classList.add('hidden');
    $('#btn-clue-done').classList.toggle('hidden', !isMyTurn);
    if (isMyTurn) $('#btn-clue-done').textContent = 'I said my clue — next →';
    renderClueChips(view);
  }

  function renderClueChips(view) {
    const wrap = $('#clue-progress');
    wrap.innerHTML = '';
    const clues = view.clues || [];
    (view.speakingOrder || []).forEach(function (pid) {
      const clueObj = clues.filter(function (c) { return c.playerId === pid; })[0];
      const isCurrent = pid === view.speakingOrder[view.speakerIdx];
      const chip = el('span', 'clue-chip' + (isCurrent ? ' current' : ''));
      chip.innerHTML = '<span class="who">' + escapeHtml(nameById(view, pid)) + '</span>' +
        (clueObj ? ' → ' + escapeHtml(clueObj.word) : '');
      wrap.appendChild(chip);
    });
  }

  $('#btn-clue-done').addEventListener('click', function () {
    if (!S.roomCode) return; // offline mode has its own handler
    if (!S.lastView || S.lastView.room.phase !== 'clues') return;
    post('clue', {}).catch(function (e) { toast(e.message, 'err'); });
  });

  /* ================= in-game: discussion ================= */

  function renderDiscussion(view) {
    show('discussion');
    $('#disc-timer-wrap').classList.add('off');
    const recap = $('#clue-recap');
    recap.innerHTML = '';
    (view.clues || []).forEach(function (c) {
      const chip = el('span', 'clue-chip');
      chip.innerHTML = '<span class="who">' + escapeHtml(nameById(view, c.playerId)) + ':</span> ' + escapeHtml(c.word);
      recap.appendChild(chip);
    });
    $('#btn-begin-vote').textContent = '🗳️ Everyone vote';
  }

  $('#btn-begin-vote').addEventListener('click', async function () {
    if (!S.roomCode) return;
    if (!S.lastView || S.lastView.room.phase !== 'discussion') return;
    try { await post('beginVote', {}); } catch (e) { toast(e.message, 'err'); }
  });

  /* ================= in-game: vote ================= */

  let pendingTarget = null;

  function renderVote(view) {
    show('vote');
    $('#vote-cover').classList.add('hidden');
    $('#vote-ballot').classList.remove('hidden');
    const vp = view.voteProgress || { cast: 0, total: '?' };
    $('#vote-prompt').innerHTML = 'Who is the Mafia? <span class="mini">(' +
      vp.cast + '/' + vp.total + ' locked)</span>';
    const myVote = view.myVote || null;
    const grid = $('#vote-grid');
    grid.innerHTML = '';
    const alive = view.players.filter(function (p) { return p.alive && p.id !== S.playerId; });
    grid.classList.toggle('one-col', alive.length > 6);
    alive.forEach(function (p) {
      const av = avatarFor(p.name);
      const cardEl = el('div', 'vote-card' + (myVote === p.id ? ' sel' : ''));
      cardEl.innerHTML =
        '<div class="v-avatar" style="background:' + av.color + '2e;color:' + av.color + '">' + escapeHtml(av.initial) + '</div>' +
        '<div class="v-name">' + escapeHtml(p.name) + '</div>';
      cardEl.addEventListener('click', function () {
        if (myVote) return;
        pendingTarget = p.id;
        $('#vote-confirm-name').textContent = p.name;
        $('#vote-confirm').classList.remove('hidden');
        Sfx.select(); haptic();
      });
      grid.appendChild(cardEl);
    });
    if (myVote) {
      $('#vote-confirm').classList.remove('hidden');
      $('#vote-confirm p').innerHTML = '🔒 Your vote for <b>' + escapeHtml(nameById(view, myVote)) + '</b> is locked. Waiting for others…';
      $('#btn-vote-confirm').classList.add('hidden');
      $('#btn-vote-change').classList.add('hidden');
    } else {
      $('#vote-confirm').classList.add('hidden');
      $('#btn-vote-confirm').classList.remove('hidden');
      $('#btn-vote-change').classList.remove('hidden');
    }
  }

  $('#btn-vote-confirm').addEventListener('click', async function () {
    if (!S.roomCode || !pendingTarget) return;
    try {
      await post('vote', { targetId: pendingTarget });
      Sfx.vote(); haptic(18);
    } catch (e) { toast(e.message, 'err'); }
  });

  $('#btn-vote-change').addEventListener('click', function () {
    if (!S.roomCode) return;
    pendingTarget = null;
    $('#vote-confirm').classList.add('hidden');
    Sfx.tap();
  });

  /* ================= in-game: reveal ================= */

  function renderReveal(view) {
    show('reveal');
    const tally = view.tally || {};
    const need = view.voteNeed || 0;
    const maxVotes = Math.max(1, ...(Object.values(tally).length ? Object.values(tally) : [1]));
    const wrap = $('#tally');
    wrap.innerHTML = '';
    view.players.forEach(function (p) {
      if (!p.alive && p.id !== view.eliminatedId) return;
      const c = tally[p.id] || 0;
      const row = el('div', 'tally-row');
      row.innerHTML =
        '<span class="t-name">' + escapeHtml(p.name) + (p.alive ? '' : ' <span class="mini">(out)</span>') + '</span>' +
        '<span class="t-bar" style="width:' + Math.max(6, (c / maxVotes) * 140) + 'px"></span>' +
        '<span class="t-count">' + c + '</span>';
      wrap.appendChild(row);
    });
    const rr = $('#reveal-result');
    rr.classList.remove('hidden');
    $('#final-guess').classList.add('hidden');
    $('#btn-continue').classList.add('hidden');
    if (view.eliminatedId) {
      const p = view.players.find(function (p2) { return p2.id === view.eliminatedId; });
      const role = view.eliminatedRole;
      rr.innerHTML = '<div class="rr-elim">' + escapeHtml(p ? p.name : '?') + ' is eliminated!</div>' +
        '<div class="rr-role ' + role + '">' + (role === 'mafia' ? '🔴 MAFIA!' : '⭕ Civilian') + '</div>' +
        '<div class="rr-sub">Majority needed: ' + need + '</div>';
      if (role === 'mafia') Sfx.mafiaReveal(); else Sfx.error();
      if (view.card && view.card.finalGuess) {
        renderFinalGuessUI(view);
      } else {
        $('#btn-continue').classList.remove('hidden');
        $('#btn-continue').textContent = 'Continue →';
        $('#btn-continue').onclick = async function () {
          try { await post('continue', {}); } catch (e) { toast(e.message, 'err'); }
        };
      }
    } else {
      rr.innerHTML = '<div class="rr-elim">No strict majority — nobody eliminated!</div>' +
        '<div class="rr-sub">' + need + '+ votes on one player needed. Continuing…</div>';
      Sfx.error();
      $('#btn-continue').classList.remove('hidden');
      $('#btn-continue').textContent = 'Next round of clues →';
      $('#btn-continue').onclick = async function () {
        try { await post('continue', {}); } catch (e) { toast(e.message, 'err'); }
      };
    }
  }

  function renderFinalGuessUI(view) {
    $('#reveal-result').classList.add('hidden');
    $('#tally').classList.add('hidden');
    const fg = $('#final-guess');
    fg.classList.remove('hidden');
    const wrap = $('#fg-options');
    wrap.innerHTML = '';
    const options = Game.shuffle(view.card.finalGuess.options);
    options.forEach(function (w) {
      const b = el('button', '', escapeHtml(w));
      b.addEventListener('click', async function () {
        wrap.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
        try {
          const res = await post('finalGuess', { guess: w });
          const correct = !!(res && res.correct);
          b.classList.add(correct ? 'correct-flash' : 'wrong-flash');
          if (correct) { Sfx.win(); Fx.celebrate(); } else { Sfx.mafiaReveal(); Fx.sinister(); }
        } catch (e) { toast(e.message, 'err'); }
      });
      wrap.appendChild(b);
    });
    Sfx.reveal();
  }

  /* ================= in-game: win ================= */

  function renderWin(view) {
    show('win');
    const civWin = view.winner === 'civilians';
    const banner = $('#win-banner');
    banner.className = 'win-banner ' + (civWin ? 'civ' : 'maf');
    const reasons = {
      'mafia-caught': 'The mafia was caught red-handed.',
      'word-guessed': 'The mafia guessed the word — steal successful!',
      'last-two': 'The mafia outlasted everyone. Sinister.',
      'word-blurted': 'A civilian blurted the word — civilians win.'
    };
    banner.innerHTML =
      '<div class="win-title">' + (civWin ? '🏆 CIVILIANS WIN' : '🎩 MAFIA WINS') + '</div>' +
      '<div class="win-sub">' + escapeHtml(reasons[view.winReason] || '') + '</div>';
    $('#win-details').innerHTML =
      'The word was <b>' + escapeHtml(view.secretWord || '') + '</b><br>' +
      'Mafia: <b>' + (view.mafiaNames || []).map(escapeHtml).join(', ') + '</b>';
    // rematch: host sees the button, everyone sees a hint
    $('#btn-rematch').textContent = '🔁 Rematch';
    $('#btn-rematch').onclick = async function () {
      try { await post('rematch', {}); } catch (e) { toast(e.message, 'err'); }
    };
    if (civWin) { Sfx.win(); Fx.celebrate(); } else { Sfx.mafiaReveal(); Fx.sinister(); }
  }

  /* ================= boot: deep link (?room=CODE) ================= */

  function bootDeepLink() {
    const m = location.search.match(/room=([A-Za-z0-9]{4})/);
    if (!m) return;
    const code = m[1].toUpperCase();
    openHome();
    $('#join-code').value = code;
  }
  bootDeepLink();

  global.Online = { openHome: openHome, state: S, post: post };
})(typeof window !== 'undefined' ? window : globalThis);
