import { blockedFraction } from './model.js';
import { seededRandom } from './measurements.js';
import { bandShape, binAverage, SPECIES, WINDOWS } from './spectral-bands.js';

export const EARTH_RADIUS_KM = 6371;
export const SCALE_HEIGHT_KM = 8.4;
export const HOSTS = Object.freeze({
  dwarf: { name: 'Kleiner roter Stern', radius: .2, mass: .15, temperature: 3000, period: 15 },
  sun: { name: 'Sonnenähnlicher Stern', radius: 1, mass: 1, temperature: 5772, period: 365.25 },
});
export const WORLDS = Object.freeze({
  mixture: { label: 'Interessante Mischung', clouds: .1, atmosphere: true,
    gases: { water: 5.5, oxygen: 3.2, methane: 4.5, carbon: 3.5, monoxide: 0 } },
  abiotic: { label: 'Sauerstoff ohne Leben', clouds: .05, atmosphere: true,
    gases: { water: .15, oxygen: 4, methane: 0, carbon: 4.5, monoxide: 4 } },
  cloudy: { label: 'Unter Wolken', clouds: .92, atmosphere: true,
    gases: { water: 5.5, oxygen: 3.2, methane: 4.5, carbon: 3.5, monoxide: 0 } },
  bare: { label: 'Nackter Fels', clouds: 0, atmosphere: false,
    gases: { water: 0, oxygen: 0, methane: 0, carbon: 0, monoxide: 0 } },
});

export function atmosphereHeight(wavelength, world) {
  if (!world.atmosphere) return 0;
  const bands = Object.keys(SPECIES).reduce((sum, gas) => sum + world.gases[gas] * bandShape(wavelength, gas), 0);
  // A gray base + muted features. Not a self-consistent cloud/radiative-transfer calculation.
  return SCALE_HEIGHT_KM * (1 + 2 * world.clouds + (1 - world.clouds) * bands);
}

export function geometryAtWavelength(wavelength, world, hostKey = 'dwarf', separation = 0, inFront = true) {
  const stellarRadius = HOSTS[hostKey].radius * 695700;
  const radius = EARTH_RADIUS_KM / stellarRadius;
  const height = atmosphereHeight(wavelength, world);
  const effectiveRadius = (EARTH_RADIUS_KM + height) / stellarRadius;
  const solidDepth = inFront ? blockedFraction(separation, radius) * 1e6 : 0;
  const depth = inFront ? blockedFraction(separation, effectiveRadius) * 1e6 : 0;
  return { radius, effectiveRadius, height, stellarRadius, solidDepth, depth, extraDepth: depth - solidDepth };
}

export function transitDuration(hostKey) {
  const h = HOSTS[hostKey];
  const a = 4.20827834583 * h.period ** (2/3) * h.mass ** (1/3) / h.radius;
  return 24 * h.period / Math.PI * Math.asin((1 + EARTH_RADIUS_KM / (h.radius * 695700)) / a);
}

// Photon counts per log wavelength bin from a blackbody: proportional to λ^-3/(exp(hc/λkT)-1).
const photons = (w, t) => 1 / (w ** 3 * Math.expm1(14387.77 / (w * t)));
export function photonNoise(wavelength, instrument) {
  const h = HOSTS[instrument.host];
  const reference = .2 ** 2 * photons(1.4, 3000) * transitDuration('dwarf');
  const received = h.radius ** 2 * photons(wavelength, h.temperature) * transitDuration(instrument.host);
  // 28 ppm is a chosen teaching normalization, NOT an instrument performance forecast.
  return 28 * (6 / instrument.diameter) * (instrument.distance / 10) /
    Math.sqrt(instrument.transits) * Math.sqrt(reference / received) * Math.sqrt(instrument.resolution / 90);
}

export function spectrumGrid(windowKey = 'broad', resolution = 90) {
  const [lo, hi] = WINDOWS[windowKey];
  const count = Math.ceil(Math.log(hi/lo) * resolution);
  return Array.from({ length: count }, (_, i) => {
    const left = lo * (hi/lo) ** (i / count), right = lo * (hi/lo) ** ((i + 1) / count);
    return { wavelength: (left + right)/2, width: right - left };
  });
}

export function generateSpectrum(world, instrument, seed = 9173) {
  const random = seededRandom(seed);
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(1e-15, random()))) * Math.cos(2 * Math.PI * random());
  return spectrumGrid(instrument.window, instrument.resolution).map(({ wavelength, width }) => {
    const clean = binAverage(wavelength, width, w => geometryAtWavelength(w, world, instrument.host).depth);
    const photon = photonNoise(wavelength, instrument);
    const sigma = Math.hypot(photon, instrument.floor);
    // Separate persistent per-channel offset: additional transits cannot remove this floor.
    const depth = clean + photon * normal() + instrument.floor * normal();
    return { wavelength, width, depth, sigma };
  });
}
