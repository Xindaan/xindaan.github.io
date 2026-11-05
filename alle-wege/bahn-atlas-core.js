import { API, planURL, ortParameter } from "./bahn-core.js?v=2";

export function atlasURL(ort, opt) {
  if (
    !Number.isInteger(opt.horizont) ||
    opt.horizont < 30 ||
    opt.horizont > (opt.automatischeTreffpunktsuche ? 1440 : 480)
  )
    throw new Error(
      "Bitte einen Suchhorizont zwischen 30 Minuten und 8 Stunden wählen.",
    );
  const p = new URL(planURL(ort, ort, opt)).searchParams;
  for (const k of [
    "fromPlace",
    "toPlace",
    "numItineraries",
    "maxItineraries",
    "timetableView",
  ])
    p.delete(k);
  p.set("one", ortParameter(ort));
  p.set("maxTravelTime", String(opt.horizont));
  p.set("arriveBy", String(!!opt.arriveBy));
  p.set("maxPreTransitTime", "900");
  p.set("maxPostTransitTime", "900");
  return `${API}/v6/one-to-all?${p}`;
}

// Der Betreiber liefert Minuten und k = Zahl der Fahrzeuge, nicht Umstiege.
// Nur kompakte Werte speichern; keine acht grossen Rohantworten im Cache halten.
export function verdichteAtlas(raw) {
  if (!raw || !Array.isArray(raw.all))
    throw new Error(
      "Der Fahrplandienst hat keine lesbare Erreichbarkeitskarte geliefert.",
    );
  const map = new Map();
  for (const r of raw.all) {
    const p = r.place;
    if (
      !p ||
      typeof p.stopId !== "string" ||
      !p.stopId ||
      typeof p.name !== "string" ||
      !Number.isFinite(p.lat) ||
      !Number.isFinite(p.lon) ||
      !Number.isFinite(r.duration) ||
      r.duration < 0 ||
      !Number.isInteger(r.k) ||
      r.k < 0
    )
      continue;
    const s = {
      id: p.stopId,
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      dauer: r.duration,
      umstiege: Math.max(0, r.k - 1),
    };
    const alt = map.get(s.id);
    if (
      !alt ||
      s.dauer < alt.dauer ||
      (s.dauer === alt.dauer && s.umstiege < alt.umstiege)
    )
      map.set(s.id, s);
  }
  return [...map.values()];
}
export function inGebiet(p, geometrie) {
  const ringEnthaelt = (ring) => {
    let drin = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i],
        [xj, yj] = ring[j];
      if (
        yi > p.lat !== yj > p.lat &&
        p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi
      )
        drin = !drin;
    }
    return drin;
  };
  const polys =
    geometrie.type === "Polygon"
      ? [geometrie.coordinates]
      : geometrie.coordinates;
  return polys.some(
    (poly) => ringEnthaelt(poly[0]) && !poly.slice(1).some(ringEnthaelt),
  );
}
export function atlasTreffpunkte(listen, objective = "fair") {
  if (listen.length < 2) return [];
  const maps = listen.map((l) => new Map(l.map((s) => [s.id, s]))),
    rang = [];
  for (const ort of listen[0]) {
    const halte = maps.map((m) => m.get(ort.id));
    if (halte.some((x) => !x)) continue;
    const zeiten = halte.map((s) => s.dauer);
    rang.push({
      ...ort,
      zeiten,
      halte,
      max: Math.max(...zeiten),
      summe: zeiten.reduce((a, b) => a + b, 0),
    });
  }
  return rang.sort(
    (a, b) => (objective === "total" ? a.summe - b.summe || a.max - b.max : a.max - b.max || a.summe - b.summe) || a.id.localeCompare(b.id),
  );
}
export function atlasGebiete(listen) {
  const map = new Map();
  listen.forEach((l, i) =>
    l.forEach((s) => {
      const alt = map.get(s.id);
      if (!alt || s.dauer < alt.dauer) map.set(s.id, { ...s, gebiet: i });
    }),
  );
  return [...map.values()];
}
export function atlasEffekt(mit, ohne) {
  const m = new Map(ohne.map((s) => [s.id, s]));
  return mit.map((s) => ({
    ...s,
    regional: m.get(s.id)?.dauer ?? null,
    vorteil: m.has(s.id) ? Math.max(0, m.get(s.id).dauer - s.dauer) : null,
  }));
}

export function atlasLeerHinweis(r) {
  const ohne = r.personen.filter((p, i) => !r.anzahlen[i]).map((p) => p.name);
  const stunden = `${r.opt.horizont / 60}`.replace(".", ",");
  if (r.typ === "finden" && r.suchHinweis) return {
    titel: "Kein Treffpunkt im durchsuchten Fahrplanausschnitt",
    text: `${r.suchHinweis} Das leere Ergebnis schließt einen passenden Treffpunkt mit rechtzeitiger Heimkehr nicht aus. Bitte eine andere Abfahrt oder eigene Treffpunktorte prüfen.`,
    naechsterHorizont: null,
  };
  if (r.typ === "finden" && r.rueck && !ohne.length) return {
    titel: "Kein Treffpunkt mit rechtzeitiger Rückfahrt",
    text: `In den Fahrplandaten gibt es keinen gemeinsamen Halt, an dem alle mindestens ${r.rueck.aufenthalt / 60} ${r.rueck.aufenthalt === 60 ? "Stunde" : "Stunden"} zusammen sind und danach bis zur Rückkehrfrist heimkommen. Bitte früher abfahren, die Frist später legen oder den Mindestaufenthalt verkürzen.`,
    naechsterHorizont: null,
  };
  if (r.typ === "finden") return {
    titel: "Kein gemeinsamer Treffpunkt in den verfügbaren Fahrplandaten",
    text: ohne.length
      ? `Für ${ohne.join(", ")} liefert die Fahrplanauskunft keine erreichbaren Haltestellen. Bitte Startort, Abfahrt oder Umstiege prüfen; es können Fahrplandaten fehlen.`
      : `Die automatische Suche wurde bis ${stunden} Stunden ab Abfahrt erweitert. Die Fahrplandaten liefern damit keinen gemeinsamen Halt. Das ist keine Aussage, dass ein Treffen grundsätzlich unmöglich ist. Bitte eine andere Abfahrt oder eigene Treffpunktorte prüfen.`,
    naechsterHorizont: null,
  };
  return {
    titel: "Keine erreichbaren Haltestellen mit dieser Auswahl",
    text: ohne.length
      ? `Für ${ohne.join(", ")} liefert die Fahrplanauskunft innerhalb des Zeitlimits keine erreichbaren Haltestellen. Bitte Startort, Uhrzeit oder Umstiege ändern. Das kann auch an fehlenden Fahrplandaten liegen.`
      : `Die Fahrplanauskunft liefert keine passenden Haltestellen innerhalb von ${stunden} Stunden. Bitte Zeitlimit, Uhrzeit oder Umstiege prüfen.`,
    naechsterHorizont:
      [60, 120, 180, 240, 300, 360, 420, 480].find((h) => h > r.opt.horizont) ??
      null,
  };
}

// Treffpunkt mit Rueckfahrt: Rueckwaerts-Listen (Ankunftsfrist am Wohnort) je Person
// in derselben Reihenfolge wie die Hin-Listen. Dauer rueckwaerts = Frist minus
// spaeteste Abfahrt am Halt. Ein Treffpunkt bleibt, wenn nach der letzten Ankunft
// noch mindestens `aufenthalt` Minuten bleiben, bevor die erste Person los muss.
export function mitRueckfahrt(punkte, rueckListen, { start, frist, aufenthalt = 0 }) {
  const t0 = Date.parse(start),
    t1 = Date.parse(frist),
    maps = rueckListen.map((l) => new Map(l.map((s) => [s.id, s])));
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return [];
  return punkte.flatMap((p) => {
    const rueck = maps.map((m) => m.get(p.id)?.dauer);
    if (rueck.some((d) => !Number.isFinite(d))) return [];
    const treffen = t0 + p.max * 60000,
      abfahrten = rueck.map((d) => t1 - d * 60000),
      los = Math.min(...abfahrten),
      zusammen = Math.round((los - treffen) / 60000);
    if (zusammen < aufenthalt) return [];
    return [{ ...p, rueck, abfahrten: abfahrten.map((a) => new Date(a).toISOString()), treffen: new Date(treffen).toISOString(), zusammen }];
  });
}

// Treffpunkt-Umfeld (T-0004): Halt aus der Fahrplanauskunft dem naechsten OSM-Bahnhof
// innerhalb radiusKm zuordnen; umfeld = {radiusM, halte: [[lat, lon, name, gastro, stufenfrei?], ...]}.
// stufenfrei (T-0026, DB StaDa): 2 ja, 1 teilweise, 0 nein, null unbekannt.
// anspruch: "egal" | "bahnhof" | "gastro" (Bahnhof mit mindestens minGastro Orten) | "stufenfrei" (laut DB stufenfrei).
const kmZwischen = (a, b) =>
  6371 * Math.hypot(((b.lat - a.lat) * Math.PI) / 180, (((b.lon - a.lon) * Math.PI) / 180) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180));
export function umfeldIndex(umfeld) {
  const gitter = new Map();
  for (const [lat, lon, name, gastro, stufenfrei = null] of umfeld?.halte || []) {
    const k = `${Math.floor(lat * 100)}|${Math.floor(lon * 100)}`;
    if (!gitter.has(k)) gitter.set(k, []);
    gitter.get(k).push({ lat, lon, name, gastro, stufenfrei });
  }
  return gitter;
}
export function mitUmfeld(punkte, index, anspruch = "egal", { radiusKm = 0.3, minGastro = 3 } = {}) {
  return punkte.flatMap((p) => {
    let best = null, bd = Infinity;
    const i0 = Math.floor(p.lat * 100), j0 = Math.floor(p.lon * 100);
    for (let i = i0 - 1; i <= i0 + 1; i++)
      for (let j = j0 - 1; j <= j0 + 1; j++)
        for (const b of index.get(`${i}|${j}`) || []) {
          const d = kmZwischen(p, b);
          if (d <= radiusKm && d < bd) [best, bd] = [b, d];
        }
    if (anspruch === "bahnhof" && !best) return [];
    if (anspruch === "gastro" && !(best && best.gastro >= minGastro)) return [];
    if (anspruch === "stufenfrei" && !(best && best.stufenfrei === 2)) return [];
    return [{ ...p, umfeld: best ? { bahnhof: best.name, gastro: best.gastro, stufenfrei: best.stufenfrei } : null }];
  });
}
