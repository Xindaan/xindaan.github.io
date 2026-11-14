import { freeState, freeArrival } from './model.js';

export const COLORS = { potential: '#8d9b63', kinetic: '#3c758b', magnetic: '#9c83ad', heat: '#be744e', total: '#294147' };
export const ENERGY_NAMES = { potential: 'Lage', kinetic: 'Bewegung', magnetic: 'Induktiv', heat: 'Joule-Wärme', total: 'Summe' };
const fmt = (v, places = 2) => (Math.abs(v) < 0.5 * 10 ** -places ? 0 : v).toLocaleString('de-DE', { minimumFractionDigits: places, maximumFractionDigits: places });
const sign = v => v > 0 ? '+' : '';
const signed = (v, places = 1) => `${Math.abs(v) < 0.5 * 10 ** -places ? '' : sign(v)}${fmt(v, places)}`;
const yFor = z => 10 + z / 0.7 * 400;
let scene, ringEls, freeMagnet, coupledMagnet, forceVector, finishText;

function magnetMarkup(id, x) {
  return `<g id="${id}" transform="translate(${x},30)"><ellipse cx="0" cy="24" rx="23" ry="5" fill="#314b43" opacity=".07"/><rect class="magnet-top" x="-13" y="-23" width="26" height="46" rx="5" fill="url(#magnetMetal)" stroke="#55716f" stroke-width=".8"/><path class="magnet-bottom" d="M-13 0H13V18Q13 23 8 23H-8Q-13 23-13 18Z" fill="url(#magnetCopper)"/><path d="M-9 -18V17" stroke="white" stroke-opacity=".35" stroke-width="1.6"/><text class="north-label svg-label" x="1" y="15" text-anchor="middle" fill="#fff8eb" font-size="10" font-weight="600">N</text><text class="south-label svg-label" x="1" y="-8" text-anchor="middle" fill="#edf3e9" font-size="10" font-weight="600">S</text></g>`;
}

export function initScene(el, p) {
  scene = el;
  scene.innerHTML = `<defs><linearGradient id="ringMetal" x1="0" x2="1"><stop stop-color="#855b40"/><stop offset=".2" stop-color="#c99970"/><stop offset=".5" stop-color="#ecd6ae"/><stop offset=".8" stop-color="#bb8965"/><stop offset="1" stop-color="#795941"/></linearGradient><linearGradient id="magnetMetal"><stop stop-color="#3e6267"/><stop offset=".45" stop-color="#6c9191"/><stop offset="1" stop-color="#2e5258"/></linearGradient><linearGradient id="magnetCopper"><stop stop-color="#a45236"/><stop offset=".45" stop-color="#d48a60"/><stop offset="1" stop-color="#a45b3d"/></linearGradient><marker id="forceArrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L8 4L0 8Z" fill="#187f78"/></marker></defs>
  <g class="svg-label" fill="#8a998e" font-size="8"><text x="19" y="20">z ↓</text><text x="4" y="37">[cm]</text><text x="100" y="14" text-anchor="middle">START</text><text x="320" y="14" text-anchor="middle">START</text><text x="425" y="60">RING</text><text x="481" y="60" text-anchor="middle">I [A]</text><text x="555" y="60" text-anchor="middle">ΔT [mK]</text><text x="639" y="60" text-anchor="middle">Fz [mN]</text></g>
  <g stroke="#b6c7ba" stroke-width=".6">${Array.from({ length: 7 }, (_, j) => `<line x1="32" y1="${yFor(j / 10)}" x2="42" y2="${yFor(j / 10)}"/><text class="svg-mono" x="24" y="${yFor(j / 10) + 3}" text-anchor="end" fill="#8a998e" stroke="none" font-size="8">${j * 10}</text>`).join('')}</g>
  <path d="M100 25V381 M320 25V381" stroke="#afc1b5" stroke-width=".8" stroke-dasharray="2 5"/>
  <path d="M193 20V408" stroke="#d8e0d3" stroke-width=".7"/>
  <rect x="275" y="85" width="90" height="244" rx="3" fill="#d6c9ae" opacity=".10"/>
  <g id="rings">${Array.from({ length: p.ringCount }, (_, i) => {
    const y = yFor(p.ringStart + i * p.ringSpacing);
    return `<g id="ring-${i}" class="ring-hit" data-ring="${i}" tabindex="0" role="button" aria-label="Ring ${i + 1} untersuchen" transform="translate(0,${y})"><title>Ring ${i + 1} auswählen und Vorgang anhalten</title><rect class="ring-hover" x="260" y="-7" width="420" height="14" rx="3" fill="#d6e5d9"/><rect class="selected-bg" x="260" y="-7" width="420" height="14" rx="3" fill="#d5e3d4" opacity="0"/><ellipse cx="320" cy="0" rx="48" ry="9" fill="none" stroke="url(#ringMetal)" stroke-width="5"/><path class="ring-window" d="M286 6Q320 14 354 6" fill="none" stroke="#f0f1e9" stroke-width="6"/><path class="ring-closure" d="M286 6Q320 14 354 6" fill="none" stroke="#c8af8a" stroke-width="1" stroke-dasharray="2 3"/><path class="slit-mark" d="M363 -5L371 5" stroke="#f0f1e9" stroke-width="7" opacity="0"/><path class="current-arc" d="M281 -5Q296 -13 313 -10" fill="none" stroke="#187f78" stroke-width="2" opacity="0"/><text class="ring-number svg-mono" x="425" y="3" fill="#9ca395" font-size="8">${String(i + 1).padStart(2, '0')}</text><text class="ring-current svg-mono" x="481" y="3" text-anchor="middle" fill="#536b61" font-size="11">· 0,0</text><text class="ring-temp svg-mono" x="555" y="3" text-anchor="middle" fill="#887055" font-size="11">0,000</text><text class="ring-force svg-mono" x="639" y="3" text-anchor="middle" fill="#536b61" font-size="11">0,00</text><rect x="262" y="-8" width="414" height="16" fill="transparent"/></g>`;
  }).join('')}</g>
  <g stroke="#bdc9bb" stroke-width=".8" stroke-dasharray="4 4"><path d="M56 ${yFor(p.finish)}H152 M266 ${yFor(p.finish)}H378"/></g>
  <g class="svg-label" fill="#8a998e" font-size="8"><text x="100" y="402" text-anchor="middle">MESSLINIE</text><text x="320" y="402" text-anchor="middle">MESSLINIE</text><text x="425" y="349">↻ +I: Uhrzeigersinn · Draufsicht</text><text x="425" y="363">Fz &lt; 0: nach oben</text><text x="425" y="387">Schnitt: Vorderseite transparent.</text><text x="425" y="401">Wärme als Messwert, ohne Glühen.</text></g>
  <text id="free-finish" x="100" y="${yFor(p.finish) - 18}" text-anchor="middle" class="svg-mono" fill="#637f6b" font-size="10"></text>
  ${magnetMarkup('free-magnet', 100)}${magnetMarkup('coupled-magnet', 320)}
  <g id="force-vector"><path id="force-line" d="M250 100V60" stroke="#187f78" stroke-width="2" marker-end="url(#forceArrow)"/><text id="force-label" class="svg-label" x="239" y="75" text-anchor="end" fill="#187f78" font-size="9">ΣF</text></g>`;
  ringEls = Array.from({ length: p.ringCount }, (_, i) => {
    const el = scene.querySelector(`#ring-${i}`);
    return { el, selected: el.querySelector('.selected-bg'), current: el.querySelector('.ring-current'),
      heat: el.querySelector('.ring-temp'), force: el.querySelector('.ring-force'), arc: el.querySelector('.current-arc'),
      slit: el.querySelector('.slit-mark'), closure: el.querySelector('.ring-closure') };
  });
  freeMagnet = scene.querySelector('#free-magnet'); coupledMagnet = scene.querySelector('#coupled-magnet');
  forceVector = scene.querySelector('#force-vector'); finishText = scene.querySelector('#free-finish');
}

export function renderScene(o, p, selected) {
  const free = freeState(o.t, p), reached = o.t >= freeArrival(p);
  freeMagnet.setAttribute('transform', `translate(100,${yFor(free.z)})`);
  freeMagnet.setAttribute('visibility', reached ? 'hidden' : 'visible');
  coupledMagnet.setAttribute('transform', `translate(320,${yFor(o.z)})`);
  finishText.textContent = reached ? `${fmt(freeArrival(p), 3)} s ✓` : '';
  for (const el of [freeMagnet, coupledMagnet]) {
    el.querySelector('.magnet-top').setAttribute('fill', p.polarity > 0 ? 'url(#magnetMetal)' : 'url(#magnetCopper)');
    el.querySelector('.magnet-bottom').setAttribute('fill', p.polarity > 0 ? 'url(#magnetCopper)' : 'url(#magnetMetal)');
    el.querySelector('.north-label').textContent = p.polarity > 0 ? 'N' : 'S';
    el.querySelector('.south-label').textContent = p.polarity > 0 ? 'S' : 'N';
  }
  for (const r of o.rings) {
    const node = ringEls[r.i], active = Math.abs(r.current) > 1e-7;
    const color = r.current > 0 ? '#ad623d' : '#187f78';
    node.selected.setAttribute('opacity', r.i === selected ? '0.7' : '0');
    node.el.setAttribute('aria-pressed', String(r.i === selected));
    node.current.textContent = `${active ? (r.current > 0 ? '↻' : '↺') : '·'} ${signed(r.current, Math.abs(r.current) > 1e-7 && Math.abs(r.current) < 0.1 ? 3 : 1)}`;
    node.current.setAttribute('fill', active ? color : '#7b897d');
    node.force.textContent = signed(r.force * 1000, 2);
    node.heat.textContent = fmt(r.temperatureRise * 1000, 3);
    node.arc.setAttribute('stroke', color);
    node.arc.setAttribute('stroke-width', 1 + Math.min(Math.abs(r.current) / 50, 2));
    node.arc.setAttribute('opacity', active ? String(Math.min(1, 0.25 + Math.abs(r.current) / 50)) : '0');
    node.slit.setAttribute('opacity', p.closed ? '0' : '1');
    node.closure.setAttribute('opacity', p.closed ? '1' : '.3');
  }
  const fy = yFor(o.z), fl = Math.min(60, Math.abs(o.force) * 180);
  forceVector.setAttribute('visibility', fl > 0.1 ? 'visible' : 'hidden');
  scene.querySelector('#force-line').setAttribute('d', `M250 ${fy}V${fy + Math.sign(o.force) * fl}`);
  scene.querySelector('#force-label').setAttribute('y', fy + Math.sign(o.force) * fl / 2 + 3);
  scene.querySelector('#force-label').textContent = `ΣF ${signed(o.force * 1000, 0)} mN`;
}

export function renderRingDetail(el, r, p) {
  const active = Math.abs(r.current) > 1e-7, positive = r.current > 0;
  const color = positive ? '#b76f4e' : '#187f78';
  el.innerHTML = `<defs><marker id="detailArrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8Z" fill="${color}"/></marker></defs><circle cx="125" cy="52" r="36" fill="#e7eadd" stroke="#b9936c" stroke-width="7"/><circle cx="125" cy="52" r="36" fill="none" stroke="#d5b48b" stroke-width="3"/>${p.closed ? '' : '<path d="M155 28L170 23" stroke="#f4f2ec" stroke-width="14"/>'}<text x="125" y="60" text-anchor="middle" fill="#638477" font-size="24">${r.phi > 1e-15 ? '⊗' : r.phi < -1e-15 ? '⊙' : '·'}</text><text x="177" y="56" class="svg-label" fill="#79867c" font-size="10">Φ ${signed(r.phi * 1e6, 2)} µWb</text>${active ? `<path d="${positive ? 'M78 45 A48 48 0 0 1 151 10' : 'M151 10 A48 48 0 0 0 78 45'}" fill="none" stroke="${color}" stroke-width="1.7" marker-end="url(#detailArrow)"/><text x="45" y="62" text-anchor="middle" font-size="25" fill="${color}">${positive ? '↻' : '↺'}</text>` : '<text x="45" y="54" text-anchor="middle" font-size="10" fill="#8c998c">I = 0</text>'}`;
}

export function initEnergy(legend) {
  legend.innerHTML = Object.keys(COLORS).map(key => `<div class="legend-item" style="--color:${COLORS[key]}"><i></i>${ENERGY_NAMES[key]}<strong id="energy-${key}">0,00 mJ</strong></div>`).join('');
}

export function renderEnergy(svg, history, o, initialEnergy, cursorIndex = null) {
  const left = 35, right = 805, top = 17, bottom = 143;
  const duration = Math.max(1, Math.ceil((history.at(-1)?.t ?? o.t) * 2) / 2);
  const ymax = Math.max(initialEnergy * 1000 * 1.12, 0.01);
  const x = t => left + t / duration * (right - left);
  const y = energy => bottom - energy * 1000 / ymax * (bottom - top);
  const points = history;
  let markup = `<g class="svg-mono" fill="#96a090" font-size="8"><text x="3" y="10">mJ</text><text x="819" y="164" text-anchor="end">s</text>`;
  for (let i = 0; i < 4; i++) {
    const value = ymax * i / 3, yy = y(value / 1000);
    markup += `<line x1="${left}" x2="${right}" y1="${yy}" y2="${yy}" stroke="#d8dfd2" stroke-width=".65"/><text x="27" y="${yy + 3}" text-anchor="end">${fmt(value, value < 1 ? 2 : 0)}</text>`;
  }
  for (let i = 0; i < 5; i++) markup += `<text x="${x(duration * i / 4)}" y="162" text-anchor="middle">${fmt(duration * i / 4, 2)}</text>`;
  markup += '</g>';
  for (const key of Object.keys(COLORS)) {
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(2)} ${y(p.energy[key]).toFixed(2)}`).join(' ');
    if (key === 'heat' && points.length > 1) markup += `<path d="${path} L${x(points.at(-1).t)} ${bottom} L${left} ${bottom}Z" fill="${COLORS[key]}" opacity=".07"/>`;
    markup += `<path d="${path}" fill="none" stroke="${COLORS[key]}" stroke-width="${key === 'total' ? 1 : 1.9}" ${key === 'total' ? 'stroke-dasharray="4 4"' : ''} stroke-linecap="round"/>`;
  }
  const current = cursorIndex === null ? o : points[cursorIndex];
  if (current) {
    markup += `<line x1="${x(current.t)}" x2="${x(current.t)}" y1="${top}" y2="${bottom}" stroke="#9ba999" stroke-dasharray="2 3" stroke-width=".8"/>`;
    for (const key of Object.keys(COLORS)) {
      markup += `<circle cx="${x(current.t)}" cy="${y(current.energy[key])}" r="2.5" fill="${COLORS[key]}"/>`;
      document.querySelector(`#energy-${key}`).textContent = `${fmt(current.energy[key] * 1000, 2)} mJ`;
    }
  }
  svg.innerHTML = markup;
}

export { fmt, signed };
