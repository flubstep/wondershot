import * as THREE from 'three';
import { HeadTracker } from './tracker.js';
import { WindowCamera } from './projection.js';
import { Room } from './scene.js';
import { OneEuroVec3 } from './filter.js';

// ---------- settings (persisted) ----------
const DEFAULTS = {
  screenWidthMm: 302, // physical width of the whole display. 14" MBP ≈ 302, 16" ≈ 344, 27" ≈ 597
  hfovDeg: 60, // webcam horizontal field of view
  camOffsetXMm: 0, // webcam position relative to top-centre of the display
  camOffsetYMm: 6, // distance from the top edge of the picture up to the webcam lens
  calibDistanceMm: 600, // distance assumed when you press 'c'
  smoothMinCutoff: 1.2,
  smoothBeta: 0.008,
};
const settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('wondershot.settings') || '{}') };
const saveSettings = () => localStorage.setItem('wondershot.settings', JSON.stringify(settings));

// ---------- three.js ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const room = new Room();
scene.add(room.group);
const win = new WindowCamera();

// ---------- state ----------
const tracker = new HeadTracker({ hfovDeg: settings.hfovDeg });
let smoother = new OneEuroVec3({ minCutoff: settings.smoothMinCutoff, beta: settings.smoothBeta });
const state = {
  tracking: true,
  mouseMode: false,
  debug: true,
  started: false,
  eye: [0, 0, 600],
  rawHead: null,
  mouse: [0, 0],
  lostFrames: 0,
};

// Physical rectangle of this browser viewport in mm, origin at display centre.
function viewportRectMm() {
  const mmPerPx = settings.screenWidthMm / screen.width;
  const chrome = Math.max(0, window.outerHeight - window.innerHeight);
  const vx = document.fullscreenElement ? 0 : window.screenX;
  const vy = document.fullscreenElement ? 0 : window.screenY + chrome;
  const l = (vx - screen.width / 2) * mmPerPx;
  const t = (screen.height / 2 - vy) * mmPerPx;
  return { l, r: l + window.innerWidth * mmPerPx, b: t - window.innerHeight * mmPerPx, t };
}
function screenHeightMm() {
  return settings.screenWidthMm * (screen.height / screen.width);
}

let lastRectKey = '';
function layout() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  const r = viewportRectMm();
  win.setRect(r.l, r.r, r.b, r.t);
  const key = [r.l, r.r, r.b, r.t].map((v) => v.toFixed(1)).join(',');
  if (key !== lastRectKey) {
    lastRectKey = key;
    room.build(r);
  }
}
window.addEventListener('resize', layout);
document.addEventListener('fullscreenchange', layout);
layout();

// ---------- head -> eye in world ----------
function eyeFromHead(h) {
  // Webcam sits at the top-centre of the display, optical axis assumed
  // perpendicular to the screen. Camera frame -> display frame is a translation.
  const camY = screenHeightMm() / 2 + settings.camOffsetYMm;
  return [h.x + settings.camOffsetXMm, h.y + camY, Math.max(80, h.z)];
}

function updateEye(tSec) {
  if (state.mouseMode) {
    const [mx, my] = state.mouse;
    const r = win.rect;
    const w = r.r - r.l, hh = r.t - r.b;
    state.eye = smoother.filter([(mx - 0.5) * 2 * w, -(my - 0.5) * 2 * hh, 600], tSec);
    return;
  }
  if (!state.tracking) {
    state.eye = [0, 0, 600];
    return;
  }
  const head = tracker.update();
  state.rawHead = head;
  if (head) {
    state.lostFrames = 0;
    state.eye = smoother.filter(eyeFromHead(head), tSec);
  } else {
    state.lostFrames++;
  }
}

// ---------- debug preview ----------
const preview = document.getElementById('preview');
const pctx = preview.getContext('2d');
function drawPreview() {
  const v = tracker.video;
  if (v.readyState < 2) return;
  const W = preview.width, H = preview.height;
  pctx.save();
  pctx.translate(W, 0);
  pctx.scale(-1, 1); // mirror, like a mirror
  pctx.drawImage(v, 0, 0, W, H);
  const h = state.rawHead;
  if (h) {
    const [vw, vh] = tracker.frameSize;
    const sx = W / vw, sy = H / vh;
    pctx.strokeStyle = '#4cff9a';
    pctx.lineWidth = 1.5;
    for (const c of [h.eyeL, h.eyeR]) {
      pctx.beginPath();
      pctx.arc(c[0] * sx, c[1] * sy, (h.irisPx / 2) * sx, 0, Math.PI * 2);
      pctx.stroke();
    }
  }
  pctx.restore();
}

// ---------- HUD ----------
const hud = document.getElementById('hud');
const help = document.getElementById('help');
help.textContent = [
  'f  fullscreen (recommended)',
  't  toggle head tracking',
  'm  mouse mode (no camera)',
  'c  calibrate distance',
  's  settings',
  'd  debug overlay',
].join('\n');

function drawHud() {
  if (!state.debug) { hud.textContent = ''; return; }
  const h = state.rawHead;
  const e = state.eye;
  const lines = [
    `mode      ${state.mouseMode ? 'mouse' : state.tracking ? 'head tracking' : 'fixed (tracking off)'}`,
    `detector  ${tracker.fps.toFixed(0)} fps  ${tracker.frameSize.join('x')}`,
    h ? `iris      ${h.irisPx.toFixed(1)} px` : `iris      --`,
    h ? `head cam  x ${h.x.toFixed(0)}  y ${h.y.toFixed(0)}  z ${h.z.toFixed(0)} mm` : `head cam  no face`,
    `eye world x ${e[0].toFixed(0)}  y ${e[1].toFixed(0)}  z ${e[2].toFixed(0)} mm`,
    `screen    ${settings.screenWidthMm} x ${screenHeightMm().toFixed(0)} mm, hfov ${settings.hfovDeg}°, fscale ${tracker.focalScale.toFixed(3)}`,
  ];
  if (!document.fullscreenElement) lines.push('(press f for fullscreen — the window-to-screen offset is only estimated otherwise)');
  hud.innerHTML = lines.map((l) => (l.startsWith('(') ? `<span class="warn">${l}</span>` : l)).join('\n');
}

// ---------- settings panel ----------
const panel = document.getElementById('panel');
function buildPanel() {
  const fields = [
    ['screenWidthMm', 'display width (mm)'],
    ['hfovDeg', 'webcam HFOV (deg)'],
    ['camOffsetXMm', 'webcam x offset (mm)'],
    ['camOffsetYMm', 'webcam above picture (mm)'],
    ['calibDistanceMm', "'c' calibrates to (mm)"],
    ['smoothMinCutoff', 'smoothing min cutoff'],
    ['smoothBeta', 'smoothing beta'],
  ];
  panel.innerHTML =
    fields
      .map(([k, label]) => `<label>${label}<input data-k="${k}" type="number" step="any" value="${settings[k]}"></label>`)
      .join('') + `<div style="margin-top:6px;opacity:.7">esc or 's' to close · <a href="#" id="reset" style="color:#9aa4e0">reset</a></div>`;
  panel.querySelectorAll('input').forEach((inp) =>
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      if (!Number.isFinite(v)) return;
      settings[inp.dataset.k] = v;
      saveSettings();
      applySettings();
    }),
  );
  panel.querySelector('#reset').addEventListener('click', (e) => {
    e.preventDefault();
    Object.assign(settings, DEFAULTS);
    tracker.focalScale = 1;
    saveSettings();
    applySettings();
    buildPanel();
  });
}
function applySettings() {
  tracker.hfovDeg = settings.hfovDeg;
  smoother = new OneEuroVec3({ minCutoff: settings.smoothMinCutoff, beta: settings.smoothBeta });
  lastRectKey = '';
  layout();
}
buildPanel();

// ---------- input ----------
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Escape') panel.classList.remove('show'); return; }
  switch (e.key) {
    case 'f': document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); break;
    case 't': state.tracking = !state.tracking; state.mouseMode = false; smoother.reset(); break;
    case 'm': state.mouseMode = !state.mouseMode; smoother.reset(); break;
    case 'd': state.debug = !state.debug; preview.classList.toggle('show', state.debug && state.started); break;
    case 's': panel.classList.toggle('show'); break;
    case 'Escape': panel.classList.remove('show'); break;
    case 'c':
      if (tracker.calibrateDistance(settings.calibDistanceMm)) smoother.reset();
      break;
  }
});
window.addEventListener('mousemove', (e) => {
  state.mouse = [e.clientX / window.innerWidth, e.clientY / window.innerHeight];
});

// ---------- start ----------
const startEl = document.getElementById('start');
document.getElementById('startBtn').addEventListener('click', async () => {
  const btn = document.getElementById('startBtn');
  btn.disabled = true;
  btn.textContent = 'loading model…';
  try {
    await tracker.start();
    state.started = true;
    startEl.remove();
    preview.classList.toggle('show', state.debug);
  } catch (err) {
    console.error(err);
    btn.textContent = `camera failed: ${err.message} — press m for mouse mode`;
    startEl.addEventListener('click', () => { startEl.remove(); state.mouseMode = true; }, { once: true });
  }
});

// ---------- loop ----------
function frame(tMs) {
  requestAnimationFrame(frame);
  const tSec = tMs / 1000;
  updateEye(tSec);
  win.update(state.eye);
  room.update(state.eye);
  renderer.render(scene, win.camera);
  if (state.debug && state.started && !state.mouseMode) drawPreview();
  drawHud();
}
requestAnimationFrame(frame);
