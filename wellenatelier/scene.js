import { WORLD, CORE_RADIUS, TAU, createFieldGrid, fieldPhasor, pressure } from './model.js';

const COLORS = { a: '#c88a50', b: '#699faa', sum: '#293f43' };

export class FieldScene {
  constructor(canvas, trace) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.trace = trace; this.traceCtx = trace.getContext('2d');
    this.buffer = document.createElement('canvas');
    this.buffer.width = 420; this.buffer.height = 280;
    this.bufferCtx = this.buffer.getContext('2d');
    this.pixels = this.bufferCtx.createImageData(420, 280);
    this.grid = null; this.currentPressure = new Float32Array(420 * 280);
    this.observer = new ResizeObserver(() => { this.resize(); });
    this.observer.observe(canvas); this.observer.observe(trace); this.resize();
  }
  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const element of [this.canvas, this.trace]) {
      const rect = element.getBoundingClientRect();
      element.width = Math.round(rect.width * this.dpr); element.height = Math.round(rect.height * this.dpr);
    }
  }
  update(state) { this.grid = createFieldGrid(state, 420, 280); }
  draw(state, theta, why) {
    if (!this.grid) this.update(state);
    const { re, im, width: gw, height: gh } = this.grid;
    const co = Math.cos(theta), si = Math.sin(theta); const data = this.pixels.data;
    for (let i = 0; i < re.length; i++) {
      const p = re[i] * co - im[i] * si; this.currentPressure[i] = p;
      const intensity = Math.tanh(Math.abs(p) * 2.5) * 0.82;
      data[i * 4] = 17 + (p >= 0 ? 194 : 63) * intensity;
      data[i * 4 + 1] = 40 + (p >= 0 ? 122 : 105) * intensity;
      data[i * 4 + 2] = 53 + (p >= 0 ? 47 : 113) * intensity;
      data[i * 4 + 3] = 255;
    }
    this.bufferCtx.putImageData(this.pixels, 0, 0);
    const ctx = this.ctx; const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.drawImage(this.buffer, 0, 0, w, h);
    ctx.lineWidth = 0.5; ctx.strokeStyle = '#d4dfd310'; ctx.beginPath();
    for (let x = 1; x < WORLD.width; x++) { ctx.moveTo(x / WORLD.width * w, 0); ctx.lineTo(x / WORLD.width * w, h); }
    for (let y = 1; y < WORLD.height; y++) { ctx.moveTo(0, y / WORLD.height * h); ctx.lineTo(w, y / WORLD.height * h); }
    ctx.stroke();
    // Isobars from the actual sum: positive solid, negative dashed.
    for (const threshold of [0.13, -0.13, 0.38, -0.38]) {
      ctx.strokeStyle = threshold > 0 ? '#f1c08948' : '#a0d2e050';
      ctx.lineWidth = 0.65; ctx.setLineDash(threshold < 0 ? [2.5, 4] : []); ctx.beginPath();
      const step = 4;
      for (let y = 0; y < gh - step; y += step) {
        for (let x = 0; x < gw - step; x += step) {
          const points = [[x, y], [x + step, y], [x + step, y + step], [x, y + step]];
          const v = points.map(([px, py]) => this.currentPressure[py * gw + px]);
          const crossings = [];
          for (let e = 0; e < 4; e++) {
            const next = (e + 1) % 4;
            if ((v[e] >= threshold) !== (v[next] >= threshold)) {
              const t = (threshold - v[e]) / (v[next] - v[e]);
              crossings.push([(points[e][0] + (points[next][0] - points[e][0]) * t) / (gw - 1) * w, (points[e][1] + (points[next][1] - points[e][1]) * t) / (gh - 1) * h]);
            }
          }
          for (let i = 0; i + 1 < crossings.length; i += 2) { ctx.moveTo(...crossings[i]); ctx.lineTo(...crossings[i + 1]); }
        }
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Sparse signed samples make the sign readable without color perception.
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let y = 60; y < h - 40; y += 48) {
      for (let x = 35; x < w - 20; x += 48) {
        const i = Math.round(y / h * (gh - 1)) * gw + Math.round(x / w * (gw - 1));
        const p = this.currentPressure[i];
        if (Math.abs(p) < 0.055) continue;
        ctx.fillStyle = p > 0 ? '#efca9385' : '#aed9e57a'; ctx.fillText(p > 0 ? '+' : '−', x, y);
      }
    }
    if (why) this.drawPaths(state, w, h);
    for (const source of state.sources) {
      const x = source.x / WORLD.width * w, y = source.y / WORLD.height * h, r = CORE_RADIUS / WORLD.width * w;
      ctx.save();ctx.beginPath();ctx.arc(x, y, r, 0, TAU);ctx.clip();
      ctx.strokeStyle = '#edf0dc77';ctx.lineWidth = 1;ctx.beginPath();
      for (let dx = -r * 2; dx < r * 2; dx += 5) {ctx.moveTo(x + dx, y - r);ctx.lineTo(x + dx + r * 2, y + r);}
      ctx.stroke();ctx.restore();
    }
    this.drawTrace(state, theta);
  }
  drawPaths(state, w, h) {
    const ctx = this.ctx; const z = fieldPhasor(state);
    const lx = state.listener.x / WORLD.width * w, ly = state.listener.y / WORLD.height * h;
    state.sources.forEach((source, i) => {
      const x = source.x / WORLD.width * w, y = source.y / WORLD.height * h;
      ctx.strokeStyle = i ? '#a4d4dbd9' : '#f2c58dd9'; ctx.lineWidth = 1.2;ctx.setLineDash(i ? [5, 4] : []);
      ctx.beginPath();ctx.moveTo(x, y);ctx.lineTo(lx, ly);ctx.stroke();ctx.setLineDash([]);
      const mx = (x + lx) / 2, my = (y + ly) / 2;
      const text = `r${i ? 'B' : 'A'} = ${(i ? z.b : z.a).distance.toFixed(2).replace('.', ',')} m`;
      ctx.font = '10px sans-serif';const tw = ctx.measureText(text).width;
      ctx.fillStyle = '#17333eeb';ctx.fillRect(mx - tw / 2 - 7, my - 11, tw + 14, 22);
      ctx.fillStyle = i ? '#afd7d9' : '#f0c797';ctx.textAlign = 'center';ctx.textBaseline = 'middle';ctx.fillText(text, mx, my);
    });
  }
  drawTrace(state, theta) {
    const ctx = this.traceCtx, w = this.trace.width / this.dpr, h = this.trace.height / this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);ctx.clearRect(0, 0, w, h);
    const z = fieldPhasor(state); const peak = Math.max(1, Math.hypot(z.re, z.im), z.a.amplitude, z.b.amplitude);
    const scale = Math.ceil(peak * 2) / 2;
    const sy = p => h / 2 - p / scale * (h / 2 - 10);
    ctx.strokeStyle = '#afbaa650';ctx.lineWidth = 0.7;ctx.beginPath();ctx.moveTo(0, h / 2);ctx.lineTo(w, h / 2);ctx.stroke();
    ctx.font = '8px sans-serif';ctx.fillStyle = '#9aa38e';ctx.textAlign = 'left';ctx.fillText(`+${scale.toFixed(1)}`, 0, 9);ctx.fillText(`−${scale.toFixed(1)}`, 0, h - 2);
    for (const [key, phasor] of [['a', z.a], ['b', z.b], ['sum', z]]) {
      ctx.strokeStyle = COLORS[key];ctx.lineWidth = key === 'sum' ? 2 : 1.4;ctx.setLineDash(key === 'b' ? [4, 3] : []);ctx.beginPath();
      for (let x = 0; x <= w; x++) {const y = sy(pressure(phasor, x / w * TAU));if (!x) ctx.moveTo(x, y);else ctx.lineTo(x, y);}
      ctx.stroke();
    }
    ctx.setLineDash([]);const cursor = ((theta % TAU + TAU) % TAU) / TAU * w;
    ctx.strokeStyle = '#7a8a7170';ctx.lineWidth = 1;ctx.beginPath();ctx.moveTo(cursor, 7);ctx.lineTo(cursor, h - 7);ctx.stroke();
    for (const [key, phasor] of [['a', z.a], ['b', z.b], ['sum', z]]) {ctx.fillStyle = COLORS[key];ctx.beginPath();ctx.arc(cursor, sy(pressure(phasor, theta)), key === 'sum' ? 3.1 : 2.3, 0, TAU);ctx.fill();}
  }
}
