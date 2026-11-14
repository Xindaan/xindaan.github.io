// Lengths in stellar radii, time in days. Fixed solar mass and solar radius.
export const TAU = 2 * Math.PI;
export const ORBIT_SCALE = 4.208278345829608;
export const mod = (x, p) => ((x % p) + p) % p;
export const semimajor = period => ORBIT_SCALE * period ** (2 / 3);

export function position(time, { period, inclination, phase }) {
  const a = semimajor(period);
  const angle = TAU * (time / period + phase);
  const i = inclination * Math.PI / 180;
  return {
    x: a * Math.sin(angle),
    y: a * Math.cos(angle) * Math.cos(i),
    z: a * Math.cos(angle) * Math.sin(i),
    a,
  };
}

// Exact area common to circles of radii 1 and k, normalized by stellar area pi.
export function blockedFraction(distance, k) {
  if (distance >= 1 + k) return 0;
  if (distance <= Math.abs(1 - k)) return Math.min(1, k * k);
  const clamp = v => Math.max(-1, Math.min(1, v));
  const a = Math.acos(clamp((distance * distance + 1 - k * k) / (2 * distance)));
  const b = Math.acos(clamp((distance * distance + k * k - 1) / (2 * distance * k)));
  const area = a + k * k * b - 0.5 * Math.sqrt(Math.max(0,
    (-distance + 1 + k) * (distance + 1 - k) * (distance - 1 + k) * (distance + 1 + k)));
  // Roundoff near inner/outer tangency can put the result outside its bounds.
  return Math.max(0, Math.min(k * k, area / Math.PI));
}

export function fluxAt(time, params) {
  const p = position(time, params);
  return p.z > 0 ? 1 - blockedFraction(Math.hypot(p.x, p.y), params.radius) : 1;
}

export function contactDuration({ period, radius, inclination }) {
  const a = semimajor(period);
  const cosI = Math.cos(inclination * Math.PI / 180);
  const b = a * cosI;
  if (b >= 1 + radius) return 0;
  return period / Math.PI * Math.asin(Math.min(1,
    Math.sqrt(((1 + radius) ** 2 - b * b) / (a * a - b * b))));
}
