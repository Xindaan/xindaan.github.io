// The only payload allowed to cross from the simulator to the detective.
// Deliberately reconstruct every record: never spread the simulation state.
export function copyMeasurements(input) {
  if (!Array.isArray(input) || input.length < 10 || input.length > 20000) {
    throw new Error('Erwartet werden 10 bis 20.000 Messpunkte.');
  }
  let previous = -Infinity;
  return input.map(point => {
    const time = point.time;
    const flux = point.flux;
    if (!Number.isFinite(time) || !Number.isFinite(flux) || time <= previous) {
      throw new Error('Messwerte müssen endlich und zeitlich streng geordnet sein.');
    }
    previous = time;
    return { time, flux };
  });
}
