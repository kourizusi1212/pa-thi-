import * as THREE from 'three';
const $ = id => document.getElementById(id);
const NAMES = { coin: 'コインラッシュ', dodge: 'メテオよけ', race: 'ダッシュレース' };
const HOW = { coin: 'コインをたくさん集めろ!', dodge: '落ちてくる玉をよけろ!', race: '奥のゴールまで一番乗り!' };
const R = 12;
let ws, myId = 0, roster = new Map(), S = null, game = null, phase = 'lobby', roomName = 'lobby';

// ---- three.js ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffd6a5); scene.fog = new THREE.Fog(0xffd6a5, 45, 100);
const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb08cff, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(10, 25, 10); scene.add(sun);
const stage = new THREE.Group(); scene.add(stage);
const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: .7 });
function resize() { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

function buildStage(g) {
  stage.clear();
  const add = (geo, c, x, y, z) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); stage.add(m); return m; };
  if (g === 'race') {
    add(new THREE.BoxGeometry(25, 1, 31), 0x7bd88f, 0, -.5, 0);
    add(new THREE.BoxGeometry(25, .05, 1.4), 0xffffff, 0, .03, -14.3);
    for (let i = 0; i < 12; i++) add(new THREE.BoxGeometry(1, .06, .7), i % 2 ? 0x2b1d4a : 0xffffff, -11.5 + i * 2.1, .06, -14.3);
    add(new THREE.BoxGeometry(.6, 6, .6), 0xff4f8b, -12.5, 3, -14.5); add(new THREE.BoxGeometry(.6, 6, .6), 0xff4f8b, 12.5, 3, -14.5);
    add(new THREE.BoxGeometry(25.6, 1, .6), 0xffc93c, 0, 6, -14.5);
  } else {
    add(new THREE.CylinderGeometry(R + .6, R + .6, 1, 48), g === 'dodge' ? 0x9b8cff : 0xffc93c, 0, -.5, 0);
    add(new THREE.TorusGeometry(R + .6, .35, 8, 64), 0xff4f8b, 0, .0, 0).rotation.x = Math.PI / 2;
  }
}

const label = (text, color) => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = '800 34px "M PLUS Rounded 1c",sans-serif'; x.textAlign = 'center'; x.lineWidth = 8; x.strokeStyle = '#2b1d4a'; x.strokeText(text, 128, 44); x.fillStyle = '#fff'; x.fillText(text, 128, 44);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); s.scale.set(3.2, .8, 1); s.renderOrder = 9; return s;
};
const avatars = new Map();
function avatar(id) {
  let a = avatars.get(id); const info = roster.get(id); if (!info) return null;
  if (!a) {
    const g = new THREE.Group(), c = new THREE.Color(info.color);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.6, .75, 1.2, 16), mat(c)); body.position.y = .6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.65, 20, 16), mat(c)); head.position.y = 1.7;
    const eyes = [-.22, .22].map(x => { const e = new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 8), mat(0x2b1d4a)); e.position.set(x, 1.8, .55); return e; });
    const l = label(info.name); l.position.y = 3.1;
    g.add(body, head, ...eyes, l); scene.add(g); a = { g, body, head, tx: 0, tz: 0, alive: 1, ready: false }; avatars.set(id, a);
  }
  return a;
}
const coinMeshes = [], ballMeshes = [];
const coinGeo = new THREE.CylinderGeometry(.6, .6, .15, 20), ballGeo = new THREE.SphereGeometry(1.1, 16, 12), ringGeo = new THREE.RingGeometry(.9, 1.4, 24);
function syncPool(pool, n, make) { while (pool.length < n) { const m = make(); scene.add(m); pool.push(m); } pool.forEach((m, i) => m.visible = i < n); }

// ---- 入力 ----
const keys = {}; let drag = null, last = [0, 0];
addEventListener('keydown', e => keys[e.code] = true); addEventListener('keyup', e => keys[e.code] = false);
addEventListener('pointerdown', e => { if (e.target === renderer.domElement) drag = [e.clientX, e.clientY]; });
addEventListener('pointerup', () => drag = null);
let dragVec = [0, 0];
addEventListener('pointermove', e => { if (drag) { const dx = e.clientX - drag[0], dz = e.clientY - drag[1], l = Math.hypot(dx, dz); dragVec = l > 8 ? [dx / Math.max(l, 50), dz / Math.max(l, 50)] : [0, 0]; } else dragVec = [0, 0]; });
setInterval(() => {
  if (!ws || ws.readyState !== 1) return;
  let dx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), dz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (!dx && !dz) [dx, dz] = dragVec;
  if (dx !== last[0] || dz !== last[1]) { last = [dx, dz]; ws.send(JSON.stringify({ t: 'in', dx, dz })); }
}, 40);

// ---- 通信 ----
function connect() {
  const name = $('name').value.trim() || 'ゲスト', room = $('room').value.trim() || 'lobby';
  localStorage.setItem('p3d', JSON.stringify({ name, room }));
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, room }));
  ws.onclose = () => { $('banner').textContent = '切断されました\nリロードしてね'; };
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.t === 'hello') { myId = m.id; roomName = m.room; $('join').classList.add('hide'); history.replaceState(null, '', '?room=' + m.room); $('share').textContent = '招待リンク: ' + location.href; }
    else if (m.t === 'err') alert(m.text);
    else if (m.t === 'roster') {
      roster = new Map(m.players.map(p => [p.id, p])); phase = m.phase;
      avatars.forEach((a, id) => { if (!roster.has(id)) { scene.remove(a.g); avatars.delete(id); } });
      renderLobby();
    } else if (m.t === 's') onState(m);
    else if (m.t === 'result') showResult(m);
    else if (m.t === 'lobby') { game = null; stage.clear(); resetObjs(); $('result').style.display = 'none'; }
  };
}
function resetObjs() { syncPool(coinMeshes, 0); syncPool(ballMeshes, 0); }
function renderLobby() {
  const inLobby = phase === 'lobby';
  $('lobby').classList.toggle('hide', !inLobby);
  $('lobbyinfo').textContent = `ルーム「${roomName}」 ${roster.size}人 — 3つのミニゲームで勝負!`;
  if (inLobby && !game) buildStage('coin');
}
function onState(m) {
  S = m; phase = m.phase;
  if (m.game !== game && m.game) { game = m.game; buildStage(game); resetObjs(); $('result').style.display = 'none'; }
  $('lobby').classList.toggle('hide', phase !== 'lobby');
  $('hud').style.display = phase === 'lobby' ? 'none' : 'block';
  $('gname').textContent = NAMES[game] || ''; $('timer').textContent = Math.ceil(m.time) + '秒';
  $('banner').textContent = phase === 'intro' ? `${NAMES[game]}\n${HOW[game]}\n${Math.ceil(m.time)}` : '';
  m.p.forEach(([id, x, z, sc, al]) => { const a = avatar(id); if (!a) return; a.tx = x; a.tz = z; a.alive = al; if (!a.ready) { a.g.position.set(x, 0, z); a.ready = true; } });
  const rows = m.p.map(p => ({ ...roster.get(p[0]), sc: p[3], id: p[0], al: p[4] })).filter(p => p.name).sort((a, b) => b.sc - a.sc);
  $('board').innerHTML = rows.map(p => `<div><i class="dot" style="background:${p.color}"></i><span style="flex:1">${esc(p.name)}${p.id === myId ? '(あなた)' : ''}</span><span>${phase === 'lobby' ? p.total : (p.al ? '' : '✕ ') + p.sc}</span></div>`).join('');
  if (m.c.length || ballMeshes.length || coinMeshes.length || m.b.length) {
    syncPool(coinMeshes, m.c.length, () => { const c = new THREE.Mesh(coinGeo, mat(0xffd700)); c.rotation.x = Math.PI / 2; return c; });
    m.c.forEach((c, i) => coinMeshes[i].position.set(c[0], 1.2, c[1]));
    syncPool(ballMeshes, m.b.length, () => { const g = new THREE.Group(); g.add(new THREE.Mesh(ballGeo, mat(0xff4f8b))); const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff2255, transparent: true, opacity: .6 })); r.rotation.x = -Math.PI / 2; g.add(r); g.ring = r; return g; });
    m.b.forEach((b, i) => { const g = ballMeshes[i]; g.position.set(b[0], Math.max(b[1], 1), b[2]); g.ring.position.y = .05 - g.position.y; });
  }
}
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function showResult(m) {
  const r = $('result'); r.style.display = 'block';
  r.innerHTML = `<h2>${m.final ? '最終結果' : NAMES[m.game] + ' 結果'}</h2>` + m.rows.map((p, i) => `<div><span>${i + 1}位</span><i class="dot" style="background:${p.color}"></i><span class="n">${esc(p.name)}</span><span>${p.score}</span><span style="color:var(--pink)">+${p.pts}</span><span>合計${p.total}</span></div>`).join('');
  if (m.final) { const w = [...m.rows].sort((a, b) => b.total - a.total)[0]; $('banner').textContent = `🏆 ${w.name} の優勝!`; }
}

// ---- ループ ----
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  avatars.forEach(a => {
    a.g.position.x += (a.tx - a.g.position.x) * .35; a.g.position.z += (a.tz - a.g.position.z) * .35;
    const moving = Math.hypot(a.tx - a.g.position.x, a.tz - a.g.position.z) > .05;
    if (moving) a.g.rotation.y = Math.atan2(a.tx - a.g.position.x, a.tz - a.g.position.z);
    a.g.scale.y += ((a.alive ? 1 : .25) - a.g.scale.y) * .3;
    a.g.position.y = a.alive && moving ? Math.abs(Math.sin(t * 14)) * .25 : 0;
  });
  coinMeshes.forEach((c, i) => c.rotation.z = t * 3 + i);
  const me = avatars.get(myId), fx = me ? me.g.position.x * .6 : 0, fz = me ? me.g.position.z * .6 : 0;
  cam.position.lerp(new THREE.Vector3(fx, 22, fz + 17), .1); cam.lookAt(fx, 0, fz - 1);
  renderer.render(scene, cam);
});

const saved = JSON.parse(localStorage.getItem('p3d') || '{}');
$('name').value = saved.name || ''; $('room').value = new URLSearchParams(location.search).get('room') || saved.room || '';
$('go').onclick = connect; $('start').onclick = () => ws.send(JSON.stringify({ t: 'start' }));
buildStage('coin');
