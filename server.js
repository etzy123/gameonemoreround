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

const players = JSON.parse(fs.readFileSync(path.join(__dirname, 'players.json'), 'utf8'));
const playerIds = new Set(players.map(p => p.id));

let state = { assignments: {}, locked: false, version: 0 };
try {
  const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  state = { ...state, ...saved };
  for (const id of Object.keys(state.assignments)) if (!playerIds.has(id)) delete state.assignments[id];
} catch { /* first boot */ }

function save() {
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, STATE_FILE);
}

function publicState() {
  return { event: EVENT_NAME, info: EVENT_INFO, bays: BAYS, perBay: PER_BAY,
           players, assignments: state.assignments, locked: state.locked, version: state.version };
}

const clients = new Set();
function broadcast() {
  const msg = `data: ${JSON.stringify(publicState())}\n\n`;
  for (const res of clients) res.write(msg);
}

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

// Body: { playerId, bay (1..BAYS or null), as (playerId of the person acting) }
app.post('/api/move', (req, res) => {
  const { playerId, bay, as } = req.body || {};
  const admin = isAdmin(req);
  if (!playerIds.has(playerId)) return res.status(400).json({ error: 'Unknown player.' });
  if (!admin && as !== playerId) return res.status(403).json({ error: 'You can only move yourself.' });
  if (state.locked && !admin) return res.status(423).json({ error: 'The bays are locked. Ask the organiser to change your spot.' });
  if (bay !== null && !(Number.isInteger(bay) && bay >= 1 && bay <= BAYS))
    return res.status(400).json({ error: 'That bay does not exist.' });

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

app.post('/api/lock', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
  state.locked = !!(req.body && req.body.locked);
  state.version++; save(); broadcast();
  res.json(publicState());
});

app.post('/api/reset', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only.' });
  state.assignments = {}; state.version++; save(); broadcast();
  res.json(publicState());
});

app.listen(PORT, () => console.log(`Bay picker on :${PORT}`));
