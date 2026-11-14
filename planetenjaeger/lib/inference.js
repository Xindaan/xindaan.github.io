// Pure inverse problem. No simulator, storage, DOM, seed or true parameters.
import { blockedFraction, semimajor, mod, TAU } from './model.js';
import { copyMeasurements } from './data.js';

export const SEARCH = Object.freeze({ minPeriod: 1, maxPeriod: 12, minRadius: 0.02, maxRadius: 0.24 });
const median = values => {
  const a = [...values].sort((a, b) => a - b);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};
export function estimateNoise(points) {
  const differences = points.slice(1).map((p, i) => p.flux - points[i].flux);
  const center = median(differences);
  return Math.max(1e-6, median(differences.map(d => Math.abs(d - center))) / (0.67448975 * Math.SQRT2));
}

export function foldMeasurements(points, period, epoch = 0) {
  return points.map(p => ({ ...p,
    phase: mod((p.time - epoch) / period + 0.5, 1) - 0.5,
    cycle: Math.floor((p.time - epoch) / period + 0.5),
  }));
}

// Flux drop for a proposed orbit, not for the generator's orbit.
export function candidateDrop(time, { period, epoch, radius, impact }) {
  const angle = TAU * (time - epoch) / period;
  if (Math.cos(angle) <= 0) return 0;
  const a = semimajor(period);
  const distance = Math.hypot(a * Math.sin(angle), impact * Math.cos(angle));
  return blockedFraction(distance, radius);
}

export function evaluateCandidate(points, params) {
  let baseline = 0;
  const drops = points.map(p => {
    const d = candidateDrop(p.time, params);
    baseline += p.flux + d;
    return d;
  });
  baseline /= points.length;
  let sse = 0;
  points.forEach((p, j) => { sse += (p.flux - baseline + drops[j]) ** 2; });
  return { sse, baseline };
}

function boxSearch(points, minPeriod, maxPeriod) {
  const bins = 192;
  const widths = [3, 5, 8, 12, 18, 26];
  const span = points.at(-1).time - points[0].time;
  const steps = Math.max(500, Math.ceil(4 * span / 0.018 * (1 / minPeriod - 1 / maxPeriod)));
  const mean = points.reduce((s, p) => s + p.flux, 0) / points.length;
  const candidates = [];
  const spectrum = [];
  const sums = new Float64Array(bins * 2 + 1);
  const counts = new Float64Array(bins * 2 + 1);
  for (let g = 0; g <= steps; g++) {
    const frequency = 1 / maxPeriod + (1 / minPeriod - 1 / maxPeriod) * g / steps;
    const period = 1 / frequency;
    sums.fill(0); counts.fill(0);
    for (const p of points) {
      const j = Math.floor(mod(p.time * frequency, 1) * bins) + 1;
      sums[j] += p.flux - mean;
      counts[j]++;
    }
    for (let j = 1; j <= bins; j++) { sums[j + bins] = sums[j]; counts[j + bins] = counts[j]; }
    for (let j = 1; j <= 2 * bins; j++) { sums[j] += sums[j - 1]; counts[j] += counts[j - 1]; }
    let best = { score: 0, period, epoch: 0, depth: 0, duration: 0 };
    for (const width of widths) {
      for (let j = 0; j < bins; j++) {
        const n = counts[j + width] - counts[j];
        if (n < 3 || n > points.length * 0.3) continue;
        const sum = sums[j + width] - sums[j];
        if (sum >= 0) continue;
        const score = sum * sum * points.length / (n * (points.length - n));
        if (score > best.score) best = { score, period, epoch: mod((j + width / 2) / bins * period, period),
          depth: -sum * points.length / (n * (points.length - n)), duration: width / bins * period };
      }
    }
    candidates.push(best);
    spectrum.push({ period, score: best.score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const starts = [];
  for (const c of candidates) {
    if (starts.every(s => Math.abs(s.period - c.period) > Math.max(0.012, c.period ** 2 * 0.025 / span))) starts.push(c);
    if (starts.length === 10) break;
  }
  return { starts, spectrum };
}

// Bounded Nelder-Mead; baseline is analytically profiled in the objective.
function minimize(points, initial, bounds, steps, iterations = 260) {
  const unpack = v => ({ period: v[0], epoch: v[1], radius: v[2], impact: v[3] });
  const score = v => {
    if (v.some((x, i) => x < bounds[i][0] || x > bounds[i][1]) || v[3] >= 1 + v[2]) return 1e9;
    return evaluateCandidate(points, unpack(v)).sse;
  };
  let simplex = [initial, ...initial.map((_, i) => initial.map((v, j) => v + (i === j ? steps[i] : 0)))].map(v => ({ v, f: score(v) }));
  for (let k = 0; k < iterations; k++) {
    simplex.sort((a, b) => a.f - b.f);
    const center = [0, 1, 2, 3].map(j => simplex.slice(0, 4).reduce((s, p) => s + p.v[j], 0) / 4);
    const trial = scale => {
      const v = center.map((c, j) => c + scale * (c - simplex[4].v[j]));
      return { v, f: score(v) };
    };
    const reflected = trial(1);
    if (reflected.f < simplex[0].f) {
      const expanded = trial(2);
      simplex[4] = expanded.f < reflected.f ? expanded : reflected;
    } else if (reflected.f < simplex[3].f) simplex[4] = reflected;
    else {
      const contracted = trial(reflected.f < simplex[4].f ? 0.5 : -0.5);
      if (contracted.f < Math.min(reflected.f, simplex[4].f)) simplex[4] = contracted;
      else simplex = simplex.map((p, i) => {
        if (!i) return p;
        const v = p.v.map((x, j) => (x + simplex[0].v[j]) / 2);
        return { v, f: score(v) };
      });
    }
  }
  simplex.sort((a, b) => a.f - b.f);
  const params = unpack(simplex[0].v);
  params.epoch = mod(params.epoch, params.period);
  return { ...params, ...evaluateCandidate(points, params) };
}

// Numerical curvature: local, conditional 1-sigma approximation only.
function localErrors(points, fit, sigma) {
  const keys = ['period', 'epoch', 'radius', 'impact'];
  const steps = [fit.period * 1e-5, fit.period * 1e-5, 1e-5, 1e-4];
  const derivatives = keys.map((key, j) => {
    const plus = { ...fit, [key]: fit[key] + steps[j] };
    const minus = { ...fit, [key]: fit[key] - steps[j] };
    const d = points.map(p => (candidateDrop(p.time, plus) - candidateDrop(p.time, minus)) / (2 * steps[j]));
    const mean = d.reduce((s, x) => s + x, 0) / d.length;
    return d.map(x => x - mean);
  });
  const matrix = derivatives.map((d, j) => [...derivatives.map(e => d.reduce((s, x, i) => s + x * e[i] / sigma ** 2, 0)),
    ...keys.map((_, i) => i === j ? 1 : 0)]);
  for (let j = 0; j < 4; j++) {
    let pivot = j;
    for (let k = j + 1; k < 4; k++) if (Math.abs(matrix[k][j]) > Math.abs(matrix[pivot][j])) pivot = k;
    [matrix[pivot], matrix[j]] = [matrix[j], matrix[pivot]];
    const value = matrix[j][j];
    if (Math.abs(value) < 1e-9) return null;
    for (let k = 0; k < 8; k++) matrix[j][k] /= value;
    for (let row = 0; row < 4; row++) {
      if (row === j) continue;
      const factor = matrix[row][j];
      for (let k = 0; k < 8; k++) matrix[row][k] -= factor * matrix[j][k];
    }
  }
  const errors = Object.fromEntries(keys.map((key, j) => [key, Math.sqrt(Math.max(0, matrix[j][j + 4]))]));
  return Object.values(errors).every(Number.isFinite) ? errors : null;
}

function* fitSteps(input, options = {}) {
  const points = copyMeasurements(input);
  const minPeriod = options.minPeriod ?? SEARCH.minPeriod;
  const maxPeriod = options.maxPeriod ?? SEARCH.maxPeriod;
  if (!(minPeriod >= 1 && maxPeriod <= 12 && maxPeriod > minPeriod)) throw new Error('Suchbereich muss innerhalb 1–12 Tagen liegen.');
  const sigma = estimateNoise(points);
  const { starts, spectrum } = boxSearch(points, minPeriod, maxPeriod);
  const span = points.at(-1).time - points[0].time;
  const solutions = [];
  for (const start of starts) {
    const p = start.period;
    const radius = Math.max(0.025, Math.min(0.22, Math.sqrt(start.depth)));
    const bounds = [[minPeriod, maxPeriod], [start.epoch - p * 0.18, start.epoch + p * 0.18], [0.02, 0.24], [0, 1.23]];
    for (const impact of [0.12, 0.6, 0.95]) {
      const fit = minimize(points, [p, start.epoch, radius, impact], bounds,
        [Math.min(0.01, p * p * 0.01 / span), p / 384, 0.012, 0.04]);
      if (solutions.every(s => Math.abs(s.period - fit.period) > p * 0.002 || Math.abs(s.impact - fit.impact) > 0.04)) solutions.push(fit);
      else {
        const index = solutions.findIndex(s => Math.abs(s.period - fit.period) <= p * 0.002 && Math.abs(s.impact - fit.impact) <= 0.04);
        if (fit.sse < solutions[index].sse) solutions[index] = fit;
      }
      yield { progress: (starts.indexOf(start) * 3 + [0.12, 0.6, 0.95].indexOf(impact) + 1) / (starts.length * 3) };
    }
  }
  solutions.sort((a, b) => a.sse - b.sse);
  const best = solutions[0];
  const mean = points.reduce((s, p) => s + p.flux, 0) / points.length;
  const flatSSE = points.reduce((s, p) => s + (p.flux - mean) ** 2, 0);
  const deltaBIC = (flatSSE - best.sse) / sigma ** 2 - 4 * Math.log(points.length);
  const transits = new Map();
  for (const p of points) {
    if (candidateDrop(p.time, best) < best.radius ** 2 * 0.1) continue;
    const cycle = Math.round((p.time - best.epoch) / best.period);
    if (!transits.has(cycle)) transits.set(cycle, []);
    transits.get(cycle).push(p);
  }
  const supportedEvents = [...transits.values()].filter(event => event.length >= 3 &&
    event.reduce((s, p) => s + best.baseline - p.flux, 0) / (sigma * Math.sqrt(event.length)) >= 3).length;
  const plausible = solutions.filter(s => (s.sse - best.sse) / sigma ** 2 <= 9);
  const aliases = plausible.some(s => Math.abs(s.period - best.period) > best.period * 0.01);
  const rawErrors = localErrors(points, best, sigma);
  const enough = supportedEvents >= 3 && span / best.period >= 2 && deltaBIC > 20;
  const status = !enough ? (supportedEvents > 0 && deltaBIC > 20 ? 'ambiguous' : 'undetected') : aliases ? 'ambiguous' : 'detected';
  const reasons = [];
  if (supportedEvents < 3) reasons.push(`Nur ${supportedEvents} einzeln gestützte Transit-Ereignisse; mindestens drei sind für eine belastbare Wiederholung gefordert.`);
  if (deltaBIC <= 20) reasons.push('Der Gewinn gegenüber konstanter Helligkeit reicht nach Komplexitätsstrafe nicht aus.');
  if (span / best.period < 2) reasons.push('Das Zeitfenster deckt weniger als zwei Kandidatenperioden ab.');
  if (aliases) reasons.push('Mehrere unterschiedliche Perioden erklären die Daten ähnlich gut.');
  if (!rawErrors || best.impact < 0.05 || best.impact + best.radius > 0.99) reasons.push('Radius und Bahnversatz können gekoppelt sein; lokale Fehlergrenzen sind eingeschränkt.');
  if (best.period < minPeriod * 1.003 || best.period > maxPeriod * 0.997) reasons.push('Der beste Kandidat liegt am Rand des untersuchten Periodenbereichs.');
  const uncertainty = status === 'detected' && rawErrors && best.impact > 0.05 && best.impact + best.radius < 0.99 ? rawErrors : null;
  return { best, sigma, status, reasons, deltaBIC, supportedEvents, uncertainty,
    candidates: solutions.slice(0, 6).map(s => ({ ...s, deltaChi2: (s.sse - best.sse) / sigma ** 2,
      plausible: (s.sse - best.sse) / sigma ** 2 <= 9 })),
    spectrum, search: { minPeriod, maxPeriod }, span,
  };
}

export function fitMeasurements(input, options = {}) {
  const iterator = fitSteps(input, options);
  let next = iterator.next();
  while (!next.done) next = iterator.next();
  return next.value;
}

export async function fitMeasurementsAsync(input, { onProgress = () => {}, signal, ...options } = {}) {
  const iterator = fitSteps(input, options);
  let next;
  do {
    if (signal?.aborted) throw new DOMException('Abgebrochen', 'AbortError');
    next = iterator.next();
    if (!next.done) {
      onProgress(next.value.progress);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } while (!next.done);
  return next.value;
}
