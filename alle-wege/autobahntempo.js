// Szenario fuer Tagesverkehr, kein gemessener individueller Reiseschnitt.
// 65 % der Strecke Wunschtempo/Limit, 35 % hoechstens 100 km/h.
export function modellTempo(wunsch) {
  return 1 / (0.65 / wunsch + 0.35 / Math.min(wunsch, 100));
}
export function gueltigesTempo(wert) {
  return Number.isInteger(wert) && wert >= 100 && wert <= 200 && wert % 10 === 0;
}
export function autobahnZeit(kante, wunsch, vorwaerts) {
  const zeit = kante[vorwaerts ? 3 : 4];
  if (zeit <= 0 || !kante[9] || !gueltigesTempo(wunsch)) return zeit;
  return kante[9].reduce((summe, [km, hin, rueck]) => {
    const limit = vorwaerts ? hin : rueck;
    // 0 = ausdruecklich unbeschraenkt, -1 = fehlend/unlesbar: konservativ 130.
    const tempo = Math.min(wunsch, limit === 0 ? Infinity : limit > 0 ? limit : 130);
    return summe + km * 60 / modellTempo(tempo);
  }, 0);
}
