// Ideal circular-aperture angular limits. No throughput, exposure or detection forecast.
export const ARCSEC_PER_RADIAN = 180 / Math.PI * 3600;
export const PARSEC_METERS = 3.085677581491367e16;
export const EARTH_DIAMETER_METERS = 12742000;
export function angularExperiment({ diameter = 6, distance = 10, wavelength = .55, suppression = 10 } = {}) {
  if (![diameter,distance,wavelength,suppression].every(Number.isFinite) || diameter<=0 || distance<=0 || wavelength<=0 || suppression<0) throw new Error('Ungültige Optikparameter.');
  const lambda = wavelength * 1e-6;
  const separation = 1 / distance; // 1 AU at quadrature, in arcsec.
  const disk = EARTH_DIAMETER_METERS / (distance * PARSEC_METERS) * ARCSEC_PER_RADIAN;
  const resolution = 1.22 * lambda / diameter * ARCSEC_PER_RADIAN;
  const innerWorkingAngle = 3 * lambda / diameter * ARCSEC_PER_RADIAN; // Teaching assumption, not a specific coronagraph.
  const diskDiameterAperture = 1.22 * lambda / (disk / ARCSEC_PER_RADIAN);
  return { diameter,distance,wavelength,suppression,separation,disk,resolution,innerWorkingAngle,diskDiameterAperture,
    elementsAcross: disk / resolution, relativeArea: (diameter / 6)**2,
    residualToPlanet: 10**(10-suppression), angularPossible: separation >= innerWorkingAngle,
    contrastScaleReached: suppression >= 10 };
}
