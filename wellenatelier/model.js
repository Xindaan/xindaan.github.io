// A plane through a 3D homogeneous free field. Pressure units are relative.
export const C = 343;
export const TAU = 2 * Math.PI;
export const CORE_RADIUS = 0.25;
export const REFERENCE_DISTANCE = 1;
export const WORLD = Object.freeze({ width: 12, height: 8 });

export function initialState() {
  return {
    frequency: 220,
    sources: [
      { x: 3, y: 2.8, amplitude: 1, phase: 0, enabled: true },
      { x: 3, y: 5.2, amplitude: 1, phase: 0, enabled: true },
    ],
    listener: { x: 7.2, y: 4 },
  };
}

export function wrapPhase(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function sourcePhasor(source, point, frequency) {
  const distance = Math.hypot(point.x - source.x, point.y - source.y);
  const amplitude = source.enabled ? source.amplitude * REFERENCE_DISTANCE / Math.max(CORE_RADIUS, distance) : 0;
  const phase = source.phase - TAU * frequency * distance / C;
  return { re: amplitude * Math.cos(phase), im: amplitude * Math.sin(phase), amplitude, phase, distance };
}

export function fieldPhasor(state, point = state.listener) {
  const a = sourcePhasor(state.sources[0], point, state.frequency);
  const b = sourcePhasor(state.sources[1], point, state.frequency);
  const re = a.re + b.re;
  const im = a.im + b.im;
  return { re, im, a, b };
}

// p(t) = Re[Z exp(i theta)]. theta advances at 2 pi f in physical time.
export function pressure(phasor, theta) {
  return phasor.re * Math.cos(theta) - phasor.im * Math.sin(theta);
}

export function measure(state, theta = 0) {
  const z = fieldPhasor(state);
  const amplitude = Math.hypot(z.re, z.im);
  const bothPresent = z.a.amplitude > 0 && z.b.amplitude > 0;
  const phaseDifference = bothPresent ? wrapPhase(z.b.phase - z.a.phase) : null;
  const interference = bothPresent ? 2 * (z.a.re * z.b.re + z.a.im * z.b.im) : 0;
  return {
    ...z, amplitude, rms: amplitude / Math.SQRT2,
    // Fixed reference: unit source at 1 m, rms = 1 / sqrt(2).
    db: amplitude < 1e-12 ? -Infinity : 20 * Math.log10(amplitude),
    pA: pressure(z.a, theta), pB: pressure(z.b, theta), pSum: pressure(z, theta),
    pathDifference: z.b.distance - z.a.distance,
    phaseDifference, interference,
    kind: !bothPresent ? (amplitude ? 'single' : 'silent') : Math.abs(interference) < 1e-10 ? 'neutral' : interference > 0 ? 'constructive' : 'destructive',
  };
}

// One coefficient grid for all frames. No independent wave animation.
export function createFieldGrid(state, width, height) {
  const re = new Float32Array(width * height);
  const im = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const z = fieldPhasor(state, { x: x / (width - 1) * WORLD.width, y: y / (height - 1) * WORLD.height });
      const i = y * width + x;
      re[i] = z.re; im[i] = z.im;
    }
  }
  return { re, im, width, height };
}

export function preset(name) {
  const state = initialState();
  if (name === 'cancel') state.sources[1].phase = Math.PI;
  if (name === 'explore') state.listener = { x: 7.2, y: 2.4 };
  return state;
}
