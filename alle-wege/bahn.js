import { STANDARDORTE } from "./standardorte.js";
import { leseZustand, vergleichLink, bahnZuStrasse } from "./vergleich.js?v=20261104-1";
let strassenStand = {}, vergleichInfo = {};
import { atlasURL, verdichteAtlas, umfeldIndex } from "./bahn-atlas-core.js?v=20261104-6";
import { versetzteZeiten } from "./bahn-auto-core.js?v=20261105-1";
import { atlasBerechnen, atlasAnzeigen } from "./bahn-atlas-ui.js?v=20261105-1";
import { ortsnamen, ergaenzeOrt } from "./ortslisten.js";
import {
  API,
  lokal,
  abfahrtISO,
  planURL,
  verbindungen,
  treffpunkte,
  polyline,
  minuten,
  uhr,
  tageswechsel,
} from "./bahn-core.js?v=2";
const $ = (id) => document.getElementById(id),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const ortName = (p) =>
  p.name === "START" ? "Startpunkt" : p.name === "END" ? "Zielpunkt" : p.name;
const norm = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .trim();
let orte = [],
  grenzen,
  bahnnetz,
  art = "reichweite",
  schnellFuer = "nach",
  auswahl = {},
  laeuft = null,
  folge = 0,
  ergebnis = null,
  karteReisen = [];
const cache = new Map(),
  farben = [
    "#a9674c",
    "#517a78",
    "#7a7d48",
    "#8580a1",
    "#b79247",
    "#527c9e",
    "#b57f82",
    "#67926c",
  ];
const verkehr = {
  WALK: "Zu Fuß",
  HIGHSPEED_RAIL: "Fernverkehr",
  LONG_DISTANCE: "Fernverkehr",
  NIGHT_RAIL: "Nachtzug",
  REGIONAL_FAST_RAIL: "Regionalexpress",
  REGIONAL_RAIL: "Regionalbahn",
  SUBURBAN: "S-Bahn",
  SUBWAY: "U-Bahn",
  TRAM: "Straßenbahn",
  BUS: "Bus",
};
function status(text, fehler = false) {
  $("bahn-status").textContent = text;
  $("bahn-status").dataset.fehler = String(fehler);
}
function abbrechen() {
  folge++;
  laeuft?.abort();
  laeuft = null;
  $("suchen").disabled = !orte.length;
  $("abbrechen").hidden = true;
  $("bahn-ergebnis").setAttribute("aria-busy", "false");
}
function leeren() {
  abbrechen();
  ergebnis = null;
  karteReisen = [];
  $("bahn-karten").innerHTML = "";
  $("bahn-detail").innerHTML = "";
  $("bahn-detailbereich").hidden = true;
  $("atlas-ergebnis").hidden = true;
  $("bahn-einstieg").hidden = false;
  status("Eingaben geändert. Bitte die Ansicht neu berechnen.");
}
function ort(c) {
  return {
    key: c.id,
    name: c.name,
    display: c.rail?.name || `${c.name} (Ortsmittelpunkt)`,
    lat: c.rail?.lat ?? c.lat,
    lon: c.rail?.lon ?? c.lon,
    stopId: c.rail?.id,
  };
}
function finde(text, feld) {
  if (auswahl[feld]?.name === text) return auswahl[feld];
  const n = norm(text);
  return orte.find((c) => norm(c.label) === n)
    ? ort(orte.find((c) => norm(c.label) === n))
    : undefined;
}
function ortHinweis(feld) {
  const c = finde($(feld).value, feld);
  $(feld + "-hinweis").textContent = c
    ? c.display
    : "Ort wählen oder mit ⌕ eine Haltestelle suchen.";
}
function modus(neu) {
  leeren();
  art = neu;
  $("route-felder").hidden = art !== "route";
  $("treffen-felder").hidden = !["treffen", "finden"].includes(art);
  $("atlas-felder").hidden = !["reichweite", "effekt", "auto"].includes(art);
  $("zentren-felder").hidden = art !== "gebiete";
  $("horizont-feld").hidden = ["route", "treffen", "finden"].includes(art);
  $("wechsel-hinweis").hidden = ["treffen", "finden"].includes(art) || !$("wechsel-hinweis").textContent;
  $("eigene-kandidaten").hidden = art !== "treffen";
  $("rueck-felder").hidden = art !== "finden";
  $("nutzbar-felder").hidden = art !== "finden";
  $("treff-art").value = art === "treffen" ? "eigen" : "auto";
  $("regional").disabled = art === "effekt";
  $("schnell-ziel").hidden = art !== "route";
  $("von").required = $("nach").required = art === "route";
  $("suchen").textContent = {
    route: "Verbindungen suchen →",
    treffen: "Eigene Ziele vergleichen →",
    finden: "Faire Treffpunkte finden →",
    reichweite: "Erreichbarkeit berechnen →",
    gebiete: "Einzugsgebiete berechnen →",
    effekt: "Fernverkehr vergleichen →",
    auto: "Bahn und Auto vergleichen →",
  }[art];
  document.querySelector(".map-heading h2").textContent = {
    route: "Eine konkrete Verbindung.",
    treffen: "Ausgewählte Orte vergleichen.",
    finden: "Wo treffen wir uns fair?",
    reichweite: "Alle Wege im Fahrplan.",
    gebiete: "Welches Zentrum liegt näher?",
    effekt: "Was leistet der Fernverkehr?",
    auto: "Wo schlägt die Bahn das Auto?",
  }[art];
  $("zeit-label").textContent =
    art === "gebiete" ||
    (["reichweite", "effekt", "auto"].includes(art) &&
      $("atlas-richtung").value === "nach")
      ? "ANKUNFT BIS"
      : "ABFAHRT AB";
  $("atlas-hinweis").textContent =
    art === "finden"
        ? `Gemeinsame Haltestellen in Deutschland automatisch finden. Rangfolge: ${$("bahn-objective").value === "total" ? "geringste gesamte Anreise, danach kürzeste längste Anreise" : "kürzeste längste Anreise, danach geringste Summe"}. Ohne persönliches Zeitlimit; die Fahrplansuche wird bei Bedarf erweitert.`
      : art === "gebiete"
        ? "Vergleich bei gleicher Ankunftsfrist. Nur Haltestellen innerhalb des Suchhorizonts; Farbe = zeitlich nächstes Zentrum."
        : art === "effekt"
          ? "Vergleich mit und ohne Fernverkehr bei gleicher Zeit und Umstiegsgrenze. Fehlt der Nahverkehrsweg im Zeitlimit, wird kein unbegrenzter Zeitgewinn behauptet."
          : art === "auto"
            ? "Je Haltestelle: Fahrplanzeit gegen Modell-Autozeit vom selben Ausgangspunkt. Bahn: beste von 4 Abfahrten im 15-Minuten-Raster (4 Fahrplananfragen), also höchstens 15 Min. Warten. Auto ohne Stau, Parken und letzte Strecke. Lädt beim ersten Mal das Straßennetz (ca. 13 MB)."
            : "Erreichbare Haltestellen laut Fahrplan, einschließlich Wartezeit ab Wunschabfahrt bzw. bis zur Ankunftsfrist. Fußzugang bis 15 Minuten; keine flächige Erreichbarkeitsgarantie.";
  document
    .querySelectorAll("[data-art]")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(
          b.dataset.art === art ||
            (b.dataset.art === "finden" && art === "treffen"),
        ),
      ),
    );
  wechselLinks();
}
function wechselLinks() {
  if (!orte.length) return;
  try {
    const neu = bahnZuStrasse(zustand(), orte, strassenStand);
    for (const a of document.querySelectorAll('[data-wechsel-strasse]'))
      a.href = vergleichLink("./", neu.strasse, neu.bahn);
  } catch { /* Unbestaetigte Texte erst beim Wechsel als Fehler zeigen. */ }
}
function kontingent() {
  let q;
  const heute = lokal().slice(0, 10);
  try {
    q = JSON.parse(localStorage.getItem("bahn-anfragen") || "null");
  } catch {}
  return q?.datum === heute && Number.isInteger(q.anzahl) && q.anzahl >= 0
    ? q
    : { datum: heute, anzahl: 0 };
}
function verbrauche() {
  const q = kontingent();
  if (q.anzahl >= 40)
    throw new Error(
      "Die 40 Fahrplananfragen der privaten Erprobung sind für heute verbraucht. Bitte morgen erneut versuchen.",
    );
  q.anzahl++;
  try {
    localStorage.setItem("bahn-anfragen", JSON.stringify(q));
  } catch {
    throw new Error(
      "Für das Tageslimit muss der lokale Browserspeicher verfügbar sein.",
    );
  }
}
async function lade(url, signal, fahrplan = false) {
  const alt = cache.get(url);
  if (alt && Date.now() - alt.zeit < 600000) return alt.daten;
  if (fahrplan) verbrauche();
  const timeout = AbortSignal.timeout(35000);
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, timeout]),
    referrerPolicy: "strict-origin-when-cross-origin",
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Der Fahrplandienst ist ausgelastet. Bitte später erneut suchen."
        : response.status === 422 && url.includes("/v6/one-to-all?")
          ? "Die Sammelsuche überschreitet eine technische Grenze des Fahrplandienstes. Bitte eine andere Abfahrt oder eigene Treffpunktorte prüfen."
        : `Der Fahrplandienst ist momentan nicht verfügbar (HTTP ${response.status}).`,
    );
  const raw = await response.json();
  const daten = url.includes("/v6/one-to-all?") ? verdichteAtlas(raw) : raw;
  if (cache.size >= 12) cache.delete(cache.keys().next().value);
  cache.set(url, { zeit: Date.now(), daten });
  return daten;
}
async function reise(von, nach, optionen, signal) {
  if (von.key === nach.key || (von.stopId && von.stopId === nach.stopId))
    return {
      startTime: optionen.zeit,
      endTime: optionen.zeit,
      transfers: 0,
      legs: [],
      identisch: true,
    };
  const url = planURL(von, nach, optionen);
  const daten = await lade(url, signal, true);
  return verbindungen(
    daten,
    optionen.zeit,
    optionen.umstiege,
    optionen.arriveBy,
  );
}
function optionen() {
  const zeit = abfahrtISO($("datum").value, $("uhrzeit").value);
  if (Date.parse(zeit) < Date.now() - 60000)
    throw new Error(
      "Der gewählte Zeitpunkt liegt in der Vergangenheit. Bitte einen zukünftigen Zeitpunkt wählen.",
    );
  return {
    zeit,
    umstiege: Number($("umstiege").value),
    puffer: Number($("puffer").value),
    nurRegional: $("regional").checked,
    vergleich: art === "treffen",
    objective: $("bahn-objective").value,
    horizont: Number($("horizont").value),
    ...(art === "finden" && $("rueck-uhrzeit").value ? rueckOptionen(zeit) : {}),
    ...(art === "finden" ? { nutzbar: $("nutzbar").value } : {}),
    arriveBy:
      art === "gebiete" ||
      (["reichweite", "effekt", "auto"].includes(art) &&
        $("atlas-richtung").value === "nach"),
  };
}
let umfeld = null;
async function ladeUmfeld() {
  // Einmal je Seite; ohne Datei bleibt die Treffpunktsuche nutzbar, nur ohne Bahnhofsangaben.
  if (umfeld === null)
    umfeld = await fetch("data/bahnhof-umfeld.json?v=1")
      .then((r) => (r.ok ? r.json() : false))
      .then((d) => (d ? umfeldIndex(d) : false))
      .catch(() => false);
  return umfeld;
}
function rueckOptionen(zeit) {
  let frist = abfahrtISO($("datum").value, $("rueck-uhrzeit").value);
  // Uhrzeit vor der Abfahrt: Rueckkehr am Folgetag.
  if (Date.parse(frist) <= Date.parse(zeit)) {
    const d = new Date(`${$("datum").value}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    frist = abfahrtISO(d.toISOString().slice(0, 10), $("rueck-uhrzeit").value);
  }
  if (Date.parse(frist) - Date.parse(zeit) > 1440 * 60000)
    throw new Error("Die Rückkehr darf höchstens 24 Stunden nach der Abfahrt liegen.");
  return { rueckFrist: frist, aufenthalt: Number($("aufenthalt").value) };
}
function liste(id, min, max) {
  const namen = ortsnamen($(id).value);
  if (namen.length < min || namen.length > max)
    throw new Error(
      `Bitte ${min}–${max} Orte bei „${id === "personen" ? "Wo startet ihr?" : "Treffpunkte"}“ eintragen.`,
    );
  const result = namen.map((n) => {
    const c = finde(n);
    if (!c)
      throw new Error(
        `„${n}“ wurde nicht eindeutig im Ortsverzeichnis gefunden.`,
      );
    return c;
  });
  if (new Set(result.map((c) => c.key)).size !== result.length)
    throw new Error("Bitte verschiedene Orte auswählen.");
  return result;
}
function ortslistenAnzeigen() {
  for (const feld of ["personen", "zentren", "kandidaten"]) {
    $(feld + "-liste").innerHTML = ortsnamen($(feld).value)
      .map(
        (name, i) =>
          `<div class="traveler"><i style="background:${farben[i % farben.length]}"></i><span>${esc(name)}</span><button type="button" data-ort-remove="${feld}" data-index="${i}" aria-label="${esc(name)} entfernen">×</button></div>`,
      )
      .join("");
  }
}
function ortHinzufuegen(feld, name = $(feld + "-ort").value) {
  try {
    const p = finde(name);
    if (!p)
      throw new Error("Bitte einen Ort aus den Suchvorschlägen auswählen.");
    const label = orte.find((c) => c.id === p.key).label;
    const wert = ergaenzeOrt(
      $(feld).value,
      label,
      feld === "kandidaten" ? 3 : feld === "zentren" ? 20 : 8,
    );
    leeren();
    $(feld).value = wert;
    $(feld + "-ort").value = "";
    $(feld + "-fehler").textContent = "";
    ortslistenAnzeigen();
    wechselLinks();
  } catch (e) {
    $(feld + "-fehler").textContent = e.message;
  }
}
async function suchen(event) {
  event.preventDefault();
  abbrechen();
  const id = folge,
    controller = new AbortController();
  laeuft = controller;
  let opt;
  try {
    opt = optionen();
    if (["reichweite", "finden", "gebiete", "effekt", "auto"].includes(art)) {
      await sucheAtlas(opt, controller.signal, id);
      return;
    }
    let von, nach, personen, kandidaten;
    if (art === "route") {
      von = finde($("von").value, "von");
      nach = finde($("nach").value, "nach");
      if (!von || !nach)
        throw new Error(
          "Bitte Start und Ziel aus der Liste auswählen oder die Haltestellensuche nutzen.",
        );
      if (von.key === nach.key)
        throw new Error("Start und Ziel müssen verschieden sein.");
    } else {
      personen = liste("personen", 2, 8);
      kandidaten = liste("kandidaten", 1, 3);
    }
    const paare =
      art === "route"
        ? [[von, nach]]
        : kandidaten.flatMap((k) => personen.map((p) => [p, k]));
    const neu = paare
      .filter(([a, b]) => a.key !== b.key)
      .map(([a, b]) => planURL(a, b, opt))
      .filter(
        (url) => !cache.has(url) || Date.now() - cache.get(url).zeit >= 600000,
      ).length;
    const frei = 40 - kontingent().anzahl;
    if (neu > frei)
      throw new Error(
        `Noch ${frei} Fahrplananfragen sind heute möglich; diese Suche braucht ${neu}. Bitte weniger Treffpunkte wählen oder morgen fortsetzen.`,
      );
    $("suchen").disabled = true;
    $("abbrechen").hidden = false;
    $("bahn-ergebnis").setAttribute("aria-busy", "true");
    $("bahn-karten").innerHTML = "";
    $("bahn-detailbereich").hidden = true;
    $("bahn-einstieg").hidden = true;
    ergebnis = null;
    schreibeLink();
    if (art === "route") {
      status(`Suche ${von.display} → ${nach.display} …`);
      const reisen = await reise(von, nach, opt, controller.signal);
      if (id !== folge) return;
      ergebnis = { art, reisen, von, nach, opt, abgerufen: new Date() };
      if (!reisen.length) {
        status(
          "Keine passende, gültige Verbindung gefunden. Prüfe Datum, Umstiegsgrenze und Nahverkehrsfilter. Auch Ausfälle oder fehlende Fahrplandaten können die Ursache sein.",
          true,
        );
        return;
      }
      $("bahn-karten").innerHTML = reisen
        .slice(0, 6)
        .map(
          (r, i) =>
            `<button class="fahrt-karte" data-reise="${i}" aria-pressed="false"><span class="etikett">Verbindung ${i + 1}</span><strong>${uhr(r.startTime)} → ${uhr(r.endTime)}</strong><span>${minuten(Date.parse(r.endTime) - Date.parse(r.startTime))} · ${umstiegsText(r.transfers)}</span><small>${esc(tageswechsel(r.endTime, r.startTime) || "Am selben Tag")} · ${r.legs.some((l) => l.mode === "BUS") ? "mit Bus" : "Bahn / Nahverkehr"}</small></button>`,
        )
        .join("");
      status(
        `${reisen.length} Verbindungen · ${datumText(opt.zeit)} ab ${uhr(opt.zeit)} · Suche um ${uhr(ergebnis.abgerufen)}. Antworten bis zu 10 Min. zwischengespeichert. Vor der Fahrt erneut prüfen.`,
      );
      zeigeReise(0);
    } else {
      const result = [];
      let fertig = 0;
      const gesamt = personen.length * kandidaten.length;
      for (const kandidat of kandidaten) {
        const reisen = [];
        for (const person of personen) {
          status(
            `Prüfe ${person.name} → ${kandidat.name} (${++fertig}/${gesamt}) …`,
          );
          const rs = await reise(person, kandidat, opt, controller.signal);
          if (id !== folge) return;
          reisen.push(
            Array.isArray(rs)
              ? rs
                  .slice()
                  .sort(
                    (a, b) =>
                      Date.parse(a.endTime) - Date.parse(b.endTime) ||
                      a.transfers - b.transfers,
                  )[0] || null
              : rs,
          );
        }
        result.push({ ort: kandidat, reisen });
      }
      const rang = treffpunkte(result, opt.zeit);
      if (opt.objective === "total") rang.sort((a, b) => Number(b.erreichbar) - Number(a.erreichbar) || a.summe - b.summe || a.max - b.max);
      ergebnis = { art, rang, personen, opt, abgerufen: new Date() };
      $("bahn-karten").innerHTML = rang
        .map(
          (k, i) =>
            `<button class="fahrt-karte" data-treff="${i}" aria-pressed="false"><span class="etikett">${k.erreichbar ? `${i + 1}. im Vergleich` : "Keine gemeinsame Verbindung"}</span><strong>${esc(k.ort.name)}</strong><span>${k.erreichbar ? `Max. ${minuten(k.max * 60000)} ab Wunschabfahrt` : "Nicht für alle erreichbar im Suchergebnis"}</span><small>${k.erreichbar ? `Alle angekommen um ${uhr(new Date(Date.parse(opt.zeit) + k.max * 60000))}${tageswechsel(new Date(Date.parse(opt.zeit) + k.max * 60000), opt.zeit)}` : "Andere Zeit oder Umstiegsgrenze prüfen."}</small></button>`,
        )
        .join("");
      status(
        `${personen.length} Startorte × ${kandidaten.length} ${kandidaten.length === 1 ? "Treffpunkt" : "Treffpunkte"} geprüft. Rangfolge: ${opt.objective === "total" ? "geringste gesamte Anreise, danach früheste gemeinsame Ankunft" : "früheste gemeinsame Ankunft, bei Gleichstand geringste Summe der Zeiten ab Wunschabfahrt"}. Nur die eingegebenen Orte werden verglichen.`,
      );
      zeigeTreff(0);
    }
  } catch (error) {
    if (id !== folge) return;
    status(
      error.name === "TimeoutError"
        ? "Die Fahrplansuche hat zu lange gedauert. Bitte später erneut versuchen."
        : error.name === "TypeError"
          ? "Der Fahrplandienst ist nicht erreichbar. Bitte Internetverbindung prüfen und später erneut suchen."
          : error.message,
      true,
    );
    $("bahn-karten").innerHTML = "";
    $("bahn-detailbereich").hidden = true;
    ergebnis = null;
  } finally {
    if (id === folge) {
      laeuft = null;
      $("suchen").disabled = false;
      $("abbrechen").hidden = true;
      $("bahn-ergebnis").setAttribute("aria-busy", "false");
      if (innerWidth <= 700)
        $("bahn-status").scrollIntoView({
          block: "start",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        });
    }
  }
}
// Strassennetz nur fuer "Bahn gegen Auto" und erst bei Bedarf laden.
let strassenWorkerLauf = null,
  strassenAnfrage = 0;
function strassenWorker() {
  strassenWorkerLauf ||= (async () => {
    const res = await fetch("data/roads.json.gz?v=6");
    if (!res.ok) throw new Error(`Straßendaten nicht verfügbar (${res.status}).`);
    const bytes = await res.arrayBuffer(),
      sig = new Uint8Array(bytes, 0, 2);
    const data = JSON.parse(
      sig[0] === 31 && sig[1] === 139
        ? await new Response(
            new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
          ).text()
        : new TextDecoder().decode(bytes),
    );
    const w = new Worker("worker.js?v=20261105-1", { type: "module" });
    await new Promise((ok, fail) => {
      w.onmessage = ({ data: m }) =>
        m.type === "ready" ? ok() : fail(new Error(m.message));
      w.onerror = () => fail(new Error("Der Straßenrechner konnte nicht starten."));
      w.postMessage({ type: "init", data });
    });
    return w;
  })().catch((e) => {
    strassenWorkerLauf = null;
    throw e;
  });
  return strassenWorkerLauf;
}
async function strassenZeiten(start, halte, optionen) {
  const w = await strassenWorker(),
    id = ++strassenAnfrage;
  return new Promise((ok, fail) => {
    w.onmessage = ({ data: m }) => {
      if (m.id !== id) return;
      m.type === "result" ? ok(m.result) : fail(new Error(m.message));
    };
    w.postMessage({
      type: "bahnauto",
      id,
      start: { lon: start.lon, lat: start.lat },
      halte: halte.map((h) => ({ lon: h.lon, lat: h.lat })),
      optionen,
    });
  });
}
function pruefeBudget(urls) {
  const neu = [...new Set(urls)].filter(
    (url) => !cache.has(url) || Date.now() - cache.get(url).zeit >= 600000,
  ).length;
  const frei = 40 - kontingent().anzahl;
  if (neu > frei)
    throw new Error(
      `Noch ${frei} Fahrplananfragen sind heute möglich; diese Ansicht braucht ${neu}. Bitte weniger Orte wählen oder morgen fortsetzen.`,
    );
}
async function sucheAtlas(opt, signal, id) {
  const typ = art;
  const personen =
    typ === "finden"
      ? liste("personen", 2, 8)
      : typ === "gebiete"
        ? liste("zentren", 2, 20)
        : [finde($("atlas-ort").value, "atlas-ort")];
  if (personen.some((p) => !p))
    throw new Error(
      "Bitte einen Ort aus der Liste oder eine Haltestelle auswählen.",
    );
  const urls =
    typ === "auto"
      ? versetzteZeiten(opt.zeit, opt.arriveBy).map((zeit) =>
          atlasURL(personen[0], { ...opt, zeit }),
        )
      : typ === "effekt"
      ? [false, true].map((nurRegional) =>
          atlasURL(personen[0], { ...opt, nurRegional }),
        )
      : personen.map((p) => atlasURL(p, opt));
  if (typ !== "finden") pruefeBudget(urls);
  const umfeldDaten = typ === "finden" ? await ladeUmfeld() : false;
  if (typ === "finden" && opt.nutzbar !== "egal" && !umfeldDaten)
    throw new Error("Die Bahnhofsdaten konnten nicht geladen werden. Bitte „Keine Vorgabe“ wählen oder später erneut suchen.");
  $("suchen").disabled = true;
  $("abbrechen").hidden = false;
  $("bahn-ergebnis").setAttribute("aria-busy", "true");
  $("bahn-karten").innerHTML = "";
  $("bahn-detailbereich").hidden = true;
  $("atlas-ergebnis").hidden = true;
  $("bahn-einstieg").hidden = true;
  schreibeLink();
  const r = await atlasBerechnen({
    typ,
    personen,
    opt,
    lade,
    signal,
    grenzen,
    status,
    pruefeBudget,
    strassenZeiten,
    umfeld: umfeldDaten || null,
    autobahnTempo: Number.isInteger(strassenStand.autobahnTempo) && strassenStand.autobahnTempo >= 100 && strassenStand.autobahnTempo <= 200 ? strassenStand.autobahnTempo : 130,
  });
  if (id !== folge) return;
  r.orte = orte;
  r.bahnnetz = bahnnetz;
  ergebnis = r;
  atlasAnzeigen(r, atlasDetails, (horizont) => {
    $("horizont").value = String(horizont);
    leeren();
    $("bahn-form").requestSubmit();
  });
  status(
    r.punkte.length
      ? `${r.punkte.length.toLocaleString("de-DE")} ${typ === "finden" ? "gemeinsame" : "berechnete"} Haltestellen in Deutschland${typ === "auto" ? ` (Bahn schneller: ${r.bilanz.bahn.toLocaleString("de-DE")}, Auto schneller: ${r.bilanz.auto.toLocaleString("de-DE")}, etwa gleich: ${r.bilanz.gleich.toLocaleString("de-DE")})` : ""} · ${datumText(opt.zeit)} ${opt.arriveBy ? "Ankunft bis" : "ab"} ${uhr(opt.zeit)} · Fahrplan ohne Echtzeit. ${typ === "finden" ? r.suchHinweis || "Bestmöglicher Treffpunkt nach gewählter Fairness, ohne persönliches Zeitlimit." : "Haltestelle wählen, um die Verbindung aktuell zu prüfen."}`
      : typ === "finden" ? "Keine gemeinsame Haltestelle in den verfügbaren Fahrplandaten. Bitte die Erläuterung unten beachten." : "Keine Haltestellen im Suchhorizont gefunden. Zeitlimit erweitern, Umstiegsgrenze oder Uhrzeit ändern.",
    !r.punkte.length || !!r.suchHinweis,
  );
  if (typ === "finden" && r.punkte.length) await atlasDetails(r.punkte[0], r);
}
async function atlasDetails(s, r) {
  abbrechen();
  const id = folge,
    controller = new AbortController();
  laeuft = controller;
  const halt = {
    key: s.id,
    stopId: s.id,
    name: s.name,
    display: s.name,
    lat: s.lat,
    lon: s.lon,
  };
  const ziel = r.typ === "gebiete" ? r.personen[s.gebiet] : r.personen[0];
  const paare =
    r.typ === "finden"
      ? r.personen.map((p) => [p, halt])
      : r.opt.arriveBy
        ? [[halt, ziel]]
        : [[ziel, halt]];
  const opt = {
    ...r.opt,
    ...(r.typ === "auto" && s.startZeit ? { zeit: s.startZeit } : {}),
    vergleich: r.typ === "finden",
    nurRegional: r.typ === "effekt" ? false : r.opt.nurRegional,
  };
  try {
    pruefeBudget(
      paare
        .filter(
          ([a, b]) => a.key !== b.key && !(a.stopId && a.stopId === b.stopId),
        )
        .map(([a, b]) => planURL(a, b, opt)),
    );
    $("suchen").disabled = true;
    $("abbrechen").hidden = false;
    $("bahn-ergebnis").setAttribute("aria-busy", "true");
    $("bahn-detailbereich").hidden = true;
    const reisen = [];
    for (const [a, b] of paare) {
      status(`Prüfe aktuell: ${a.name} → ${b.name} …`);
      const rs = await reise(a, b, opt, controller.signal);
      if (id !== folge) return;
      reisen.push(
        Array.isArray(rs)
          ? rs
              .slice()
              .sort((x, y) =>
                opt.arriveBy
                  ? Date.parse(y.startTime) - Date.parse(x.startTime)
                  : Date.parse(x.endTime) - Date.parse(y.endTime),
              )[0] || null
          : rs,
      );
    }
    $("bahn-detailbereich").hidden = false;
    $("bahn-detail").innerHTML =
      '<p class="hint">Aktuelle Detailprüfung. Die Atlas-Karte und ihre Rangfolge basieren weiter auf dem ursprünglichen Fahrplan; Verspätungen können das Ergebnis verändern.</p>' +
      reisen
        .map(
          (reise, i) =>
            `<details class="vergleich-person" ${reisen.length === 1 ? "open" : ""}><summary>${esc(paare[i][0].name)} → ${esc(paare[i][1].name)} · ${reise ? `${uhr(reise.startTime)}–${uhr(reise.endTime)} · ${umstiegsText(reise.transfers)}` : "Keine gültige Verbindung"}</summary>${reise ? details(reise, ...paare[i]) : "<p>Derzeit keine passende Verbindung gefunden. Das Fahrplanergebnis ist nicht als aktuelle Zusage nutzbar.</p>"}</details>`,
        )
        .join("");
    karteReisen = reisen;
    zeichneKarte();
    r.zeigeStrecken?.(reisen, s.id, r.typ === "gebiete" ? s.gebiet : null);
    status(
      `Die farbigen Linien zeigen die aktuellen ${r.typ === "finden" ? "Anreisen" : "Fahrtabschnitte"} zur Auswahl. Umstiege und Zeiten stehen unter der Karte. Die Atlas-Berechnung beruht weiterhin auf dem Sollfahrplan.`,
    );
  } catch (e) {
    if (id === folge) {
      status(`Detailprüfung nicht abgeschlossen: ${e.message}`, true);
      $("atlas-routenstatus").textContent =
        "Strecken konnten nicht geladen werden. Auswahl erneut versuchen.";
    }
  } finally {
    if (id === folge) {
      laeuft = null;
      $("suchen").disabled = false;
      $("abbrechen").hidden = true;
      $("bahn-ergebnis").setAttribute("aria-busy", "false");
    }
  }
}
function datumText(iso) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}
function umstiegsText(n) {
  return n === 0 ? "ohne Umstieg" : `${n} ${n === 1 ? "Umstieg" : "Umstiege"}`;
}
function gleis(p) {
  const wert = p.track || p.scheduledTrack;
  return wert
    ? ` · Gleis/Steig ${esc(wert)}${p.track && p.scheduledTrack && p.track !== p.scheduledTrack ? ` (statt ${esc(p.scheduledTrack)})` : ""}`
    : "";
}
function etappen(r) {
  if (r.identisch)
    return "<p>Start und Treffpunkt sind identisch. Keine Anreise nötig.</p>";
  let html = "";
  for (let i = 0; i < r.legs.length; i++) {
    const l = r.legs[i],
      vorher = r.legs[i - 1],
      pause = vorher ? Date.parse(l.startTime) - Date.parse(vorher.endTime) : 0;
    if (pause > 0)
      html += `<div class="umstieg">${minuten(pause)} Wartezeit in ${esc(ortName(l.from))}</div>`;
    const fuss = l.mode === "WALK",
      verspaetung = Math.round(
        (Date.parse(l.startTime) - Date.parse(l.scheduledStartTime)) / 60000,
      );
    html += `<div class="etappe ${fuss ? "fuss" : ""}"><h4>${uhr(l.startTime)} ${esc(ortName(l.from))}${esc(tageswechsel(l.startTime, r.startTime))}</h4><span class="linie">${esc(fuss ? "Zu Fuß" : l.displayName || l.routeShortName || verkehr[l.mode] || l.mode)}</span><p>${fuss ? `${minuten(Date.parse(l.endTime) - Date.parse(l.startTime))}${l.distance ? ` · ${Math.round(l.distance)} m` : ""}` : `${esc(verkehr[l.mode] || l.mode)}${l.headsign ? ` Richtung ${esc(l.headsign)}` : ""}${gleis(l.from)}`}</p><p>${uhr(l.endTime)} ${esc(ortName(l.to))}${esc(tageswechsel(l.endTime, r.startTime))}${fuss ? "" : gleis(l.to)}</p><small>${fuss ? "Fußweg" : l.realTime ? `Mit Echtzeitdaten${verspaetung > 0 ? ` · Abfahrt +${verspaetung} Min.` : ""}` : "Fahrplan · keine Echtzeitbestätigung"}${l.interlineWithPreviousLeg ? " · Im Fahrzeug bleiben" : ""}</small></div>`;
  }
  return html;
}
function details(r, von, nach) {
  return `<div class="reise-kopf"><h3>${esc(von.name)} → ${esc(nach.name)}</h3><p>${esc(von.display)} → ${esc(nach.display)}</p><p><b>${datumText(r.startTime)} · ${uhr(r.startTime)}–${uhr(r.endTime)}${esc(tageswechsel(r.endTime, r.startTime))}</b><br>${minuten(Date.parse(r.endTime) - Date.parse(r.startTime))} · ${umstiegsText(r.transfers)}</p></div>${etappen(r)}`;
}
function zeigeReise(i) {
  const r = ergebnis?.reisen?.[i];
  if (!r) return;
  document
    .querySelectorAll("[data-reise]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(Number(b.dataset.reise) === i)),
    );
  $("bahn-detailbereich").hidden = false;
  $("bahn-detail").innerHTML = details(r, ergebnis.von, ergebnis.nach);
  karteReisen = [r];
  zeichneKarte();
}
function zeigeTreff(i) {
  const k = ergebnis?.rang?.[i];
  if (!k) return;
  document
    .querySelectorAll("[data-treff]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(Number(b.dataset.treff) === i)),
    );
  $("bahn-detailbereich").hidden = false;
  $("bahn-detail").innerHTML =
    `<div class="reise-kopf"><h3>Treffen in ${esc(k.ort.name)}</h3><p>${k.erreichbar ? `Früheste gemeinsame Ankunft: <b>${uhr(new Date(Date.parse(ergebnis.opt.zeit) + k.max * 60000))}${tageswechsel(new Date(Date.parse(ergebnis.opt.zeit) + k.max * 60000), ergebnis.opt.zeit)}</b>.` : "Für mindestens eine Anreise wurde keine passende Verbindung gefunden."}</p><small>Die Zeit ab Wunschabfahrt enthält auch das Warten auf die erste Verbindung. Früher Angekommene warten am Treffpunkt.</small></div>` +
    k.reisen
      .map(
        (r, j) =>
          `<details class="vergleich-person" style="border-left:3px solid ${farben[j % farben.length]}"><summary>${esc(ergebnis.personen[j].name)} · ${r ? `${minuten(Date.parse(r.endTime) - Date.parse(ergebnis.opt.zeit))} ab Wunschabfahrt · ${umstiegsText(r.transfers)}` : "Keine Verbindung"}</summary>${r ? details(r, ergebnis.personen[j], k.ort) : "<p>Keine passende Verbindung im Fahrplandatensatz. Das ist kein Beweis, dass der Ort generell unerreichbar ist.</p>"}</details>`,
      )
      .join("");
  karteReisen = k.reisen;
  zeichneKarte();
}
function zeichneKarte() {
  if (!grenzen) return;
  const xy = ([lon, lat]) => [(lon - 5.5) * 62, (55.2 - lat) * 81];
  const routen = karteReisen.map((r) =>
    (r?.legs || []).map((l) => ({
      leg: l,
      punkte: polyline(l.legGeometry?.points, l.legGeometry?.precision ?? 6),
    })),
  );
  const punkte = routen.flatMap((rs) => rs.flatMap((l) => l.punkte)).map(xy);
  let box = [0, 0, 640, 690];
  if (punkte.length) {
    let minx = Infinity,
      miny = Infinity,
      maxx = -Infinity,
      maxy = -Infinity;
    for (const [x, y] of punkte) {
      minx = Math.min(minx, x);
      maxx = Math.max(maxx, x);
      miny = Math.min(miny, y);
      maxy = Math.max(maxy, y);
    }
    let breite = Math.max(45, (maxx - minx) * 1.35),
      hoehe = Math.max(45, (maxy - miny) * 1.35);
    breite = Math.max(breite, (hoehe * 640) / 690);
    hoehe = (breite * 690) / 640;
    box = [
      (minx + maxx - breite) / 2,
      (miny + maxy - hoehe) / 2,
      breite,
      hoehe,
    ];
  }
  $("bahn-karte").setAttribute("viewBox", box.join(" "));
  const faktor = box[2] / 640,
    linie = (ps) =>
      ps
        .map(
          (p, i) =>
            `${i ? "L" : "M"}${xy(p)
              .map((x) => x.toFixed(2))
              .join(",")}`,
        )
        .join(" ");
  let svg = "<title>Verlauf der ausgewählten Fahrplanverbindung</title>";
  for (const f of grenzen.features) {
    const polys =
      f.geometry.type === "Polygon"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates;
    for (const p of polys)
      svg += `<path d="${p.map((r) => linie(r) + "Z").join(" ")}" fill="${f.properties.code === "DEU" ? "var(--paper)" : "none"}" stroke="var(--line)" stroke-width="${0.7 * faktor}"/>`;
  }
  routen.forEach((rs, j) => {
    for (const { leg: l, punkte: ps } of rs)
      if (ps.length > 1)
        svg += `<path d="${linie(ps)}" fill="none" stroke="${farben[j % farben.length]}" stroke-width="${(l.mode === "WALK" ? 1.3 : 2.2) * faktor}" ${l.mode === "WALK" ? `stroke-dasharray="${3 * faktor} ${3 * faktor}"` : ""}/>`;
    const r = karteReisen[j];
    for (const p of [r?.legs[0]?.from, r?.legs.at(-1)?.to])
      if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
        const [x, y] = xy([p.lon, p.lat]);
        const tx = Math.min(
          box[0] + box[2] - 160 * faktor,
          Math.max(box[0] + 8 * faktor, x + 8 * faktor),
        );
        svg += `<circle cx="${x}" cy="${y}" r="${4 * faktor}" fill="${farben[j % farben.length]}"/><text x="${tx}" y="${y - 8 * faktor}" fill="var(--ink)" font-size="${11 * faktor}" font-family="DM Sans,sans-serif">${esc(ortName(p))}</text>`;
      }
  });
  $("bahn-karte").innerHTML = svg;
}
async function haltestellen(feld) {
  const text = $(feld).value.trim();
  if (text.length < 2) {
    status(
      "Bitte mindestens zwei Zeichen für die Haltestellensuche eingeben.",
      true,
    );
    return;
  }
  leeren();
  const id = folge,
    controller = new AbortController();
  laeuft = controller;
  status("Haltestellen werden gesucht …");
  try {
    const daten = await lade(
      `${API}/v1/geocode?${new URLSearchParams({ text, language: "de", type: "STOP", numResults: "8" })}`,
      controller.signal,
    );
    if (id !== folge) return;
    const liste = daten.filter(
      (c) =>
        c.country === "DE" &&
        typeof c.id === "string" &&
        Number.isFinite(c.lat) &&
        Number.isFinite(c.lon),
    );
    const box = $(feld + "-vorschlaege");
    box.innerHTML = "";
    for (const c of liste) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = c.name + (c.zip ? ` · ${c.zip}` : "");
      b.onclick = () => {
        leeren();
        auswahl[feld] = {
          key: c.id,
          stopId: c.id,
          name: c.name,
          display: c.name,
          lat: c.lat,
          lon: c.lon,
        };
        $(feld).value = c.name;
        box.innerHTML = "";
        ortHinweis(feld);
      };
      box.append(b);
    }
    status(
      liste.length
        ? "Bitte eine Haltestelle aus den Treffern auswählen."
        : "Keine passende deutsche Haltestelle gefunden. Bitte den Suchbegriff präzisieren.",
    );
  } catch (error) {
    if (id === folge)
      status(
        "Die Haltestellensuche ist momentan nicht verfügbar. Die Orte im lokalen Verzeichnis bleiben auswählbar.",
        true,
      );
  } finally {
    if (id === folge) laeuft = null;
  }
}
function zustand() {
  return {
    ...vergleichInfo,
    objective: $("bahn-objective").value,
    art,
    von: $("von").value,
    nach: $("nach").value,
    personen: $("personen").value,
    kandidaten: $("kandidaten").value,
    datum: $("datum").value,
    uhrzeit: $("uhrzeit").value,
    umstiege: $("umstiege").value,
    puffer: $("puffer").value,
    regional: $("regional").checked,
    theme: $("bahn-theme").value,
    auswahl,
    "atlas-ort": $("atlas-ort").value,
    "atlas-richtung": $("atlas-richtung").value,
    horizont: $("horizont").value,
    zentren: $("zentren").value,
    "rueck-uhrzeit": $("rueck-uhrzeit").value,
    nutzbar: $("nutzbar").value,
    aufenthalt: $("aufenthalt").value,
  };
}
function schreibeLink() {
  history.replaceState(
    null,
    "",
    vergleichLink("", strassenStand, zustand()),
  );
}
function leseLink() {
  try {
    strassenStand = leseZustand(location.hash, "s") || {};
    const s = JSON.parse(
      new URLSearchParams(location.hash.slice(1)).get("bahn"),
    );
    if (!s) return;
    vergleichInfo = { uebernahme: s.uebernahme, unbegrenztUebernommen: s.unbegrenztUebernommen, rueckvergleich: s.rueckvergleich, objective: s.objective, strassenBudget: s.strassenBudget };
    $("bahn-objective").value = s.objective === "total" ? "total" : "fair";
    $("wechsel-hinweis").textContent = typeof s.uebernahme === "string" ? s.uebernahme : "";
    $("wechsel-hinweis").hidden = !$("wechsel-hinweis").textContent;
    for (const id of [
      "von",
      "nach",
      "personen",
      "kandidaten",
      "datum",
      "uhrzeit",
      "umstiege",
      "puffer",
      "atlas-ort",
      "atlas-richtung",
      "horizont",
      "zentren",
      "rueck-uhrzeit",
      "aufenthalt",
    ])
      if (typeof s[id] === "string" && s[id].length < 1000) $(id).value = s[id];
    if (["egal", "bahnhof", "gastro"].includes(s.nutzbar)) $("nutzbar").value = s.nutzbar;
    $("regional").checked = s.regional === true;
    if (["paper", "night", "ink"].includes(s.theme))
      $("bahn-theme").value = s.theme;
    auswahl = {};
    for (const f of ["von", "nach", "atlas-ort"]) {
      const c = s.auswahl?.[f];
      if (
        c &&
        typeof c.name === "string" &&
        c.name.length < 200 &&
        ((typeof c.stopId === "string" && c.stopId.length > 0 && c.stopId.length < 300) || c.punkt === true) &&
        Number.isFinite(c.lat) &&
        c.lat >= 47 &&
        c.lat <= 56 &&
        Number.isFinite(c.lon) &&
        c.lon >= 5 &&
        c.lon <= 16
      )
        auswahl[f] = {
          key: c.stopId || `punkt:${c.lat},${c.lon}`,
          stopId: c.stopId,
          punkt: c.punkt === true,
          name: c.name,
          display: c.name,
          lat: c.lat,
          lon: c.lon,
        };
    }
    if (
      [
        "route",
        "treffen",
        "reichweite",
        "finden",
        "gebiete",
        "effekt",
        "auto",
      ].includes(s.art)
    )
      modus(s.art);
  } catch {}
  document.body.dataset.theme = $("bahn-theme").value;
  ortHinweis("von");
  ortHinweis("nach");
  ortHinweis("atlas-ort");
}
async function init() {
  try {
    const [o, g, b] = await Promise.all([
      fetch("data/places.json?v=3"),
      fetch("data/borders.json"),
      fetch("data/rail-network.json"),
    ]);
    if (!o.ok || !g.ok || !b.ok)
      throw new Error("Ortsdaten nicht verfügbar. Bitte neu laden.");
    orte = await o.json();
    grenzen = await g.json();
    bahnnetz = await b.json();
    for (const c of orte)
      c.label =
        c.name +
        (orte.filter((x) => x.name === c.name).length > 1
          ? ` (${c.state})`
          : "");
    $("bahn-orte").innerHTML = orte
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label, "de"))
      .map((c) => `<option value="${esc(c.label)}"></option>`)
      .join("");
    const zeit = lokal(
      new Date(Math.ceil((Date.now() + 1800000) / 900000) * 900000),
    );
    $("datum").value = zeit.slice(0, 10);
    $("datum").min = lokal().slice(0, 10);
    $("uhrzeit").value = zeit.slice(11, 16);
    $("suchen").disabled = false;
    modus(art);
    leseLink();
    ortslistenAnzeigen();
    wechselLinks();
    ["von", "nach", "atlas-ort"].forEach(ortHinweis);
    $("bahn-schnell").innerHTML = STANDARDORTE.map((name) =>
      orte.find((c) => c.name === name),
    )
      .filter(Boolean)
      .map(
        (c) =>
          `<button type="button" data-ort="${esc(c.id)}">${esc(c.name)}</button>`,
      )
      .join("");
    document
      .querySelectorAll("[data-art]")
      .forEach((b) => (b.onclick = () => modus(b.dataset.art)));
    document
      .querySelectorAll("[data-suche]")
      .forEach((b) => (b.onclick = () => haltestellen(b.dataset.suche)));
    document.querySelectorAll("[data-ort-add]").forEach((b) => {
      b.onclick = () => ortHinzufuegen(b.dataset.ortAdd);
    });
    for (const feld of ["personen", "zentren", "kandidaten"]) {
      $(feld + "-ort").onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          ortHinzufuegen(feld);
        }
      };
      $(feld + "-liste").onclick = (e) => {
        const b = e.target.closest("[data-ort-remove]");
        if (!b) return;
        leeren();
        $(feld).value = ortsnamen($(feld).value)
          .filter((_, i) => i !== Number(b.dataset.index))
          .join("\n");
        $(feld + "-fehler").textContent = "";
        ortslistenAnzeigen();
        wechselLinks();
      };
    }
    document.querySelectorAll("[data-fuer]").forEach(
      (b) =>
        (b.onclick = () => {
          schnellFuer = b.dataset.fuer;
          document
            .querySelectorAll("[data-fuer]")
            .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        }),
    );
    $("bahn-schnell").onclick = (e) => {
      const b = e.target.closest("[data-ort]");
      if (!b) return;
      const c = orte.find((c) => c.id === b.dataset.ort);
      if (["treffen", "finden", "gebiete"].includes(art)) {
        const feld = art === "gebiete" ? "zentren" : "personen";
        ortHinzufuegen(feld, c.label);
      } else {
        leeren();
        const feld = ["reichweite", "effekt", "auto"].includes(art)
          ? "atlas-ort"
          : schnellFuer;
        $(feld).value = c.label;
        delete auswahl[feld];
        ortHinweis(feld);
        wechselLinks();
      }
    };
    $("bahn-form").onsubmit = suchen;
    $("bahn-form").oninput = (e) => {
      if (
        ["personen-ort", "zentren-ort", "kandidaten-ort"].includes(e.target.id)
      )
        return;
      leeren();
      if (e.target.id === "horizont") vergleichInfo.unbegrenztUebernommen = false;
      if (["von", "nach", "atlas-ort"].includes(e.target.id)) {
        delete auswahl[e.target.id];
        $(e.target.id + "-vorschlaege").innerHTML = "";
        ortHinweis(e.target.id);
      }
    };
    $("bahn-form").addEventListener("input", () => queueMicrotask(wechselLinks));
    for (const a of document.querySelectorAll('[data-wechsel-strasse]')) {
      a.onclick = (e) => {
        try {
          const neu = bahnZuStrasse(zustand(), orte, strassenStand);
          a.href = vergleichLink("./", neu.strasse, neu.bahn);
        } catch (fehler) { e.preventDefault(); status(fehler.message, true); }
      };
    }
    $("treff-art").onchange = () =>
      modus($("treff-art").value === "auto" ? "finden" : "treffen");
    $("bahn-objective").onchange = () => modus(art);
    $("atlas-richtung").onchange = () => modus(art);
    $("tauschen").onclick = () => {
      leeren();
      [$("von").value, $("nach").value] = [$("nach").value, $("von").value];
      [auswahl.von, auswahl.nach] = [auswahl.nach, auswahl.von];
      ortHinweis("von");
      ortHinweis("nach");
      wechselLinks();
    };
    $("abbrechen").onclick = () => {
      leeren();
      status("Suche abgebrochen. Es werden keine weiteren Anfragen gestartet.");
    };
    $("bahn-theme").onchange = () => {
      document.body.dataset.theme = $("bahn-theme").value;
      zeichneKarte();
      ergebnis?.neuzeichnen?.();
    };
    $("bahn-karten").onclick = (e) => {
      const r = e.target.closest("[data-reise]"),
        k = e.target.closest("[data-treff]");
      if (r) zeigeReise(Number(r.dataset.reise));
      if (k) zeigeTreff(Number(k.dataset.treff));
    };
    $("bahn-teilen").onclick = async () => {
      schreibeLink();
      try {
        await navigator.clipboard.writeText(location.href);
        status("Link kopiert. Er enthält Orte, Datum und Uhrzeit.");
      } catch {
        status(
          "Die Adresszeile enthält deinen Ansichtslink. Bitte von dort kopieren.",
        );
      }
    };
    window.onhashchange = () => {
      leeren();
      leseLink();
      ortslistenAnzeigen();
    };
    $("bahn-eingaben").inert = false;
    $("bahn-eingaben").setAttribute("aria-busy", "false");
  } catch (error) {
    status(error.message, true);
  }
}
init();
