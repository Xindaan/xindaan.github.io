import { API, planURL, ortParameter } from "./bahn-core.js?v=2";

export function atlasURL(ort, opt) {
  if (
    !Number.isInteger(opt.horizont) ||
    opt.horizont < 30 ||
    opt.horizont > 480
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
export function atlasTreffpunkte(listen) {
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
    (a, b) => a.max - b.max || a.summe - b.summe || a.id.localeCompare(b.id),
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
  return {
    titel:
      r.typ === "finden"
        ? `Kein gemeinsamer Treffpunkt im Sollfahrplan innerhalb von ${stunden} Stunden`
        : "Keine erreichbaren Haltestellen mit dieser Auswahl",
    text: ohne.length
      ? `Für ${ohne.join(", ")} liefert die Fahrplanauskunft innerhalb des Zeitlimits keine erreichbaren Haltestellen. Bitte Startort, Uhrzeit oder Umstiege ändern. Das kann auch an fehlenden Fahrplandaten liegen.`
      : `Für alle ${r.personen.length} Startorte wurden Verbindungen gefunden. Im Sollfahrplan ergibt sich jedoch keine gemeinsame Haltestelle innerhalb von ${stunden} Stunden. Das Zeitlimit gilt je Person, einschließlich Warten ab Wunschabfahrt. Aktuelle Verspätungen oder Ausfälle können die erreichbaren Anschlüsse verändern.`,
    naechsterHorizont:
      [60, 120, 180, 240, 300, 360, 420, 480].find((h) => h > r.opt.horizont) ??
      null,
  };
}
