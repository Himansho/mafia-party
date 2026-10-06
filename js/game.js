/* Mafia Party — pure game logic (no DOM, no network).
 * Shared by the offline app and the server (CommonJS + global).
 * State machine: lobby → dealing → clues → discussion → vote → reveal → win
 */
(function (global) {
  'use strict';

  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 20;

  /* ---------- helpers ---------- */

  function shuffle(arr, rng) {
    const r = rng || Math.random;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  /* ---------- state creation ---------- */

  /** Create a fresh game. cfg: { players: [{id,name}], topicId, mafiaCount, finalGuess } */
  function createGame(cfg) {
    const players = cfg.players.map(function (p) {
      return { id: p.id, name: p.name, alive: true, role: null, clue: null, vote: null };
    });
    if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
      throw new Error('Player count must be between ' + MIN_PLAYERS + ' and ' + MAX_PLAYERS);
    }
    const mafiaWanted = clamp(cfg.mafiaCount || 1, 1, Math.max(1, players.length - 2));
    const topicId = cfg.topicId;
    const rng = cfg.rng || Math.random;
    const Words = global.Words || require('./words.js');

    // resolve topic (mix → random concrete topic)
    let concreteTopic = topicId;
    if (topicId === 'mix') concreteTopic = Words.resolve('mix', rng);
    const secretWord = Words.pickWord(concreteTopic, cfg.usedWords, rng);
    // Mafia's "suspects": the real word + 3 decoys, shuffled. The mafia knows
    // the topic and that ONE of these four is the secret word — but not which.
    const suspects = Words.pickDecoys(concreteTopic, secretWord, 3, rng).concat([secretWord]);
    const mafiaSuspects = shuffle(suspects, rng);
    // extra decoys for the final-guess screen (6 options incl. the real word)
    const decoys = Words.pickDecoys(concreteTopic, secretWord, 5, rng);

    // choose mafia
    const ids = shuffle(players.map(function (p) { return p.id; }), rng);
    const mafiaIds = ids.slice(0, mafiaWanted);
    players.forEach(function (p) {
      p.role = mafiaIds.indexOf(p.id) !== -1 ? 'mafia' : 'civilian';
    });

    // speaking order: random start, seat order preserved
    const order = players.map(function (p) { return p.id; });
    const startIdx = Math.floor(rng() * order.length);
    const speakingOrder = order.slice(startIdx).concat(order.slice(0, startIdx));

    return {
      phase: 'dealing',          // dealing | clues | discussion | vote | reveal | win
      players: players,
      topicId: topicId === 'mix' ? 'mix' : topicId,
      concreteTopic: concreteTopic,
      secretWord: secretWord,
      mafiaSuspects: mafiaSuspects,
      decoys: decoys,
      mafiaIds: mafiaIds,
      speakingOrder: speakingOrder,
      speakerIdx: 0,
      clues: [],                  // [{playerId, word}]
      votes: {},                  // voterId -> targetId
      votesCast: 0,
      eliminated: null,           // {playerId, role, guessResult}
      winner: null,               // 'civilians' | 'mafia'
      winReason: null,
      finalGuessEnabled: !!cfg.finalGuess,
      finalGuessUsed: false,
      finalGuessResult: null,     // 'correct' | 'wrong'
      usedWords: (cfg.usedWords && cfg.usedWords.slice ? cfg.usedWords.slice(0) : []),
      roundNo: cfg.roundNo || 1
    };
  }

  /* ---------- phase transitions ---------- */

  function alivePlayers(state) {
    return state.players.filter(function (p) { return p.alive; });
  }

  function playerById(state, id) {
    for (const p of state.players) if (p.id === id) return p;
    return null;
  }

  function nextSpeaker(state) {
    return state.speakingOrder[state.speakerIdx] || null;
  }

  /** Mark that a player has seen their card. Returns {allRevealed}. */
  function markRevealed(state, playerId) {
    const p = playerById(state, playerId);
    if (!p) throw new Error('No such player');
    if (state.phase !== 'dealing') throw new Error('Not in dealing phase');
    p.revealed = true;
    const all = state.players.every(function (q) { return q.revealed; });
    return { allRevealed: all };
  }

  /** Advance from dealing to clues (called when all players have revealed). */
  function beginClues(state) {
    if (state.phase !== 'dealing') throw new Error('Not in dealing phase');
    state.phase = 'clues';
    state.speakerIdx = 0;
    return state;
  }

  /** Record a clue and advance the speaker. Returns {finished, nextSpeaker}. */
  function giveClue(state, playerId, word) {
    if (state.phase !== 'clues') throw new Error('Not in clue phase');
    if (nextSpeaker(state) !== playerId) throw new Error('Not your turn to speak');
    const p = playerById(state, playerId);
    if (!p) throw new Error('No such player');
    const w = String(word || '').trim();
    if (!w) throw new Error('Clue cannot be empty');
    if (w.toLowerCase() === state.secretWord.toLowerCase()) {
      // auto-forfeit: clue equals the secret word
      state.winner = 'civilians';
      state.winReason = 'word-blurted';
      state.phase = 'win';
      return { finished: true, invalid: true };
    }
    p.clue = w;
    state.clues.push({ playerId: playerId, word: w });
    state.speakerIdx++;
    const done = state.speakerIdx >= state.speakingOrder.length;
    return { finished: done };
  }

  /** Move from clues to discussion (free talk). */
  function beginDiscussion(state) {
    if (state.phase !== 'clues') throw new Error('Not in clue phase');
    state.phase = 'discussion';
    return state;
  }

  /** Move to voting. */
  function beginVote(state) {
    if (state.phase !== 'discussion' && state.phase !== 'clues') throw new Error('Cannot vote yet');
    state.phase = 'vote';
    state.votes = {};
    state.votesCast = 0;
    state.players.forEach(function (p) { p.vote = null; });
    return state;
  }

  /** Cast a vote. Both offline sequential and online simultaneous use this. */
  function castVote(state, voterId, targetId) {
    if (state.phase !== 'vote') throw new Error('Not in vote phase');
    const voter = playerById(state, voterId);
    const target = playerById(state, targetId);
    if (!voter || !target) throw new Error('No such player');
    if (!voter.alive) throw new Error('Eliminated players cannot vote');
    if (!target.alive) throw new Error('Cannot vote for an eliminated player');
    if (state.votes[voterId]) throw new Error('Vote already cast');
    state.votes[voterId] = targetId;
    voter.vote = targetId;
    state.votesCast++;
    if (state.votesCast >= alivePlayers(state).length) {
      return tally(state);
    }
    return { allIn: false };
  }

  /** Strict-majority tally. */
  function tally(state) {
    const alive = alivePlayers(state).length;
    const counts = {};
    let max = 0, maxId = null;
    Object.keys(state.votes).forEach(function (voter) {
      const t = state.votes[voter];
      counts[t] = (counts[t] || 0) + 1;
      if (counts[t] > max) { max = counts[t]; maxId = t; }
    });
    const need = Math.floor(alive / 2) + 1;
    const eliminated = max >= need && maxId !== null ? maxId : null;
    state.eliminated = { playerId: eliminated, role: null, guessResult: null };
    state.lastTally = { counts: counts, need: need, maxVotes: max };
    state.phase = 'reveal';
    return { allIn: true, counts: counts, need: need, eliminated: eliminated };
    // NOTE: when eliminated === null (no strict majority), reveal phase shows
    // "no elimination" and the game loops back to clues/discussion.
 }

  /** Resolve the elimination: reveal role, check win conditions. */
  function resolveElimination(state) {
    if (state.phase !== 'reveal') throw new Error('Not in reveal phase');
    if (state.eliminated && state.eliminated.playerId) {
      const p = playerById(state, state.eliminated.playerId);
      if (p) {
        p.alive = false;
        p.vote = null;
        state.eliminated.role = p.role;
      }
      if (state.eliminated.role === 'mafia') {
        if (state.finalGuessEnabled && !state.finalGuessUsed) {
          // stay in reveal phase: the mafia gets one shot at guessing the word
          return { pendingFinalGuess: true };
        }
        state.winner = 'civilians';
        state.winReason = 'mafia-caught';
        state.phase = 'win';
        return;
      }
    }
    // civilian eliminated (or nobody eliminated): check last-two rule
    const alive = alivePlayers(state).length;
    if (alive <= 2) {
      state.winner = 'mafia';
      state.winReason = 'last-two';
      state.phase = 'win';
      return;
    }
    // continue: back to clues with remaining players (new speaking order)
    state.speakingOrder = state.speakingOrder.filter(function (id) {
      return alivePlayers(state).some(function (p) { return p.id === id; });
    });
    state.players.forEach(function (p) { p.clue = null; });
    state.clues = [];
    state.speakerIdx = 0;
    state.phase = 'clues';
    return;
  }

  /** After a caught mafia uses their final guess (if enabled). */
  function resolveFinalGuess(state, guess) {
    if (state.phase !== 'reveal') throw new Error('Not in reveal phase');
    if (!state.eliminated || !state.eliminated.playerId) throw new Error('No eliminated player');
    if (state.eliminated.role !== 'mafia') throw new Error('Eliminated player is not the mafia');
    if (state.finalGuessUsed) throw new Error('Final guess already used');
    state.finalGuessUsed = true;
    const correct = String(guess || '').trim().toLowerCase() === state.secretWord.toLowerCase();
    state.finalGuessResult = correct ? 'correct' : 'wrong';
    if (correct) {
      state.winner = 'mafia';
      state.winReason = 'word-guessed';
      state.phase = 'win';
    } else {
      state.winner = 'civilians';
      state.winReason = 'mafia-caught';
      state.phase = 'win';
    }
  }

  function OverrideError(msg) {
    const e = new Error(msg); e.name = 'OverrideError'; return e;
  }

  /* ---------- view builders (privacy-safe) ---------- */

  /** Public state safe to show to everyone. */
  function publicView(state) {
    const v = {
      phase: state.phase,
      players: state.players.map(function (p) {
        return { id: p.id, name: p.name, alive: p.alive, hasClue: !!p.clue, voteCount: null };
      }),
      topicId: state.topicId,
      concreteTopic: state.concreteTopic,
      speakingOrder: state.speakingOrder,
      speakerIdx: state.speakerIdx,
      clues: state.clues,
      aliveCount: alivePlayers(state).length,
      votesCast: state.votesCast,
      votesNeeded: alivePlayers(state).length,
      roundNo: state.roundNo
    };
    if (state.phase === 'reveal') {
      const elimId = state.eliminated ? state.eliminated.playerId : null;
      const elimP = elimId ? playerById(state, elimId) : null;
      v.eliminatedId = elimId;
      v.eliminatedRole = elimP ? elimP.role : null;
      v.tally = state.lastTally ? state.lastTally.counts : {};
      v.voteNeed = state.lastTally ? state.lastTally.need : 0;
      v.maxVotes = state.lastTally ? state.lastTally.maxVotes : 0;
    }
    if (state.phase === 'win') {
      v.winner = state.winner;
      v.winReason = state.winReason;
      v.secretWord = state.secretWord;
      v.mafiaNames = state.players.filter(function (p) { return p.role === 'mafia'; })
        .map(function (p) { return p.name; });
    }
    return v;
  }

  /** Per-player view: public + own card (word or mafia suspects). Never others' cards. */
  function playerView(state, playerId) {
    const v = publicView(state);
    const p = playerById(state, playerId);
    if (!p) return v;
    if (state.phase === 'dealing') {
      v.card = p.role === 'mafia'
        ? { role: 'mafia', topic: state.concreteTopic, suspects: state.mafiaSuspects }
        : { role: 'civilian', topic: state.concreteTopic, word: state.secretWord };
      v.card.revealed = !!p.revealed;
    } else if (state.phase === 'reveal' && state.eliminated && state.eliminated.role === 'mafia'
               && state.finalGuessEnabled && !state.finalGuessUsed) {
      // final-guess in progress: the word must NOT be revealed yet.
      // Only the eliminated mafia receives the guess options.
      v.card = { role: p.role, phase: state.phase };
      if (state.eliminated.playerId === playerId) {
        v.card.finalGuess = { options: state.decoys.concat([state.secretWord]) };
      }
    } else if (state.phase === 'win'
               || (state.phase === 'reveal' && state.eliminated && state.eliminated.role === 'mafia')) {
      // game over (or final guess done): safe to show the word to everyone
      v.card = p.role === 'mafia'
        ? { role: 'mafia', topic: state.concreteTopic, word: state.secretWord, suspects: state.mafiaSuspects }
        : { role: 'civilian', topic: state.concreteTopic, word: state.secretWord };
    } else {
      v.card = { role: p.role, phase: state.phase };
    }
    if (state.phase === 'vote') {
      v.voteProgress = { cast: state.votesCast, total: alivePlayers(state).length };
      v.myVote = state.votes[playerId] || null;
    }
    return v;
  }

  /* ---------- exports ---------- */

  const Game = {
    MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS,
    createGame: createGame,
    beginClues: beginClues,
    markRevealed: markRevealed,
    giveClue: giveClue,
    beginDiscussion: beginDiscussion,
    beginVote: beginVote,
    castVote: castVote,
    tally: tally,
    resolveElimination: resolveElimination,
    resolveFinalGuess: resolveFinalGuess,
    publicView: publicView,
    playerView: playerView,
    alivePlayers: alivePlayers,
    playerById: playerById,
    nextSpeaker: nextSpeaker,
    shuffle: shuffle
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Game;
  global.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
