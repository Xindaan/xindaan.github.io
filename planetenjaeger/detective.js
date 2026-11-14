import { copyMeasurements } from './lib/data.js';
import { fitMeasurementsAsync, evaluateCandidate, estimateNoise } from './lib/inference.js';
import { drawTimeSeries, drawFolded, drawSpectrum, format } from './plots.js';

const $ = id => document.getElementById(id);
let points = [], result = null, sigma = .001, run = null;
let candidate = { period: 4, epoch: 0, radius: .1, impact: .5, baseline: 1 };
// Active check of the real browser isolation, before receiving any measurements.
let isolated = false;
try { void window.parent.document; } catch (error) { isolated = error.name === 'SecurityError'; }
document.body.dataset.isolation = isolated ? 'verified' : 'failed';
if (!isolated) { $('fit').disabled = true;$('fit-progress').textContent = 'Bitte das Detektivlabor über die Simulation öffnen.'; }
function postHeight() { window.parent.postMessage({ type: 'height', height: Math.ceil(document.body.getBoundingClientRect().height) + 16 }, '*'); }
function render() {
  if (!points.length) return;
  const evaluation = evaluateCandidate(points, candidate);candidate.baseline = evaluation.baseline;
  drawFolded($('folded'), points, candidate, { zoom: $('zoom').checked, showModel: $('show-model').checked, showBins: $('show-bins').checked });
  drawTimeSeries($('raw'), points);
  $('fold-period').textContent = `P = ${format(candidate.period, 3)} d`;
  $('candidate-score').textContent = `Mittleres χ²: ${format(evaluation.sse / (sigma ** 2 * points.length))}`;
  $('candidate-radius-value').textContent = format(candidate.radius, 3);
  $('candidate-epoch-value').textContent = format(candidate.epoch / candidate.period, 3);
  $('candidate-impact-value').textContent = format(candidate.impact);
  $('folded').setAttribute('aria-label', `Messdaten gefaltet mit ${format(candidate.period, 3)} Tagen. Vermutetes Radiusverhältnis ${format(candidate.radius, 3)}. ${$('candidate-score').textContent}`);
  const spectrum = $('spectrum');if (spectrum && result) drawSpectrum(spectrum, result.spectrum, candidate.period);
}
function syncControls() {
  $('candidate-period').value = String(Number(candidate.period.toFixed(5)));
  $('candidate-radius').value = String(candidate.radius);
  $('candidate-epoch').value = String(candidate.epoch / candidate.period);
  $('candidate-impact').value = String(candidate.impact);
}
function displayResult() {
  const r = result, b = r.best;
  const titles = { detected: 'Eine wiederkehrende Spur.', ambiguous: 'Eine Spur. Mehrere Erklärungen.', undetected: 'Noch kein belastbarer Transit.' };
  const subtitles = { detected: 'Wiederholung unter den Modellannahmen gestützt', ambiguous: 'Periode oder Geometrie bleiben offen', undetected: 'Ein gefundener Kandidat ist kein Nachweis' };
  const periodUncertainty = r.uncertainty ? `± ${format(r.uncertainty.period, 5)} d` : 'Kein belastbares Intervall';
  const radiusUncertainty = r.uncertainty ? `± ${format(r.uncertainty.radius, 4)}` : 'Radius nicht eindeutig abgesichert';
  $('result').innerHTML = `<div class="result-header"><div><p class="eyebrow">03 / WAS LÄSST SICH SAGEN?</p><h2>${titles[r.status]}</h2></div><span class="badge ${r.status === 'detected' ? '' : 'warning'}">${r.status === 'detected' ? 'Wiederholung gestützt' : 'Unsicher'}</span></div>
    <p>${subtitles[r.status]}. ${r.status === 'detected' ? 'Bester gefundener Modellfit:' : 'Die folgenden Werte beschreiben nur den besten Suchkandidaten:'}</p>
    <div class="result-numbers"><div><span>PERIODENKANDIDAT</span><strong>${format(b.period, 4)} <small>d</small></strong><span>${periodUncertainty}</span></div><div><span>RADIUSVERHÄLTNIS</span><strong>${format(b.radius, 4)}</strong><span>${radiusUncertainty}</span></div><div><span>GESTÜTZTE EREIGNISSE</span><strong>${r.supportedEvents}</strong><span>ΔBIC = ${format(r.deltaBIC, 1)}</span></div></div>
    <ul class="result-reasons">${r.reasons.map(reason => `<li>${reason}</li>`).join('')}</ul>
    <p class="uncertainty-note">${r.uncertainty ? '± bezeichnet lokale 1σ-Fehler aus der Krümmung der Zielfunktion. Sie gelten nur nahe diesem Minimum, mit fest angenommener Sternmasse und festem Sternradius.' : 'Bei diesen Daten werden keine schmalen Fehlergrenzen als Sicherheit ausgegeben. Ein längeres Beobachtungsfenster oder präzisere Messungen können die Lösungen trennen.'} Die Suche ist endlich; weitere Lösungen außerhalb der gefundenen Minima oder des Suchbereichs sind möglich.</p>
    <h3>Welche Perioden konkurrieren?</h3><canvas id="spectrum" class="spectrum-chart" role="img" aria-label="Periodensuche: relative Verbesserung der Box-Anpassung für Perioden von 1 bis 12 Tagen"></canvas>
    <table class="candidate-table"><thead><tr><th>Periode</th><th>Rₚ / R★</th><th>Δχ²</th><th>Einordnung</th><th><span class="sr-only">Aktion</span></th></tr></thead><tbody>${r.candidates.map((c, j) => `<tr><td>${format(c.period, 4)} d</td><td>${format(c.radius, 4)}</td><td>${format(c.deltaChi2, 1)}</td><td class="${c.plausible ? 'plausible' : 'poor'}">${c.plausible ? 'Ähnlich passend' : 'Schlechter passend'}</td><td><button data-candidate="${j}">Ansehen</button></td></tr>`).join('')}</tbody></table>
    <p>Δχ² vergleicht die gefundenen Minima mit dem besten Fit. Bis 9 markieren wir als ähnlich passend; das ist keine Wahrscheinlichkeitsangabe. Auch ein „ähnlich passender“ Kandidat kann insgesamt unzureichend sein. Das Messrauschen σ ≈ ${format(r.sigma * 100, 3)} % wurde aus benachbarten Messwerten geschätzt.</p>`;
  // All interpolated content is generated locally from validated finite numbers or fixed messages.
  for (const button of $('result').querySelectorAll('[data-candidate]')) button.addEventListener('click', () => {
    candidate = { ...result.candidates[Number(button.dataset.candidate)] };syncControls();render();
  });
  postHeight();
}
for (const id of ['candidate-period', 'candidate-radius', 'candidate-epoch', 'candidate-impact']) $(id).addEventListener('input', () => {
  const period = Number($('candidate-period').value);
  if (!Number.isFinite(period) || period < 1 || period > 12) return;
  candidate = { period, epoch: Number($('candidate-epoch').value) * period,
    radius: Number($('candidate-radius').value), impact: Number($('candidate-impact').value), baseline: 1 };
  render();
});
$('candidate-period').addEventListener('change', () => { $('candidate-period').value = String(candidate.period); });
for (const id of ['zoom', 'show-model', 'show-bins']) $(id).addEventListener('change', render);
$('fit').addEventListener('click', async () => {
  if (run) {run.abort();return;}
  const controller = new AbortController();run = controller;
  $('fit').textContent = 'Fit abbrechen';$('fit-progress').textContent = 'Perioden werden aus den Messpunkten gesucht …';
  try {
    await new Promise(resolve => setTimeout(resolve, 25));
    const fit = await fitMeasurementsAsync(points, { signal: controller.signal,
      onProgress: progress => { $('fit-progress').textContent = `Geometrische Kandidaten prüfen · ${Math.round(progress * 100)} %`; } });
    if (controller.signal.aborted) return;
    result = fit;candidate = { ...fit.best };syncControls();displayResult();render();
    $('fit-progress').textContent = 'Fit abgeschlossen. Ergebnis unten prüfen.';
  } catch (error) { if (run === controller) $('fit-progress').textContent = error.name === 'AbortError' ? 'Fit abgebrochen.' : `Fit fehlgeschlagen: ${error.message}`; }
  finally { if (run === controller) {run = null;$('fit').textContent = 'Aus Messdaten fitten ↗';} }
});
for (const button of document.querySelectorAll('[data-case]')) button.addEventListener('click', () => {
  window.parent.postMessage({ type: 'dataset', kind: button.dataset.case }, '*');
});
window.addEventListener('message', event => {
  if (!isolated || event.source !== window.parent || event.data?.type !== 'measurements') return;
  try {
    const incoming = copyMeasurements(event.data.points);
    run?.abort();run = null;points = incoming;result = null;sigma = estimateNoise(points);
    candidate = { period: 4, epoch: 0, radius: .1, impact: .5, baseline: 1 };syncControls();
    $('fit').textContent = 'Aus Messdaten fitten ↗';$('fit-progress').textContent = '';
    $('result').innerHTML = '<p class="eyebrow">03 / WAS LÄSST SICH SAGEN?</p><p class="empty-state">Die Messreihe ist bereit. Probiere eigene Perioden oder starte den Fit. Es wurden keine wahren Systemparameter übertragen.</p>';
    $('data-info').textContent = `${points.length.toLocaleString('de-DE')} Messpunkte · ${format(points.at(-1).time - points[0].time)} Tage`;
    render();postHeight();
  } catch (error) { $('fit-progress').textContent = `Messdaten ungültig: ${error.message}`; }
});
new ResizeObserver(() => {render();postHeight();}).observe(document.body);
window.parent.postMessage({ type: 'ready' }, '*');
