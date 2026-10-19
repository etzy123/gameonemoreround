const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const BAYS = parseInt(process.env.BAYS || '12', 10);
const PER_BAY = parseInt(process.env.PER_BAY || '4', 10);
const EVENT_NAME = process.env.EVENT_NAME || 'One More Round 001';
const EVENT_INFO = process.env.EVENT_INFO || 'Friday 23 October, Flight Golf Amsterdam';

const STATE_FILE = path.join(DATA_DIR, 'state.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

const basePlayers = JSON.parse(fs.readFileSync(path.join(__dirname, 'players.json'), 'utf8'));
// Players added by the organiser live in state.added, so they survive redeploys.
const allPlayers = () => basePlayers.concat(state.added || []);
const hasPlayer = id => allPlayers().some(p => p.id === id);

let state = { assignments: {}, locked: false, lockedBays: {}, removed: {}, added: [], version: 0 };
try {
  const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  state = { ...state, ...saved };
  if (!Array.isArray(state.added)) state.added = [];
  for (const id of Object.keys(state.assignments)) if (!hasPlayer(id)) delete state.assignments[id];
  if (!state.lockedBays || typeof state.lockedBays !== 'object') state.lockedBays = {};
  if (!state.removed || typeof state.removed !== 'object') state.removed = {};
} catch {
  // First boot: start from the random pre-assignment in seed.json, if present.
  try { state = { ...state, ...JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8')) }; save(); } catch {}
}

function save() {
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, STATE_FILE);
}

const activePlayers = () => allPlayers().filter(p => !state.removed[p.id]);
const isActive = id => hasPlayer(id) && !state.removed[id];

function publicState() {
  return { event: EVENT_NAME, info: EVENT_INFO, bays: BAYS, perBay: PER_BAY,
           players: activePlayers(), assignments: state.assignments, locked: state.locked,
           lockedBays: Object.keys(state.lockedBays).map(Number), version: state.version };
}

const clients = new Set();
function broadcast() {
  const msg = `data: ${JSON.stringify(publicState())}\n\n`;
  for (const res of clients) res.write(msg);
}

const bayLocked = b => !!(b && state.lockedBays[b]);
const BAY_LOCKED_MSG = b => `Bay ${b} is locked. Ask the organiser if you need to change it.`;

const isAdmin = req => ADMIN_TOKEN && req.get('x-admin-token') === ADMIN_TOKEN;

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/state', (req, res) => res.json(publicState()));

app.get('/api/admin-check', (req, res) => res.json({ admin: !!isAdmin(req) }));

app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify(publicState())}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
});

// Body: { playerId, bay (1..BAYS or null) }
app.post('/api/move', (req, res) => {
  const { playerId, bay } = req.body || {};
  const admin = isAdmin(req);
  if (!isActive(playerId)) return res.status(400).json({ error: 'Unknown player.' });
  if (state.locked && !admin) return res.status(423).json({ error: 'The bays are locked. Ask the organiser to change your spot.' });
  if (bay !== null && !(Number.isInteger(bay) && bay >= 1 && bay <= BAYS))
    return res.status(400).json({ error: 'That bay does not exist.' });

  if (!admin) {
    const from = state.assignments[playerId];
    if (bayLocked(from)) return res.status(423).json({ error: BAY_LOCKED_MSG(from) });
    if (bayLocked(bay)) return res.status(423).json({ error: BAY_LOCKED_MSG(bay) });
  }
  if (bay === null) {
    delete state.assignments[playerId];
  } else {
    if (state.assignments[playerId] === bay) return res.json(publicState());
    const taken = Object.entries(state.assignments).filter(([id, b]) => b === bay && id !== playerId).length;
    if (taken >= PER_BAY) return res.status(409).json({ error: `Bay ${bay} is full.` });
    state.assignments[playerId] = bay;
  }
  state.version++;
  save();
  broadcast();
  res.json(publicState());
});

// Body: { a, b } -> the two players trade places (a bay or the waiting list).
app.post('/api/swap', (req, res) => {
  const { a, b } = req.body || {};
  if (!isActive(a) || !isActive(b) || a === b) return res.status(400).json({ error: 'Unknown player.' });
  if (state.locked && !isAdmin(req)) return res.status(423).json({ error: 'The bays are locked. Ask the organiser to change your spot.' });
  const ba = state.assignments[a], bb = state.assignments[b];
  if (ba === bb) return res.json(publicState());
  if (!isAdmin(req)) {
    if (bayLocked(ba)) return res.status(423).json({ error: BAY_LOCKED_MSG(ba) });
    if (bayLocked(bb)) return res.status(423).json({ error: BAY_LOCKED_MSG(bb) });
  }
  if (bb) state.assignments[a] = bb; else delete state.assignments[a];
  if (ba) state.assignments[b] = ba; else delete state.assignments[b];
  state.version++; save(); broadcast();
  res.json(publicState());
});

// Body: { bay, locked }. Anyone can lock a bay that has players in it; only the organiser can unlock.
app.post('/api/bay-lock', (req, res) => {
  const { bay, locked } = req.body || {};
  const admin = isAdmin(req);
  if (!(Number.isInteger(bay) && bay >= 1 && bay <= BAYS)) return res.status(400).json({ error: 'That bay does not exist.' });
  if (locked) {
    if (state.locked && !admin) return res.status(423).json({ error: 'The bays are locked. Ask the organiser to change your spot.' });
    if (!Object.values(state.assignments).includes(bay)) return res.status(400).json({ error: `Bay ${bay} is empty.` });
    state.lockedBays[bay] = true;
  } else {
    if (!admin) return res.status(403).json({ error: 'Only the organiser can unlock a bay.' });
    delete state.lockedBays[bay];
  }
  state.version++; save(); broadcast();
  res.json(publicState());
});

// Organiser only: take a player off the roster, or put them back on the waiting list.
app.post('/api/remove', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
  const { playerId } = req.body || {};
  if (!isActive(playerId)) return res.status(400).json({ error: 'Unknown player.' });
  const bay = state.assignments[playerId];
  delete state.assignments[playerId];
  state.removed[playerId] = true;
  if (bay && !Object.values(state.assignments).includes(bay)) delete state.lockedBays[bay];
  state.version++; save(); broadcast();
  res.json(publicState());
});

app.post('/api/restore', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
  const { playerId } = req.body || {};
  if (!hasPlayer(playerId) || !state.removed[playerId]) return res.status(400).json({ error: 'Unknown player.' });
  delete state.removed[playerId];
  state.version++; save(); broadcast();
  res.json(publicState());
});

// Organiser only. Body: { name }. New players land on the waiting list ("Not in a bay").
app.post('/api/add', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
  const name = String((req.body && req.body.name) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: 'Enter a name.' });
  if (activePlayers().some(p => p.name.toLowerCase() === name.toLowerCase()))
    return res.status(409).json({ error: `${name} is already on the list.` });
  let n = state.added.length + 1, id;
  do { id = 'a' + String(n++).padStart(2, '0'); } while (hasPlayer(id));
  state.added.push({ id, name });
  state.version++; save(); broadcast();
  res.json(publicState());
});

app.get('/api/removed', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
  res.json(allPlayers().filter(p => state.removed[p.id]));
});

app.post('/api/lock', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
  state.locked = !!(req.body && req.body.locked);
  state.version++; save(); broadcast();
  res.json(publicState());
});

app.post('/api/shuffle', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
  // Players in locked bays stay put; everyone else is shuffled over the remaining space.
  const ids = activePlayers().map(p => p.id).filter(id => !bayLocked(state.assignments[id]));
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  for (const id of ids) delete state.assignments[id];
  const open = [];
  for (let b = 1; b <= BAYS; b++) {
    if (bayLocked(b)) continue;
    for (let k = 0; k < PER_BAY; k++) open.push({ b, k });
  }
  open.sort((x, y) => x.k - y.k || x.b - y.b);
  ids.forEach((id, i) => { if (open[i]) state.assignments[id] = open[i].b; });
  state.version++; save(); broadcast();
  res.json(publicState());
});

app.post('/api/reset', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
  state.assignments = {}; state.lockedBays = {}; state.version++; save(); broadcast();
  res.json(publicState());
});

app.listen(PORT, () => console.log(`Bay picker on :${PORT}`));
