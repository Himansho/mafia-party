/* Mafia Party — offline pass-and-play controller */
(function (global) {
  'use strict';
  const { $, $$, el, show, toast, haptic, avatarFor, escapeHtml } = global.UI;
  const Sfx = global.Sfx;
  const Fx = global.Fx;
  const Words = global.Words;
  const Game = global.Game;

  const state = {
    config: null,        // {count, names[], topicId, mafiaCount, timers, finalGuess}
    game: null,          // Game state (offline authoritative)
    dealIdx: 0,
    scores: {},          // name -> points
    roundNo: 1,
    voteOrder: [],
    voteIdx: 0,
    pendingVote: null,
    clueTimerRaf: 0,
    discInt: 0
  };

  /* ================= helpers ================= */

  function topicName(g) {
    const pack = Words.PACKS[g.concreteTopic];
    return pack.emoji + ' ' + pack.name;
  }

  function setSeg(sel, val) {
    $$(sel + ' button').forEach(function (b) {
      b.classList.toggle('on', String(b.dataset.v) === String(val));
    });
  }

  function getSeg(sel) {
    const on = $(sel + ' button.on');
    return on ? on.dataset.v : null;
  }

  function wireSeg(sel, cb) {
    $$(sel + ' button').forEach(function (b) {
      b.addEventListener('click', function () {
        setSeg(sel, b.dataset.v);
        Sfx.tap(); haptic();
        if (cb) cb(b.dataset.v);
      });
    });
  }

  function getCfg() {
    if (!state.config) {
      state.config = {
        count: 4,
        names: ['Ava', 'Ben', 'Cara', 'Dan'],
        topicId: 'mix',
        mafiaCount: 1,
        clueTimer: 10,
        discTimer: 60,
        finalGuess: true
      };
    }
    return state.config;
  }

  /* ================= navigation ================= */

  $$('.btn-icon[data-nav]').forEach(function (b) {
    b.addEventListener('click', function () { Sfx.tap(); show(b.dataset.nav); });
  });

  $('#btn-offline').addEventListener('click', function () { Sfx.select(); initSetup(); show('setup'); });
  $('#btn-online').addEventListener('click', function () { Sfx.select(); global.Online.openHome(); });
  $('#btn-howto').addEventListener('click', function () { Sfx.select(); renderHowto(); show('howto'); });
  $('#btn-settings').addEventListener('click', function () { Sfx.select(); show('settings'); });
  $('#btn-reset-data').addEventListener('click', function () {
    localStorage.clear();
    toast('All local data wiped 🗑️', 'ok');
    Sfx.error();
  });

  /* ================= setup screen ================= */

  function initSetup() {
    const cfg = getCfg();
    $('#player-count').value = cfg.count;
    updateCountLabel();
    renderNames();
    renderTopics();
    setSeg('#seg-mafia', cfg.mafiaCount);
    setSeg('#seg-clue-timer', cfg.clueTimer);
    setSeg('#seg-disc-timer', cfg.discTimer);
    setSeg('#seg-final-guess', cfg.finalGuess ? '1' : '0');
  }

  function updateCountLabel() {
    $('#setup-count').textContent = $('#player-count').value;
  }

  function renderNames() {
    const cfg = getCfg();
    const count = +$('#player-count').value;
    // grow/shrink stored names to match count
    while (cfg.names.length < count) cfg.names.push('');
    cfg.names.length = count;
    const list = $('#name-list');
    list.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const row = el('div', 'name-row');
      const nm = cfg.names[i] || '';
      const av = avatarFor(nm || ('P' + (i + 1)));
      const avEl = el('div', 'avatar', escapeHtml(av.initial));
      avEl.style.background = av.color + '2e';
      avEl.style.color = av.color;
      row.appendChild(avEl);
      const input = el('input', 'text-input');
      input.type = 'text'; input.maxLength = 12;
      input.placeholder = 'Player ' + (i + 1);
      input.value = nm;
      input.addEventListener('input', function () {
        cfg.names[i] = input.value;
        const a2 = avatarFor(input.value || ('P' + (i + 1)));
        avEl.textContent = a2.initial;
        avEl.style.background = a2.color + '2e';
        avEl.style.color = a2.color;
      });
      row.appendChild(input);
      const dice = el('button', 'shuffle-btn', '🎲');
      dice.title = 'Random name';
      dice.addEventListener('click', function () {
        input.value = global.UI.randomName();
        cfg.names[i] = input.value;
        const a2 = avatarFor(input.value);
        avEl.textContent = a2.initial;
        avEl.style.background = a2.color + '2n';
        avEl.style.background = a2.color + '2e';
        avEl.style.color = a2.color;
        Sfx.tap();
      });
      row.appendChild(dice);
      list.appendChild(row);
    }
  }

  function renderTopics() {
    const grid = $('#topic-grid');
    grid.innerHTML = 'n';
    grid.innerHTML = '';
    const cfg = getCfg();
    const topics = [{ id: 'mix', name: 'Mix', emoji: '🎲' }].concat(Words.TOPIC_IDS.map(function (t) {
      return { id: t, name: Words.PACKS[t].name, emoji: Words.PACKS[t].emoji };
    }));
    topics.forEach(function (t) {
      const c = el('div', 'topic-card' + (t.id === cfg.topicId ? ' sel' : ''));
      c.innerHTML = '<span class="t-emoji">' + t.emoji + '</span><span class="t-name">' + escapeHtml(t.name) + '</span>';
      c.addEventListener('click', function () {
        cfg.topicId = t.id;
        $$('#topic-grid .topic-card').forEach(function (x) { x.classList.remove('sel'); });
        c.classList.add('sel');
        Sfx.select(); haptic();
      });
      grid.appendChild(c);
    });
  }

  $('#player-count').addEventListener('input', function () {
    updateCountLabel();
    renderNames();
  });
  $('#players-minus').addEventListener('click', function () {
    const i = $('#player-count');
    if (+i.value > 3) {
      i.value = +i.value - 1;
      updateCountLabel(); renderNames(); Sfx.tap(); haptic();
    }
  });
  $('#players-plus').addEventListener('click', function () {
    const i = $('#player-count');
    if (+i.value < 20) {
      i.value = +i.value + 1;
      updateCountLabel(); renderNames(); Sfx.tap(); haptic();
    }
  });

  wireSeg('#seg-mafia', function (v) { getCfg().mafiaCount = +v; });
  wireSeg('#seg-clue-timer', function (v) { getCfg().clueTimer = +v; });
  wireSeg('#seg-disc-timer', function (v) { getCfg().discTimer = +v; });
  wireSeg('#seg-final-guess', function (v) { getCfg().finalGuess = v === '1'; });

  $('#btn-start-offline').addEventListener('click', startOfflineGame);

  function collectNames() {
    return $$('#name-list input').map(function (i, idx) {
      return i.value.trim() || ('Player ' + (idx + 1));
    });
  }

  function startOfflineGame() {
    const cfg = getCfg();
    cfg.count = +$('#player-count').value;
    cfg.names = collectNames();
    const dup = {};
    for (const n of cfg.names) {
      const k = n.toLowerCase();
      if (dup[k]) { toast('Duplicate name: ' + escapeHtml(n)); Sfx.error(); return; }
      dup[k] = true;
    }
    state.scores = {};
    cfg.names.forEach(function (n) { state.scores[n] = 0; });
    state.roundNo = 1;
    startRound();
  }

  function startRound() {
    const cfg = getCfg();
    const players = cfg.names.map(function (n, i) { return { id: 'p' + i, name: n }; });
    try {
      state.game = Game.createGame({
        players: players,
        topicId: cfg.topicId,
        mafiaCount: cfg.mafiaCount,
        finalGuess: cfg.finalGuess,
        rng: Math.random
      });
    } catch (e) {
      toast(e.message); Sfx.error(); return;
    }
    state.dealIdx = 0;
    renderDealCover();
    show('deal');
  }

  /* ================= deal phase ================= */

  function renderDealCover() {
    const g = state.game;
    const p = g.players[state.dealIdx];
    $('#deal-count').textContent = (state.dealIdx + 1) + ' of ' + g.players.length;
    $('#deal-name').textContent = p.name;
    $('#deal-cover').classList.remove('hidden');
    $('#deal-card').classList.add('hidden');
    resetHold();
  }

  function resetHold() {
    const btn = $('#btn-hold-reveal');
    btn.querySelector('.hold-fill').style.width = '0%';
    cancelAnimationFrame(btn._raf);
    btn._raf = 0;
  }

  // hold-to-reveal interaction
  (function wireHold() {
    const btn = $('#btn-hold-reveal');
    const fill = btn.querySelector('.hold-fill');
    const DURATION = 550;
    let raf = 0, start = 0, done = false;
    function step(ts) {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / DURATION);
      fill.style.width = (p * 100) + '%';
      if (p < 1) { raf = requestAnimationFrame(step); btn._raf = raf; }
      else if (!done) { done = true; doReveal(); }
    }
    function down(e) {
      e.preventDefault();
      done = false; start = 0;
      raf = requestAnimationFrame(step); btn._raf = raf;
    }
    function up() {
      if (done) return;
      cancelAnimationFrame(raf); btn._raf = 0;
      fill.style.width = '0%'; start = 0;
    }
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('pointercancel', up);
  })();

  function doReveal() {
    const g = state.game;
    const p = g.players[state.dealIdx];
    Game.markRevealed(g, p.id);
    haptic(30); Sfx.reveal();
    $('#deal-cover').classList.add('hidden');
    $('#deal-card').classList.remove('hidden');
    const card = $('#flip-card');
    card.classList.remove('flipped');
    void card.offsetWidth; // reflow to restart the animation
    const front = $('#flip-front');
    if (p.role === 'mafia') {
      const suspectsHtml = g.mafiaSuspects.map(function (w) {
        return '<span class="suspect">' + escapeHtml(w) + '</span>';
      }).join('');
      front.classList.add('mafia-card');
      front.innerHTML =
        '<div class="card-role red">🔴 You are the MAFIA</div>' +
        '<div class="card-topic">Topic: ' + escapeHtml(topicName(g)) + '</div>' +
        '<div class="suspects-label">The word is ONE of these:</div>' +
        '<div class="suspects">' + suspectsHtml + '</div>' +
        '<div class="card-foot">Bluff your clue. Don\'t get caught.</div>';
    } else {
      front.classList.remove('mafia-card');
      front.innerHTML =
        '<div class="card-role gold">YOUR WORD</div>' +
        '<div class="card-word">' + escapeHtml(g.secretWord) + '</div>' +
        '<div class="card-topic">Topic: ' + escapeHtml(topicName(g)) + '</div>' +
        '<div class="card-foot">Say ONE word as your clue. Never the word itself.</div>';
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { card.classList.add('flipped'); });
    });
    const isLast = state.dealIdx === g.players.length - 1;
    $('#btn-deal-next').classList.toggle('hidden', isLast);
    $('#btn-deal-finish').classList.toggle('hidden', !isLast);
  }

  $('#btn-deal-next').addEventListener('click', function () {
    Sfx.tap();
    state.dealIdx++;
    renderDealCover();
  });

  $('#btn-deal-finish').addEventListener('click', function () {
    Sfx.select(); haptic(20);
    Game.beginClues(state.game);
    renderClueScreen();
    show('clue');
  });

  /* ================= clue phase ================= */

  function renderClueScreen() {
    const g = state.game;
    $('#clue-topic').textContent = topicName(g);
    $('#clue-round').textContent = 'Round ' + state.roundNo;
    renderSpeaker();
    renderClueProgress();
    startClueTimer(getCfg().clueTimer);
  }

  function renderSpeaker() {
    const g = state.game;
    const pid = Game.nextSpeaker(g);
    const p = pid ? Game.playerById(g, pid) : null;
    $('#speaker-name').textContent = p ? p.name : '…';
    const last = g.speakerIdx >= g.speakingOrder.length - 1;
    $('#btn-clue-done').textContent = last ? 'Done — to discussion 💬' : 'Done — next speaker →';
  }

  function renderClueProgress() {
    const g = state.game;
    const wrap = $('#clue-progress');
    wrap.innerHTML = '';
    g.speakingOrder.forEach(function (pid, i) {
      const p = Game.playerById(g, pid);
      const chip = el('span', 'clue-chip' + (i === g.speakerIdx ? ' current' : ''));
      chip.innerHTML = '<span class="who">' + escapeHtml(p.name) + '</span>' +
        (p.clue ? ' → ' + escapeHtml(p.clue) : '');
      wrap.appendChild(chip);
    });
  }

  function startClueTimer(seconds) {
    cancelAnimationFrame(state.clueTimerRaf);
    const ring = $('#clue-ring');
    const num = $('#clue-timer-num');
    const CIRC = 2 * Math.PI * 45;
    if (!seconds) { ring.style.display = 'none'; num.classList.add('hidden'); return; }
    ring.style.display = '';
    num.classList.remove('hidden');
    const end = Date.now() + seconds * 1000;
    function step() {
      const left = Math.max(0, end - Date.now());
      const frac = left / (seconds * 1000);
      ring.style.strokeDasharray = CIRC;
      ring.style.strokeDashoffset = CIRC * (1 - frac);
      ring.style.stroke = frac > .5 ? 'var(--gold)' : frac > .25 ? '#ffae42' : 'var(--red)';
      num.textContent = Math.ceil(left / 1000);
      if (left > 0) state.clueTimerRaf = requestAnimationFrame(step);
    }
    step();
  }

  // The clue word is spoken aloud; the app advances the speaker on "Done".
  $('#btn-clue-done').addEventListener('click', function () {
    const g = state.game;
    const pid = Game.nextSpeaker(g);
    if (pid == null) return finishClues();
    let res;
    try { res = Game.giveClue(g, pid, '·'); }
    catch (e) { toast(e.message); Sfx.error(); return; }
    if (res.finished) return finishClues();
    renderSpeaker();
    renderClueProgress();
    startClueTimer(getCfg().clueTimer);
    Sfx.tap(); haptic(8);
  });

  function finishClues() {
    cancelAnimationFrame(state.clueTimerRaf);
    Game.beginDiscussion(state.game);
    renderDiscussion();
    show('discussion');
    Sfx.select();
  }

  /* ================= discussion ================= */

  function renderDiscussion() {
    const g = state.game;
    const recap = $('#clue-recap');
    recap.innerHTML = '';
    g.clues.forEach(function (c) {
      const p = Game.playerById(g, c.playerId);
      const chip = el('span', 'clue-chip');
      chip.innerHTML = '<span class="who">' + escapeHtml(p.name) + ':</span> ' + escapeHtml(c.word);
      recap.appendChild(chip);
    });
    startDiscTimer(getCfg().discTimer);
  }

  function startDiscTimer(seconds) {
    clearInterval(state.discInt);
    const wrap = $('#disc-timer-wrap');
    const bar = $('#disc-timer-bar');
    const num = $('#disc-timer-num');
    if (!seconds) { wrap.classList.add('off'); return; }
    wrap.classList.remove('off');
    let left = seconds;
    bar.style.width = '100%';
    num.textContent = left;
    state.discInt = setInterval(function () {
      left--;
      num.textContent = Math.max(0, left);
      bar.style.width = (Math.max(0, left) / seconds * 100) + '%';
      if (left <= 0) clearInterval(state.discInt);
    }, 1000);
    clearTimeout(state.discTimeout);
    state.discTimeout = setTimeout(function () {
      if (global.UI.screen() === 'discussion') {
        toast('⏰ Time\'s up — vote!');
        Sfx.error(); haptic(40);
      }
    }, seconds * 1000);
  }

  $('#btn-begin-vote').addEventListener('click', function () {
    clearInterval(state.discInt);
    clearTimeout(state.discTimeout);
    Sfx.select(); haptic(20);
    Game.beginVote(state.game);
    startSequentialBallot();
    show('vote');
  });

  /* ================= vote phase (sequential ballot) ================= */

  function startSequentialBallot() {
    const g = state.game;
    state.voteOrder = g.players.filter(function (p) { return p.alive; }).map(function (p) { return p.id; });
    state.voteIdx = 0;
    renderVoteCover();
  }

  function renderVoteCover() {
    const g = state.game;
    const pid = state.voteOrder[state.voteIdx];
    const p = Game.playerById(g, pid);
    $('#vote-pass-name').textContent = p.name;
    $('#vote-pass-who').textContent = p.name;
    $('#vote-cover').classList.remove('hidden');
    $('#vote-ballot').classList.add('hidden');
  }

  $('#btn-vote-ready').addEventListener('click', function () {
    Sfx.tap();
    $('#vote-cover').classList.add('hidden');
    $('#vote-ballot').classList.remove('hidden');
    renderBallot();
  });

  function renderBallot() {
    const g = state.game;
    const voter = state.voteOrder[state.voteIdx];
    const grid = $('#vote-grid');
    grid.innerHTML = '';
    const others = g.players.filter(function (p) { return p.alive && p.id !== voter; });
    grid.classList.toggle('one-col', others.length > 6);
    others.forEach(function (p) {
      const av = avatarFor(p.name);
      const card = el('div', 'vote-card');
      card.innerHTML =
        '<div class="v-avatar" style="background:' + av.color + '2e;color:' + av.color + '">' + escapeHtml(av.initial) + '</div>' +
        '<div class="v-name">' + escapeHtml(p.name) + '</div>';
      card.addEventListener('click', function () {
        $$('#vote-grid .vote-card').forEach(function (x) { x.classList.remove('sel'); });
        card.classList.add('sel');
        state.pendingVote = p.id;
        $('#vote-confirm-name').textContent = p.name;
        $('#vote-confirm').classList.remove('hidden');
        Sfx.select(); haptic();
      });
      grid.appendChild(card);
    });
    $('#vote-confirm').classList.add('hidden');
    state.pendingVote = null;
  }

  $('#btn-vote-confirm').addEventListener('click', function () {
    const g = state.game;
    const voter = state.voteOrder[state.voteIdx];
    if (!state.pendingVote) return;
    let res;
    try { res = Game.castVote(g, voter, state.pendingVote); }
    catch (e) { toast(e.message); Sfx.error(); return; }
    Sfx.vote(); haptic(18);
    state.voteIdx++;
    if (state.voteIdx >= state.voteOrder.length) {
      renderTally(res);
    } else {
      renderVoteCover();
    }
  });

  $('#btn-vote-change').addEventListener('click', function () {
    state.pendingVote = null;
    $('#vote-confirm').classList.add('hidden');
    Sfx.tap();
  });

  function renderTally(res) {
    const g = state.game;
    show('reveal');
    const wrap = $('#tally');
    wrap.innerHTML = '';
    const counts = res.counts || {};
    const maxVotes = Math.max(1, ...Object.values(counts));
    const need = res.need;
    g.players.forEach(function (p) {
      if (!p.alive) return;
      const c = counts[p.id] || 0;
      const row = el('div', 'tally-row');
      row.innerHTML =
        '<span class="t-name">' + escapeHtml(p.name) + (c >= need ? ' ⚖️' : '') + '</span>' +
        '<span class="t-bar" style="width:' + Math.max(6, (c / maxVotes) * 140) + 'px"></span>' +
        '<span class="t-count">' + c + '</span>';
      wrap.appendChild(row);
    });
    const rr = $('#reveal-result');
    if (res.eliminated) {
      const p = Game.playerById(g, res.eliminated);
      rr.innerHTML = '<div class="rr-elim">' + escapeHtml(p.name) + ' is eliminated!</div>' +
        '<div class="rr-role ' + p.role + '">' + (p.role === 'mafia' ? '🔴 MAFIA!' : '⭕ Civilian') + '</div>' +
        '<div class="rr-sub">' + need + '+ votes needed · got ' + (counts[res.eliminated] || 0) + '</div>';
      if (p.role === 'mafia') Sfx.mafiaReveal(); else Sfx.error();
    } else {
      rr.innerHTML = '<div class="rr-elim">No strict majority — nobody eliminated!</div>' +
        '<div class="rr-sub">' + need + '+ votes on one player needed. The game continues…</div>';
      Sfx.error();
    }
    rr.classList.remove('hidden');
    $('#tally').classList.remove('hidden');
    $('#final-guess').classList.add('hidden');
    $('#btn-continue').classList.remove('hidden');
    $('#btn-continue').textContent = 'Continue →';
  }

  /* ================= final guess & win ================= */

  $('#btn-continue').addEventListener('click', function () {
    const g = state.game;
    let rres = null;
    try { rres = Game.resolveElimination(g); }
    catch (e) { toast(e.message); return; }
    if (g.phase === 'win') { renderWin(); return; }
    if (rres && rres.pendingFinalGuess) { renderFinalGuess(); return; }
    // back to clues for the survivors
    renderClueScreen();
    show('clue');
  });

  function renderFinalGuess() {
    const g = state.game;
    const options = Game.shuffle(g.decoys.concat([g.secretWord]));
    $('#reveal-result').classList.add('hidden');
    $('#tally').classList.add('hidden');
    $('#btn-continue').classList.add('hidden');
    const fg = $('#final-guess');
    fg.classList.remove('hidden');
    const wrap = $('#fg-options');
    wrap.innerHTML = '';
    options.forEach(function (w) {
      const b = el('button', '', escapeHtml(w));
      b.addEventListener('click', function () {
        Game.resolveFinalGuess(g, w);
        const correct = g.finalGuessResult === 'correct';
        b.classList.add(correct ? 'correct-flash' : 'wrong-flash');
        wrap.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
        if (correct) { Sfx.win(); Fx.celebrate(); }
        else { Sfx.mafiaReveal(); Fx.sinister(); }
        setTimeout(renderWin, 1500);
      });
      wrap.appendChild(b);
    });
    Sfx.reveal();
  }

  function renderWin() {
    const g = state.game;
    show('win');
    $('#final-guess').classList.add('hidden');
    const civWin = g.winner === 'civilians';
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
      '<div class="win-sub">' + escapeHtml(reasons[g.winReason] || '') + '</div>';
    const mafiaPlayers = g.players.filter(function (p) { return p.role === 'mafia'; });
    $('#win-details').innerHTML =
      'The word was <b>' + escapeHtml(g.secretWord) + '</b> · Topic: ' + escapeHtml(topicName(g)) + '<br>' +
      'Mafia: <b>' + mafiaPlayers.map(function (p) { return escapeHtml(p.name); }).join(', ') + '</b>';
    g.players.forEach(function (p) {
      const onWinningSide = (p.role === 'mafia') === (g.winner === 'mafia');
      if (onWinningSide) state.scores[p.name] = (state.scores[p.name] || 0) + 1;
    });
    renderScoreboard();
    if (civWin) { Sfx.win(); Fx.celebrate(); } else { Sfx.mafiaReveal(); Fx.sinister(); }
  }

  function renderScoreboard() {
    const g = state.game;
    const wrap = $('#scoreboard');
    wrap.innerHTML = '';
    Object.entries(state.scores)
      .sort(function (a, b) { return b[1] - a[1]; })
      .forEach(function (e, i) {
        const p = g.players.find(function (x) { return x.name === e[0]; }) || {};
        const row = el('div', 'score-row');
        row.innerHTML =
          '<span class="s-rank">' + (i + 1) + '</span>' +
          '<span class="s-name">' + escapeHtml(e[0]) + '</span>' +
          '<span class="s-role ' + (p.role || 'civilian') + '">' + (p.role === 'mafia' ? '🎩 mafia' : '⭕ civ') + '</span>' +
          '<span class="s-pts">' + e[1] + '</span>';
        wrap.appendChild(row);
      });
  }

  /* ================= howto ================= */

  const HOWTO_SLIDES = [
    { emoji: '🎩', title: 'The Setup', body: 'Everyone gets the same <b>secret word</b> from a topic… except the <b>Mafia</b>, who sees only the topic and <b>4 suspects</b> — one of which is the real word.' },
    { emoji: '🗣️', title: 'Give Clues', body: 'Going around the circle, each player says <b>one word</b> as a clue. The Mafia must bluff a clue without knowing the word!' },
    { emoji: '💬', title: 'Discuss & Accuse', body: 'Talk it out. Whose clue was suspiciously vague? Interrogate everyone!' },
    { emoji: '🗳️', title: 'Vote', body: 'A <b>strict majority</b> eliminates a player. Catch the Mafia to win — or the Mafia survives to the final 2 and wins.' }
  ];
  let howtoIdx = 0;

  function renderHowto() {
    const wrap = $('#howto-slides');
    wrap.innerHTML = '';
    const s = HOWTO_SLIDES[howtoIdx];
    const slide = el('div', 'howto-slide');
    slide.innerHTML =
      '<span class="big-emoji">' + s.emoji + '</span>' +
      '<h3>' + escapeHtml(s.title) + '</h3>' +
      '<p>' + s.body + '</p>';
    wrap.appendChild(slide);
    const dots = $('#howto-dots');
    dots.innerHTML = '';
    HOWTO_SLIDES.forEach(function (_, i) {
      dots.appendChild(el('i', i === howtoIdx ? 'on' : ''));
    });
  }

  $('#btn-howto-prev').addEventListener('click', function () {
    howtoIdx = Math.max(0, howtoIdx - 1); Sfx.tap(); renderHowto();
  });
  $('#btn-howto-next').addEventListener('click', function () {
    if (howtoIdx < HOWTO_SLIDES.length - 1) { howtoIdx++; Sfx.tap(); renderHowto(); }
    else { howtoIdx = 0; show('home'); }
  });

  /* ================= settings ================= */

  const settings = global.UI.loadSettings();
  setSeg('#seg-sound', settings.sound ? '1' : '0');
  setSeg('#seg-haptics', settings.haptics ? '1' : '0');
  Sfx.setEnabled(settings.sound);
  global.UI.setHaptics(settings.haptics);
  wireSeg('#seg-sound', function (v) {
    const s = global.UI.loadSettings();
    s.sound = v === '1';
    global.UI.saveSettings(s);
    Sfx.setEnabled(s.sound);
  });
  wireSeg('#seg-haptics', function (v) {
    const s = global.UI.loadSettings();
    s.haptics = v === '1';
    global.UI.saveSettings(s);
    global.UI.setHaptics(s.haptics);
  });

  /* ================= rematch / new game ================= */

  $('#btn-rematch').addEventListener('click', function () {
    Sfx.select(); haptic(20);
    state.roundNo++;
    startRound();
  });
  $('#btn-new-game').addEventListener('click', function () {
    Sfx.select();
    initSetup();
    show('setup');
  });
  $('#btn-win-home').addEventListener('click', function () { Sfx.tap(); show('home'); });

  /* ================= PWA install prompt ================= */

  let deferredPrompt = null;
  addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    $('#btn-install').classList.remove('hidden');
  });
  $('#btn-install').addEventListener('click', function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () {
      $('#btn-install').classList.add('hidden');
      deferredPrompt = null;
    });
  });

  /* ================= boot ================= */

  renderHowto();
  show('home');
  global.Offline = { state: state, startRound: startRound };
})(typeof window !== 'undefined' ? window : globalThis);
