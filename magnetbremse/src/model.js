/** SI units throughout. Positive z and ring normal point DOWN.
 * Positive I is clockwise when viewed from above.
 * No material-dependent acceleration: force only comes from I * dPhi/dz.
 */
export const DEFAULTS = Object.freeze({
  mass: 0.025, gravity: 9.81, moment: 3, polarity: 1,
  resistance: 0.00004, inductance: 0.0000001,
  conducting: true, closed: true,
  radius: 0.022, ringCount: 20, ringStart: 0.14, ringSpacing: 0.02,
  start: 0.035, finish: 0.65, heatCapacity: 3.45,
});
export const DT = 1 / 4000;
export const ENERGY_TOLERANCE = 1e-7; // relative to initial total energy (1 nJ floor)
const MU0 = 4 * Math.PI * 1e-7;

export function parameters(overrides = {}) {
  const p = { ...DEFAULTS, ...overrides };
  for (const key of ['mass', 'radius', 'resistance', 'heatCapacity', 'ringSpacing']) {
    if (!(Number.isFinite(p[key]) && p[key] > 0)) throw new RangeError(`${key} must be positive`);
  }
  for (const key of ['gravity', 'moment', 'inductance']) {
    if (!(Number.isFinite(p[key]) && p[key] >= 0)) throw new RangeError(`${key} must be nonnegative`);
  }
  if (![1, -1].includes(p.polarity)) throw new RangeError('polarity must be +1 or -1');
  if (!Number.isInteger(p.ringCount) || p.ringCount < 1 || p.ringCount > 100) throw new RangeError('invalid ring count');
  if (![p.start, p.finish, p.ringStart].every(Number.isFinite) || p.finish <= p.start) throw new RangeError('invalid geometry');
  return Object.freeze(p);
}

export function ringPosition(i, p) { return p.ringStart + i * p.ringSpacing; }
export function flux(z, i, p) {
  const x = z - ringPosition(i, p);
  return MU0 * p.polarity * p.moment * p.radius ** 2 / (2 * (p.radius ** 2 + x * x) ** 1.5);
}
export function gradient(z, i, p) {
  const x = z - ringPosition(i, p);
  return -3 * MU0 * p.polarity * p.moment * p.radius ** 2 * x / (2 * (p.radius ** 2 + x * x) ** 2.5);
}

// Stable exact divided difference of A / (a² + x²)^(3/2), including z1 == z0.
// Factoring x1²-x0² avoids subtracting nearly identical flux values.
export function discreteGradient(z0, z1, i, p) {
  const x0 = z0 - ringPosition(i, p), x1 = z1 - ringPosition(i, p);
  const u = Math.sqrt(p.radius ** 2 + x0 * x0), w = Math.sqrt(p.radius ** 2 + x1 * x1);
  const a = MU0 * p.polarity * p.moment * p.radius ** 2 / 2;
  return -a * (x0 + x1) * (u * u + u * w + w * w) / ((u + w) * u ** 3 * w ** 3);
}

export function createState(p = DEFAULTS, initial = {}) {
  return {
    t: 0, z: p.start, v: 0,
    currents: new Float64Array(p.ringCount), heat: new Float64Array(p.ringCount),
    ...initial,
  };
}

/** Discrete-gradient mechanics + implicit midpoint RL circuits.
 * Each step satisfies Δ(K+Ug+EL)+ΣΔQi = 0 up to scalar solve/roundoff.
 * Q uses precisely the SAME midpoint currents as mechanical coupling.
 * Open or insulating rings are removed circuits (I=0), not a drag multiplier.
 * Changing circuit/material parameters requires a NEW experiment.
 */
export function step(s, p, h = DT) {
  if (!(Number.isFinite(h) && h > 0 && h <= 0.002)) throw new RangeError('step must be in (0, 0.002] s');
  const active = p.conducting && p.closed;
  const n = p.ringCount;
  const gs = new Float64Array(n), mids = new Float64Array(n);
  const den = p.inductance + h * p.resistance / 2;
  let vm = s.v + h * p.gravity / 2;
  let converged = !active;
  if (active) {
    for (let iteration = 0; iteration < 30; iteration++) {
      let f = 0, damping = 0;
      for (let i = 0; i < n; i++) {
        const g = discreteGradient(s.z, s.z + h * vm, i, p);
        // Solve vm analytically for locally fixed discrete gradients.
        f += p.inductance * s.currents[i] * g / den;
        damping += h * g * g / (2 * den);
      }
      const next = (s.v + h * (p.gravity + f / p.mass) / 2) / (1 + h * damping / (2 * p.mass));
      if (Math.abs(next - vm) < 2e-14 * Math.max(1, Math.abs(next))) {
        vm = next; converged = true; break;
      }
      vm = next;
    }
    if (!converged) throw new Error('Coupled step did not converge; reduce timestep');
  }
  const z = s.z + h * vm;
  const currents = new Float64Array(n), heat = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    gs[i] = discreteGradient(s.z, z, i, p);
    mids[i] = active ? (p.inductance * s.currents[i] - h * gs[i] * vm / 2) / den : 0;
    // In L=0 the current is algebraic; expose the endpoint constitutive value.
    currents[i] = active ? (p.inductance > 0 ? 2 * mids[i] - s.currents[i] : -gradient(z, i, p) * (2 * vm - s.v) / p.resistance) : 0;
    heat[i] = s.heat[i] + h * p.resistance * mids[i] ** 2;
  }
  return { t: s.t + h, z, v: 2 * vm - s.v, currents, heat };
}

export function energy(s, p) {
  const potential = p.mass * p.gravity * (p.finish - s.z);
  const kinetic = p.mass * s.v ** 2 / 2;
  const magnetic = s.currents.reduce((sum, current) => sum + p.inductance * current ** 2 / 2, 0);
  const heat = s.heat.reduce((sum, q) => sum + q, 0);
  return { potential, kinetic, magnetic, heat, total: potential + kinetic + magnetic + heat };
}

export function observe(s, p) {
  const rings = Array.from({ length: p.ringCount }, (_, i) => {
    const phi = flux(s.z, i, p), dPhiDz = gradient(s.z, i, p);
    const dPhiDt = dPhiDz * s.v, voltage = -dPhiDt;
    const current = s.currents[i], force = current * dPhiDz;
    const power = p.resistance * current ** 2;
    return { i, z: ringPosition(i, p), phi, dPhiDz, dPhiDt, voltage, current, force,
      power, heat: s.heat[i], temperatureRise: s.heat[i] / p.heatCapacity,
      dIdt: p.closed && p.conducting && p.inductance > 0 ? (voltage - p.resistance * current) / p.inductance : 0 };
  });
  const force = rings.reduce((sum, ring) => sum + ring.force, 0);
  return { ...s, rings, force, acceleration: p.gravity + force / p.mass, energy: energy(s, p) };
}

export function freeState(t, p) {
  return { t, z: p.start + p.gravity * t * t / 2, v: p.gravity * t };
}
export function freeArrival(p) {
  return p.gravity > 0 ? Math.sqrt(2 * (p.finish - p.start) / p.gravity) : Infinity;
}

// Finish on the measurement plane. Velocity/energy remain PRE-impact values.
export function advanceToFinish(s, p, h = DT) {
  if (s.z >= p.finish) return s;
  const next = step(s, p, h);
  if (next.z < p.finish) return next;
  let lo = 0, hi = h;
  for (let j = 0; j < 35; j++) {
    const mid = (lo + hi) / 2;
    if (step(s, p, mid).z < p.finish) lo = mid; else hi = mid;
  }
  return step(s, p, hi);
}

export function runExperiment(overrides = {}, duration = 8, h = DT) {
  const p = parameters(overrides);
  let s = createState(p);
  const e0 = energy(s, p).total;
  let maxEnergyError = 0, peakCurrent = 0, minForce = 0;
  while (s.t < duration && s.z < p.finish) {
    s = advanceToFinish(s, p, Math.min(h, duration - s.t));
    const o = observe(s, p);
    maxEnergyError = Math.max(maxEnergyError, Math.abs(o.energy.total - e0));
    peakCurrent = Math.max(peakCurrent, ...s.currents.map(Math.abs));
    minForce = Math.min(minForce, o.force);
  }
  return { p, state: s, arrival: s.z >= p.finish ? s.t : null, freeArrival: freeArrival(p),
    energy: energy(s, p), maxEnergyError, relativeEnergyError: maxEnergyError / Math.max(Math.abs(e0), 1e-9), peakCurrent, minForce };
}
