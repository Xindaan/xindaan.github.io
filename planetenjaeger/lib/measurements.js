import { fluxAt } from './model.js';

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function generateMeasurements(params, seed = 4271, cadence = 0.0125) {
  const random = seededRandom(seed);
  const count = Math.floor(params.period * params.cycles / cadence) + 1;
  return Array.from({ length: count }, (_, index) => {
    const time = index * cadence;
    const normal = Math.sqrt(-2 * Math.log(Math.max(1e-15, random()))) * Math.cos(2 * Math.PI * random());
    return { time, flux: fluxAt(time, params) + params.noise * normal };
  });
}
