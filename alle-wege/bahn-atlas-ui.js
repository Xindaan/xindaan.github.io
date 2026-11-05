import { treffVorschlaege, reiseStrecken } from "./bahn-karten-core.js";
import {
  atlasURL,
  atlasTreffpunkte,
  atlasGebiete,
  atlasEffekt,
  inGebiet,
  atlasLeerHinweis,
  mitRueckfahrt,
  mitUmfeld,
} from "./bahn-atlas-core.js?v=20261105-1";
import { vergleicheBahnAuto, bilanz, TOLERANZ_MIN, versetzteZeiten, bestwertJeHalt, ABFAHRTEN, RASTER_MIN } from "./bahn-auto-core.js?v=20261105-1";
const farben = [
  "#a9674c",
  "#517a78",
  "#7a7d48",
  "#8580a1",
  "#b79247",
  "#527c9e",
  "#b57f82",
  "#67926c",
];
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const zeit = (m) =>
  m < 60
    ? `${Math.round(m)} Min.`
    : `${Math.floor(m / 60)} Std. ${Math.round(m % 60)} Min.`;
export async function atlasBerechnen(args) {
  if (args.typ !== "finden") return atlasRunde(args);
  let vorher, rueckListen = null;
  const rueck = args.opt.rueckFrist
    ? {
        ...args.opt,
        zeit: args.opt.rueckFrist,
        arriveBy: true,
        automatischeTreffpunktsuche: true,
        // Rueckfahrt dauert hoechstens Frist - Abfahrt - Mindestaufenthalt.
        fenster: Math.max(30, Math.round((Date.parse(args.opt.rueckFrist) - Date.parse(args.opt.zeit)) / 60000) - (args.opt.aufenthalt || 0)),
      }
    : null;
  let rueckGekappt = false;
  // Kein persoenliches Zeitbudget. Die Sammelsuche wird bei Bedarf erweitert.
  // Minimax ist gesichert, sobald ein gemeinsamer Halt innerhalb der Runde liegt:
  // Jeder noch nicht erfasste Halt braucht fuer mindestens eine Person laenger.
  // Fuer die Summe ist deren Wert eine konservative Obergrenze fuer die Suche.
  for (const horizont of [360, 480, 720, 1440]) {
    const opt = { ...args.opt, horizont, automatischeTreffpunktsuche: true };
    let r;
    try {
      args.pruefeBudget?.([
        ...args.personen.map((p) => atlasURL(p, opt)),
        ...(rueck && !rueckListen ? args.personen.map((p) => atlasURL(p, { ...rueck, horizont: Math.min(rueck.fenster, 480) })) : []),
      ]);
      if (rueck && !rueckListen) {
        // Eine Rueckfahrt-Anfrage je Person, fuer alle Suchrunden gemeinsam.
        rueckListen = [];
        for (let i = 0; i < args.personen.length; i++) {
          args.status(`${args.personen[i].name}: Rückfahrten bis zur Frist werden berechnet (${i + 1}/${args.personen.length}) …`);
          // Dienstgrenze "too many results": erst 8, dann 6 Stunden Rueckfahrt.
          let daten, fehler;
          for (const h of [...new Set([Math.min(rueck.fenster, 480), Math.min(rueck.fenster, 360)])]) {
            try {
              daten = await args.lade(atlasURL(args.personen[i], { ...rueck, horizont: h }), args.signal, true);
              if (h < rueck.fenster) rueckGekappt = h;
              break;
            } catch (e) {
              if (args.signal?.aborted) throw e;
              fehler = e;
            }
          }
          if (!daten) throw fehler;
          rueckListen.push(daten.filter((p) => p.umstiege <= rueck.umstiege));
        }
      }
      r = await atlasRunde({ ...args, opt });
      if (rueck) {
        r.punkte = mitRueckfahrt(r.punkte, rueckListen, { start: opt.zeit, frist: rueck.zeit, aufenthalt: opt.aufenthalt || 0 });
        r.rueck = { frist: rueck.zeit, aufenthalt: opt.aufenthalt || 0, gekappt: rueckGekappt };
      }
      if (args.umfeld) {
        // Nur filtern: Minimax-Abbruch bleibt gueltig.
        r.punkte = mitUmfeld(r.punkte, args.umfeld, opt.nutzbar || "egal");
        r.nutzbar = opt.nutzbar || "egal";
      }
    } catch (e) {
      if (args.signal?.aborted || !vorher?.punkte.length) throw e;
      return { ...vorher, rangVollstaendig: false,
        suchHinweis: `Die weitere Fahrplansuche konnte nicht abgeschlossen werden: ${e.message} Die angezeigten Vorschläge sind geprüft; die beste Gesamtsumme ist noch nicht abgesichert.` };
    }
    if (r.punkte.length && (opt.objective !== "total" || r.punkte[0].summe <= horizont))
      return { ...r, rangVollstaendig: true, ...(rueckGekappt ? { suchHinweis: `Rückfahrten wurden bis ${rueckGekappt / 60} Stunden berücksichtigt (Grenze des Fahrplandienstes); Treffpunkte mit noch längerer Rückfahrt fehlen.` } : {}) };
    vorher = r;
  }
  return { ...vorher, rangVollstaendig: false,
    suchHinweis: vorher.punkte.length ? "Die automatische Suche umfasst 24 Stunden ab Abfahrt. Die angezeigten Vorschläge sind geprüft; eine bessere Gesamtsumme außerhalb dieses Fahrplanausschnitts ist nicht ausgeschlossen." : "" };
}
async function atlasRunde({
  typ,
  personen,
  opt,
  lade,
  signal,
  grenzen,
  status,
  strassenZeiten,
  autobahnTempo = 130,
}) {
  const de = grenzen.features.find((f) => f.properties.code === "DEU").geometry;
  const listen = [];
  const zeiten = typ === "auto" ? versetzteZeiten(opt.zeit, opt.arriveBy) : [];
  const paare =
    typ === "auto"
      ? zeiten.map((zeit) => ({ ...opt, zeit }))
      : typ === "effekt"
      ? [
          { ...opt, nurRegional: false },
          { ...opt, nurRegional: true },
        ]
      : personen.map(() => opt);
  for (let i = 0; i < paare.length; i++) {
    status(
      `${typ === "effekt" ? (i ? "Ohne Fernverkehr" : "Mit Fernverkehr") : typ === "auto" ? `${opt.arriveBy ? "Ankunft bis" : "Abfahrt ab"} ${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(paare[i].zeit))}` : personen[i].name}: Fahrplan-Erreichbarkeit wird berechnet (${i + 1}/${paare.length}) …`,
    );
    const daten = await lade(
      atlasURL(["effekt", "auto"].includes(typ) ? personen[0] : personen[i], paare[i]),
      signal,
      true,
    );
    listen.push(
      daten.filter(
        (p) =>
          p.dauer <= opt.horizont &&
          p.umstiege <= opt.umstiege &&
          inGebiet(p, de),
      ),
    );
  }
  let punkte = listen[0];
  if (typ === "finden") punkte = atlasTreffpunkte(listen, opt.objective);
  if (typ === "gebiete") punkte = atlasGebiete(listen);
  if (typ === "effekt") punkte = atlasEffekt(...listen);
  let vergleich = null;
  if (typ === "auto") {
    punkte = bestwertJeHalt(listen, zeiten);
    status("Straßenzeiten werden berechnet (beim ersten Mal wird das Straßennetz geladen) …");
    const s = await strassenZeiten(personen[0], punkte, {
      richtung: opt.arriveBy ? "nach" : "von",
      autobahnTempo,
    });
    if (signal?.aborted) throw new DOMException("Abgebrochen", "AbortError");
    punkte = vergleicheBahnAuto(punkte, s.minuten);
    vergleich = { bilanz: bilanz(punkte), startKm: s.startKm, autobahnTempo };
  }
  return {
    ...(vergleich || {}),
    art: "atlas",
    typ,
    personen,
    opt,
    punkte,
    grenzen,
    anzahlen: listen.map((l) => l.length),
  };
}
export function atlasAnzeigen(r, onDetails, onErweitern) {
  $("atlas-ergebnis").hidden = false;
  const punkte = r.punkte;
  let auswahl = null,
    vorschlaege = r.typ === "finden" ? treffVorschlaege(punkte) : [];
  r.strecken = [];
  r.auswahlId = null;
  const info = (s) =>
    r.typ === "finden"
      ? `Max. ${zeit(s.max)} · Gesamt ${zeit(s.summe)}${s.zusammen !== undefined ? ` · ${zeit(s.zusammen)} zusammen, erste Rückfahrt ${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(Math.min(...s.abfahrten.map(Date.parse))))}` : ""}${s.umfeld !== undefined ? s.umfeld ? ` · Bahnhof, ${s.umfeld.gastro === 1 ? "1 Lokal" : `${s.umfeld.gastro} Lokale`} in 300 m${["nicht stufenfrei", "teilweise stufenfrei", "stufenfrei"][s.umfeld.stufenfrei] ? ` · ${["nicht stufenfrei", "teilweise stufenfrei", "stufenfrei"][s.umfeld.stufenfrei]} (DB)` : ""}` : " · kein Bahnhof in 300 m" : ""}`
      : r.typ === "gebiete"
        ? `${r.personen[s.gebiet].name} · ${zeit(s.dauer)}`
        : r.typ === "effekt"
          ? s.regional === null
            ? `${zeit(s.dauer)} mit Fernverkehr · ohne nicht im Zeitlimit`
            : `${zeit(s.vorteil)} Zeitvorteil · ${zeit(s.dauer)} / ${zeit(s.regional)}`
          : r.typ === "auto"
            ? s.urteil === "ohne"
              ? `Bahn ${zeit(s.dauer)} · Auto: kein Straßenanschluss im Modell`
              : `Bahn ${zeit(s.dauer)} (${r.opt.arriveBy ? "an bis" : "ab"} ${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(s.startZeit))}) · Auto ${zeit(s.auto)} · ${s.urteil === "bahn" ? `Bahn ${zeit(-s.differenz)} schneller` : s.urteil === "auto" ? `Auto ${zeit(s.differenz)} schneller` : "etwa gleich"}`
          : `${zeit(s.dauer)} · ${s.umstiege === 0 ? "ohne Umstieg" : `${s.umstiege} ${s.umstiege === 1 ? "Umstieg" : "Umstiege"}`}`;
  const uhrzeit = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(r.opt.zeit));
  $("atlas-zahlen").innerHTML =
    `<div><span>${r.typ === "finden" ? "TREFFPUNKTVORSCHLÄGE" : "HALTEPUNKTE IM ERGEBNIS"}</span><strong>${r.typ === "finden" ? vorschlaege.length : punkte.length.toLocaleString("de-DE")}</strong></div><div><span>${r.typ === "finden" ? "LÄNGSTE ANREISE · BESTER VORSCHLAG" : r.typ === "auto" ? "BAHN SCHNELLER · AUTO SCHNELLER" : "SUCHHORIZONT"}</span><strong>${r.typ === "finden" ? punkte.length ? zeit(punkte[0].max) : "–" : r.typ === "auto" ? `${r.bilanz.bahn.toLocaleString("de-DE")} · ${r.bilanz.auto.toLocaleString("de-DE")}` : zeit(r.opt.horizont)}</strong></div><div><span>${r.opt.arriveBy ? "ANKUNFT BIS" : "ABFAHRT AB"}</span><strong>${uhrzeit}</strong></div>`;
  $("atlas-raster").hidden = !punkte.length;
  $("atlas-leer").hidden = !!punkte.length;
  if (!punkte.length) {
    const hinweis = atlasLeerHinweis(r);
    $("atlas-leer").innerHTML =
      `<h3>${esc(hinweis.titel)}</h3><p>${esc(hinweis.text)}</p>${hinweis.naechsterHorizont ? `<button type="button" class="primaer" id="atlas-erweitern">Mit ${zeit(hinweis.naechsterHorizont)} neu suchen →</button>` : "<p>Wähle eine andere Abfahrtszeit oder mehr erlaubte Umstiege.</p>"}`;
    if (hinweis.naechsterHorizont)
      $("atlas-erweitern").onclick = () =>
        onErweitern?.(hinweis.naechsterHorizont);
    return;
  }
  $("atlas-legende").textContent =
    r.typ === "finden"
      ? "Nummern: bester Treffpunkt und bis zu vier räumlich getrennte Alternativen (mindestens 20 km Abstand). Farbige Linien: tatsächliche Anreisen zur Auswahl."
      : r.typ === "gebiete"
        ? "Punktfarbe: am schnellsten erreichbares Zentrum."
        : r.typ === "effekt"
          ? "Grün: wenig Zeitvorteil · Braun: viel Zeitvorteil · Violett: ohne Fernverkehr nicht innerhalb des Zeitlimits."
          : r.typ === "auto"
            ? `Blau: Bahn mehr als ${TOLERANZ_MIN} Min. schneller · Braun: Auto mehr als ${TOLERANZ_MIN} Min. schneller · Grau: etwa gleich (±${TOLERANZ_MIN} Min.); kräftiger = größerer Abstand. Bahn: Sollfahrplan, beste von ${ABFAHRTEN} ${r.opt.arriveBy ? `Ankunftsfristen bis ${(ABFAHRTEN - 1) * RASTER_MIN} Min. vor der gewählten` : `Abfahrten bis ${(ABFAHRTEN - 1) * RASTER_MIN} Min. nach der gewählten`} Zeit im ${RASTER_MIN}-Min.-Raster; enthält höchstens ${RASTER_MIN} Min. Warten auf die nächste Fahrt sowie Fußweg bis 15 Min. Auto: Straßenmodell mit Wunschtempo ${r.autobahnTempo} km/h, ohne Stau, Parken und letzte Strecke; Haltestellen an den nächsten Nicht-Autobahn-Knoten (bis 5 km) angebunden, ohne Anschluss nicht verglichen. Keine Tür-zu-Tür-Aussage.`
            : "Grün: kurze Reisezeit · Braun: lange Reisezeit. Jeder Punkt zeigt eine erreichbare Haltestelle. Die Flächen dazwischen sind nicht automatisch erreichbar.";
  if (r.suchHinweis)
    $("atlas-legende").insertAdjacentHTML("afterbegin", `<strong>${esc(r.suchHinweis)}</strong><br>`);
  if (["gebiete", "finden"].includes(r.typ))
    $("atlas-legende").insertAdjacentHTML(
      "beforeend",
      "<br>" +
        r.personen
          .map(
            (p, i) =>
              `<span style="color:${farben[i % farben.length]}">●</span> ${esc(p.name)}`,
          )
          .join(" · "),
    );
  $("atlas-legende").insertAdjacentHTML(
    "beforeend",
    "<br>Grau: vereinfachtes Bahnnetz zur Orientierung (Natural Earth), kein Nachweis der Erreichbarkeit. Gestrichelte Routen: Fußwege. Bahnsteig- und Quellen-Duplikate werden in der Liste zusammengefasst.",
  );
  $("atlas-filter").value = "";
  $("atlas-routenstatus").textContent =
    r.typ === "finden"
      ? "Anreisen zum besten Vorschlag werden geladen …"
      : "Haltestelle auswählen: die konkrete Verbindung wird auf dieser Karte eingezeichnet.";
  const sorted =
    r.typ === "finden"
      ? punkte
      : r.typ === "auto"
        ? punkte
            .slice()
            .sort(
              (a, b) =>
                (a.differenz ?? Infinity) - (b.differenz ?? Infinity) ||
                a.name.localeCompare(b.name, "de"),
            )
      : punkte
          .slice()
          .sort(
            (a, b) => a.dauer - b.dauer || a.name.localeCompare(b.name, "de"),
          );
  function waehlen(s, laden = true) {
    auswahl = s;
    r.auswahlId = s.id;
    r.strecken = [];
    $("atlas-routenstatus").textContent = "Verbindung wird geladen …";
    $("bahn-detailbereich").hidden = true;
    $("atlas-auswahl").innerHTML =
      `<h3>${esc(s.name)}</h3><p><strong>Sollfahrplan:</strong> ${esc(info(s))}</p>${r.typ === "finden" ? `<p>${r.personen.map((p, i) => `${esc(p.name)}: ${zeit(s.zeiten[i])}`).join("<br>")}</p>` : ""}<button class="primaer" id="atlas-details">${r.typ === "finden" ? "Anreisen" : "Verbindung"} aktuell prüfen →</button><p id="atlas-aktuell" class="hint"></p><p class="hint">Karte und Rangfolge beruhen auf dem Fahrplan ohne Echtzeit. Die Detailprüfung kann abweichen.</p>`;
    $("atlas-details").onclick = () => onDetails(s, r);
    zeichnen();
    if (laden) onDetails(s, r);
  }
  function liste() {
    const q = $("atlas-filter").value.toLocaleLowerCase("de").trim();
    let treffer = sorted.filter(
      (s) => !q || s.name.toLocaleLowerCase("de").includes(q),
    );
    // Ohne Suchtext zunaechst benannte Bahnhoefe zeigen; alle Halte bleiben auf Karte und in Suche.
    if (!q && r.typ !== "finden") {
      const bahnhoefe = treffer.filter((s) =>
        /\bHbf\b|Hauptbahnhof|Bahnhof/i.test(s.name),
      );
      if (bahnhoefe.length) treffer = bahnhoefe;
    }
    const gezeigt = r.typ === "finden" ? treffVorschlaege(sorted, 5, q) : [];
    if (r.typ === "finden") {
      vorschlaege = gezeigt.slice(0, 5);
    } else
      for (const s of treffer) {
        if (
          gezeigt.some(
            (x) =>
              (x.name === s.name &&
                Math.hypot((x.lon - s.lon) * 64, (x.lat - s.lat) * 111) < 5) ||
              Math.hypot((x.lon - s.lon) * 64, (x.lat - s.lat) * 111) < 0.15,
          )
        )
          continue;
        gezeigt.push(s);
        if (gezeigt.length === 40) break;
      }
    $("atlas-liste").innerHTML =
      gezeigt
        .map(
          (s, i) =>
            `<button class="atlas-halt" data-halt="${i}"><strong>${r.typ === "finden" ? `${i + 1}. ` : ""}${esc(s.name)}</strong><span>${esc(info(s))}</span></button>`,
        )
        .join("") ||
      (r.typ === "finden" ? "<p>Kein Treffpunkt passt zum Suchbegriff.</p>" : "<p>Keine passende Haltestelle. Suchbegriff oder Zeitlimit ändern.</p>");
    $("atlas-liste").onclick = (e) => {
      const b = e.target.closest("[data-halt]");
      if (b) waehlen(gezeigt[Number(b.dataset.halt)]);
    };
  }
  $("atlas-filter").oninput = () => {
    liste();
    zeichnen();
  };
  const canvas = $("atlas-karte"),
    ctx = canvas.getContext("2d"),
    xy = (lon, lat) => [45 + (lon - 5.6) * 74, 35 + (55.25 - lat) * 103];
  let view = { z: 1, x: 0, y: 0 },
    drag = null;
  if (["reichweite", "effekt", "auto", "finden"].includes(r.typ) && punkte.length) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const s of [
      ...(r.typ === "finden" ? vorschlaege : punkte),
      ...r.personen,
    ]) {
      const [x, y] = xy(s.lon, s.lat);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const z = Math.max(
      1,
      Math.min(
        4,
        620 / Math.max(1, maxX - minX),
        740 / Math.max(1, maxY - minY),
      ),
    );
    view = {
      z,
      x: 400 - ((minX + maxX) / 2) * z,
      y: 450 - ((minY + maxY) / 2) * z,
    };
  }
  // Bahn gegen Auto: seltene Bahnvorteile zuletzt zeichnen, damit sie sichtbar bleiben.
  const rang = { ohne: 0, auto: 1, gleich: 2, bahn: 3 };
  const zeichenfolge =
    r.typ === "auto"
      ? punkte.slice().sort((a, b) => rang[a.urteil] - rang[b.urteil])
      : punkte;
  const pixel = (s) => {
    const [x, y] = xy(s.lon, s.lat);
    return [x * view.z + view.x, y * view.z + view.y];
  };
  function zeichnen() {
    const dark = document.body.dataset.theme === "night",
      ink = document.body.dataset.theme === "ink";
    ctx.clearRect(0, 0, 800, 900);
    ctx.fillStyle = dark ? "#1d2b26" : "#f5f2e9";
    ctx.fillRect(0, 0, 800, 900);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.z, view.z);
    for (const f of r.grenzen.features) {
      ctx.beginPath();
      for (const poly of f.geometry.type === "Polygon"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates)
        for (const ring of poly) {
          ring.forEach((p, i) => {
            const [x, y] = xy(...p);
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          });
          ctx.closePath();
        }
      ctx.fillStyle = dark ? "#263b33" : "#eceee4";
      ctx.fill("evenodd");
      ctx.strokeStyle = dark ? "#4f6559" : "#d4d9ca";
      ctx.lineWidth = 0.7 / view.z;
      ctx.stroke();
    }
    // Hintergrundnetz ist nur Orientierung; routingrelevante Routen kommen aus der API.
    ctx.beginPath();
    for (const linie of r.bahnnetz?.lines || []) {
      linie.forEach((p, i) => {
        const [x, y] = xy(...p);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
    }
    ctx.strokeStyle = dark ? "#718178" : "#b6beb2";
    ctx.lineWidth = 1.05 / view.z;
    ctx.stroke();
    ctx.restore();
    for (const s of r.typ === "finden" ? [] : zeichenfolge) {
      const [x, y] = pixel(s);
      if (x < 0 || x > 800 || y < 0 || y > 900) continue;
      let c;
      if (r.typ === "gebiete") c = farben[s.gebiet % farben.length];
      else if (r.typ === "auto") {
        if (s.urteil === "ohne") continue;
        const staerke = Math.min(Math.abs(s.differenz) / 60, 1);
        c =
          s.urteil === "gleich"
            ? dark ? "#9aa59c" : "#8f968c"
            : s.urteil === "bahn"
              ? `hsl(208 ${35 + staerke * 30}% ${dark ? 72 - staerke * 12 : 55 - staerke * 22}%)`
              : `hsl(24 ${35 + staerke * 30}% ${dark ? 70 - staerke * 12 : 55 - staerke * 22}%)`;
      } else if (r.typ === "effekt")
        c =
          s.vorteil === null
            ? "#8b68ad"
            : `hsl(${130 - Math.min(s.vorteil / 90, 1) * 112} 40% ${dark ? 65 : 40}%)`;
      else
        c = `hsl(${145 - Math.min((s.max ?? s.dauer) / r.opt.horizont, 1) * 128} 42% ${dark ? 65 : 39}%)`;
      ctx.fillStyle = ink ? (dark ? "#eee" : "#333") : c;
      ctx.beginPath();
      ctx.arc(x, y, Math.min(3, 1.5 + view.z * 0.15), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const route of r.strecken) {
      ctx.beginPath();
      route.punkte.forEach((p, i) => {
        const [x, y] = pixel({ lon: p[0], lat: p[1] });
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.strokeStyle = farben[route.person % farben.length];
      ctx.lineWidth = route.fuss ? 2.5 : 4;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash(route.fuss ? [6, 5] : []);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const beschriftet = [];
    for (const p of (r.orte || []).slice(0, 80)) {
      if (r.personen.some((o) => o.name === p.name)) continue;
      const [x, y] = pixel(p);
      if (
        x < 20 ||
        x > 710 ||
        y < 20 ||
        y > 870 ||
        beschriftet.some(
          (q) => Math.abs(q[0] - x) < 110 && Math.abs(q[1] - y) < 25,
        )
      )
        continue;
      beschriftet.push([x, y]);
      ctx.font = "20px sans-serif";
      ctx.lineWidth = 4;
      ctx.strokeStyle = dark ? "#263b33" : "#f5f2e9";
      ctx.strokeText(p.name, x, y);
      ctx.fillStyle = dark ? "#becabe" : "#70796d";
      ctx.fillText(p.name, x, y);
    }
    for (const [i, p] of r.personen.entries()) {
      const [x, y] = pixel(p);
      ctx.fillStyle =
        r.typ === "finden"
          ? farben[i % farben.length]
          : dark
            ? "#fff"
            : "#263b33";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "bold 24px sans-serif";
      ctx.fillText(
        p.name,
        Math.max(8, Math.min(x + 9, 790 - ctx.measureText(p.name).width)),
        y - 9,
      );
    }
    if (r.typ === "finden") {
      const pins =
        auswahl && !vorschlaege.some((p) => p.id === auswahl.id)
          ? [...vorschlaege, auswahl]
          : vorschlaege;
      pins.forEach((p, i) => {
        const [x, y] = pixel(p),
          aktiv = p.id === auswahl?.id;
        ctx.beginPath();
        ctx.arc(x, y, aktiv ? 13 : 10, 0, Math.PI * 2);
        ctx.fillStyle = aktiv ? "#263b33" : "#faf8ef";
        ctx.fill();
        ctx.strokeStyle = "#263b33";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = aktiv ? "#fff" : "#263b33";
        ctx.textAlign = "center";
        ctx.font = "bold 14px sans-serif";
        ctx.fillText(i < vorschlaege.length ? String(i + 1) : "✓", x, y + 5);
        ctx.textAlign = "left";
        if (aktiv) {
          ctx.font = "bold 21px sans-serif";
          ctx.lineWidth = 4;
          ctx.strokeStyle = dark ? "#263b33" : "#f5f2e9";
          const textX = Math.max(
            8,
            Math.min(x + 17, 790 - ctx.measureText(p.name).width),
          );
          ctx.strokeText(p.name, textX, y + 30);
          ctx.fillStyle = dark ? "#fff" : "#263b33";
          ctx.fillText(p.name, textX, y + 30);
        }
      });
    }
    if (auswahl && r.typ !== "finden") {
      const [x, y] = pixel(auswahl);
      ctx.strokeStyle = dark ? "#fff" : "#182a22";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  canvas.onwheel = (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const b = canvas.getBoundingClientRect(),
      x = ((e.clientX - b.left) * 800) / b.width,
      y = ((e.clientY - b.top) * 900) / b.height,
      z = Math.max(1, Math.min(12, view.z * (e.deltaY < 0 ? 1.2 : 1 / 1.2))),
      f = z / view.z;
    view = { z, x: x - (x - view.x) * f, y: y - (y - view.y) * f };
    zeichnen();
  };
  canvas.onpointerdown = (e) => {
    const b = canvas.getBoundingClientRect();
    drag = {
      x: e.clientX,
      y: e.clientY,
      vx: view.x,
      vy: view.y,
      sx: 800 / b.width,
      sy: 900 / b.height,
      moved: false,
    };
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.moved) {
      view.x = drag.vx + dx * drag.sx;
      view.y = drag.vy + dy * drag.sy;
      zeichnen();
    }
  };
  canvas.onpointerup = (e) => {
    if (drag?.moved) {
      drag = null;
      return;
    }
    drag = null;
    const b = canvas.getBoundingClientRect(),
      x = ((e.clientX - b.left) * 800) / b.width,
      y = ((e.clientY - b.top) * 900) / b.height;
    let best,
      dist = 10;
    for (const s of r.typ === "finden" ? vorschlaege : punkte) {
      const [a, b] = pixel(s),
        d = Math.hypot(x - a, y - b);
      if (d < dist) {
        best = s;
        dist = d;
      }
    }
    if (best) waehlen(best);
  };
  canvas.onpointercancel = () => {
    drag = null;
  };
  canvas.ondblclick = () => {
    view = { z: 1, x: 0, y: 0 };
    zeichnen();
  };
  const zoom = (f) => {
    const z = Math.max(1, Math.min(12, view.z * f)),
      t = z / view.z;
    view = { z, x: 400 - (400 - view.x) * t, y: 450 - (450 - view.y) * t };
    zeichnen();
  };
  $("atlas-zoom-in").onclick = () => zoom(1.3);
  $("atlas-zoom-out").onclick = () => zoom(1 / 1.3);
  $("atlas-reset").onclick = canvas.ondblclick;
  r.neuzeichnen = zeichnen;
  r.zeigeStrecken = (reisen, id, gebiet = null) => {
    if (id !== r.auswahlId) return;
    if (r.typ === "finden") {
      $("atlas-aktuell").innerHTML =
        "<strong>Aktuell geprüft (ab Wunschabfahrt):</strong><br>" +
        r.personen.map((p, i) => `${esc(p.name)}: ${reisen[i] ? zeit((Date.parse(reisen[i].endTime) - Date.parse(r.opt.zeit)) / 60000) : "keine Verbindung"}`).join("<br>") +
        "<br>Verspätungen können andere Anschlüsse ermöglichen oder verhindern. Die Rangfolge oben bleibt die des Sollfahrplans.";
    }
    r.strecken = reiseStrecken(reisen);
    if (gebiet !== null) r.strecken.forEach((s) => (s.person = gebiet));
    $("atlas-routenstatus").textContent = r.strecken.length
      ? `${reisen.filter(Boolean).length} ${r.typ === "finden" ? "Anreisen" : "Verbindung"} auf der Karte · ${r.strecken.filter((s) => !s.fuss).length} Fahrtabschnitte.`
      : "Der Fahrplandienst liefert für diese Auswahl keine darstellbare Streckengeometrie.";
    zeichnen();
  };
  liste();
  zeichnen();
  if (r.typ === "finden" && punkte.length) waehlen(punkte[0], false);
  else
    $("atlas-auswahl").innerHTML =
      '<p class="hint">Haltestelle auf der Karte oder in der Liste wählen. Mit +/− zoomen, mit Ziehen verschieben. Normales Scrollen bewegt die Seite; Strg/⌘ + Scrollen zoomt die Karte.</p>';
}
