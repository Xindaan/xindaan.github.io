// Reiner Fahrplankern: Zeitumrechnung, Antwortpruefung und Treffpunktvergleich.
export const API = "https://api.transitous.org/api";
export const ZEITZONE = "Europe/Berlin";
export const MODI = [
  "HIGHSPEED_RAIL",
  "LONG_DISTANCE",
  "NIGHT_RAIL",
  "REGIONAL_FAST_RAIL",
  "REGIONAL_RAIL",
  "SUBURBAN",
  "SUBWAY",
  "TRAM",
  "BUS",
];
const formatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: ZEITZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export function lokal(zeit = new Date()) {
  return formatter.format(new Date(zeit)).replace(" ", "T");
}
export function abfahrtISO(datum, uhrzeit) {
  const eingabe = `${datum}T${uhrzeit}`;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(eingabe))
    throw new Error("Bitte Datum und Uhrzeit vollständig angeben.");
  const basis = Date.parse(`${eingabe}:00Z`),
    treffer = [];
  for (const offset of [60, 120]) {
    const kandidat = basis - offset * 60000;
    if (Number.isFinite(kandidat) && lokal(kandidat) === eingabe)
      treffer.push(kandidat);
  }
  if (!treffer.length)
    throw new Error(
      "Dieses Datum oder diese Uhrzeit gibt es nicht (Zeitumstellung beachten).",
    );
  if (treffer.length > 1)
    throw new Error(
      "Diese Uhrzeit kommt bei der Zeitumstellung zweimal vor. Bitte eine eindeutige Uhrzeit vor 02:00 oder ab 03:00 wählen.",
    );
  return new Date(treffer[0]).toISOString();
}
export function ortParameter(ort) {
  if (ort.stopId) return ort.stopId;
  if (!Number.isFinite(ort.lat) || !Number.isFinite(ort.lon))
    throw new Error("Ort ohne gültige Koordinaten.");
  return `${ort.lat},${ort.lon}`;
}
export function planURL(von, nach, optionen) {
  const {
    zeit,
    umstiege = 4,
    puffer = 0,
    nurRegional = false,
    vergleich = false,
    arriveBy = false,
  } = optionen;
  if (!Number.isInteger(umstiege) || umstiege < 0 || umstiege > 6)
    throw new Error("Ungültige Umstiegsgrenze.");
  if (!Number.isInteger(puffer) || puffer < 0 || puffer > 30)
    throw new Error("Ungültiger Umstiegspuffer.");
  if (!Number.isFinite(Date.parse(zeit)))
    throw new Error("Ungültige Abfahrtszeit.");
  const modi = nurRegional
    ? MODI.filter(
        (m) => !["HIGHSPEED_RAIL", "LONG_DISTANCE", "NIGHT_RAIL"].includes(m),
      )
    : MODI;
  const p = new URLSearchParams({
    fromPlace: ortParameter(von),
    toPlace: ortParameter(nach),
    time: zeit,
    maxTransfers: String(umstiege),
    additionalTransferTime: String(puffer),
    transitModes: modi.join(","),
    numItineraries: "3",
    maxItineraries: "4",
    timetableView: String(!vergleich),
    arriveBy: String(arriveBy),
  });
  return `${API}/v6/plan?${p}`;
}
export function verbindungen(antwort, zeit, maxUmstiege, arriveBy = false) {
  if (!antwort || !Array.isArray(antwort.itineraries))
    throw new Error(
      "Der Fahrplandienst hat keine lesbare Verbindungsliste geliefert.",
    );
  return antwort.itineraries
    .filter((r) => {
      const start = Date.parse(r.startTime),
        ende = Date.parse(r.endTime);
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(ende) ||
        (arriveBy ? ende > Date.parse(zeit) : start < Date.parse(zeit)) ||
        ende < start ||
        !Number.isInteger(r.transfers) ||
        r.transfers < 0 ||
        r.transfers > maxUmstiege ||
        !Array.isArray(r.legs) ||
        !r.legs.length
      )
        return false;
      let letztesEnde = start;
      for (const l of r.legs) {
        const ab = Date.parse(l.startTime),
          an = Date.parse(l.endTime);
        if (
          l.cancelled ||
          l.from?.cancelled ||
          l.to?.cancelled ||
          !l.from?.name ||
          !l.to?.name ||
          !Number.isFinite(ab) ||
          !Number.isFinite(an) ||
          an < ab ||
          ab < letztesEnde ||
          an > ende
        )
          return false;
        letztesEnde = an;
      }
      return true;
    })
    .sort(
      (a, b) =>
        Date.parse(a.startTime) - Date.parse(b.startTime) ||
        Date.parse(a.endTime) - Date.parse(b.endTime),
    );
}
export function treffpunkte(kandidaten, zeit) {
  const start = Date.parse(zeit);
  return kandidaten
    .map((k) => {
      if (k.reisen.some((r) => !r)) return { ...k, erreichbar: false };
      const zeiten = k.reisen.map(
        (r) => (Date.parse(r.endTime) - start) / 60000,
      );
      if (zeiten.some((t) => !Number.isFinite(t) || t < 0))
        throw new Error("Ungültige Ankunft im Treffpunktvergleich.");
      return {
        ...k,
        erreichbar: true,
        zeiten,
        max: Math.max(...zeiten),
        summe: zeiten.reduce((a, b) => a + b, 0),
      };
    })
    .sort(
      (a, b) =>
        Number(b.erreichbar) - Number(a.erreichbar) ||
        (a.erreichbar ? a.max - b.max || a.summe - b.summe : 0),
    );
}
export function polyline(text, precision = 6) {
  if (
    typeof text !== "string" ||
    !Number.isInteger(precision) ||
    precision < 0 ||
    precision > 7
  )
    return [];
  let pos = 0,
    lat = 0,
    lon = 0;
  const punkte = [],
    faktor = 10 ** precision;
  const zahl = () => {
    let wert = 0,
      shift = 0,
      b;
    do {
      if (pos >= text.length || shift > 30)
        throw new Error("Geometrie unvollständig");
      b = text.charCodeAt(pos++) - 63;
      if (b < 0 || b > 63) throw new Error("Geometrie ungültig");
      wert += (b & 31) * 2 ** shift;
      shift += 5;
    } while (b >= 32);
    return wert % 2 ? -(wert + 1) / 2 : wert / 2;
  };
  try {
    while (pos < text.length) {
      lat += zahl();
      lon += zahl();
      if (Math.abs(lat / faktor) > 90 || Math.abs(lon / faktor) > 180)
        return [];
      punkte.push([lon / faktor, lat / faktor]);
    }
  } catch {
    return [];
  }
  return punkte;
}
export function minuten(ms) {
  if (!Number.isFinite(ms)) return "–";
  const m = Math.round(ms / 60000);
  return m < 60
    ? `${m} Min.`
    : `${Math.floor(m / 60)} Std. ${String(m % 60).padStart(2, "0")} Min.`;
}
export function uhr(iso) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: ZEITZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
export function tageswechsel(iso, start) {
  const tag = (s) => Date.parse(lokal(s).slice(0, 10) + "T00:00:00Z");
  const tage = Math.round((tag(iso) - tag(start)) / 86400000);
  return tage ? ` (+${tage} ${tage === 1 ? "Tag" : "Tage"})` : "";
}
