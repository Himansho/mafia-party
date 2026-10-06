// Mafia Party — game server as a Supabase Edge Function (Deno).
// Server-authoritative: the secret word NEVER leaves this function.
// Endpoints (POST JSON): create | join | act  (action routing like the Node server)
// Sync: rooms table row holds full state; clients poll + realtime broadcast nudge.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: CORS });

// ---------- game logic (inlined, mirrors js/game.js + js/words.js) ----------

const TOPICS: Record<string, string[]> = {
  "movies": ["Titanic","Inception","Shrek","Dune","Frozen","The Lion King","Jurassic Park","Star Wars","The Avengers","Spider-Man","Batman","Superman","Iron Man","Thor","Harry Potter","Lord of the Rings","The Dark Knight","Interstellar","Gladiator","Braveheart","Rocky","The Terminator","Alien","Predator","Jaws","E.T.","Home Alone","Mrs. Doubtfire","The Mask","Dumb and Dumber","Mean Girls","The Notebook","La La Land","Grease","Mamma Mia","Forrest Gump","Cast Away","The Shawshank Redemption","Pulp Fiction","Fight Club","The Departed","Goodfellas","Casino","Scarface","The Wolf of Wall Street","Django Unchained","Kill Bill","Deadpool","Wolverine","X-Men","Guardians of the Galaxy","Black Panther","Toy Story","Finding Nemo","Up","Coco","Ratatouille","The Godfather","Avatar","The Matrix","Joker","Oppenheimer","Barbie"],
  "space": ["Comet","Black Hole","Astronaut","Saturn","Eclipse","Mars","Jupiter","Neptune","Uranus","Mercury","Venus","Pluto","The Moon","The Sun","Galaxy","Milky Way","Nebula","Supernova","Meteor Shower","Asteroid","Rocket","Satellite","Space Station","Telescope","Hubble","James Webb","NASA","Cosmonaut","Alien","UFO","Orbit","Gravity","Vacuum","The Universe","Big Bang","Andromeda","Aurora","Northern Lights","Solar System","Planet","Dwarf Planet","Asteroid Belt","Kuiper Belt","Halley’s Comet","ISS","Sputnik","Apollo","Artemis","SpaceX","Falcon 9","Starship","Voyager","Curiosity","Perseverance","Mars Rover","Lunar Eclipse","Solar Flare","Sunspot","Red Giant","White Dwarf","Neutron Star","Pulsar","Quasar","Event Horizon","Wormhole","Exoplanet","Dark Matter","Dark Energy","Space Suit","Zero Gravity","Mission Control","Countdown","Landing","Spacewalk","Constellation"],
  "sports": ["Football","Tennis","Karate","Olympics","Marathon","Basketball","Baseball","Cricket","Hockey","Golf","Rugby","Boxing","Wrestling","Judo","Taekwondo","Fencing","Archery","Swimming","Diving","Surfing","Skiing","Snowboarding","Ice Skating","Cycling","Sprinting","Hurdles","Relay Race","Pole Vault","High Jump","Long Jump","Shot Put","Javelin","Discus","Gymnastics","Volleyball","Badminton","Table Tennis","Squash","Handball","Water Polo","Rowing","Kayaking","Sailing","Triathlon","Decathlon","Formula 1","MotoGP","Tour de France","World Cup","Super Bowl","Wimbledon","Champions League","Premier League","NBA","Penalty Kick","Home Run","Touchdown","Goalkeeper","Referee","Trophy","Stadium","Cheerleader","Skateboarding","Climbing","Surf Lifesaving"],
  "actors": ["Tom Hanks","Jackie Chan","Emma Watson","Shah Rukh Khan","Dwayne Johnson","Leonardo DiCaprio","Brad Pitt","Angelina Jolie","Johnny Depp","Robert Downey Jr.","Chris Evans","Chris Hemsworth","Scarlett Johansson","Will Smith","Morgan Freeman","Samuel L. Jackson","Keanu Reeves","Matt Damon","Ben Affleck","Ryan Gosling","Ryan Reynolds","Hugh Jackman","Anne Hathaway","Natalie Portman","Keira Knightley","Nicole Kidman","Reese Witherspoon","Julia Roberts","Sandra Bullock","Jennifer Lawrence","Margot Robbie","Zendaya","Tom Holland","Andrew Garfield","Timothée Chalamet","Cillian Murphy","Christian Bale","Heath Ledger","Joaquin Phoenix","Denzel Washington","Viola Davis","Meryl Streep","Kate Winslet","Al Pacino","Robert De Niro","Anthony Hopkins","Daniel Day-Lewis","Russell Crowe","Mel Gibson","Arnold Schwarzenegger","Sylvester Stallone","Bruce Lee","Jet Li","Donnie Yen","Michelle Yeoh","Amitabh Bachchan","Salman Khan","Aamir Khan","Deepika Padukone","Priyanka Chopra","Ranbir Kapoor","Kangana Ranaut","Vicky Kaushal","Rajinikanth","Allu Arjun"],
  "anime": ["Naruto","Pikachu","Goku","One Piece","Attack on Titan","Luffy","Zoro","Nami","Sasuke","Sakura","Kakashi","Itachi","Vegeta","Gohan","Bulma","Saitama","Genos","Tanjiro","Nezuko","Zenitsu","Inosuke","Rengoku","Deku","Bakugo","All Might","Todoroki","L","Light Yagami","Ryuk","Levi","Eren","Mikasa","Armin","Spike Spiegel","Edward Elric","Alphonse","Gon","Killua","Hisoka","Ichigo","Rukia","Conan","Lupin","Astro Boy","Doraemon","Shinchan","Nobita","Sailor Moon","Totoro","Howl","Ponyo","No-Face","Haku","Chihiro","Yugi","Jotaro","Dio","Mob","Anya","Gojo","Itadori","Makima","Denji","Power","Rem","Ram","Asuna","Kirito","Senku","Yusuke"]
};

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 20;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickWord(topicId: string): { word: string; pool: string[] } {
  const ids = Object.keys(TOPICS);
  const id = topicId === "mix" || !TOPICS[topicId] ? ids[Math.floor(Math.random() * ids.length)] : topicId;
  const pool = TOPICS[id];
  return { word: pool[Math.floor(Math.random() * pool.length)], pool };
}

function pickDecoys(word: string, pool: string[], n: number): string[] {
  return shuffle(pool.filter((w) => w !== word)).slice(0, n);
}

function createGame(cfg: any) {
  const { word, pool } = pickWord(cfg.topicId);
  const ids = cfg.players.map((p: any) => p.id);
  const mafiaIdx = Math.floor(Math.random() * ids.length);
  const mafiaId = ids[mafiaIdx];
  const decoys = pickDecoys(word, pool, 5);
  const suspects = shuffle([word, ...pickDecoys(word, pool, 3)]);
  return {
    players: cfg.players.map((p: any) => ({ ...p, role: p.id === mafiaId ? "mafia" : "civilian", alive: true, revealed: false, clue: null, vote: null })),
    topicId: cfg.topicId === "mix" ? "mix" : cfg.topicId,
    concreteTopic: Object.keys(TOPICS).includes(cfg.topicId) ? cfg.topicId : "mix",
    secretWord: word,
    mafiaSuspects: suspects,
    decoys,
    mafiaId,
    phase: "dealing",
    speakingOrder: shuffle(ids),
    speakerIdx: 0,
    clues: [],
    votes: {},
    votesCast: 0,
    eliminated: null,
    lastTally: null,
    finalGuessEnabled: cfg.finalGuess !== false,
    finalGuessUsed: false,
    finalGuessResult: null,
    winner: null,
    winReason: null,
    roundNo: 1,
  };
}

const alive = (g: any) => g.players.filter((p: any) => p.alive);
const byId = (g: any, id: string) => g.players.find((p: any) => p.id === id);

function playerView(g: any, pid: string) {
  const v: any = {
    phase: g.phase,
    players: g.players.map((p: any) => ({ id: p.id, name: p.name, alive: p.alive, hasClue: !!p.clue })),
    concreteTopic: g.concreteTopic,
    speakingOrder: g.speakingOrder,
    speakerIdx: g.speakerIdx,
    clues: g.clues,
    aliveCount: alive(g).length,
    votesCast: g.votesCast,
    roundNo: g.roundNo,
  };
  const p = byId(g, pid);
  if (!p) return v;
  if (g.phase === "dealing") {
    v.card = p.role === "mafia"
      ? { role: "mafia", topic: g.concreteTopic, suspects: g.mafiaSuspects }
      : { role: "civilian", topic: g.concreteTopic, word: g.secretWord };
    v.card.revealed = !!p.revealed;
  } else if (g.phase === "reveal" && g.eliminated && g.eliminated.role === "mafia" && g.finalGuessEnabled && !g.finalGuessUsed) {
    v.card = { role: p.role, phase: g.phase };
    if (g.eliminated.playerId === pid) v.card.finalGuess = { options: shuffle([...g.decoys, g.secretWord]) };
  } else if (g.phase === "win" || (g.phase === "reveal" && g.eliminated && g.eliminated.role === "mafia")) {
    v.card = p.role === "mafia"
      ? { role: "mafia", topic: g.concreteTopic, word: g.secretWord, suspects: g.mafiaSuspects }
      : { role: "civilian", topic: g.concreteTopic, word: g.secretWord };
  } else {
    v.card = { role: p.role, phase: g.phase };
  }
  if (g.phase === "reveal") {
    v.eliminatedId = g.eliminated?.playerId ?? null;
    v.eliminatedRole = g.eliminated?.role ?? null;
    v.tally = g.lastTally?.counts ?? {};
    v.voteNeed = g.lastTally?.need ?? 0;
    v.maxVotes = g.lastTally?.maxVotes ?? 0;
  }
  if (g.phase === "win") {
    v.winner = g.winner;
    v.winReason = g.winReason;
    v.secretWord = g.secretWord;
    v.mafiaNames = g.players.filter((p: any) => p.role === "mafia").map((p: any) => p.name);
  }
  if (g.phase === "vote") {
    v.voteProgress = { cast: g.votesCast, total: alive(g).length };
    v.myVote = g.votes[pid] || null;
  }
  return v;
}

function applyMove(g: any, mv: any): any {
  const act = mv.action;
  const p = byId(g, mv.playerId);
  switch (act) {
    case "setTopic": {
      if (g.phase !== "lobby" && g.phase !== "dealing") throw new Error("Too late to change topic");
      g.topicId = mv.topicId;
      return g;
    }
    case "start": {
      if (g.phase !== "lobby") throw new Error("Already started");
      const players = g.players.map((x: any) => ({ id: x.id, name: x.name }));
      const fresh = createGame({ players, topicId: g.topicId, finalGuess: true });
      Object.assign(g, fresh);
      return g;
    }
    case "revealed": {
      if (g.phase !== "dealing") throw new Error("Not in dealing phase");
      if (!p) throw new Error("Not a player");
      p.revealed = true;
      if (g.players.every((x: any) => x.revealed)) {
        g.phase = "clues";
        g.speakerIdx = 0;
      }
      return g;
    }
    case "clue": {
      if (g.phase !== "clues") throw new Error("Not in clue phase");
      if (g.speakingOrder[g.speakerIdx] !== mv.playerId) throw new Error("Not your turn");
      const text = String(mv.clue ?? "·").slice(0, 40);
      if (text.toLowerCase() === g.secretWord.toLowerCase()) {
        g.winner = "mafia"; g.winReason = "word-blurted"; g.phase = "win";
        return g;
      }
      p.clue = text;
      g.clues.push({ playerId: mv.playerId, name: p.name, text });
      g.speakerIdx++;
      if (g.speakerIdx >= g.speakingOrder.length) g.phase = "discussion";
      return g;
    }
    case "beginVote": {
      if (g.phase !== "discussion") throw new Error("Not in discussion");
      g.phase = "vote";
      g.votes = {};
      g.votesCast = 0;
      g.players.forEach((x: any) => { x.vote = null; });
      return g;
    }
    case "vote": {
      if (g.phase !== "vote") throw new Error("Not in vote phase");
      if (!p || !p.alive) throw new Error("Not eligible");
      if (g.votes[mv.playerId]) throw new Error("Already voted");
      const target = byId(g, mv.targetId);
      if (!target || !target.alive) throw new Error("Bad target");
      g.votes[mv.playerId] = mv.targetId;
      g.votesCast++;
      if (g.votesCast >= alive(g).length) {
        // tally
        const counts: Record<string, number> = {};
        let max = 0, maxId: string | null = null;
        for (const t of Object.values(g.votes) as string[]) {
          counts[t] = (counts[t] || 0) + 1;
          if (counts[t] > max) { max = counts[t]; maxId = t; }
        }
        const need = Math.floor(alive(g).length / 2) + 1;
        const eliminated = max >= need && maxId ? maxId : null;
        g.eliminated = { playerId: eliminated, role: null, guessResult: null };
        g.lastTally = { counts, need, maxVotes: max };
        g.phase = "reveal";
      }
      return g;
    }
    case "continue": {
      if (g.phase !== "reveal") throw new Error("Not in reveal phase");
      return resolveElimination(g);
    }
    case "finalGuess": {
      if (g.phase !== "reveal") throw new Error("Not in reveal phase");
      if (!g.eliminated || g.eliminated.playerId !== mv.playerId) throw new Error("Only the eliminated mafia can guess");
      if (g.eliminated.role !== "mafia") throw new Error("No final guess");
      if (g.finalGuessUsed) throw new Error("Already guessed");
      const correct = String(mv.guess).toLowerCase() === g.secretWord.toLowerCase();
      g.finalGuessUsed = true;
      g.finalGuessResult = correct ? "correct" : "wrong";
      g.eliminated.guessResult = g.finalGuessResult;
      if (correct) { g.winner = "mafia"; g.winReason = "word-guessed"; g.phase = "win"; }
      else { g.winner = "civilians"; g.winReason = "mafia-caught"; g.phase = "win"; }
      return g;
    }
    case "rematch": {
      if (g.phase !== "win") throw new Error("Game not over");
      const players = g.players.map((x: any) => ({ id: x.id, name: x.name }));
      const fresh = createGame({ players, topicId: g.topicId, finalGuess: g.finalGuessEnabled });
      Object.assign(g, fresh);
      g.roundNo = (g.roundNo ?? 1) + 1;
      return g;
    }
    default:
      throw new Error("Unknown action: " + act);
  }
}

function resolveElimination(g: any) {
  if (g.eliminated && g.eliminated.playerId) {
    const p = byId(g, g.eliminated.playerId);
    if (p) {
      p.alive = false;
      g.eliminated.role = p.role;
    }
    if (g.eliminated.role === "mafia") {
      if (g.finalGuessEnabled && !g.finalGuessUsed) return g; // pause for the guess
      g.winner = "civilians"; g.winReason = "mafia-caught"; g.phase = "win";
      return g;
    }
  }
  if (alive(g).length <= 2) {
    g.winner = "mafia"; g.winReason = "last-two"; g.phase = "win";
    return g;
  }
  g.speakingOrder = g.speakingOrder.filter((id: string) => alive(g).some((x: any) => x.id === id));
  g.players.forEach((x: any) => { x.clue = null; });
  g.clues = [];
  g.speakerIdx = 0;
  g.votes = {};
  g.votesCast = 0;
  g.phase = "clues";
  return g;
}

// ---------- room persistence ----------

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const newCode = () => [...crypto.getRandomValues(new Uint8Array(4))].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join("");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const { url: supaUrl, anonKey, serviceKey } = {
    url: Deno.env.get("SUPABASE_URL")!,
    anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  };
  const admin = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  try {
    switch (body.op) {
      case "create": {
        const name = String(body.name || "").replace(/[<>"'&]/g, "").trim().slice(0, 14);
        if (!name) return json({ error: "Name required" }, 400);
        const pid = crypto.randomUUID();
        const code = newCode();
        const g = { players: [{ id: pid, name }], topicId: "mix", phase: "lobby", concreteTopic: "mix" };
        const { error: e1 } = await admin.from("rooms").insert({ code, host_id: pid, topic_id: "mix", phase: "lobby", state: g, version: 1 });
        if (e1) throw new Error(e1.message);
        const { error: e2 } = await admin.from("players").insert({ id: pid, room_code: code, name, is_host: true });
        if (e2) throw new Error(e2.message);
        return json({ roomCode: code, playerId: pid });
      }
      case "join": {
        const code = String(body.code || "").toUpperCase();
        const name = String(body.name || "").replace(/[<>"'&]/g, "").trim().slice(0, 14);
        if (!name) return json({ error: "Name required" }, 400);
        const { data: room, error } = await admin.from("rooms").select("code, state").eq("code", code).single();
        if (error || !room) return json({ error: "Room not found" }, 404);
        const g = room.state;
        if (g.phase !== "lobby") return json({ error: "Game already started" }, 409);
        if (g.players.length >= MAX_PLAYERS) return json({ error: "Room is full" }, 409);
        if (g.players.some((p: any) => p.name.toLowerCase() === name.toLowerCase())) return json({ error: "Name already taken" }, 409);
        const pid = crypto.randomUUID();
        g.players.push({ id: pid, name });
        const { error: e2 } = await admin.from("rooms").update({ state: g, version: (room.version ?? 1) + 1 }).eq("code", code);
        if (e2) throw new Error(e2.message);
        const { error: e3 } = await admin.from("players").insert({ id: pid, room_code: code, name, is_host: false });
        if (e3) throw new Error(e3.message);
        return json({ roomCode: code, playerId: pid });
      }
      case "state": {
        const code = String(body.code || "").toUpperCase();
        const pid = body.playerId;
        const { data: room } = await admin.from("rooms").select("code, phase, topic_id, state, version, host_id").eq("code", code).single();
        if (!room) return json({ error: "Room not found" }, 404);
        const { data: players } = await admin.from("players").select("id, name, is_host, connected").eq("room_code", code);
        const g = room.state;
        const view = g.phase === "lobby"
          ? { phase: "lobby", players: g.players }
          : playerView(g, pid);
        return json({ room: { code: room.code, phase: g.phase, hostId: room.host_id, topicId: g.topicId, players: players || [] }, ...view });
      }
      case "act": {
        const code = String(body.code || "").toUpperCase();
        const pid = body.playerId;
        const { data: room } = await admin.from("rooms").select("code, phase, state, version, host_id").eq("code", code).single();
        if (!room) return json({ error: "Room not found" }, 404);
        const g = room.state;
        const mv = { action: body.action, ...body };
        // host-gated actions
        if (["start", "setTopic", "rematch", "kick"].includes(body.action) && room.host_id !== pid) {
          return json({ error: "Host only" }, 403);
        }
        applyMove(g, mv);
        const { error: e } = await admin.from("rooms").update({ state: g, phase: g.phase, version: (room.version ?? 1) + 1, updated_at: new Date().toISOString() }).eq("code", code);
        if (e) throw new Error(e.message);
        // broadcast a nudge via realtime channel
        const channel = admin.channel("room:" + code);
        channel.subscribe((status: string) => {
          if (status === "SUBSCRIBED") channel.send({ type: "broadcast", event: "state", payload: { version: (room.version ?? 1) + 1 } });
          setTimeout(() => channel.unsubscribe(), 2000);
        });
        const view = g.phase === "lobby" ? { phase: "lobby", players: g.players } : playerView(g, pid);
        return json({ ok: true, ...(view ? { view } : {}) });
      }
      default:
        return json({ error: "Unknown op" }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 400);
  }
});
