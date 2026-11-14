// Approximate real band centers; widths and relative weights are pedagogical.
// These are NOT laboratory cross sections or abundance templates. See docs/LEBENSSPUREN.md.
export const SPECIES = Object.freeze({
  water: { name: 'Wasserdampf', symbol: 'H₂O', color: '#7edfd0', focus: 1.4,
    bands: [[.94,.025,.3],[1.13,.035,.2],[1.4,.07,1],[1.9,.09,.85],[2.7,.13,.95]] },
  oxygen: { name: 'Sauerstoff', symbol: 'O₂', color: '#acb8ff', focus: .76,
    bands: [[.69,.008,.2],[.76,.010,1],[1.27,.018,.45]] },
  methane: { name: 'Methan', symbol: 'CH₄', color: '#efc28d', focus: 3.3,
    bands: [[1.65,.045,.3],[2.31,.065,.45],[3.3,.11,1]] },
  carbon: { name: 'Kohlendioxid', symbol: 'CO₂', color: '#ee9b9d', focus: 4.3,
    bands: [[1.6,.022,.1],[2.0,.04,.15],[4.3,.09,1]] },
  monoxide: { name: 'Kohlenmonoxid', symbol: 'CO', color: '#bdcf94', focus: 4.65,
    bands: [[2.35,.035,.25],[4.65,.085,1]] },
});
export const WINDOWS = Object.freeze({ broad: [.6,5], optical: [.6,1], infrared: [1,5] });

export function bandShape(wavelength, species) {
  return SPECIES[species].bands.reduce((sum, [center, width, strength]) =>
    sum + strength * Math.exp(-.5 * ((wavelength - center) / width) ** 2), 0);
}

// Integration over a finite spectrometer bin. Forward and inverse use identical bins.
export function binAverage(wavelength, width, fn) {
  let value = 0;
  for (let i = 0; i < 9; i++) value += fn(wavelength + width * ((i + .5) / 9 - .5));
  return value / 9;
}

export function validateSpectrum(input) {
  if (!Array.isArray(input) || input.length < 8 || input.length > 3000) throw new Error('Ungültige Spektralreihe.');
  let last = 0;
  return input.map(p => {
    const { wavelength, width, depth, sigma } = p;
    if (![wavelength,width,depth,sigma].every(Number.isFinite) || wavelength <= last || width <= 0 || sigma <= 0) {
      throw new Error('Spektralwerte müssen endlich, geordnet und mit positiver Unsicherheit versehen sein.');
    }
    last = wavelength;
    return { wavelength, width, depth, sigma };
  });
}
