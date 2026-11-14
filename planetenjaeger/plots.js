import { candidateDrop, foldMeasurements } from './lib/inference.js';

const colors = ['#81decf', '#aeb6ff', '#e3ba88', '#83bce9', '#d49dc8', '#b4d998'];
export const format = (n, decimals = 2) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
export function prepare(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
  if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
    canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
function frame(canvas, points, xMin, xMax, xLabel, extra = []) {
  const { ctx, w, h } = prepare(canvas);
  const left = w < 500 ? 49 : 60, right = 14, top = 27, bottom = 34;
  let low = 1, high = 1;
  for (const p of points) { low = Math.min(low, p.flux); high = Math.max(high, p.flux); }
  for (const v of extra) { low = Math.min(low, v); high = Math.max(high, v); }
  const margin = Math.max(0.0015, (high - low) * 0.14);
  low -= margin; high += margin;
  const x = value => left + (value - xMin) / (xMax - xMin) * (w - left - right);
  const y = value => top + (high - value) / (high - low) * (h - top - bottom);
  ctx.font = '9px "Avenir Next", sans-serif'; ctx.lineWidth = 1;
  ctx.fillStyle = '#93a2b6'; ctx.fillText('Helligkeit (%)', left, 13);
  for (let j = 0; j < 4; j++) {
    const value = low + (high - low) * j / 3;
    const yy = y(value);
    ctx.strokeStyle = '#879cb218'; ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(w - right, yy); ctx.stroke();
    ctx.fillStyle = '#8292a9'; ctx.textAlign = 'right'; ctx.fillText(format(value * 100, high - low < 0.015 ? 2 : 1), left - 10, yy + 3);
  }
  const ticks = w < 450 ? 4 : 6;
  for (let j = 0; j <= ticks; j++) {
    const value = xMin + (xMax - xMin) * j / ticks;
    ctx.textAlign = 'center';ctx.fillStyle = '#8292a9';ctx.fillText(format(value, xMax - xMin > 2 ? 1 : 2), x(value), h - 17);
  }
  ctx.fillStyle = '#93a2b6'; ctx.textAlign = 'right'; ctx.fillText(xLabel, w - right, h - 2); ctx.textAlign = 'left';
  ctx.save(); ctx.beginPath(); ctx.rect(left, top, w - left - right, h - top - bottom); ctx.clip();
  ctx.strokeStyle = '#c7d6e744'; ctx.setLineDash([3, 5]);ctx.beginPath();ctx.moveTo(left, y(1));ctx.lineTo(w - right, y(1));ctx.stroke();ctx.setLineDash([]);
  return { ctx, x, y, left, right, w, h, top, bottom };
}
function path(ctx, points, x, y, color, dashed = false) {
  ctx.strokeStyle = color;ctx.lineWidth = 1.6;ctx.setLineDash(dashed ? [5, 4] : []);ctx.beginPath();
  points.forEach((p, j) => j ? ctx.lineTo(x(p.time), y(p.flux)) : ctx.moveTo(x(p.time), y(p.flux)));
  ctx.stroke();ctx.setLineDash([]);
}
export function drawTimeSeries(canvas, points, { model = null, cursor = null } = {}) {
  if (!points.length) return;
  const start = points[0].time, end = points.at(-1).time;
  const theoretical = model ? new Array(Math.max(1500, points.length * 2)) : [];
  // Dense evaluation is generated afresh from geometry; no stored curves.
  for (let j = 0; j < theoretical.length; j++) {
    const time = start + (end - start) * j / (theoretical.length - 1);
    theoretical[j] = { time, flux: model(time) };
  }
  const f = frame(canvas, points, start, end, 'Zeit (Tage)', theoretical.map(p => p.flux));
  const { ctx, x, y, top, h, bottom } = f;
  ctx.fillStyle = '#81decf'; ctx.globalAlpha = Math.max(0.24, Math.min(0.75, 1300 / points.length));
  for (const p of points) { ctx.beginPath();ctx.arc(x(p.time), y(p.flux), 1.25, 0, Math.PI * 2);ctx.fill(); }
  ctx.globalAlpha = 1;
  if (model) path(ctx, theoretical, x, y, '#ffc88c');
  if (cursor !== null) {
    const xx = x(cursor);ctx.strokeStyle = '#ffc88c88';ctx.lineWidth = 1;ctx.beginPath();ctx.moveTo(xx, top);ctx.lineTo(xx, h - bottom);ctx.stroke();
    ctx.fillStyle = '#ffc88c';ctx.beginPath();ctx.moveTo(xx - 4, top);ctx.lineTo(xx + 4, top);ctx.lineTo(xx, top + 6);ctx.fill();
  }
  ctx.restore();
  return f;
}
export function drawFolded(canvas, points, candidate, { zoom = false, showModel = true, showBins = true } = {}) {
  const folded = foldMeasurements(points, candidate.period, candidate.epoch);
  const range = zoom ? 0.12 : 0.5;
  const theoretical = Array.from({ length: 1000 }, (_, j) => {
    const phase = -range + 2 * range * j / 999;
    return { time: phase, flux: candidate.baseline - candidateDrop(candidate.epoch + phase * candidate.period, candidate) };
  });
  const visible = folded.filter(p => Math.abs(p.phase) <= range);
  const { ctx, x, y } = frame(canvas, visible, -range, range, 'Phase (Anteil der Kandidatenperiode)', showModel ? theoretical.map(p => p.flux) : []);
  const minCycle = Math.min(...folded.map(p => p.cycle));
  ctx.globalAlpha = 0.55;
  for (const p of visible) {ctx.fillStyle = colors[(p.cycle - minCycle) % colors.length];ctx.beginPath();ctx.arc(x(p.phase), y(p.flux), 1.6, 0, Math.PI * 2);ctx.fill();}
  ctx.globalAlpha = 1;
  if (showBins) {
    const bins = Array.from({ length: 48 }, () => []);
    for (const p of visible) bins[Math.min(47, Math.floor((p.phase + range) / (2 * range) * 48))].push(p.flux);
    ctx.strokeStyle = '#e5edf6aa';ctx.fillStyle = '#edf1f5';ctx.lineWidth = 1;
    bins.forEach((values, j) => {
      if (values.length < 2) return;
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const se = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1) / values.length);
      const xx = x(-range + (j + 0.5) / 48 * 2 * range);
      ctx.beginPath();ctx.moveTo(xx, y(mean - se));ctx.lineTo(xx, y(mean + se));ctx.stroke();ctx.fillRect(xx - 1.5, y(mean) - 1.5, 3, 3);
    });
  }
  if (showModel) path(ctx, theoretical, x, y, '#ffc88c', true);
  ctx.restore();
  return new Set(folded.map(p => p.cycle)).size;
}
export function drawSpectrum(canvas, spectrum, selected) {
  const { ctx, w, h } = prepare(canvas);
  const sorted = [...spectrum].sort((a, b) => a.period - b.period);
  const max = Math.max(1e-12, ...sorted.map(s => s.score));
  const x = p => 28 + (p - 1) / 11 * (w - 42), y = score => h - 25 - score / max * (h - 47);
  ctx.strokeStyle = '#81decf88';ctx.lineWidth = 1;ctx.beginPath();
  sorted.forEach((p, j) => j ? ctx.lineTo(x(p.period), y(p.score)) : ctx.moveTo(x(p.period), y(p.score)));ctx.stroke();
  ctx.strokeStyle = '#ffc88c';ctx.beginPath();ctx.moveTo(x(selected), 14);ctx.lineTo(x(selected), h - 25);ctx.stroke();
  ctx.fillStyle = '#93a2b6';ctx.font = '9px "Avenir Next", sans-serif';ctx.fillText('Box-Suche · relative Anpassungsverbesserung (keine Wahrscheinlichkeit)', 28, 10);
  for (const p of [1, 3, 6, 9, 12]) ctx.fillText(`${p} d`, x(p) - 5, h - 7);
}
