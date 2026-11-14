// Inverse problem: only measured wavelengths, bin widths, depths and reported measurement errors.
// No import of atmosphere.js, presets, true gas amplitudes, star or telescope settings.
import { SPECIES, bandShape, binAverage, validateSpectrum } from './spectral-bands.js';

function regress(points, omit = null) {
  const keys = Object.keys(SPECIES).filter(key => key !== omit);
  const meanLog = points.reduce((s,p) => s + Math.log(p.wavelength), 0) / points.length;
  const columns = [points.map(() => 1), points.map(p => Math.log(p.wavelength) - meanLog),
    ...keys.map(key => points.map(p => binAverage(p.wavelength, p.width, w => bandShape(w,key))))];
  const weights = points.map(p => 1 / p.sigma ** 2);
  const coefficients = columns.map(() => 0);
  const residual = points.map(p => p.depth);
  const norms = columns.map(c => c.reduce((sum,x,j) => sum + weights[j] * x * x, 0));
  for (let iteration = 0; iteration < 300; iteration++) {
    let maxChange = 0;
    columns.forEach((col,k) => {
      if (norms[k] < 1e-12) return;
      const old = coefficients[k];
      let next = old + col.reduce((s,x,j) => s + weights[j] * x * residual[j], 0) / norms[k];
      if (k >= 2) next = Math.max(0, next);
      coefficients[k] = next;
      const change = next - old;maxChange = Math.max(maxChange, Math.abs(change));
      col.forEach((x,j) => { residual[j] -= change * x; });
    });
    if (maxChange < 1e-8) break;
  }
  return {
    chi2: residual.reduce((s,x,j) => s + x*x*weights[j], 0),
    baseline: coefficients[0], slope: coefficients[1], meanLog,
    amplitudes: Object.fromEntries(keys.map((key,j) => [key,coefficients[j+2]])),
    predicted: points.map((p,j) => p.depth - residual[j]),
  };
}

export function inferSpectrum(input) {
  const points = validateSpectrum(input);
  const best = regress(points);
  const gases = Object.fromEntries(Object.keys(SPECIES).map(key => {
    // Ignore negligible far tails of idealized Gaussians; they do not supply spectral coverage.
    const sampled = points.some(p => binAverage(p.wavelength, p.width, w => bandShape(w,key)) > .15);
    const without = sampled ? regress(points,key) : null;
    const score = without ? Math.sqrt(Math.max(0, without.chi2 - best.chi2)) : 0;
    return [key, { amplitude: best.amplitudes[key], score, sampled, supported: sampled && score >= 4 }];
  }));
  const supported = Object.keys(gases).filter(key => gases[key].supported);
  let category = 'weak';
  if (supported.length) category = 'atmosphere';
  if (gases.oxygen.supported && gases.methane.supported) category = 'interesting';
  if (gases.oxygen.supported && gases.monoxide.supported) category = 'alternative';
  // Always explicit: a spectral match never establishes biology.
  return { ...best, gases, supported, category, lifeConfirmed: false,
    reducedChi2: best.chi2 / Math.max(1, points.length - 7),
    points: points.map((p,i) => ({ ...p, predicted: best.predicted[i] })),
  };
}
