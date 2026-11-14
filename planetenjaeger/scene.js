import { position, fluxAt, semimajor, TAU } from './lib/model.js';
import { prepare, format } from './plots.js';

function circle(ctx, x, y, radius, fill) {ctx.fillStyle = fill;ctx.beginPath();ctx.arc(x, y, radius, 0, TAU);ctx.fill();}
function line(ctx, from, to, color, dashed = false) {ctx.strokeStyle = color;ctx.lineWidth = 1;ctx.setLineDash(dashed ? [3, 5] : []);ctx.beginPath();ctx.moveTo(from.x, from.y);ctx.lineTo(to.x, to.y);ctx.stroke();ctx.setLineDash([]);}
export function drawScene(canvas, params, time) {
  const { ctx, w, h } = prepare(canvas);
  // Deterministic decorative sky, independent of measurement noise.
  for (let j = 0; j < 95; j++) {
    const sx = ((j * 137.507 + 53) % 997) / 997 * w;
    const sy = ((j * j * 11.731 + 19) % 613) / 613 * h;
    circle(ctx, sx, sy, j % 7 === 0 ? .9 : .55, j % 3 === 0 ? '#d4dcf638' : '#a8bce318');
  }
  const compact = w < 600;
  const split = w * (compact ? 0.61 : 0.70);
  const cx = split * 0.48, cy = h * .45;
  const a = semimajor(params.period), scale = split * .44 / a;
  const project = p => ({ x: cx + scale * (.819152 * p.x - .573576 * p.z),
    y: cy + scale * (.242404 * p.x - .906308 * p.y + .346189 * p.z),
    depth: .519837 * p.x + .422618 * p.y + .742404 * p.z });
  const pos = position(time, params), pp = project(pos);
  const orbit = Array.from({ length: 361 }, (_, j) => project(position(j / 360 * params.period, params)));
  ctx.strokeStyle = '#728aa63b';ctx.lineWidth = 1;ctx.beginPath();orbit.forEach((p, j) => j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));ctx.stroke();
  // Orbital ticks convey direction and depth, without changing the physical radius.
  for (let j = 0; j < 360; j += 30) circle(ctx, orbit[j].x, orbit[j].y, 1.2, '#7d91ad55');
  const observer = project({ x: 0, y: 0, z: a * 1.1 });
  const near = project({ x: 0, y: 0, z: 1.6 });
  line(ctx, observer, near, '#85dccc70', true);
  const angle = Math.atan2(near.y - observer.y, near.x - observer.x);
  line(ctx, near, { x: near.x - 7 * Math.cos(angle - .4), y: near.y - 7 * Math.sin(angle - .4) }, '#85dccc');
  line(ctx, near, { x: near.x - 7 * Math.cos(angle + .4), y: near.y - 7 * Math.sin(angle + .4) }, '#85dccc');
  const planet = () => {
    circle(ctx, pp.x, pp.y, scale * params.radius, '#101b2c');
    ctx.strokeStyle = '#85ded2';ctx.lineWidth = 1;ctx.beginPath();ctx.arc(pp.x, pp.y, scale * params.radius, 0, TAU);ctx.stroke();
    ctx.strokeStyle = '#85ded233';ctx.beginPath();ctx.arc(pp.x, pp.y, scale * params.radius + 5, 0, TAU);ctx.stroke();
  };
  if (pp.depth < 0) planet();
  const glow = ctx.createRadialGradient(cx, cy, scale * .4, cx, cy, scale * 3.6);
  glow.addColorStop(0, '#ffc77f52');glow.addColorStop(.4, '#f7aa4420');glow.addColorStop(1, '#f7aa4400');circle(ctx, cx, cy, scale * 3.6, glow);
  const stellar = ctx.createRadialGradient(cx - scale * .25, cy - scale * .3, 0, cx, cy, scale);
  stellar.addColorStop(0, '#fff5da');stellar.addColorStop(.7, '#ffdc9c');stellar.addColorStop(1, '#f4b875');circle(ctx, cx, cy, scale, stellar);
  if (pp.depth >= 0) planet();
  ctx.font = '10px "Avenir Next", sans-serif';ctx.fillStyle = '#e4d6bd';ctx.fillText('Stern', cx + scale + 10, cy - 8);
  if (Math.hypot(pp.x - cx, pp.y - cy) > scale * 1.8) {
    ctx.fillStyle = '#a6cccd';ctx.fillText('Planet', pp.x + scale * params.radius + 12, pp.y + 4);
  }
  ctx.fillStyle = '#8ab8b5';ctx.font = '9px "Avenir Next", sans-serif';ctx.fillText('Beobachtung', Math.max(14, observer.x - 28), observer.y + 18);
  ctx.fillStyle = '#71839c';ctx.font = '8px "Avenir Next", sans-serif';ctx.fillText('PERSPEKTIVISCHE ANSICHT', 22, h - 18);
  const sx = split + (w - split) / 2, sy = h * .47;
  const r = Math.min((w - split) * .29, h * .235);
  ctx.strokeStyle = '#5d759127';ctx.beginPath();ctx.moveTo(split, 29);ctx.lineTo(split, h - 28);ctx.stroke();
  ctx.textAlign = 'center';ctx.fillStyle = '#9baabf';ctx.font = '8px "Avenir Next", sans-serif';ctx.fillText('BLICK AUF DEN STERN', sx, 27);
  ctx.fillStyle = '#697e97';ctx.fillText('PROJEKTION · x / y', sx, 43);
  ctx.save();ctx.beginPath();ctx.rect(split + 8, 57, w - split - 16, h - 98);ctx.clip();
  circle(ctx, sx, sy, r, '#f6d298'); // Uniform surface brightness used by the model.
  ctx.strokeStyle = '#d9e8ee55';ctx.lineWidth = 1;ctx.setLineDash([3, 4]);ctx.beginPath();
  let started = false;
  for (let j = -90; j <= 90; j++) {
    const p = position(j / 360 * params.period, { ...params, phase: 0 });
    if (Math.abs(p.x) > 2) continue;
    const x = sx + p.x * r, y = sy - p.y * r;
    if (!started) ctx.moveTo(x, y); else ctx.lineTo(x, y);started = true;
  }
  ctx.stroke();ctx.setLineDash([]);
  if (pos.z > 0) {
    circle(ctx, sx + pos.x * r, sy - pos.y * r, r * params.radius, '#15273a');
    ctx.strokeStyle = '#81decf';ctx.lineWidth = 1;ctx.beginPath();ctx.arc(sx + pos.x * r, sy - pos.y * r, r * params.radius, 0, TAU);ctx.stroke();
  }
  ctx.restore();
  const depth = 1 - fluxAt(time, params);
  ctx.font = '10px "Avenir Next", sans-serif';ctx.fillStyle = depth > 0 ? '#ffc88c' : '#9eacc0';
  ctx.fillText(depth > 0 ? `−${format(depth * 100)} % Licht` : 'Keine Bedeckung', sx, sy + r + 28);
  ctx.font = '8px "Avenir Next", sans-serif';ctx.fillStyle = '#778ba4';
  ctx.fillText(pos.z < 0 ? 'Planet hinter dem Stern' : Math.abs(pos.x) > 1.7 ? 'Planet außerhalb des Ausschnitts' : `Abstand zur Mitte: ${format(Math.hypot(pos.x, pos.y))} R★`, sx, sy + r + 45);
  ctx.textAlign = 'left';
}
