/* Mafia Party — game server.
 * Pure Node.js (no dependencies): static file serving + SSE rooms + game authority.
 * Rooms live in memory. Each client gets ONLY its own playerView (privacy by design).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const Words = require(path.join(__dirname, '..', 'js', 'words.js'));
const Game = require(path.join(__dirname, '..', 'js', 'game.js'));

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');

/* ================= rooms ================= */

const rooms = new Map(); // code -> room
const ROOM_TTL = 2 * 60 * 60 * 1000; // 2h idle auto-delete
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O for clarity

function newCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  } while (rooms.has(code));
  return code;
}

function createRoom(hostName) {
  const code = newCode();
  const hostId = crypto.randomUUID();
  const room = {
    code: code,
    players: [],            // {id, name, isHost, connected, res(SSE), revealed, lastSeen}
    phase: 'lobby',         // lobby|dealing|clues|discussion|vote|reveal|win
    game: null,
    topicId: 'mix',
    createdAt: Date.now(),
    lastActivity: Date.now(),
    roundStamp: 0
  };
  room.players.push({ id: hostId, name: sanitizeName(hostName), isHost: true, connected: false, res: null, revealed: false });
  rooms.set(code, room);
  return room;
}

function sanitizeName(n) {
  return String(n || '').replace(/[<>\"'&]/g, '').trim().slice(0, 14) || 'Player';
}

function findRoom(code) { return rooms.get(String(code || '').toUpperCase()); }

function broadcast(room) {
  room.lastActivity = Date.now();
  for (const p of room.players) {
    if (!p.res || p.res.writableEnded) continue;
    let payload;
    try { payload = buildPlayerView(room, p); }
    catch (e) { continue; }
    p.res.write('event: state\ndata: ' + JSON.stringify(payload) + '\n\n');
  }
}

/* ================= player views (privacy-safe) ================= */

/** Keep room.phase in sync with game.phase; call after any mutation. */
function syncPhase(room) {
  if (room.game) room.phase = room.game.phase;
  else room.phase = 'lobby';
}

function buildPlayerView(room, player) {
  syncPhase(room);
  const g = room.game;
  const base = {
    room: {
      code: room.code,
      phase: room.phase,
      hostId: room.players.find(function (p) { return p.isHost; })
        ? room.players.find(function (p) { return p.isHost; }).id : null,
      players: room.players.map(function (p) {
        return { id: p.id, name: p.name, isHost: p.isHost, connected: p.connected };
      }),
      topicId: room.topicId,
      revealedCount: room.game ? room.game.players.filter(function (p) { return p.revealed; }).length : 0,
      roundStamp: room.roundStamp
    },
    roundNo: g ? g.roundNo : 1
  };
  if (!g) return base;
  const v = Game.playerView(g, player.id);
  // merge game view into base
  Object.assign(base, v);
  base.room.revealedCount = g.players.filter(function (p) { return p.revealed; }).length;
  return base;
}

/* ================= SSE + HTTP server ================= */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(function (req, res) {
  const url = new URL(req.url, 'http://x');
  const pathname = decodeURIComponent(url.pathname);

  /* ---- API routes ---- */
  if (pathname === '/api/rooms' && req.method === 'POST') return handleCreateRoom(req, res);
  if (pathname.startsWith('/api/rooms/') && pathname.endsWith('/join') && req.method === 'POST') {
    return handleJoinRoom(req, res, pathname);
  }
  if (pathname.startsWith('/api/room/')) {
    const parts = pathname.split('/').filter(Boolean); // ['api','room',CODE,...]
    const code = parts[2];
    const rest = parts.slice(3).join('/');
    if (rest === 'events' && req.method === 'GET') return handleEvents(req, res, url, code);
    if (rest === 'act' && req.method === 'POST') return handleAct(req, res, url, code);
  }
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
  }

  /* ---- static files ---- */
  return serveStatic(req, res, pathname);
});

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch (e) { return {}; }
}

/* ---- create room ---- */
function handleCreateRoom(req, res) {
  readBody(req).then(function (body) {
    const name = sanitizeName(body.name);
    if (!name) return json(res, 400, { error: 'Name required' });
    const room = createRoom(name);
    json(res, 200, { roomCode: room.code, playerId: room.players[0].id });
  }).catch(function (e) { json(res, 500, { error: e.message }); });
}

/* ---- join room ---- */
function handleJoinRoom(req, res, pathname) {
  const code = pathname.split('/')[3];
  readBody(req).then(function (body) {
    const room = findRoom(code);
    if (!room) return json(res, 404, { error: 'Room not found' });
    if (room.phase !== 'lobby') return json(res, 409, { error: 'Game already started' });
    if (room.players.length >= Game.MAX_PLAYERS) return json(res, 409, { error: 'Room is full' });
    const name = sanitizeName(body.name);
    if (!name) return json(res, 400, { error: 'Name required' });
    const taken = room.players.some(function (p) { return p.name.toLowerCase() === name.toLowerCase(); });
    if (taken) return json(res, 409, { error: 'Name already taken in this room' });
    const id = crypto.randomUUID();
    room.players.push({ id: id, name: name, isHost: false, connected: false, res: null, revealed: false });
    broadcast(room);
    json(res, 200, { roomCode: room.code, playerId: id });
  }).catch(function (e) { json(res, 500, { error: e.message }); });
}

/* ---- SSE events stream ---- */
function handleEvents(req, res, url, code) {
  const room = findRoom(code);
  if (!room) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('room not found');
  }
  const playerId = url.searchParams.get('playerId');
  const player = room.players.find(function (p) { return p.id === playerId; });
  if (!player) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('not in room');
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 2000\n\n');
  player.res = res;
  player.connected = true;
  // send current state immediately
  try { res.write('event: state\ndata: ' + JSON.stringify(buildPlayerView(room, player)) + '\n\n'); }
  catch (e) { /* game not started */ }
  broadcast(room); // tell others we're connected
  const ping = setInterval(function () {
    if (res.writableEnded) return clearInterval(ping);
    res.write(': ping\n\n');
  }, 15000);
  req.on('close', function () {
    clearInterval(ping);
    player.res = null;
    player.connected = false;
    // reassign host if the host disconnected
    const host = room.players.find(function (p) { return p.isHost; });
    if (!host || !host.connected) {
      const next = room.players.find(function (p) { return p.connected; });
      if (next) {
        room.players.forEach(function (p) { p.isHost = (p.id === next.id); });
      }
    }
    broadcast(room);
  });
}

/* ---- actions ---- */
function handleAct(req, res, url, code) {
  const room = findRoom(code);
  if (!room) return json(res, 404, { error: 'Room not found' });
  readBody(req).then(function (body) {
    const player = room.players.find(function (p) { return p.id === body.playerId; });
    if (!player) return json(res, 403, { error: 'Not in room' });
    try {
      const result = applyAction(room, player, body);
      broadcast(room);
      json(res, 200, result || { ok: true });
    } catch (e) {
      json(res, 400, { error: e.message });
    }
  }).catch(function (e) { json(res, 500, { error: e.message }); });
}

/* ---- game actions ---- */
function applyAction(room, player, body) {
  const action = body.action;
  const g = room.game;

  if (action === 'leave') {
    removePlayer(room, player);
    return {};
  }

  if (action === 'setTopic') {
    if (!player.isHost) throw new Error('Only the host can pick the topic');
    if (room.phase !== 'lobby') throw new Error('Game already started');
    room.topicId = Words.PACKS[body.topicId] ? body.topicId : 'mix';
    return {};
  }

  if (action === 'start') {
    if (!player.isHost) throw new Error('Only the host can start');
    if (room.players.length < Game.MIN_PLAYERS) throw new Error('Need at least 3 players');
    if (room.phase !== 'lobby') throw new Error('Already started');
    startGame(room);
    return {};
  }

  if (action === 'revealed') {
    if (room.phase !== 'dealing') throw new Error('Not in dealing phase');
    const r = Game.markRevealed(g, player.id);
    if (r.allRevealed) Game.beginClues(g);
    return {};
  }

  if (action === 'clue') {
    if (room.phase !== 'clues') throw new Error('Not in clue phase');
    const pid = Game.nextSpeaker(g);
    if (pid !== player.id) throw new Error('Not your turn');
    const res = Game.giveClue(g, player.id, '·');
    if (res.finished) Game.beginDiscussion(g); // last clue → open discussion
    return {};
  }

  if (action === 'beginVote') {
    if (room.phase !== 'discussion') throw new Error('Not in discussion phase');
    Game.beginVote(g);
    return {};
  }

  if (action === 'vote') {
    if (room.phase !== 'vote') throw new Error('Not in vote phase');
    const res = Game.castVote(g, player.id, body.targetId);
    return {}; // elimination resolves when players press Continue (reveal phase)
  }

  if (action === 'continue') {
    if (room.phase !== 'reveal') throw new Error('Not in reveal phase');
    const rres = Game.resolveElimination(g);
    if (g.phase === 'win') return {};
    if (rres && rres.pendingFinalGuess) return {};
    return {};
  }

  if (action === 'finalGuess') {
    if (room.phase !== 'reveal') throw new Error('Not in reveal phase');
    const gp = g.eliminated && g.eliminated.playerId ? g.eliminated.playerId : null;
    if (gp !== player.id) throw new Error('Only the eliminated mafia can guess');
    if (g.eliminated.role !== 'mafia') throw new Error('No final guess for civilians');
    Game.resolveFinalGuess(g, body.guess);
    return { correct: g.finalGuessResult === 'correct' };
  }

  if (action === 'rematch') {
    if (room.phase !== 'win') throw new Error('Game not over');
    startGame(room);
    return {};
  }

  throw new Error('Unknown action: ' + action);
}

function removePlayer(room, player) {
  const idx = room.players.indexOf(player);
  if (idx !== -1) room.players.splice(idx, 1);
  if (player.res) { player.res.end(); player.res = null; }
  if (!room.players.length) {
    rooms.delete(room.code);
    return;
  }
  // reassign host if needed
  if (player.isHost) {
    room.players[0].isHost = true;
  }
  // mid-game quit handling
  if (room.game && room.phase !== 'lobby' && room.phase !== 'win') {
    handleMidGameQuit(room, player);
  }
}

function handleMidGameQuit(room, player) {
  const g = room.game;
  // find the equivalent game player
  const gp = Game.playerById(g, player.id);
  if (!gp) return;
  gp.alive = false;
  if (gp.role === 'mafia') {
    g.winner = 'civilians';
    g.winReason = 'mafia-caught';
    g.phase = 'win';
  } else if (g.phase !== 'win') {
    // count survivors still connected in the room
    const remainingAlive = Game.alivePlayers(g).filter(function (p) {
      return p.id !== player.id && room.players.some(function (rp) { return rp.id === p.id; });
    }).length;
    if (remainingAlive <= 1) {
      g.winner = 'mafia';
      g.winReason = 'last-two';
      g.phase = 'win';
    }
  }
  syncPhase(room);
}

function startGame(room) {
  // reset reveal flags
  room.players.forEach(function (p) { p.revealed = false; });
  room.roundStamp++;
  const players = room.players.map(function (p) { return { id: p.id, name: p.name }; });
  room.game = Game.createGame({
    players: players,
    topicId: room.topicId,
    mafiaCount: 1,
    finalGuess: true,
    rng: Math.random
  });
  room.phase = 'dealing';
}

/* ================= static files ================= */

function serveStatic(req, res, pathname) {
  let fp = pathname === '/' ? '/index.html' : pathname;
  // normalize & prevent traversal
  fp = path.normalize(fp).replace(/^([/\\])+/, '');
  const full = path.join(ROOT, fp);
  if (!full.startsWith(ROOT)) {
    res.writeHead(403); return res.end('forbidden');
  }
  fs.readFile(full, function (err, data) {
    if (err) {
      // SPA-ish fallback for deep links
      if (!path.extname(fp)) {
        return fs.readFile(path.join(ROOT, 'index.html'), function (e2, d2) {
          if (e2) { res.writeHead(404); return res.end('not found'); }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(d2);
        });
      }
      res.writeHead(404); return res.end('not found');
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(data);
  });
}

/* ================= idle room cleanup ================= */

setInterval(function () {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL) rooms.delete(code);
  }
}, 10 * 60 * 1000);

/* ================= boot ================= */

server.listen(PORT, function () {
  console.log('Mafia Party server listening on http://localhost:' + PORT);
});
