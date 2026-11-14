import { OrbitAudio } from './audio.js';
import { mod, period } from './timing.js';

const $ = id => document.getElementById(id);
let selected = 0;
let hasPlayed = false;
let blooms = [];
let lastDebug = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const engine = new OrbitAudio(update);
const canvas = $('orbit');
const ctx = canvas.getContext('2d');
let width = 0, height = 0, scale = 1;
const speaker = muted => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4 6 8H3v8h3l5 4Z"/>${muted ? '<path d="m16 9 6 6m0-6-6 6"/>' : '<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'}</svg>`;

engine.layers.forEach((layer, index) => {
  const button = document.createElement('button');
  button.className = 'layer-button';
  button.style.setProperty('--color', layer.color);
  button.innerHTML = `<span class="layer-top"><span class="index">0${index + 1}</span><span class="mini-dots" aria-hidden="true"></span></span><span class="layer-bottom"><span class="layer-title">${layer.name}</span><span class="layer-count"></span></span>`;
  button.addEventListener('click', () => select(index));
  $('layer-list').append(button);
});
const layerButtons = [...$('layer-list').children];

function select(index) { selected = index; update(); }
function paintRange(input) {
  input.style.setProperty('--fill', `${(input.value - input.min) / (input.max - input.min) * 100}%`);
}
function update(reason = '') {
  const layer = engine.layers[selected];
  $('editor').style.setProperty('--accent', layer.color);
  $('layer-number').textContent = `EBENE 0${selected + 1}`;
  $('layer-name').textContent = layer.name;
  $('layer-description').textContent = layer.muted ? 'Stumm. Dein Rhythmus bleibt erhalten.' : layer.description;
  $('count').value = layer.count;
  $('minus').disabled = layer.count <= 1;
  $('plus').disabled = layer.count >= 16;
  $('phase').value = layer.phase;
  $('phase-value').value = `${layer.phase}°`;
  $('volume').value = layer.volume;
  $('volume-value').value = `${layer.volume} %`;
  $('mute').innerHTML = speaker(layer.muted);
  $('mute').setAttribute('aria-label', `${layer.name} ${layer.muted ? 'einschalten' : 'stummschalten'}`);
  $('mute').setAttribute('aria-pressed', String(layer.muted));
  $('tempo').value = engine.bpm;
  $('tempo-value').value = engine.bpm;
  $('master').value = engine.masterVolume;
  $('master-value').value = `${engine.masterVolume} %`;
  $('cycle-time').textContent = period(engine.bpm).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $('play').classList.toggle('playing', engine.running);
  $('play-label').textContent = engine.running ? 'Pause' : hasPlayed ? 'Fortsetzen' : 'Starten';
  $('status').textContent = engine.running ? 'Im gemeinsamen Fluss' : hasPlayed ? 'Der Moment bleibt.' : 'Bereit zum Entdecken';
  $('status-dot').classList.toggle('active', engine.running);
  $('center-text').textContent = engine.running ? 'IM EINKLANG' : hasPlayed ? 'INNEHALTEN' : 'IM EINKLANG';
  $('message').textContent = reason || (engine.running ? 'Verändere die Ebenen. Finde deinen eigenen Rhythmus.' : hasPlayed ? 'Fortsetzen spielt an derselben Stelle weiter.' : 'Der Klang beginnt erst mit deinem Klick.');
  layerButtons.forEach((button, index) => {
    const value = engine.layers[index];
    button.setAttribute('aria-pressed', String(index === selected));
    button.setAttribute('aria-label', `${value.name}, ${value.count} Impulse${value.muted ? ', stumm' : ''}`);
    button.classList.toggle('muted', value.muted);
    button.querySelector('.layer-count').textContent = value.count;
    button.querySelector('.mini-dots').innerHTML = '<i></i>'.repeat(value.count);
  });
  document.querySelectorAll('input[type="range"]').forEach(paintRange);
}

async function toggle() {
  if (engine.busy) return;
  if (engine.running) { engine.pause(); blooms = []; return; }
  $('play').disabled = true;
  $('reset').disabled = true;
  try {
    await engine.start();
    hasPlayed = true;
    update();
  } catch (error) { update(error.message || 'Audio konnte nicht starten. Bitte erneut versuchen.'); }
  finally { $('play').disabled = false; $('reset').disabled = false; }
}
$('play').addEventListener('click', toggle);
$('reset').addEventListener('click', () => {
  hasPlayed = false;
  selected = 0;
  blooms = [];
  engine.reset();
  update('Zurück am Anfang: 3 · 4 · 5 · 7 Impulse.');
});
$('minus').addEventListener('click', () => engine.setLayer(selected, 'count', engine.layers[selected].count - 1));
$('plus').addEventListener('click', () => engine.setLayer(selected, 'count', engine.layers[selected].count + 1));
$('phase').addEventListener('input', event => engine.setLayer(selected, 'phase', +event.target.value));
$('volume').addEventListener('input', event => engine.setLayer(selected, 'volume', +event.target.value));
$('mute').addEventListener('click', () => engine.setLayer(selected, 'muted', !engine.layers[selected].muted));
$('tempo').addEventListener('input', event => engine.setTempo(+event.target.value));
$('master').addEventListener('input', event => engine.setMaster(+event.target.value));
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { $('message').textContent = 'Vollbild ist hier nicht verfügbar. Vergrößere stattdessen das Browserfenster.'; }
});
document.addEventListener('fullscreenchange', () => {
  $('fullscreen').querySelector('span').textContent = document.fullscreenElement ? 'Vollbild verlassen' : 'Vollbild';
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && engine.running) { engine.pause('Beim Verlassen der Installation automatisch pausiert.'); blooms = []; }
});
window.addEventListener('pagehide', () => engine.pause());
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
  if (/^[1-4]$/.test(event.key)) { event.preventDefault(); select(Number(event.key) - 1); }
  if (event.code === 'Space' && !event.target.closest('button, a, summary')) { event.preventDefault(); toggle(); }
});

function resize() {
  const box = canvas.getBoundingClientRect();
  width = box.width; height = box.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scale = Math.min(width / 650, height / 660);
}
new ResizeObserver(resize).observe(canvas);
canvas.addEventListener('click', event => {
  const rect = canvas.getBoundingClientRect();
  const radius = Math.hypot(event.clientX - rect.left - width / 2, event.clientY - rect.top - height * 0.51) / scale;
  const nearest = engine.layers.map((layer, i) => ({ i, delta: Math.abs(layer.radius - radius) })).sort((a, b) => a.delta - b.delta)[0];
  if (nearest.delta < 30) select(nearest.i);
});

function polar(radius, angle) { return [Math.sin(angle) * radius, -Math.cos(angle) * radius]; }
function circle(x, y, radius, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); }
function glow(x, y, size, color, alpha) {
  ctx.globalAlpha = alpha;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
  gradient.addColorStop(0, color + '65'); gradient.addColorStop(0.35, color + '22'); gradient.addColorStop(1, color + '00');
  circle(x, y, size, gradient); ctx.globalAlpha = 1;
}

function draw() {
  const frame = engine.frame();
  blooms.push(...frame.hits);
  blooms = engine.running ? blooms.filter(hit => frame.time - hit.time < 0.65) : [];
  const angle = mod(frame.cycle) * Math.PI * 2;
  ctx.clearRect(0, 0, width, height);
  ctx.save(); ctx.translate(width / 2, height * 0.51); ctx.scale(scale, scale);

  // A barely visible halo grounds the installation without a raster background.
  glow(0, 0, 318, '#aac78a', 0.1);
  for (let i = 0; i < 72; i++) {
    const [x, y] = polar(303, i / 72 * Math.PI * 2);
    const [x2, y2] = polar(i % 6 === 0 ? 307 : 305, i / 72 * Math.PI * 2);
    ctx.strokeStyle = i % 6 === 0 ? '#9faa8552' : '#9faa8522'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.font = '9px sans-serif'; ctx.fillStyle = '#949f7f'; ctx.textAlign = 'center';
  ctx.fillText('D E R  A N F A N G', 0, -321);

  frame.layers.forEach((layer, index) => {
    const muted = layer.muted || layer.volume === 0;
    ctx.strokeStyle = layer.color + (muted ? '17' : index === selected ? '65' : '3b');
    ctx.lineWidth = index === selected ? 1.5 : 1;
    ctx.beginPath(); ctx.arc(0, 0, layer.radius, 0, Math.PI * 2); ctx.stroke();
    if (engine.running && !muted) {
      ctx.strokeStyle = layer.color + '7a'; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.arc(0, 0, layer.radius, angle - Math.PI / 2 - 0.23, angle - Math.PI / 2); ctx.stroke();
    }
    for (let p = 0; p < layer.count; p++) {
      const pointAngle = (p / layer.count + layer.phase / 360) * Math.PI * 2;
      const [x, y] = polar(layer.radius, pointAngle);
      if (!muted) glow(x, y, index === selected ? 17 : 12, layer.color, .55);
      circle(x, y, index === selected ? 4.7 : 3.8, layer.color + (muted ? '50' : 'ee'));
      if (index === selected && !muted) circle(x, y, 1.6, '#f4ffe5');
    }
    const [lx, ly] = polar(layer.radius, 4.05);
    circle(lx, ly, 11, '#151a11');
    ctx.fillStyle = layer.color + (muted ? '60' : 'c0'); ctx.font = '10px sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(`0${index + 1}`, lx, ly);
  });

  // Pointer and flashes use the very same timestamps as AudioBufferSource.start().
  const [sx, sy] = polar(48, angle), [ex, ey] = polar(287, angle);
  const beam = ctx.createLinearGradient(sx, sy, ex, ey);
  beam.addColorStop(0, '#e5f3cd00'); beam.addColorStop(.4, '#e5f3cd45'); beam.addColorStop(1, '#e5f3cdbb');
  ctx.strokeStyle = beam; ctx.lineWidth = 1.25; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
  circle(ex, ey, 2.6, '#f0f6df'); glow(ex, ey, 13, '#e5f3cd', .5);
  for (const hit of blooms) {
    const elapsed = Math.max(0, frame.time - hit.time);
    const life = Math.exp(-elapsed * 9);
    const layer = frame.layers[hit.layer];
    if (layer.muted || layer.volume === 0) continue;
    const [x, y] = polar(layer.radius, hit.angle);
    glow(x, y, reducedMotion ? 19 : 32 + elapsed * 24, layer.color, life);
    if (!reducedMotion) {
      ctx.strokeStyle = layer.color; ctx.lineWidth = 1; ctx.globalAlpha = life * .7;
      ctx.beginPath(); ctx.arc(x, y, 7 + elapsed * 37, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    circle(x, y, 4.5 + life * 3, layer.color);
    circle(x, y, 2.4 * life, '#ffffff');
  }
  ctx.strokeStyle = '#a8b38c2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 42, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  if (!$('diagnostics').hidden && performance.now() - lastDebug > 150) {
    lastDebug = performance.now();
    $('debug-output').textContent = JSON.stringify(engine.diagnostics(), null, 2);
  }
  requestAnimationFrame(draw);
}

if (new URLSearchParams(location.search).has('debug')) { $('diagnostics').hidden = false; $('diagnostics').open = true; }
update(); resize(); draw();
