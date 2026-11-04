// Bahn gegen Auto: Haltestellen ans Strassennetz anbinden und Zeiten vergleichen.
// Reiner Rechenkern fuer Worker und Node-Tests.
import { shortest } from "./graph.js?v=20261103-10";

export const MAX_ANBINDUNG_KM = 5;
export const TOLERANZ_MIN = 5;

export function km(a, b) {
  const r = Math.PI / 180;
  const u =
    Math.sin(((b[1] - a[1]) * r) / 2) ** 2 +
    Math.cos(a[1] * r) *
      Math.cos(b[1] * r) *
      Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(u)));
}

// Haltestellen nur an Knoten mit Nicht-Autobahn-Kante, wie der Ortsanschluss.
export function anbindungsRaster(g) {
  const geeignet = new Uint8Array(g.nodes.length);
  for (const e of g.edges)
    if (e[5] !== 0 && !e[8]) geeignet[e[0]] = geeignet[e[1]] = 1;
  const zellen = new Map();
  geeignet.forEach((x, i) => {
    if (!x) return;
    const [lon, lat] = g.nodes[i];
    const k = `${Math.floor(lon * 10)},${Math.floor(lat * 10)}`;
    if (!zellen.has(k)) zellen.set(k, []);
    zellen.get(k).push(i);
  });
  return { zellen };
}

export function anbinden(g, raster, lon, lat, maxKm = MAX_ANBINDUNG_KM) {
  const bx = Math.floor(lon * 10),
    by = Math.floor(lat * 10);
  let node = -1,
    abstand = Infinity;
  // Ein Nachbarring genuegt: 0,1 Grad Laenge >= 6,4 km bis 55,1 N > maxKm.
  for (let a = bx - 1; a <= bx + 1; a++)
    for (let b = by - 1; b <= by + 1; b++)
      for (const i of raster.zellen.get(`${a},${b}`) || []) {
        const d = km([lon, lat], g.nodes[i]);
        if (d < abstand) (abstand = d), (node = i);
      }
  return abstand <= maxKm ? { node, km: abstand } : { node: -1, km: abstand };
}

// richtung "von": ab Start zu den Halten; "nach": von den Halten zum Start.
export function autoMinuten(g, raster, start, halte, { richtung = "von", autobahnTempo = 130 } = {}) {
  const s = anbinden(g, raster, start.lon, start.lat);
  if (s.node < 0) throw new Error("Der Ausgangspunkt liegt mehr als 5 km vom Straßenmodell entfernt.");
  const r = shortest(g, [s.node], { reverse: richtung === "nach", autobahnTempo });
  return {
    startKm: s.km,
    minuten: halte.map((h) => {
      const a = anbinden(g, raster, h.lon, h.lat);
      return a.node >= 0 && Number.isFinite(r.d[a.node]) ? r.d[a.node] : null;
    }),
  };
}

// differenz = Bahn minus Auto; negativ heisst Bahn schneller.
export function vergleicheBahnAuto(punkte, minuten, toleranz = TOLERANZ_MIN) {
  return punkte.map((p, i) => {
    const auto = minuten[i];
    if (auto === null || auto === undefined)
      return { ...p, auto: null, differenz: null, urteil: "ohne" };
    const differenz = p.dauer - auto;
    return {
      ...p,
      auto,
      differenz,
      urteil: differenz < -toleranz ? "bahn" : differenz > toleranz ? "auto" : "gleich",
    };
  });
}

export function bilanz(punkte) {
  const z = { bahn: 0, auto: 0, gleich: 0, ohne: 0 };
  for (const p of punkte) z[p.urteil]++;
  return z;
}
