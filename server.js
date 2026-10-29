// 3Dパーティーゲーム サーバー (Node.js + ws)  サーバー権威でゲームを進行します
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') return res.end('ok');
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(PUB, path.normalize(p));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(d);
  });
});
const wss = new WebSocketServer({ server });

const DT = 1 / 30, R = 12, SPEED = 7;
const GAMES = ['coin', 'dodge', 'race'];
const DUR = { coin: 25, dodge: 30, race: 30 };
const PTS = [5, 3, 2, 1, 0, 0, 0, 0];
const COLORS = ['#ff5252', '#448aff', '#ffd740', '#69f0ae', '#e040fb', '#ff9100', '#18ffff', '#b2ff59'];
const rooms = new Map();
let nextId = 1;

const rnd = (a, b) => a + Math.random() * (b - a);
const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
const bcast = (r, o) => { const s = JSON.stringify(o); r.players.forEach(p => p.ws.readyState === 1 && p.ws.send(s)); };
const roster = r => bcast(r, { t: 'roster', phase: r.phase, players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, total: p.total })) });

function getRoom(name) {
  if (!rooms.has(name)) rooms.set(name, { name, players: new Map(), phase: 'lobby', queue: [], game: null, time: 0, coins: [], balls: [], spawnT: 0, elapsed: 0 });
  return rooms.get(name);
}
function spawnPos(r, i, n) {
  if (r.game === 'race') return [-10 + (20 * (i + 0.5)) / n, 13];
  const a = (i / n) * Math.PI * 2; return [Math.cos(a) * 6, Math.sin(a) * 6];
}
function startRound(r) {
  r.game = r.queue.shift(); r.phase = 'intro'; r.time = 3; r.elapsed = 0;
  r.coins = []; r.balls = []; r.spawnT = 1;
  if (r.game === 'coin') for (let i = 0; i < 10; i++) r.coins.push(newCoin());
  let i = 0; const n = r.players.size;
  r.players.forEach(p => { [p.x, p.z] = spawnPos(r, i++, n); p.dx = p.dz = 0; p.score = 0; p.alive = true; p.done = false; });
  roster(r);
}
function newCoin() { const a = rnd(0, 6.28), d = Math.sqrt(Math.random()) * (R - 1); return [Math.cos(a) * d, Math.sin(a) * d]; }

function endRound(r) {
  r.phase = 'result'; r.time = 6;
  const arr = [...r.players.values()].sort((a, b) => b.score - a.score);
  const rows = arr.map((p, i) => { const pts = p.score > 0 ? PTS[i] : 0; p.total += pts; return { name: p.name, color: p.color, score: Math.round(p.score * 10) / 10, pts, total: p.total }; });
  const final = r.queue.length === 0;
  bcast(r, { t: 'result', rows, final, game: r.game });
  roster(r);
}
function update(r) {
  if (r.phase === 'intro') { r.time -= DT; if (r.time <= 0) { r.phase = 'play'; r.time = DUR[r.game]; } }
  else if (r.phase === 'result') {
    r.time -= DT;
    if (r.time <= 0) {
      if (r.queue.length) startRound(r);
      else { r.phase = 'lobby'; r.game = null; r.players.forEach(p => p.total = 0); bcast(r, { t: 'lobby' }); roster(r); }
    }
  } else if (r.phase === 'play') {
    r.time -= DT; r.elapsed += DT;
    r.players.forEach(p => {
      if (!p.alive || p.done) return;
      p.x += p.dx * SPEED * DT; p.z += p.dz * SPEED * DT;
      if (r.game === 'race') { p.x = Math.max(-12, Math.min(12, p.x)); p.z = Math.max(-15, Math.min(15, p.z)); }
      else { const d = Math.hypot(p.x, p.z); if (d > R) { p.x *= R / d; p.z *= R / d; } }
    });
    let over = r.time <= 0;
    if (r.game === 'coin') {
      r.players.forEach(p => r.coins.forEach((c, i) => { if (Math.hypot(p.x - c[0], p.z - c[1]) < 1.3) { p.score++; r.coins[i] = newCoin(); } }));
    } else if (r.game === 'dodge') {
      r.spawnT -= DT;
      if (r.spawnT <= 0) { const a = rnd(0, 6.28), d = Math.sqrt(Math.random()) * (R - 1); r.balls.push([Math.cos(a) * d, 18, Math.sin(a) * d]); r.spawnT = Math.max(0.2, 0.9 - r.elapsed * 0.02) / Math.max(1, r.players.size * 0.6); }
      r.balls.forEach(b => b[1] -= 14 * DT);
      r.players.forEach(p => { if (!p.alive) return; p.score += DT; r.balls.forEach(b => { if (b[1] < 1.6 && b[1] > -0.5 && Math.hypot(p.x - b[0], p.z - b[2]) < 1.4) p.alive = false; }); });
      r.balls = r.balls.filter(b => b[1] > -1);
      const alive = [...r.players.values()].filter(p => p.alive).length;
      if (alive === 0 || (r.players.size > 1 && alive <= 1)) over = true;
    } else if (r.game === 'race') {
      r.players.forEach(p => { if (!p.done && p.z <= -14) { p.done = true; p.score = Math.max(1, r.time * 10); } });
      if ([...r.players.values()].every(p => p.done)) over = true;
    }
    if (over) return endRound(r);
  }
  bcast(r, { t: 's', phase: r.phase, game: r.game, time: Math.max(0, r.time),
    p: [...r.players.values()].map(p => [p.id, +p.x.toFixed(2), +p.z.toFixed(2), Math.round(p.score * 10) / 10, p.alive ? 1 : 0]),
    c: r.coins, b: r.balls.map(b => [+b[0].toFixed(2), +b[1].toFixed(2), +b[2].toFixed(2)]) });
}
setInterval(() => rooms.forEach((r, k) => { if (!r.players.size) rooms.delete(k); else update(r); }), DT * 1000);

wss.on('connection', ws => {
  let room = null, me = null; ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join' && !room) {
      const r = getRoom(String(m.room || 'lobby').replace(/[^\w-]/g, '').slice(0, 16) || 'lobby');
      if (r.players.size >= 8) return send(ws, { t: 'err', text: 'このルームは満員です(最大8人)' });
      const used = new Set([...r.players.values()].map(p => p.color));
      me = { id: nextId++, ws, name: String(m.name || 'ゲスト').slice(0, 12), color: COLORS.find(c => !used.has(c)) || COLORS[0], x: 0, z: 0, dx: 0, dz: 0, score: 0, total: 0, alive: true, done: false };
      room = r; r.players.set(me.id, me);
      send(ws, { t: 'hello', id: me.id, room: r.name }); roster(r);
    } else if (m.t === 'in' && me) {
      const l = Math.hypot(m.dx, m.dz) || 1;
      me.dx = Math.max(-1, Math.min(1, m.dx / Math.max(1, l))) || 0; me.dz = Math.max(-1, Math.min(1, m.dz / Math.max(1, l))) || 0;
    } else if (m.t === 'start' && me && room.phase === 'lobby') {
      room.queue = [...GAMES].sort(() => Math.random() - 0.5); startRound(room);
    }
  });
  ws.on('close', () => { if (room) { room.players.delete(me.id); roster(room); } });
});
setInterval(() => wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }), 30000);
server.listen(PORT, () => console.log('listening on ' + PORT));
