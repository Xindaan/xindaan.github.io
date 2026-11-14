import { C, TAU, WORLD, initialState, measure, preset } from './model.js';
import { ListenerAudio } from './audio.js';
import { FieldScene } from './scene.js';

const $ = id => document.getElementById(id);
let state = initialState();
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let theta = 0, speed = 1, why = false, audioBusy = false;
let lastFrame = 0, dirty = true;
const field = $('field');
const scene = new FieldScene($('field-canvas'), $('trace-canvas'));
const audio = new ListenerAudio(stats => {
  // Readable output telemetry for browser QA, from the real AudioWorklet samples.
  $('audio-button').dataset.outputRms = stats.rms.toPrecision(8);
  $('audio-button').dataset.outputPeak = stats.peak.toPrecision(8);
});
const number = (value, digits = 2) => value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (value, digits = 3) => (Math.abs(value) < 0.5 * 10 ** -digits ? '' : value > 0 ? '+' : '−') + number(Math.abs(value), digits);
let toastTimer;
function toast(text) { $('status').textContent = text; $('status').hidden = false;clearTimeout(toastTimer);toastTimer = setTimeout(() => { $('status').hidden = true; }, 5000); }

function positionMarkers() {
  [state.sources[0], state.sources[1], state.listener].forEach((point, i) => {
    const element = $(['source-a', 'source-b', 'listener'][i]);
    element.style.left = `${point.x / WORLD.width * 100}%`;element.style.top = `${point.y / WORLD.height * 100}%`;
    element.dataset.x = point.x.toFixed(3);element.dataset.y = point.y.toFixed(3);
    if (i < 2) element.classList.toggle('muted', !point.enabled || point.amplitude === 0);
  });
  const rect = field.getBoundingClientRect();const annotationWidth = Math.min(240, rect.width * 0.48);
  const x = state.listener.x / WORLD.width * rect.width;
  const y = state.listener.y / WORLD.height * rect.height;
  $('why-annotation').style.left = `${Math.max(12, Math.min(rect.width - annotationWidth - 12, x - annotationWidth / 2))}px`;
  $('why-annotation').style.top = `${Math.max(45, y > rect.height * 0.55 ? y - 115 : Math.min(rect.height - 95, y + 65))}px`;
}

function updateReadings() {
  const m = measure(state, theta);
  $('pressure-a').textContent = signed(m.pA); $('pressure-b').textContent = signed(m.pB);$('pressure-sum').textContent = signed(m.pSum);
  $('level-db').textContent = Number.isFinite(m.db) ? signed(m.db, 1) : '−∞';
  $('level-db').dataset.amplitude = m.amplitude.toPrecision(12);
  $('level-db').dataset.rms = m.rms.toPrecision(12);
  $('level-fill').style.width = `${Number.isFinite(m.db) ? Math.max(0, Math.min(100, (m.db + 60) / 80 * 100)) : 0}%`;
  $('amplitude-value').textContent = `Amplitude ${number(m.amplitude, 3)} · feste 1-m-Referenz`;
  $('path-difference').textContent = `${signed(m.pathDifference, 3)} m`;
  $('phase-difference').textContent = m.phaseDifference === null ? '— · ein Beitrag fehlt' : `${signed(m.phaseDifference * 180 / Math.PI, 1)}°`;
  $('distances').textContent = `${number(m.a.distance)} / ${number(m.b.distance)} m`;
  $('listener-position').textContent = `${number(state.listener.x, 1)} / ${number(state.listener.y, 1)} m`;
  const descriptions = { constructive: 'Konstruktive Interferenz', destructive: 'Destruktive Interferenz', single: 'Einzelne Quelle', silent: 'Beide Beiträge stumm', neutral: 'Kein Interferenzanteil' };
  $('interference-label').textContent = descriptions[m.kind];
  const degrees = Math.abs((m.phaseDifference ?? 0) * 180 / Math.PI);
  const phaseLabel = m.phaseDifference === null ? 'Kein Phasenvergleich' : degrees < 1 ? 'Gleiche Phase' : degrees > 179 ? 'Gegenphase' : `Um ${number(degrees, 0)}° versetzt`;
  $('why-title').textContent = `${phaseLabel} · ${m.kind === 'constructive' ? 'Verstärkung' : m.kind === 'destructive' ? 'Auslöschung' : 'Überlagerung'}`;
  $('why-detail').textContent = `Δr = ${signed(m.pathDifference, 3)} m${m.kind === 'destructive' ? m.amplitude < 1e-8 ? ' · gleiche Beiträge heben sich auf.' : degrees > 179 ? ' · ungleiche Amplituden lassen einen Rest.' : ' · Beiträge löschen sich teilweise aus.' : m.kind === 'constructive' ? ' · Beiträge verstärken einander.' : ''}`;
  $('snapshot-label').textContent = playing ? 'Eine Periode · laufend' : 'Eine Periode · Moment eingefroren';
  field.dataset.theta = theta.toFixed(8);
}

function updateControls() {
  $('frequency').value = state.frequency; $('frequency-value').innerHTML = `${state.frequency} <small>Hz</small>`;
  $('phase').value = Math.round(state.sources[1].phase * 180 / Math.PI); $('phase-value').textContent = `${$('phase').value}°`;
  $('wavelength').textContent = `λ = ${number(C / state.frequency)} m`;
  $('same-phase').classList.toggle('active', Math.abs(state.sources[1].phase) < 1e-6);
  $('opposite-phase').classList.toggle('active', Math.abs(Math.abs(state.sources[1].phase) - Math.PI) < 1e-6);
  ['a', 'b'].forEach((key, i) => {
    const source = state.sources[i];
    $(`amplitude-${key}`).value = Math.round(source.amplitude * 100);
    $(`amplitude-${key}-value`).textContent = `${Math.round(source.amplitude * 100)} %`;
    $(`mute-${key}`).setAttribute('aria-pressed', String(source.enabled));
    $(`mute-${key}`).setAttribute('aria-label', `Quelle ${key.toUpperCase()} ${source.enabled ? 'aktiv' : 'stumm'}`);
  });
  document.querySelectorAll('input[type=range]').forEach(input => input.style.setProperty('--fill', `${(input.value - input.min) / (input.max - input.min) * 100}%`));
  $('why-button').setAttribute('aria-pressed', String(why));$('why-annotation').hidden = !why;
  $('play-button').setAttribute('aria-pressed', String(!playing));$('play-label').textContent = playing ? 'Pause' : 'Weiter';$('play-icon').textContent = playing ? 'Ⅱ' : '▷';
  $('audio-label').textContent = !audio.enabled ? 'Ton einschalten' : playing ? 'Ton ausschalten' : 'Ton pausiert';
  $('audio-button').setAttribute('aria-pressed', String(audio.enabled));
  $('time-scale').textContent = `Bildzeit 1 : ${Math.round(440 / speed).toLocaleString('de-DE')} · Ton in Echtzeit`;
  positionMarkers(); updateReadings();
}

function changed({ custom = true, physics = true } = {}) {
  if (custom) document.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', 'false'));
  if (physics) { scene.update(state);audio.update(state, playing); }
  dirty = true; updateControls();
}

$('frequency').addEventListener('input', event => { state.frequency = Number(event.target.value);changed(); });
$('phase').addEventListener('input', event => { state.sources[1].phase = Number(event.target.value) * Math.PI / 180;changed(); });
$('same-phase').addEventListener('click', () => { state.sources[1].phase = 0;changed(); });
$('opposite-phase').addEventListener('click', () => { state.sources[1].phase = Math.PI;changed(); });
['a', 'b'].forEach((key, i) => {
  $(`amplitude-${key}`).addEventListener('input', event => { state.sources[i].amplitude = Number(event.target.value) / 100;changed(); });
  $(`mute-${key}`).addEventListener('click', () => { state.sources[i].enabled = !state.sources[i].enabled;changed(); });
});
$('play-button').addEventListener('click', () => { playing = !playing;audio.update(state, playing);changed({ custom: false, physics: false }); });
$('speed').addEventListener('change', event => { speed = Number(event.target.value);changed({ custom: false, physics: false }); });
$('why-button').addEventListener('click', () => { why = !why;changed({ custom: false, physics: false }); });
$('audio-button').addEventListener('click', async () => {
  if (audioBusy) return;
  audioBusy = true;$('audio-button').disabled = true;
  try {
    if (audio.enabled) audio.stop(state);
    else { await audio.start(state, playing);toast(playing ? 'Du hörst die Summe am Hörpunkt. Leiser Start, feste Verstärkung.' : 'Ton bereit. Mit „Weiter“ werden Bild und Ton fortgesetzt.'); }
  } catch (error) { toast(`Audio konnte nicht starten: ${error.message}`); }
  finally {audioBusy = false;$('audio-button').disabled = false;updateControls();}
});

document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  state = preset(button.dataset.preset);theta = 0;
  document.querySelectorAll('[data-preset]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  changed({ custom: false });
}));
$('reset-button').addEventListener('click', () => {
  audio.stop(state);state = initialState();theta = 0;speed = 1;why = false;playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('speed').value = '1';
  document.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preset === 'reinforce')));
  changed({ custom: false });toast('Ausgangslage wiederhergestellt.');
});

function movePoint(index, x, y) {
  const point = index === 2 ? state.listener : state.sources[index];
  point.x = Math.max(0, Math.min(WORLD.width, x));point.y = Math.max(0, Math.min(WORLD.height, y));
  changed();
}
['source-a', 'source-b', 'listener'].forEach((id, index) => {
  const element = $(id);let dragging = false;let offset = { x: 0, y: 0 };
  element.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    dragging = true;element.setPointerCapture(event.pointerId);
    const rect = field.getBoundingClientRect();const point = index === 2 ? state.listener : state.sources[index];
    offset = { x: point.x - (event.clientX - rect.left) / rect.width * WORLD.width, y: point.y - (event.clientY - rect.top) / rect.height * WORLD.height };
  });
  element.addEventListener('pointermove', event => {
    if (!dragging) return;
    const rect = field.getBoundingClientRect();movePoint(index, (event.clientX - rect.left) / rect.width * WORLD.width + offset.x, (event.clientY - rect.top) / rect.height * WORLD.height + offset.y);
  });
  const endDrag = () => {dragging = false;};
  element.addEventListener('pointerup', endDrag);element.addEventListener('pointercancel', endDrag);element.addEventListener('lostpointercapture', endDrag);
  element.addEventListener('keydown', event => {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta) return;event.preventDefault();
    const point = index === 2 ? state.listener : state.sources[index];const step = event.shiftKey ? 0.5 : 0.1;
    movePoint(index, Math.round((point.x + delta[0] * step) * 1e6) / 1e6, Math.round((point.y + delta[1] * step) * 1e6) / 1e6);
  });
});
// A click in free space puts the listening point there; markers remain drag handles.
field.addEventListener('pointerdown', event => {
  if (event.target !== $('field-canvas') || event.button !== 0) return;
  const rect = field.getBoundingClientRect();movePoint(2, (event.clientX - rect.left) / rect.width * WORLD.width, (event.clientY - rect.top) / rect.height * WORLD.height);
});

$('model-button').addEventListener('click', () => $('model-dialog').showModal());
$('close-model').addEventListener('click', () => $('model-dialog').close());
$('understood').addEventListener('click', () => $('model-dialog').close());
$('projection-button').addEventListener('click', () => {
  const active = document.body.classList.toggle('projection');
  $('projection-button').setAttribute('aria-pressed', String(active));
  $('projection-button').innerHTML = active ? 'Atelieransicht <span>⛶</span>' : 'Beameransicht <span>⛶</span>';
  window.scrollTo(0, 0);scene.resize();positionMarkers();dirty = true;
});
window.addEventListener('resize', () => {dirty = true;positionMarkers();});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) {playing = false;audio.update(state, false);changed({ custom: false, physics: false });}
});

function frame(now) {
  const elapsed = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
  if (now - lastFrame >= 30 || !lastFrame) {
    lastFrame = now;
    if (playing) {theta = (theta + TAU * state.frequency * elapsed * speed / 440) % TAU;dirty = true;}
    if (dirty) {scene.draw(state, theta, why);updateReadings();dirty = false;}
  }
  requestAnimationFrame(frame);
}
changed({ custom: false });requestAnimationFrame(frame);
