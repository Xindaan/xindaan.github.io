import { parameters, DT, ENERGY_TOLERANCE, createState, observe, energy, advanceToFinish, freeState, freeArrival } from './model.js';
import { initScene, renderScene, renderRingDetail, initEnergy, renderEnergy, fmt, signed } from './scene.js';

const $ = selector => document.querySelector(selector);
let p = parameters(), state = createState(p), running = false, completed = false, selected = 0;
let e0 = energy(state, p).total, observation = observe(state, p);
let history = [observation], lastSample = 0, accumulator = 0, previousWallTime = null;
let maxError = 0, fault = '', reviewIndex = null, pauseLimit = 30;
const scene = $('#scene'), chart = $('#energy-chart');
const scrub = document.createElement('input');
scrub.type = 'range'; scrub.min = '0'; scrub.max = '0'; scrub.value = '0'; scrub.step = '1';
scrub.id = 'timeline'; scrub.setAttribute('aria-label', 'Zeitpunkt im aufgezeichneten Versuch untersuchen');
const scrubRow = document.createElement('div');
scrubRow.className = 'timeline-row';
scrubRow.innerHTML = '<label for="timeline">Zeitpunkt untersuchen</label>';
scrubRow.append(scrub); $('.energy-plot').append(scrubRow);

initScene(scene, p); initEnergy($('#energy-legend'));
$('#resistance').step = 'any';
$('#resistance').value = String(Math.log(p.resistance / 0.00002) / Math.log(40) * 100);

function signWord(value, eps = 1e-12) { return value > eps ? 'positiv' : value < -eps ? 'negativ' : 'null'; }
function explain(o) {
  const r = o.rings[selected], above = o.z < r.z, active = p.closed && p.conducting;
  const moving = Math.abs(o.v) > 1e-7, changing = Math.abs(r.dPhiDt) > 1e-10;
  $('#selected-ring').textContent = `${String(selected + 1).padStart(2, '0')} / ${p.ringCount}`;
  const approaching = (r.z - o.z) * o.v > 0;
  $('#ring-context').textContent = !moving
    ? `Der Magnet ruht ${above ? 'oberhalb' : 'unterhalb'} des Rings. Sein Feld allein erzeugt keinen dauerhaften Strom.`
    : p.moment === 0 ? 'Das Magnetmoment ist null. Trotz Bewegung gibt es keinen Magnetfluss und keine Induktion.'
    : `Der Magnet ${approaching ? 'nähert sich dem Ring' : 'entfernt sich vom Ring'} ${above ? 'von oben' : 'nach unten'}. ${approaching ? 'Der Betrag des Flusses nimmt zu.' : 'Der Betrag des Flusses nimmt ab.'}`;
  $('#flux-rate').textContent = `${signed(r.dPhiDt * 1000, 3)} mWb/s`;
  $('#flux-explain').textContent = changing
    ? `Φ = ${signed(r.phi * 1e6, 2)} µWb. Die Änderung ist ${signWord(r.dPhiDt)}: Der vorzeichenbehaftete Fluss ${r.dPhiDt > 0 ? 'steigt' : 'sinkt'}.`
    : `Φ = ${signed(r.phi * 1e6, 2)} µWb. Momentan ändert sich der Fluss ${moving ? 'hier praktisch nicht' : 'nicht, weil v = 0 ist'}.`;
  $('#voltage').textContent = `${signed(r.voltage * 1000, 3)} mV`;
  $('#voltage-explain').textContent = !active
    ? `Die Flussänderung liefert trotzdem eine EMK. ${p.closed ? 'Ohne Leitfähigkeit' : 'Am vollständigen Schlitz'} ist der Stromkreis unterbrochen: I = 0.`
    : changing
      ? `Das Minuszeichen kehrt das Vorzeichen um: U ist ${signWord(r.voltage)}. L·dI/dt = U − R·I bestimmt, wie der Strom darauf reagiert.`
      : 'Ohne Flussänderung ist U = 0. Ein vorhandener Strom klingt mit der Zeitkonstante L/R ab.';
  const currentLabel = Math.abs(r.current) > 1e-9 && Math.abs(r.current) < 0.1 ? `${signed(r.current * 1000, 2)} mA` : `${signed(r.current, 1)} A`;
  const forceLabel = Math.abs(r.force) > 1e-12 && Math.abs(r.force) < 1e-5 ? `${signed(r.force * 1e6, 3)} µN` : `${signed(r.force * 1000, 2)} mN`;
  $('#ring-force').textContent = `${currentLabel} → ${forceLabel}`;
  if (!active || Math.abs(r.current) < 1e-7) {
    $('#force-explain').textContent = 'Kein Ringstrom, keine Kopplungskraft. Das leitende Material hält den Magneten nicht statisch fest.';
  } else {
    const direction = r.current > 0 ? 'im Uhrzeigersinn' : 'gegen den Uhrzeigersinn';
    const base = `I fließt ${direction}. ∂Φ/∂z ist ${signWord(r.dPhiDz)}; I·∂Φ/∂z wirkt ${r.force < 0 ? 'nach oben' : 'nach unten'}.`;
    $('#force-explain').textContent = base + (r.force * o.v < -1e-9
      ? ' Das entzieht der Bewegung Energie.'
      : r.force * o.v > 1e-9 ? ' Hier gibt der nachlaufende Strom kurz gespeicherte Feldenergie zurück.' : ' Momentan wird keine mechanische Arbeit übertragen.');
  }
  $('#ring-heat').textContent = `${fmt(r.temperatureRise * 1000, 3)} mK`;
  $('#ring-heat').title = `Q = ${fmt(r.heat * 1000, 5)} mJ; P = R·I² = ${fmt(r.power * 1000, 3)} mW`;
  renderRingDetail($('#ring-detail'), r, p);
}

function render() {
  const o = reviewIndex === null ? observation : history[reviewIndex];
  const freeTime = freeArrival(p), arrivedFree = o.t >= freeTime;
  $('#time').textContent = fmt(o.t, 3);
  const freeV = freeState(arrivedFree ? freeTime : o.t, p).v;
  $('#free-speed').innerHTML = `${fmt(freeV)} <small>m/s${arrivedFree ? ' an Messlinie' : ''}</small>`;
  $('#coupled-speed').innerHTML = `${fmt(o.v)} <small>m/s</small>`;
  $('#play').innerHTML = running ? '<span aria-hidden="true">Ⅱ</span> Pause' : completed && reviewIndex === null ? '<span aria-hidden="true">↺</span> Erneut starten' : o.t > 0 ? '<span aria-hidden="true">▶</span> Fortsetzen' : '<span aria-hidden="true">▶</span> Gemeinsam starten';
  $('#run-status').textContent = fault || (reviewIndex !== null ? 'Zeitpunkt im aufgezeichneten Versuch' : running ? 'Gemeinsamer Fall · Modell läuft' : completed ? 'Messlinie erreicht · Zustand vor dem Aufprall' : o.t > 0 ? `Pausiert · Ring ${String(selected + 1).padStart(2, '0')} untersuchen` : 'Bereit für den gemeinsamen Fall');
  $('#step').disabled = running || (completed && reviewIndex === null) || Boolean(fault);
  $('#play').disabled = Boolean(fault);
  if (o.z >= p.finish) {
    $('#arrival-info').textContent = `A: ${fmt(freeTime, 3)} s · B: ${fmt(o.t, 3)} s · ${fmt(o.t / freeTime, 2)} × Fallzeit`;
  } else if (arrivedFree) {
    $('#arrival-info').textContent = `A passiert die Messlinie nach ${fmt(freeTime, 3)} s. B ist noch unterwegs.`;
  } else {
    $('#arrival-info').textContent = p.gravity === 0 ? 'Ohne Gravitation und Anfangsgeschwindigkeit bleibt der Magnet in Ruhe.' : 'Beide Magnete starten aus derselben Höhe.';
  }
  const error = o.energy.total - e0, relative = Math.abs(error) / Math.max(Math.abs(e0), 1e-9);
  const good = relative <= ENERGY_TOLERANCE;
  $('#balance').classList.toggle('warning', !good);
  $('#balance').innerHTML = `<span class="balance-dot"></span><span>${good ? 'Bilanz stimmt' : 'Bilanz außerhalb der Toleranz'}<strong id="balance-error">ΔE = ${signed(error * 1e6, 6)} µJ</strong></span>`;
  $('#balance').title = `Relativer Fehler: ${relative.toExponential(3)}. Maximal im Lauf: ${maxError.toExponential(3)}. Toleranz: ${ENERGY_TOLERANCE}.`;
  $('#energy-transfer').textContent = o.t === 0 ? 'Noch keine Energie übertragen.' : e0 > 0 ? `${fmt(o.energy.heat / e0 * 100, 1)} % der Anfangsenergie sind jetzt Joule-Wärme.` : 'Keine Anfangsenergie · keine Energieübertragung.';
  $('#energy-total').textContent = `Σ ${fmt(o.energy.total * 1000, 2)} mJ`;
  renderScene(o, p, selected); explain(o);
  renderEnergy(chart, history, o, e0, reviewIndex);
  scrub.max = String(history.length - 1); scrub.value = String(reviewIndex ?? history.length - 1);
  scrub.disabled = history.length < 2;
}

function reset(overrides = {}) {
  running = false; completed = false; reviewIndex = null; fault = '';
  p = parameters({ ...p, ...overrides }); state = createState(p);
  observation = observe(state, p); e0 = observation.energy.total;
  history = [observation]; maxError = 0; lastSample = 0; pauseLimit = 30; accumulator = 0; previousWallTime = null;
  $('#resistance-value').textContent = p.conducting ? `${fmt(p.resistance * 1000, 3)} mΩ` : 'R → ∞';
  $('#strength-value').textContent = `${fmt(p.moment, 1)} A·m²`;
  $('#gravity-value').textContent = `${fmt(p.gravity)} m/s²`;
  $('#resistance').disabled = !p.conducting;
  $('#closed').setAttribute('aria-pressed', String(p.closed));
  $('#slit').setAttribute('aria-pressed', String(!p.closed));
  $('#circuit-note').textContent = p.closed ? '20 Ringe. Jeder ein eigener Stromkreis.' : 'Jeder Ring vollständig unterbrochen: I = 0.';
  $('#polarity').setAttribute('aria-pressed', String(p.polarity < 0));
  $('#polarity .pole-pair').innerHTML = p.polarity > 0 ? '<i>S</i><i>N</i>' : '<i>N</i><i>S</i>';
  document.querySelectorAll('[data-gravity]').forEach(el => el.classList.toggle('active', Number(el.dataset.gravity) === p.gravity));
  render();
}

function resumeReview() {
  if (reviewIndex === null) return;
  const chosen = history[reviewIndex];
  state = { t: chosen.t, z: chosen.z, v: chosen.v, currents: chosen.currents.slice(), heat: chosen.heat.slice() };
  observation = observe(state, p); history = history.slice(0, reviewIndex + 1);
  lastSample = state.t; reviewIndex = null; completed = state.z >= p.finish;
}

function advance(duration) {
  if (completed || fault) return;
  accumulator += duration;
  while (accumulator + 1e-12 >= DT && !completed) {
    state = advanceToFinish(state, p, DT); accumulator = Math.max(0, accumulator - DT);
    const e = energy(state, p);
    maxError = Math.max(maxError, Math.abs(e.total - e0) / Math.max(Math.abs(e0), 1e-9));
    completed = state.z >= p.finish;
    if (state.t - lastSample >= 0.005 - 1e-9 || completed) {
      history.push(observe(state, p)); lastSample = state.t;
    }
    if (completed) running = false;
    // A stationary g=0 experiment has no event horizon. Bound recording length
    // without changing the physics; continuing is available from this pause.
    if (state.t >= pauseLimit && !completed) { running = false; accumulator = 0; pauseLimit += 30; break; }
  }
  observation = observe(state, p);
}

$('#play').addEventListener('click', () => {
  if (running) { running = false; render(); return; }
  resumeReview();
  if (completed) reset();
  running = true; previousWallTime = null; render();
});
document.querySelector('a[href="#modell"]').addEventListener('click', () => { $('#modell').open = true; });
$('#reset').addEventListener('click', () => reset());
$('#step').addEventListener('click', () => { resumeReview(); advance(0.01); render(); });
$('#closed').addEventListener('click', () => reset({ closed: true }));
$('#slit').addEventListener('click', () => reset({ closed: false }));
$('#insulator').addEventListener('change', e => reset({ conducting: !e.target.checked }));
$('#resistance').addEventListener('input', e => reset({ resistance: 0.00002 * 40 ** (Number(e.target.value) / 100) }));
$('#strength').addEventListener('input', e => reset({ moment: Number(e.target.value) }));
$('#gravity').addEventListener('input', e => reset({ gravity: Number(e.target.value) }));
$('#polarity').addEventListener('click', () => reset({ polarity: -p.polarity }));
document.querySelectorAll('[data-gravity]').forEach(el => el.addEventListener('click', () => {
  $('#gravity').value = el.dataset.gravity; reset({ gravity: Number(el.dataset.gravity) });
}));
function chooseRing(target) {
  const el = target.closest('[data-ring]');
  if (!el) return;
  selected = Number(el.dataset.ring); running = false; render();
}
scene.addEventListener('click', e => chooseRing(e.target));
scene.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chooseRing(e.target); }
});
scrub.addEventListener('input', e => { running = false; reviewIndex = Number(e.target.value); render(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && running) { running = false; previousWallTime = null; render(); }
});

function tick(wallTime) {
  if (running) {
    const elapsed = previousWallTime === null ? 0 : Math.min((wallTime - previousWallTime) / 1000, 0.05);
    try { advance(elapsed * Number($('#speed').value)); }
    catch (err) { running = false; fault = `Numerik angehalten: ${err.message}`; }
    render();
  }
  previousWallTime = wallTime;
  requestAnimationFrame(tick);
}
reset(); requestAnimationFrame(tick);

fetch(new URL('../docs/numerical-results.json', import.meta.url)).then(r => { if (!r.ok) throw new Error('report unavailable'); return r.json(); }).then(report => {
  const base = report.cases[0];
  $('#test-evidence').textContent = `Numerisch gemessen im Standardversuch: ${fmt(base.arrivalSeconds, 6)} s gegenüber ${fmt(base.freeArrivalSeconds, 6)} s im freien Fall. Maximaler relativer Energiefehler: ${base.maxRelativeEnergyError.toExponential(2)}. Schritt-Halbierung: ${fmt(report.convergence.relativeArrivalDifference * 100, 5)} % Abweichung der Fallzeit. Die ausführbaren Tests liegen lokal in tests/.`;
}).catch(() => { $('#test-evidence').textContent = 'Ergebnisdatei fehlt. Mit „npm run test:report“ im Projektordner neu erzeugen.'; });
