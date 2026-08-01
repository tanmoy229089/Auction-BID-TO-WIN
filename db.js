// Simple JSON-file database. No external dependencies.
// Good for a single-tournament scale app; not meant for high concurrency.

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const TEAMS = [
  { id: 'script_breaker', name: 'Script Breaker FC', logo: '/assets/script_breaker.jpg' },
  { id: 'iron_wolves', name: 'Iron Wolves FC', logo: '/assets/iron_wolves.jpg' },
  { id: 'server_sentinel', name: 'Server Sentinel FC', logo: '/assets/server_sentinel.jpg' },
  { id: 'sovereign', name: 'Sovereign FC', logo: '/assets/sovereign.jpg' },
  { id: 'elite_eleven', name: 'Elite Eleven FC', logo: '/assets/elite_eleven.jpg' },
  { id: 'phantom_blitz', name: 'Phantom Blitz FC', logo: '/assets/phantom_blitz.jpg' },
];

const MIN_ROSTER = 5;

function defaultData() {
  return {
    registrationOpen: true,
    players: [],   // { id, playerId, name, device, photoUrl, teamId, isCaptain, createdAt }
    matches: [],   // { id, teamA, teamB, legs:[{playerAId,playerAName,playerBId,playerBName,scoreA,scoreB}], legsWonA, legsWonB, goalsA, goalsB, playedAt }
  };
}

function load() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    const fresh = defaultData();
    save(fresh);
    return fresh;
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// In-memory cache, flushed to disk on every mutation. Fine at this scale.
let cache = load();

function getState() {
  return cache;
}

function persist() {
  save(cache);
}

function teamById(id) {
  return TEAMS.find(t => t.id === id) || null;
}

function publicPlayer(p) {
  return {
    id: p.id,
    playerId: p.playerId,
    name: p.name,
    device: p.device,
    photoUrl: p.photoUrl,
    teamId: p.teamId,
    isCaptain: p.isCaptain,
    createdAt: p.createdAt,
  };
}

function computeStandings() {
  const table = {};
  TEAMS.forEach(t => { table[t.id] = { teamId: t.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; });
  cache.matches.forEach(m => {
    const a = table[m.teamA], b = table[m.teamB];
    if (!a || !b) return;
    a.p++; b.p++;
    a.gf += m.goalsA; a.ga += m.goalsB;
    b.gf += m.goalsB; b.ga += m.goalsA;
    if (m.legsWonA > m.legsWonB) { a.w++; a.pts += 3; b.l++; }
    else if (m.legsWonB > m.legsWonA) { b.w++; b.pts += 3; a.l++; }
    else { a.d++; b.d++; a.pts += 1; b.pts += 1; }
  });
  return Object.values(table).sort((x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    const gdX = x.gf - x.ga, gdY = y.gf - y.ga;
    if (gdY !== gdX) return gdY - gdX;
    return y.gf - x.gf;
  });
}

module.exports = {
  TEAMS,
  MIN_ROSTER,
  getState,
  persist,
  teamById,
  publicPlayer,
  computeStandings,
};
