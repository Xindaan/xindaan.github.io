import { polyline } from "./bahn-core.js?v=2";

// Besten Treffer erhalten; Alternativen mit 20 km Abstand statt Nachbarhaltestellen.
export function treffVorschlaege(punkte, anzahl = 5, suche = "") {
  const gezeigt = [],
    q = suche.trim().toLocaleLowerCase("de");
  for (const p of punkte) {
    if (q && !p.name.toLocaleLowerCase("de").includes(q)) continue;
    if (
      gezeigt.some(
        (x) => Math.hypot((x.lon - p.lon) * 64, (x.lat - p.lat) * 111) < 20,
      )
    )
      continue;
    gezeigt.push(p);
    if (gezeigt.length === anzahl) break;
  }
  return gezeigt;
}

// Fehlende Geometrie nie durch eine Verbindung der Endpunkte erfinden.
export function reiseStrecken(reisen) {
  return reisen.flatMap((r, person) =>
    (r?.legs || []).flatMap((l) => {
      const punkte = polyline(
        l.legGeometry?.points,
        l.legGeometry?.precision ?? 6,
      );
      if (
        punkte.length < 2 ||
        punkte.some(
          (p) =>
            !p.every(Number.isFinite) ||
            Math.abs(p[0]) > 180 ||
            Math.abs(p[1]) > 90,
        )
      )
        return [];
      return [{ person, fuss: l.mode === "WALK", punkte }];
    }),
  );
}
