import { fluxAt, semimajor, contactDuration, mod } from './lib/model.js';
import { generateMeasurements } from './lib/measurements.js';
import { copyMeasurements } from './lib/data.js';
import { drawScene } from './scene.js';
import { drawTimeSeries, format } from './plots.js';
import { mountLifeView } from './life-view.js';
import { mountObservatoryView } from './observatory-view.js';

const $ = id => document.getElementById(id);
const defaults = { radius: .12, period: 3.2, inclination: 87, phase: .17, noise: .002, cycles: 4 };
let params = { ...defaults }, seed = 4271, measurements = [], time = 2.656, playing = false, detective = null;
let lastFrame = 0, plotFrame = null;
let mode = 'simulation';
const scene = $('scene'), chart = $('lightcurve');
const lifeView = mountLifeView($('life-view'));
const observatoryView = mountObservatoryView($('observatory-view'));

function redraw() {
  if (mode !== 'simulation') return;
  drawScene(scene, params, time);
  plotFrame = drawTimeSeries(chart, measurements, { model: t => fluxAt(t, params), cursor: time });
  $('time').value = String(time); $('time-value').textContent = `${format(time)} d`;
}
function updateParameters() {
  measurements = generateMeasurements(params, seed);
  time = Math.min(time, measurements.at(-1).time);
  $('time').max = String(measurements.at(-1).time);
  const b = semimajor(params.period) * Math.cos(params.inclination * Math.PI / 180);
  const transit = b < 1 + params.radius;
  const grazing = transit && b > 1 - params.radius;
  $('transit-state').textContent = !transit ? 'Kein Transit' : grazing ? 'Streifender Transit' : 'Transit möglich';
  $('transit-state').classList.toggle('warning', !transit || grazing);
  $('radius-value').textContent = format(params.radius, 3);
  $('period-value').textContent = `${format(params.period)} d`;
  $('inclination-value').textContent = `${format(params.inclination, 1)}°`;
  $('phase-value').textContent = format(params.phase);
  $('noise-value').textContent = `${format(params.noise * 100)} %`;
  $('cycles-value').textContent = format(params.cycles, 1);
  const depth = 1 - fluxAt(-params.phase * params.period, params);
  $('signal-description').textContent = transit
    ? `${grazing ? 'Streifende Bedeckung' : 'Maximale Bedeckung'}: ${format(depth * 100)} % · Dauer ${format(contactDuration(params) * 24)} h · Wiederkehr alle ${format(params.period)} d`
    : 'Die Bahn verfehlt die Sternscheibe. Sichtbar ist ausschließlich Messrauschen.';
  $('sample-description').textContent = `${measurements.length.toLocaleString('de-DE')} Messpunkte · ${format(measurements.at(-1).time)} Tage · Kurve anklicken, um Zeit zu wählen`;
  chart.setAttribute('aria-label', `Relative Helligkeit über ${format(measurements.at(-1).time)} Tage. ${$('signal-description').textContent}`);
  redraw();
}
function syncControls() { for (const key of Object.keys(defaults)) $(key).value = String(params[key]); }
for (const key of Object.keys(defaults)) $(key).addEventListener('input', event => { params[key] = Number(event.target.value);updateParameters(); });
$('reset').addEventListener('click', () => { params = { ...defaults }; seed = 4271; $('seed').value = '4271';time = 2.656;syncControls();updateParameters(); });
$('time').addEventListener('input', event => { time = Number(event.target.value);redraw(); });
function pause() {playing = false;$('play').textContent = '▶';$('play').setAttribute('aria-label', 'Animation abspielen');}
$('play').addEventListener('click', () => {
  playing = !playing;$('play').textContent = playing ? 'Ⅱ' : '▶';$('play').setAttribute('aria-label', playing ? 'Animation pausieren' : 'Animation abspielen');
});
$('at-transit').addEventListener('click', () => {
  pause();time = mod(-params.phase, 1) * params.period;
  if (time > measurements.at(-1).time) time = 0;
  redraw();
});
chart.addEventListener('click', event => {
  if (!plotFrame) return;
  const fraction = (event.clientX - chart.getBoundingClientRect().left - plotFrame.left) / (plotFrame.w - plotFrame.left - plotFrame.right);
  time = Math.max(0, Math.min(1, fraction)) * measurements.at(-1).time;pause();redraw();
});
for (const button of document.querySelectorAll('[data-preset]')) button.addEventListener('click', () => {
  const preset = button.dataset.preset;
  if (preset === 'large') { params.radius = .20;params.inclination = 90; }
  if (preset === 'grazing') { params.radius = .12;params.inclination = Math.round(Math.acos(1.01 / semimajor(params.period)) * 180 / Math.PI * 10) / 10; }
  if (preset === 'miss') params.inclination = 75;
  syncControls();updateParameters();time = Math.min(mod(-params.phase, 1) * params.period, measurements.at(-1).time);redraw();
});
$('seed').addEventListener('input', () => {
  if ($('seed').value === '' || !Number.isFinite(Number($('seed').value))) return;
  seed = Math.min(4294967295, Math.max(0, Math.floor(Number($('seed').value))));updateParameters();
});
$('seed').addEventListener('change', () => { $('seed').value = String(seed); });
$('new-noise').addEventListener('click', () => {seed = (seed + 1) >>> 0;$('seed').value = String(seed);updateParameters();});
$('export-data').addEventListener('click', () => {
  const blob = new Blob(['time_days,relative_flux\n' + measurements.map(p => `${p.time},${p.flux}`).join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');link.href = url;link.download = 'planetenjaeger-messdaten.csv';link.click();setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function transferData(points) {
  detective?.contentWindow.postMessage({ type: 'measurements', points: copyMeasurements(points) }, '*');
}
function switchMode(next) {
  if (!['simulation','detective','life','observatory'].includes(next)) return;
  if (mode===next && (next!=='detective'||detective)) return;
  pause();detective?.remove();detective=null;mode=next;
  for(const key of ['simulation','detective','life','observatory']) {
    $(`${key}-view`).hidden=key!==mode;
    $(`${key}-mode`).classList.toggle('selected',key===mode);
    $(`${key}-mode`).setAttribute('aria-pressed',String(key===mode));
  }
  $('mode-eyebrow').textContent=mode==='observatory'?'UNSERE NÄCHSTE MISSION':mode==='life'?'AUF DER SUCHE NACH LEBEN':mode==='detective'?'DIE WELT HINTER DEN DATEN':'LICHT ALS SPURENSUCHE';
  $('intro-note').textContent=mode==='observatory'?'Welche Instrumente brauchen wir? Und wann könnten aus Lichtpunkten neue Erkenntnisse werden?':mode==='life'?'Von einem winzigen Schatten zur großen Frage: Könnte diese Welt bewohnt sein?':mode==='detective'?'Die Geometrie verschwindet. Die Messung bleibt. Welche Erklärung hält den Daten stand?':'Ein Planet zieht vor seinem Stern vorbei. Ein winziger Schatten. Eine messbare Spur.';
  if(mode==='detective') {
    detective=document.createElement('iframe');
    // No allow-same-origin: the browser prevents reading parent state or DOM.
    detective.setAttribute('sandbox', 'allow-scripts');
    detective.title='Detektivmodus – nur gemessene Helligkeit';detective.src='./detective.html';
    $('detective-view').append(detective);
  }
  lifeView.setActive(mode==='life');observatoryView.setActive(mode==='observatory');redraw();
  history.replaceState(null,'',mode==='observatory'?'#mission':mode==='life'?'#leben':mode==='detective'?'#detektiv':'#simulation');
}
for(const key of ['simulation','detective','life','observatory']) $(`${key}-mode`).addEventListener('click',()=>switchMode(key));
$('enter-detective').addEventListener('click',()=>switchMode('detective'));
$('enter-life').addEventListener('click',()=>switchMode('life'));
window.addEventListener('message', event => {
  if (!detective || event.source !== detective.contentWindow || event.origin !== 'null') return;
  if (event.data?.type === 'ready') transferData(measurements);
  if (event.data?.type === 'height' && Number.isFinite(event.data.height)) detective.height = String(Math.max(650, Math.min(4000, event.data.height + 4)));
  if (event.data?.type === 'dataset' && ['blind', 'short', 'noisy'].includes(event.data.kind)) {
    // A new unknown system is generated here, then discarded. Only measured points leave this scope.
    const kind = event.data.kind;
    const period = 2 + Math.random() * 4;
    const blind = { period, radius: .085 + Math.random() * .065,
      inclination: Math.acos((.25 + Math.random() * .45) / semimajor(period)) * 180 / Math.PI,
      phase: .1 + Math.random() * .8, noise: .0015, cycles: 3.5 + Math.random() * 1.5 };
    if (kind === 'short') { blind.phase = .84;blind.cycles = .45;blind.noise = .0003; }
    if (kind === 'noisy') { blind.radius = .025;blind.noise = .014;blind.cycles = 1.4; }
    transferData(generateMeasurements(blind, Math.floor(Math.random() * 4294967296)));
  }
});
$('about-open').addEventListener('click', () => $('about').showModal());
new ResizeObserver(() => redraw()).observe($('simulation-view'));
function tick(timestamp) {
  const elapsed = Math.min((timestamp - lastFrame) / 1000, .1);lastFrame = timestamp;
  if (playing && mode==='simulation' && !document.hidden) {time = mod(time + elapsed * .45, measurements.at(-1).time);redraw();}
  requestAnimationFrame(tick);
}
updateParameters();requestAnimationFrame(tick);
const hashMode=()=>location.hash==='#mission'?'observatory':location.hash==='#leben'?'life':location.hash==='#detektiv'?'detective':'simulation';
switchMode(hashMode());window.addEventListener('hashchange',()=>switchMode(hashMode()));
