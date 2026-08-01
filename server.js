// Bid-to-Win: The Grand Reopening — tournament backend
// Zero external dependencies. Node's built-in http, fs, crypto, path only.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const db = require('./lib/db');
const auth = require('./lib/auth');

// ---------- Config ----------
loadDotEnv();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD_SALT = process.env.ADMIN_PASSWORD_SALT;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

if (!ADMIN_PASSWORD_SALT || !ADMIN_PASSWORD_HASH) {
  console.error('Missing ADMIN_PASSWORD_SALT / ADMIN_PASSWORD_HASH in .env.');
  console.error('Run: node scripts/hash-password.js "your-password"  and paste the output into .env');
  process.exit(1);
}

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---------- Tiny .env loader (no dependency) ----------
function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  });
}

// ---------- Helpers ----------
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function sendText(res, status, text, contentType) {
  res.writeHead(status, { 'Content-Type': contentType || 'text/plain; charset=utf-8' });
  res.end(text);
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req, maxBytes = 8 * 1024 * 1024) {
  const buf = await readBody(req, maxBytes);
  if (buf.length === 0) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch (e) { throw new Error('Invalid JSON'); }
}

function isAdmin(req) {
  const cookies = auth.parseCookies(req);
  return auth.isValidSession(cookies.session);
}

function requireAdmin(req, res) {
  if (!isAdmin(req)) {
    sendJson(res, 401, { error: 'Admin session required.' });
    return false;
  }
  return true;
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

function saveBase64Photo(dataUrl, id) {
  const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  const ext = match[1] === 'png' ? 'png' : 'jpg';
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 4 * 1024 * 1024) throw new Error('Photo too large');
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);
  return `/uploads/${filename}`;
}

function deletePhotoFile(photoUrl) {
  if (!photoUrl || !photoUrl.startsWith('/uploads/')) return;
  const filePath = path.join(UPLOADS_DIR, path.basename(photoUrl));
  fs.unlink(filePath, () => {});
}

function csvEscape(val) {
  return `"${String(val).replace(/"/g, '""')}"`;
}

// ---------- Static file serving ----------
function serveStatic(req, res, rootDir, urlPath) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(rootDir, safePath);
  if (!filePath.startsWith(rootDir)) { sendText(res, 403, 'Forbidden'); return; }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { sendText(res, 404, 'Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': stat.size });
    fs.createReadStream(filePath).pipe(res);
  });
}

// ---------- Route handlers ----------
async function handleApi(req, res, url) {
  const segments = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
  const method = req.method;

  // ----- Public reads -----
  if (method === 'GET' && segments[0] === 'teams') {
    return sendJson(res, 200, { teams: db.TEAMS, minRoster: db.MIN_ROSTER });
  }

  if (method === 'GET' && segments[0] === 'players' && segments[1] === 'recent') {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '8', 10) || 8, 50);
    const state = db.getState();
    const recent = [...state.players].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(db.publicPlayer);
    return sendJson(res, 200, { players: recent });
  }

  if (method === 'GET' && segments[0] === 'players') {
    const state = db.getState();
    const list = [...state.players].sort((a, b) => a.createdAt - b.createdAt).map(db.publicPlayer);
    return sendJson(res, 200, { players: list });
  }

  if (method === 'GET' && segments[0] === 'standings') {
    return sendJson(res, 200, { standings: db.computeStandings() });
  }

  if (method === 'GET' && segments[0] === 'matches') {
    const state = db.getState();
    const list = [...state.matches].sort((a, b) => b.playedAt - a.playedAt);
    return sendJson(res, 200, { matches: list });
  }

  if (method === 'GET' && segments[0] === 'registration-status') {
    return sendJson(res, 200, { open: db.getState().registrationOpen });
  }

  // ----- Public: register -----
  if (method === 'POST' && segments[0] === 'register') {
    const state = db.getState();
    if (!state.registrationOpen) return sendJson(res, 403, { error: 'Registration is currently closed.' });

    let body;
    try { body = await readJsonBody(req); } catch (e) { return sendJson(res, 400, { error: e.message }); }

    const name = (body.name || '').trim();
    const playerId = (body.playerId || '').trim();
    const device = (body.device || '').trim();
    const photo = body.photo || '';

    if (!name || !playerId || !device || !photo) {
      return sendJson(res, 400, { error: 'Name, Player ID, Device and Photo are all required.' });
    }
    if (state.players.some(p => p.playerId.toLowerCase() === playerId.toLowerCase())) {
      return sendJson(res, 409, { error: `Player ID "${playerId}" is already registered.` });
    }

    const id = newId();
    let photoUrl;
    try {
      photoUrl = saveBase64Photo(photo, id);
      if (!photoUrl) return sendJson(res, 400, { error: 'Photo must be a valid JPG or PNG image.' });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }

    const player = { id, playerId, name, device, photoUrl, teamId: null, isCaptain: false, createdAt: Date.now() };
    state.players.push(player);
    db.persist();
    return sendJson(res, 201, { player: db.publicPlayer(player) });
  }

  // ----- Admin: login/logout -----
  if (method === 'POST' && segments[0] === 'admin' && segments[1] === 'login') {
    let body;
    try { body = await readJsonBody(req); } catch (e) { return sendJson(res, 400, { error: e.message }); }
    const password = body.password || '';
    if (!auth.verifyPassword(password, ADMIN_PASSWORD_SALT, ADMIN_PASSWORD_HASH)) {
      return sendJson(res, 401, { error: 'Incorrect passcode.' });
    }
    const token = auth.createSession();
    res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; Max-Age=43200; SameSite=Strict`);
    return sendJson(res, 200, { ok: true });
  }

  if (method === 'POST' && segments[0] === 'admin' && segments[1] === 'logout') {
    const cookies = auth.parseCookies(req);
    if (cookies.session) auth.destroySession(cookies.session);
    res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
    return sendJson(res, 200, { ok: true });
  }

  if (method === 'GET' && segments[0] === 'admin' && segments[1] === 'check') {
    return sendJson(res, 200, { authenticated: isAdmin(req) });
  }

  // ----- Everything below requires an admin session -----
  if (segments[0] === 'admin') {
    if (!requireAdmin(req, res)) return;
    const state = db.getState();

    if (method === 'POST' && segments[1] === 'registration-status') {
      let body; try { body = await readJsonBody(req); } catch (e) { return sendJson(res, 400, { error: e.message }); }
      state.registrationOpen = !!body.open;
      db.persist();
      return sendJson(res, 200, { open: state.registrationOpen });
    }

    if (method === 'PUT' && segments[1] === 'players' && segments[2]) {
      const player = state.players.find(p => p.id === segments[2]);
      if (!player) return sendJson(res, 404, { error: 'Player not found.' });
      let body; try { body = await readJsonBody(req); } catch (e) { return sendJson(res, 400, { error: e.message }); }

      const name = (body.name || '').trim();
      const playerId = (body.playerId || '').trim();
      const device = (body.device || '').trim();
      if (!name || !playerId || !device) return sendJson(res, 400, { error: 'Name, Player ID and Device are required.' });

      if (state.players.some(p => p.id !== player.id && p.playerId.toLowerCase() === playerId.toLowerCase())) {
        return sendJson(res, 409, { error: `Player ID "${playerId}" is already used by another player.` });
      }

      player.name = name;
      player.playerId = playerId;
      player.device = device;
      if (body.photo) {
        try {
          const newUrl = saveBase64Photo(body.photo, player.id);
          if (newUrl) { deletePhotoFile(player.photoUrl); player.photoUrl = newUrl; }
        } catch (e) { return sendJson(res, 400, { error: e.message }); }
      }
      db.persist();
      return sendJson(res, 200, { player: db.publicPlayer(player) });
    }

    if (method === 'DELETE' && segments[1] === 'players' && segments[2]) {
      const idx = state.players.findIndex(p => p.id === segments[2]);
      if (idx === -1) return sendJson(res, 404, { error: 'Player not found.' });
      deletePhotoFile(state.players[idx].photoUrl);
      state.players.splice(idx, 1);
      db.persist();
      return sendJson(res, 200, { ok: true });
    }

    if (method === 'POST' && segments[1] === 'players' && segments[2] && segments[3] === 'assign') {
      const player = state.players.find(p => p.id === segments[2]);
      if (!player) return sendJson(res, 404, { error: 'Player not found.' });
      let body; try { body = await readJsonBody(req); } catch (e) { return sendJson(res, 400, { error: e.message }); }
      if (!db.teamById(body.teamId)) return sendJson(res, 400, { error: 'Unknown club.' });
      player.teamId = body.teamId;
      db.persist();
      return sendJson(res, 200, { player: db.publicPlayer(player) });
    }

    if (method === 'POST' && segments[1] === 'players' && segments[2] && segments[3] === 'unassign') {
      const player = state.players.find(p => p.id === segments[2]);
      if (!player) return sendJson(res, 404, { error: 'Player not found.' });
      player.teamId = null;
      player.isCaptain = false;
      db.persist();
      return sendJson(res, 200, { player: db.publicPlayer(player) });
    }

    if (method === 'POST' && segments[1] === 'players' && segments[2] && segments[3] === 'captain') {
      const player = state.players.find(p => p.id === segments[2]);
      if (!player || !player.teamId) return sendJson(res, 400, { error: 'Player must be assigned to a club first.' });
      const makeCaptain = !player.isCaptain;
      state.players.filter(p => p.teamId === player.teamId).forEach(p => { p.isCaptain = (p.id === player.id) && makeCaptain; });
      db.persist();
      return sendJson(res, 200, { player: db.publicPlayer(player) });
    }

    if (method === 'GET' && segments[1] === 'export.csv') {
      const rows = [['#', 'Name', 'Player ID', 'Club', 'Captain', 'Device', 'Registered At']];
      state.players.forEach((p, i) => {
        const t = db.teamById(p.teamId);
        rows.push([i + 1, p.name, p.playerId, t ? t.name : 'Unassigned', p.isCaptain ? 'Yes' : 'No', p.device, new Date(p.createdAt).toISOString()]);
      });
      const csv = rows.map(r => r.map(csvEscape).join(',')).join('\n');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="bid-to-win-roster.csv"' });
      return res.end(csv);
    }

    if (method === 'POST' && segments[1] === 'matches') {
      let body; try { body = await readJsonBody(req); } catch (e) { return sendJson(res, 400, { error: e.message }); }
      const { teamA, teamB, legs } = body;
      if (!db.teamById(teamA) || !db.teamById(teamB) || teamA === teamB) {
        return sendJson(res, 400, { error: 'Pick two different clubs.' });
      }
      if (!Array.isArray(legs) || legs.length !== 5) {
        return sendJson(res, 400, { error: 'A fixture needs exactly 5 legs.' });
      }
      const preparedLegs = [];
      for (const leg of legs) {
        const scoreA = parseInt(leg.scoreA, 10), scoreB = parseInt(leg.scoreB, 10);
        if (isNaN(scoreA) || isNaN(scoreB) || scoreA < 0 || scoreB < 0) {
          return sendJson(res, 400, { error: 'Every leg needs a valid, non-negative score.' });
        }
        const playerA = state.players.find(p => p.id === leg.playerAId);
        const playerB = state.players.find(p => p.id === leg.playerBId);
        if (!playerA || playerA.teamId !== teamA) return sendJson(res, 400, { error: 'A leg references a player not on the home club.' });
        if (!playerB || playerB.teamId !== teamB) return sendJson(res, 400, { error: 'A leg references a player not on the away club.' });
        preparedLegs.push({ playerAId: playerA.id, playerAName: playerA.name, playerBId: playerB.id, playerBName: playerB.name, scoreA, scoreB });
      }
      const legsWonA = preparedLegs.filter(l => l.scoreA > l.scoreB).length;
      const legsWonB = preparedLegs.filter(l => l.scoreB > l.scoreA).length;
      const goalsA = preparedLegs.reduce((s, l) => s + l.scoreA, 0);
      const goalsB = preparedLegs.reduce((s, l) => s + l.scoreB, 0);
      const match = { id: 'm_' + newId(), teamA, teamB, legs: preparedLegs, legsWonA, legsWonB, goalsA, goalsB, playedAt: Date.now() };
      state.matches.push(match);
      db.persist();
      return sendJson(res, 201, { match, standings: db.computeStandings() });
    }

    if (method === 'DELETE' && segments[1] === 'matches' && segments[2]) {
      const idx = state.matches.findIndex(m => m.id === segments[2]);
      if (idx === -1) return sendJson(res, 404, { error: 'Fixture not found.' });
      state.matches.splice(idx, 1);
      db.persist();
      return sendJson(res, 200, { standings: db.computeStandings() });
    }

    return sendJson(res, 404, { error: 'Unknown admin route.' });
  }

  return sendJson(res, 404, { error: 'Unknown API route.' });
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    if (url.pathname.startsWith('/uploads/')) {
      return serveStatic(req, res, UPLOADS_DIR, url.pathname.replace('/uploads/', ''));
    }
    if (url.pathname === '/' ) {
      return serveStatic(req, res, PUBLIC_DIR, 'index.html');
    }
    return serveStatic(req, res, PUBLIC_DIR, url.pathname);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'Server error.' });
  }
});

server.listen(PORT, () => {
  console.log(`Bid-to-Win server running at http://localhost:${PORT}`);
});
