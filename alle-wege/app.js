import { STANDARDORTE } from "./standardorte.js";
import { leseZustand, vergleichLink, strasseZuBahn } from "./vergleich.js?v=20261104-1";
import { gueltigesTempo, modellTempo } from "./autobahntempo.js";
let bahnStand = {};
const $ = (id) => document.getElementById(id),
  esc = (s) =>
    String(s).replace(
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
const nf = new Intl.NumberFormat("de-DE"),
  palette = [
    "#a9674c",
    "#517a78",
    "#7a7d48",
    "#8580a1",
    "#b79247",
    "#527c9e",
    "#b57f82",
    "#67926c",
    "#aa6d8d",
    "#7c8e98",
    "#ac865c",
    "#839d52",
    "#6177a9",
    "#bd7060",
    "#6c9e93",
    "#9f9c68",
    "#948398",
    "#a59b84",
    "#6e816b",
    "#a08873",
  ];
const bright = [
  "#e9a67d",
  "#7fbdb7",
  "#bcc183",
  "#b9a6d8",
  "#d7be75",
  "#8db8dd",
  "#dfa1a7",
  "#9ac49c",
  "#d894b9",
  "#a6c1c9",
  "#d5b28a",
  "#b7cf86",
  "#a0b0df",
  "#e0a08b",
  "#93cabb",
  "#ccca99",
  "#bca6c2",
  "#c6bbaa",
  "#a0b99a",
  "#c6af98",
];
let data,
  borders,
  worker,
  result,
  requestId = 0,
  computeMs = 0,
  animation = 0,
  toastTimer,
  ready = false,
  computing = false,
  worldEdges = [],
  nodeXY = [],
  view = { zoom: 1, dx: 0, dy: 0 },
  mapBox = {},
  drag = null,
  frame = 0;
let state = {
  mode: "one", // Standard: Hauptaeste (Andre 2026-11-05), Fahrzeit per Kartenbild-Auswahl
  direction: "from",
  destination: "2950159",
  node: 0,
  point: null,
  metric: "time",
  weight: "nodes",
  limit: 0, // Hauptaeste ueber ganz Deutschland; Fahrzeit setzt beim Wechsel 2 Std.
  branches: 6,
  theme: "paper",
  travelers: [],
  objective: "fair",
  meeting: null,
  seeds: [],
  basinCount: 10,
  sylt: "both",
  transferWait: 0,
  autobahnTempo: 130,
  centers: [],
};
const project = (lon, lat) => [(lon - 10.5) * 69.98, (55.15 - lat) * 111.2];
const unproject = (x, y) => [x / 69.98 + 10.5, 55.15 - y / 111.2];
const duration = (m) =>
  !Number.isFinite(m)
    ? "nicht erreichbar"
    : m < 1
      ? "< 1 Min."
      : m < 60
        ? `${Math.round(m)} Min.`
        : `${Math.floor(Math.round(m) / 60)} Std. ${String(Math.round(m) % 60).padStart(2, "0")} Min.`;
const valueFmt = (v) =>
  state.metric === "distance" && state.mode !== "reach"
    ? `${nf.format(Math.round(v))} km`
    : duration(v);
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 4500);
}
function city(id) {
  return data.cities.find((c) => c.id === id);
}
function label(c) {
  return c?.label || c?.name || "Kartenpunkt";
}
const norm = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .trim();
function findCity(q) {
  const needle = norm(q);
  return (
    data.cities.find((c) => norm(c.label) === needle) ||
    data.cities.find((c) => norm(c.name) === needle)
  );
}
function nearest(x, y) {
  let best = -1,
    bd = Infinity;
  for (let i = 0; i < nodeXY.length; i++) {
    const a = nodeXY[i][0] - x,
      b = nodeXY[i][1] - y,
      d = a * a + b * b;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return { node: best, km: Math.sqrt(bd) };
}
function destinationLabel() {
  if (!state.point) return label(city(state.destination));
  const [x, y] = project(...state.point);
  let near = data.cities.reduce((a, b) =>
    Math.hypot(...project(b.lon, b.lat).map((v, i) => v - [x, y][i])) <
    Math.hypot(...project(a.lon, a.lat).map((v, i) => v - [x, y][i]))
      ? b
      : a,
  );
  return `bei ${near.name}`;
}
function serialize() {
  const s = { ...state };
  delete s.node;
  delete s.seeds;
  return vergleichLink("", s, bahnStand);
}
function readHash() {
  try {
    const p = new URLSearchParams(location.hash.slice(1));
    bahnStand = leseZustand(location.hash, "bahn") || {};
    if (!p.has("s")) return;
    const s = JSON.parse(p.get("s"));
    if (s.mode === "effect") s.mode = "reach";
    if (s.mode) state.direction = s.direction === "from" ? "from" : "to";
    if (["one", "meet", "basins", "reach"].includes(s.mode))
      state.mode = s.mode;
    if (city(s.destination)) state.destination = s.destination;
    if (["time", "distance"].includes(s.metric)) state.metric = s.metric;
    if (["nodes", "cities"].includes(s.weight)) state.weight = s.weight;
    if (["paper", "night", "ink"].includes(s.theme)) state.theme = s.theme;
    if (["fair", "total"].includes(s.objective)) state.objective = s.objective;
    if (gueltigesTempo(s.autobahnTempo)) state.autobahnTempo = s.autobahnTempo;
    state.centers = Array.isArray(s.centers) ? [...new Set(s.centers.filter((id) => city(id)))].slice(0, 20) : [];
    if (typeof s.uebernahme === "string") toast(s.uebernahme);
    // Alte Sonderoptionen normalisieren: alle hinterlegten Ueberfahrten automatisch.
    state.sylt = "both";
    state.transferWait = 0;
    for (const [k, lo, hi] of [
      ["limit", 0, 8],
      ["branches", 3, 10],
    ])
      if (Number.isFinite(s[k]) && (k === "limit" ? Number.isInteger(s[k] * 2) : Number.isInteger(s[k])) && s[k] >= lo && s[k] <= hi) state[k] = s[k];
    if ([5, 10, 20].includes(s.basinCount)) state.basinCount = s.basinCount;

    if (Array.isArray(s.travelers))
      state.travelers = [
        ...new Set(s.travelers.filter((id) => city(id))),
      ].slice(0, 8);
    state.meeting = city(s.meeting) ? s.meeting : null;
    state.point =
      Array.isArray(s.point) &&
      s.point.length === 2 &&
      s.point.every(Number.isFinite) &&
      s.point[0] >= 5 &&
      s.point[0] <= 16 &&
      s.point[1] >= 47 &&
      s.point[1] <= 56
        ? s.point
        : null;
  } catch {
    toast("Der Ansichtslink ist ungültig. Die Standardansicht wird geladen.");
  }
}
function sync() {
  if (state.mode === "reach" && !state.limit) state.limit = 2;
  $("kartenbild").value = state.mode === "one" ? "aeste" : "fahrzeit";
  $("kartenbild-controls").hidden = !["one", "reach"].includes(state.mode);
  $("richtung").value = state.direction;
  $("richtung-controls").hidden = !["one", "reach"].includes(state.mode);
  $("reach-results").hidden = state.mode !== "reach";
  $("reach").min = state.mode === "reach" ? "0.5" : "0";
  $("reach").step = "0.5";
  $("reach-min").textContent = state.mode === "reach" ? "30 Minuten" : "Gesamt";

  document.body.dataset.theme = state.theme;
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        b.dataset.mode === state.mode ||
          (b.dataset.mode === "reach" && state.mode === "one"),
      ),
    );
  document
    .querySelectorAll("#metric button")
    .forEach((b) =>
      b.setAttribute("aria-pressed", b.dataset.value === state.metric),
    );
  document
    .querySelectorAll("[data-theme]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", b.dataset.theme === state.theme),
    );
  $("destination-controls").hidden = !["one", "reach"].includes(state.mode);
  $("meet-controls").hidden = state.mode !== "meet";
  $("basin-controls").hidden = state.mode !== "basins";
  $("reach-controls").hidden = state.mode !== "reach";
  $("routing-controls").hidden = state.mode === "meet";
  $("branch-controls").hidden = state.mode !== "one";
  $("metric").hidden = ["reach", "meet"].includes(state.mode);
  $("metric").previousElementSibling.hidden = $("metric").hidden;
  $("linienstaerke-feld").hidden = state.mode === "meet";
  $("linienstaerke-hinweis").hidden = state.mode === "meet";
  $("play").hidden = state.mode === "meet";
  $("destination").value = destinationLabel();
  $("objective").value = state.objective;
  $("weight").value = state.weight;
  $("reach").value = state.limit;
  $("branches").value = state.branches;
  $("branch-value").textContent = state.branches;
  $("basin-custom").hidden = !state.centers.length;
  $("basin-custom").textContent = `${state.centers.length} übernommene Zentren`;
  $("basin-count").value = state.centers.length ? "custom" : state.basinCount;
  $("reach-value").textContent = state.limit
    ? state.metric === "time" || ["reach", "meet"].includes(state.mode)
      ? duration(state.limit * 60)
      : `${state.limit * 100} km`
    : "Ganzes Netz";
  $("reach-unit").textContent =
    state.metric === "time" || ["reach", "meet"].includes(state.mode) ? "8 Stunden" : "800 km";
  $("basin-controls").querySelector(".hint").textContent =
    state.centers.length ? "Dieselben Zentren wie in der Bahnansicht. Über die Auswahl oben kannst du wieder die größten Orte verwenden." : state.metric === "distance"
      ? "Jeder Netzknoten gehört zur Stadt mit der kürzesten Straßenentfernung. Städtauswahl nach GeoNames-Einwohnerzahl."
      : "Jeder Netzknoten gehört zur Stadt, die er am schnellsten erreicht. Städtauswahl nach GeoNames-Einwohnerzahl.";
  $("objective-hint").textContent =
    state.objective === "fair"
      ? "Die längste einzelne Anreise wird so kurz wie möglich. Die Suche vergleicht alle geladenen Orte, ohne Zeitlimit."
      : "Die Summe aller Anreisen wird so klein wie möglich. Die Suche vergleicht alle geladenen Orte, ohne Zeitlimit.";
  $("quick").innerHTML = STANDARDORTE.map((n) =>
    data.cities.find((c) => c.name === n),
  )
    .filter(Boolean)
    .map(
      (c) =>
        `<button data-city="${esc(c.id)}" aria-pressed="${!state.point && state.destination === c.id}">${c.name === "Frankfurt am Main" ? "Frankfurt" : esc(c.name)}</button>`,
    )
    .join("");
  $("travelers").innerHTML = state.travelers
    .map(
      (id, i) =>
        `<div class="traveler"><i style="background:${palette[i]}"></i><span>${esc(label(city(id)))}</span><button data-remove="${esc(id)}" aria-label="${esc(label(city(id)))} entfernen">×</button></div>`,
    )
    .join("");
  state.seeds = state.centers.length ? state.centers : data.cities.slice(0, state.basinCount).map((c) => c.id);
  $("autobahn-tempo").value = state.autobahnTempo;
  $("autobahn-tempo-wert").textContent = `${state.autobahnTempo} km/h`;
  $("autobahn-tempo-hinweis").textContent = `Tagesverkehr-Szenario: auf unbeschränkten Abschnitten rechnerisch ca. ${Math.round(modellTempo(state.autobahnTempo))} km/h im Mittel. Erfasste Tempolimits gelten weiter. Annahmen unter „Daten & Modell“.`;
  for (const a of document.querySelectorAll('[data-wechsel-bahn]'))
    a.href = vergleichLink("bahn.html", { ...state, node: undefined }, strasseZuBahn(state, data.cities, bahnStand));
  $("basin-legend").innerHTML = state.seeds
    .map(
      (id, i) =>
        `<span><i class="legend-dot" style="background:${(state.theme === "night" ? bright : palette)[i]}"></i>${esc(city(id).name)}</span>`,
    )
    .join("");
  $("controls").setAttribute("aria-busy", !ready);
  const ortHinweis = $("ort-hinweis");
  ortHinweis.hidden = !city(state.destination)?.source;
  ortHinweis.textContent = city(state.destination)?.island
    ? "Westerland ist einschließlich der hinterlegten Überfahrten angebunden."
    : state.destination === "osm-240120548"
      ? "Heidesee in Brandenburg. Bezugspunkt: Ortsteil Friedersdorf; weitere Ortsteile über die Karte wählen."
    : state.destination === "osm-240065786"
      ? "Lehnitz bei Oranienburg. Ortsstraßen sind erfasst."
      : state.destination === "osm-1502917951"
        ? "Burgk bei Schleiz. Ortsstraßen sind erfasst."
        : state.destination === "osm-832424012"
          ? "Zollgrün bei Tanna. Ortsstraßen sind erfasst."
          : "Ortsstraßen sind hier zusätzlich erfasst.";
}
function update({ recompute = true, save = true } = {}) {
  stopAnimation();
  sync();
  if (save) history.replaceState(null, "", serialize());
  if (recompute) {
    computing = true;
    $("export").disabled = true;
    $("play").disabled = true;
    $("performance").textContent = "Wege werden berechnet …";
    $("controls").setAttribute("aria-busy", "true");
    worker.postMessage({ type: "compute", id: ++requestId, state });
  } else {
    heading();
    draw();
  }
}
function selectDestination(c) {
  state.destination = c.id;
  state.node = c.node;
  state.point = null;
  zielAusschnitt();
  update();
}
function zielAusschnitt(
  w = $("map-wrap").clientWidth,
  h = $("map-wrap").clientHeight,
) {
  view = { zoom: 1, dx: 0, dy: 0 };
}
function setMode(mode) {
  state.mode = mode;
  if (mode === "reach") {
    state.metric = "time";
    if (!state.limit) state.limit = 2;
  }
  state.meeting = null;
  zielAusschnitt();
  update();
}
function heading() {
  const dest = destinationLabel();
  let title, kicker, subtitle;
  if (state.mode === "meet") {
    const c = result?.selected ? data.cities[result.selected.index] : null;
    title = c
      ? `Wir treffen uns in <em>${esc(c.name)}.</em>`
      : "Wo treffen wir uns?";
    kicker = "GEMEINSAM ANKOMMEN";
    subtitle =
      state.travelers.length < 2
        ? "Wähle mindestens zwei Startorte."
        : `${state.travelers.length} Startorte · ${state.objective === "fair" ? "Kürzeste maximale Anreise" : "Geringste Gesamtfahrzeit"} · ${nf.format(data.cities.length)} mögliche Orte`;
  } else if (state.mode === "basins") {
    title = `Deutschlands <em>Einzugsgebiete.</em>`;
    kicker = "WELCHE STADT IST AM NÄCHSTEN?";
    subtitle = `${state.seeds.length} Städte. ${state.metric === "time" ? "Die Fahrzeit" : "Die Straßenentfernung"} entscheidet über die Zugehörigkeit.`;
  } else if (state.mode === "reach") {
    title = `${duration(state.limit * 60)} ${state.direction === "from" ? "ab" : "nach"} <em>${esc(dest)}.</em>`;
    kicker = "WIE WEIT KOMME ICH IN DIESER ZEIT?";
    subtitle = `${state.direction === "from" ? "Ziele ab" : "Ausgangsorte mit Ziel"} ${dest} · schnellste Wege im Straßenmodell · Farben zeigen die Fahrzeit bis ${state.limit * 60} Minuten.`;
  } else {
    title = `Alle Wege ${state.direction === "from" ? "ab" : "nach"} <em>${esc(dest)}.</em>`;
    kicker =
      state.metric === "time"
        ? "DIE SCHNELLSTEN WEGE IM STRASSENMODELL"
        : "DIE KÜRZESTEN WEGE IM STRASSENMODELL";
    subtitle =
      state.direction === "from"
        ? "Ein Ausgangspunkt. Viele erreichbare Ziele."
        : "Viele Ausgangspunkte. Ein gemeinsames Ziel.";
  }
  $("map-title").innerHTML = title;
  $("map-kicker").textContent = kicker;
  $("map-subtitle").textContent = subtitle;
  document.title = `${state.mode === "meet" ? "Fairer Treffpunkt" : state.mode === "basins" ? "Einzugsgebiete" : dest} · Alle Wege`;
  if (!result || result.mode !== state.mode) return;
  let stats = [];
  if (state.mode === "meet") {
    const sel = result.selected;
    if (sel) {
      stats = [
        ["LÄNGSTE ANREISE", duration(sel.max), "Modellfahrzeit"],
        [
          "ALLE ANREISEN ZUSAMMEN",
          duration(sel.sum),
          "Summe über alle Startorte",
        ],
        ["UNTERSCHIED", duration(sel.spread), "Längste minus kürzeste Anreise"],
      ];
      $("meeting-results").innerHTML =
        `<label style="margin-top:20px">DIE BESTEN TREFFPUNKTE</label>` +
        result.candidates
          .map(
            (c, i) =>
              `<button class="meeting" data-meeting="${esc(data.cities[c.index].id)}" aria-pressed="${c.index === sel.index}"><strong>${i + 1}. ${esc(label(data.cities[c.index]))}</strong><span>Max. ${duration(c.max)} · Gesamt ${duration(c.sum)}</span>${
                c.index === sel.index
                  ? `<small>${state.travelers
                      .map((id, k) => {
                        const arten = [
                          ...new Set(
                            (result.paths[k] || [])
                              .map((e) => data.edges[e][8])
                              .filter(Boolean),
                          ),
                        ];
                        return `${esc(city(id).name)}: ${duration(c.times[k])}${arten.length ? ` · ${arten.map((a) => (a === "autozug" ? "Autozug" : "Autofähre")).join(" + ")}` : ""}`;
                      })
                      .join(
                        "<br>",
                      )}<br>Ortsanschluss: ${data.cities[c.index].snapKm.toLocaleString("de-DE")} km Luftlinie (nicht enthalten)</small>`
                  : ""
              }</button>`,
          )
          .join("");
    } else {
      $("meeting-results").innerHTML =
        state.travelers.length < 2
          ? '<p class="hint">Füge mindestens zwei verschiedene Startorte hinzu.</p>'
          : '<p class="hint">Kein gemeinsamer Treffpunkt im geladenen Straßennetz. Bitte die Startorte prüfen.</p>';
      stats = [
        [
          "STARTORTE",
          String(state.travelers.length),
          state.travelers.length < 2
            ? "Mindestens zwei auswählen"
            : "Kein gemeinsames Ziel im Modell",
        ],
      ];
    }
  } else {
    stats = [
      [
        "ERREICHBARE ORTE",
        nf.format(result.samples.length),
        `Von ${nf.format(data.cities.length)} geladenen Orten`,
      ],
      [
        "MEDIANE ANREISE",
        valueFmt(result.median),
        state.limit
          ? "Über die Orte innerhalb des Zeitbudgets"
          : "Über alle Orte im gesamten Netz",
      ],
      [
        "STRAßENNETZ",
        nf.format(data.meta.nodes) + " Knoten",
        "Mit erfassten Fähren und Autozügen",
      ],
    ];
  }
  if (state.mode === "reach") zeigeReichweite();
  $("insights").innerHTML = stats
    .map(
      ([a, b, c]) =>
        `<div><span>${esc(a)}</span><strong>${esc(b)}</strong><small>${esc(c)}</small></div>`,
    )
    .join("");
  const colors =
    state.theme === "ink"
      ? ["#333"]
      : state.theme === "night"
        ? bright
        : palette;
  let legend = "";
  if (state.mode === "reach")
    legend =
      "<b>FAHRZEIT IM MODELL</b>" +
      Array.from(
        { length: 4 },
        (_, i) =>
          `<div class="key"><i style="background:${reiseColors()[i]}"></i>${i * state.limit * 15}–${(i + 1) * state.limit * 15} Min.</div>`,
      ).join("") +
      "<small>Grau: Netz außerhalb der Auswahl.<br>Keine Echtzeitverkehrsdaten.</small>";
  else if (state.mode === "meet")
    legend =
      "<b>ANREISEN ZUM TREFFPUNKT</b>" +
      state.travelers
        .map(
          (id, i) =>
            `<div class="key"><i style="background:${colors[i % colors.length]}"></i>${esc(city(id).name)}</div>`,
        )
        .join("");
  else if (state.mode === "basins")
    legend =
      state.theme === "ink"
        ? "<b>EINZUGSGEBIETE</b>Tinte zeigt die Wege ohne Farbzuordnung. Für Stadtfarben Papier oder Nacht wählen."
        : "<b>EINZUGSGEBIETE</b>Gleiche Farbe = gleiches Ziel.<br>Zuordnung über das Straßennetz.";
  else
    legend = `<b>ÄSTE DER SCHNELLSTEN WEGE</b>Farbe = großer Zufluss.<br>Neutral = gemeinsamer Stamm oder Nebenast.<br>Stärke = Anzahl der ${state.weight === "cities" ? "Orte" : "Netzknoten"}, deren Weg hier entlangführt.`;
  if (state.mode === "reach" && state.theme === "ink")
    legend = `<b>FAHRZEIT BIS ${state.limit * 60} MINUTEN</b>Tinte zeigt die erreichbaren Wege einfarbig.<br>Für Zeitfarben Papier oder Nacht wählen.`;
  $("map-legend").innerHTML = legend;
}
function reiseColors() {
  return state.theme === "night"
    ? ["#85c6b4", "#b8be83", "#dcc17d", "#de9870"]
    : ["#517a78", "#809252", "#b9a24f", "#b36345"];
}
function zeigeReichweite() {
  if (!result || result.mode !== "reach") return;
  const q = norm($("reach-filter").value);
  const treffer = result.samples.filter((s) =>
    norm(city(s.id).name).includes(q),
  );
  $("reach-list").innerHTML =
    `<p class="hint">${treffer.length} passende Orte · bis ${state.limit * 60} Minuten</p>` +
    treffer
      .slice(0, 20)
      .map(
        (s) =>
          `<div class="reichweiten-ort"><span>${esc(label(city(s.id)))}</span><b>${duration(s.value)}</b></div>`,
      )
      .join("") +
    (treffer.length > 20
      ? '<p class="hint">20 angezeigt. Mit der Suche weiter eingrenzen.</p>'
      : "");
}
function reichweitenAusschnitt() {
  const sichtbar = result.order.filter((u) => result.d[u] <= result.limit);
  if (!sichtbar.length) return;
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const u of sichtbar) {
    const [x, y] = nodeXY[u];
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const w = $("map-wrap").clientWidth,
    h = $("map-wrap").clientHeight;
  view = { zoom: 1, dx: 0, dy: 0 };
  const [basis] = setupTransform(w, h);
  view.zoom = Math.max(
    1,
    Math.min(
      12,
      Math.min(
        (w - 120) / Math.max(1, x1 - x0),
        (h - 110) / Math.max(1, y1 - y0),
      ) / basis,
    ),
  );
  const [scale, ox, oy] = setupTransform(w, h);
  view.dx = w / 2 - ox - ((x0 + x1) / 2) * scale;
  view.dy = h / 2 - oy - ((y0 + y1) / 2) * scale;
}
function setupTransform(w, h) {
  const bounds = { x0: -344, x1: 339, y0: 0, y1: 895 },
    pad = 26;
  let scale =
    Math.min(
      (w - 2 * pad) / (bounds.x1 - bounds.x0),
      (h - 2 * pad) / (bounds.y1 - bounds.y0),
    ) * view.zoom;
  const ox = w / 2 - ((bounds.x0 + bounds.x1) / 2) * scale + view.dx,
    oy = h / 2 - ((bounds.y0 + bounds.y1) / 2) * scale + view.dy;
  mapBox = { w, h, scale, ox, oy };
  return [scale, ox, oy];
}
function draw(target = $("map"), progress = 1, exporting = false) {
  if (!data || !result || computing || result.mode !== state.mode) return;
  const wrap = $("map-wrap");
  const w = exporting ? target.width : wrap.clientWidth,
    h = exporting ? target.height : wrap.clientHeight;
  const ratio = exporting ? 1 : Math.min(devicePixelRatio || 1, 2);
  if (!exporting) {
    target.width = Math.round(w * ratio);
    target.height = Math.round(h * ratio);
  }
  const ctx = target.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const css = getComputedStyle(document.body),
    paper = css.getPropertyValue("--paper").trim(),
    ink = css.getPropertyValue("--ink").trim(),
    muted = css.getPropertyValue("--muted").trim(),
    mapfill = css.getPropertyValue("--map").trim();
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  const previousBox = mapBox;
  const transform = setupTransform(w, exporting ? h - 160 : h);
  if (exporting) transform[2] += 110;
  const [scale, ox, oy] = transform;
  const xy = (x, y) => [ox + x * scale, oy + y * scale];
  for (const feature of borders.features) {
    const polys =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    ctx.beginPath();
    for (const poly of polys)
      for (const ring of poly) {
        ring.forEach((p, i) => {
          const [x, y] = xy(...project(...p));
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.closePath();
      }
    ctx.fillStyle = feature.properties.code === "DEU" ? mapfill : paper;
    ctx.fill("evenodd");
    ctx.strokeStyle = state.theme === "night" ? "#3a4a41" : "#d7d9cb";
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
  // Dezent sichtbares Netz; keine Kachel- oder Routing-API erforderlich.
  ctx.beginPath();
  for (let i = 0; i < worldEdges.length; i++) addEdge(ctx, i, scale, ox, oy);
  ctx.strokeStyle = state.theme === "night" ? "#34473d" : "#d8d8c9";
  ctx.lineWidth = 0.35;
  ctx.stroke();
  const colors =
    state.theme === "ink"
      ? ["#333"]
      : state.theme === "night"
        ? bright
        : palette;
  if (state.mode === "meet") {
    result.paths.forEach((path, i) => {
      ctx.beginPath();
      for (const id of path) addEdge(ctx, id, scale, ox, oy);
      ctx.strokeStyle = colors[i % colors.length];
      ctx.lineWidth = 2.4;
      ctx.lineJoin = "round";
      ctx.stroke();
    });
  } else {
    const buckets = new Map(),
      widths = [0.35, 0.55, 0.8, 1.15, 1.7, 2.5, 3.6],
      maxW = Math.max(
        1,
        ...Array.from(result.roots || []).map((i) => result.w[i]),
      );
    let maxD = 1;
    if (progress < 1)
      for (const i of result.order)
        if (Number.isFinite(result.d[i])) maxD = Math.max(maxD, result.d[i]);
    for (const u of result.order) {
      const e = result.edge[u];
      if (e < 0 || result.w[u] <= 0) continue;
      if (progress < 1 && result.d[u] < maxD * (1 - progress)) continue;
      let ci = result.colors[u];
      let color =
        ci < 0
          ? state.theme === "night"
            ? "#c7c8a2"
            : "#596350"
          : colors[ci % colors.length];
      if (state.mode === "reach") {
        const j = Math.min(3, Math.floor(result.d[u] / (state.limit * 15)));
        color = reiseColors()[j];
        if (state.theme === "ink") color = "#333";
      }
      const bin = Math.min(
        6,
        Math.floor((Math.log1p(result.w[u]) / Math.log1p(maxW)) * 6),
      );
      const key = color + "|" + bin;
      if (!buckets.has(key)) buckets.set(key, { color, bin, ids: [] });
      buckets.get(key).ids.push(e);
    }
    for (const b of [...buckets.values()].sort((a, b) => a.bin - b.bin)) {
      ctx.beginPath();
      for (const id of b.ids) addEdge(ctx, id, scale, ox, oy);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = widths[b.bin] * (exporting ? 1.7 : 1);
      ctx.globalAlpha = 0.88;
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const highlights = new Map();
  // Ueberfahrten als solche zeigen, ohne die Auswahl der Strassen zu aendern.
  const genutzt = new Set(
    state.mode === "meet"
      ? result.paths.flat()
      : result.order.filter((u) => result.w[u] > 0).map((u) => result.edge[u]),
  );
  ctx.setLineDash([5, 4]);
  for (let i = 0; i < data.edges.length; i++)
    if (data.edges[i][8] && genutzt.has(i)) {
      ctx.beginPath();
      addEdge(ctx, i, scale, ox, oy);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  ctx.setLineDash([]);
  if (state.mode === "meet") {
    state.travelers.forEach((id, i) =>
      highlights.set(id, { color: colors[i % colors.length], special: false }),
    );
    if (result.selected)
      highlights.set(data.cities[result.selected.index].id, {
        color: ink,
        special: true,
      });
  } else if (state.mode === "basins")
    state.seeds.forEach((id, i) =>
      highlights.set(id, { color: colors[i % colors.length], special: true }),
    );
  else if (!state.point)
    highlights.set(state.destination, { color: ink, special: true });
  const occupied = [];
  const drawLabel = (c, special = false, color = muted) => {
    const p = nodeXY[c.node],
      [x, y] = xy(...p);
    if (x < 15 || y < 15 || x > w - 15 || y > h - 15) return;
    const font = exporting ? 20 : special ? 12 : 9;
    ctx.font = `${special ? "600" : "400"} ${font}px 'DM Sans',sans-serif`;
    const text = c.name,
      tw = ctx.measureText(text).width,
      tx = x + 8,
      ty = y - 5,
      rect = [tx - 3, ty - font, tx + tw + 3, ty + 3];
    if (
      !special &&
      occupied.some(
        (r) =>
          rect[0] < r[2] && rect[2] > r[0] && rect[1] < r[3] && rect[3] > r[1],
      )
    )
      return;
    occupied.push(rect);
    ctx.beginPath();
    ctx.arc(x, y, special ? 4 : 1.8, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (special) {
      ctx.strokeStyle = paper;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    ctx.strokeStyle = paper;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = "round";
    ctx.strokeText(text, tx, ty);
    ctx.fillStyle = color;
    ctx.fillText(text, tx, ty);
  };
  for (const [id, h] of highlights) drawLabel(city(id), true, h.color);
  for (const c of data.cities.slice(0, view.zoom > 1.8 ? 65 : 24))
    if (!highlights.has(c.id)) drawLabel(c);
  if (state.point && state.mode !== "meet" && state.mode !== "basins") {
    const [x, y] = xy(...nodeXY[state.node]);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.moveTo(x - 12, y);
    ctx.lineTo(x + 12, y);
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x, y + 12);
    ctx.stroke();
  }
  // Massstab in Projektionskilometern (naeherungsweise bei 51 N).
  const bar = 100 * scale;
  if (bar < w * 0.3) {
    ctx.strokeStyle = muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w - 30 - bar, h - 20);
    ctx.lineTo(w - 30, h - 20);
    ctx.stroke();
    ctx.font = "8px sans-serif";
    ctx.fillStyle = muted;
    ctx.textAlign = "center";
    ctx.fillText("ca. 100 km", w - 30 - bar / 2, h - 27);
    ctx.textAlign = "left";
  }
  if (exporting) {
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, 98);
    ctx.fillRect(0, h - 38, w, 38);
    ctx.fillStyle = ink;
    ctx.font = "32px Georgia";
    ctx.fillText($("map-title").textContent, 30, 43);
    ctx.font = "12px sans-serif";
    ctx.fillStyle = muted;
    ctx.fillText($("map-subtitle").textContent, 30, 68);
    ctx.fillText(
      "Alle Wege · Deutschland | Modellzeiten ohne Liveverkehr",
      30,
      87,
    );
    ctx.fillText(
      "© OpenStreetMap-Mitwirkende · openstreetmap.org/copyright | GeoNames CC BY 4.0 | Natural Earth",
      25,
      h - 15,
    );
    mapBox = previousBox;
  }
}
function addEdge(ctx, id, s, ox, oy) {
  const shape = worldEdges[id];
  ctx.moveTo(ox + shape[0] * s, oy + shape[1] * s);
  for (let k = 2; k < shape.length; k += 2)
    ctx.lineTo(ox + shape[k] * s, oy + shape[k + 1] * s);
}
function scheduleDraw() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => draw());
}
function stopAnimation() {
  cancelAnimationFrame(animation);
  animation = 0;
  $("play").textContent = "▷";
}
function animate() {
  if (animation) {
    stopAnimation();
    draw();
    return;
  }
  if (!result || computing || state.mode === "meet") return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    toast(
      "Animation ist wegen deiner Einstellung für reduzierte Bewegung ausgeschaltet.",
    );
    return;
  }
  const t = performance.now();
  $("play").textContent = "Ⅱ";
  const tick = (now) => {
    const p = Math.min(1, (now - t) / 2400);
    draw($("map"), p);
    if (p < 1) animation = requestAnimationFrame(tick);
    else stopAnimation();
  };
  animation = requestAnimationFrame(tick);
}
function addTraveler() {
  const c = findCity($("traveler").value);
  if (!c) {
    toast("Bitte einen Ort aus der Vorschlagsliste auswählen.");
    return;
  }
  if (state.travelers.includes(c.id)) {
    toast("Dieser Startort ist schon dabei.");
    return;
  }
  if (state.travelers.length >= 8) {
    toast("Bis zu acht Startorte sind möglich.");
    return;
  }
  state.travelers.push(c.id);
  state.meeting = null;
  $("traveler").value = "";
  update();
}
// Schaltflaeche "Erreichbarkeit": aktuelles Kartenbild behalten, sonst Hauptaeste.
function erreichbarkeitsBild() {
  return ["one", "reach"].includes(state.mode) ? state.mode : "one";
}
function wire() {
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => (b.onclick = () => setMode(b.dataset.mode === "reach" ? erreichbarkeitsBild() : b.dataset.mode)));
  document.querySelectorAll("#metric button").forEach(
    (b) =>
      (b.onclick = () => {
        state.metric = b.dataset.value;
        update();
      }),
  );
  document.querySelectorAll("[data-theme]").forEach(
    (b) =>
      (b.onclick = () => {
        state.theme = b.dataset.theme;
        update({ recompute: false });
      }),
  );
  const pick = () => {
    const c = findCity($("destination").value);
    if (c) selectDestination(c);
    else toast("Bitte einen Ort aus der Vorschlagsliste auswählen.");
  };
  $("destination-go").onclick = pick;
  $("destination").onchange = pick;
  $("destination").onkeydown = (e) => {
    if (e.key === "Enter") pick();
  };
  $("quick").onclick = (e) => {
    const b = e.target.closest("[data-city]");
    if (b) selectDestination(city(b.dataset.city));
  };
  $("traveler-add").onclick = addTraveler;
  $("traveler").onkeydown = (e) => {
    if (e.key === "Enter") addTraveler();
  };
  $("travelers").onclick = (e) => {
    const b = e.target.closest("[data-remove]");
    if (b) {
      state.travelers = state.travelers.filter((x) => x !== b.dataset.remove);
      state.meeting = null;
      update();
    }
  };
  $("objective").onchange = (e) => {
    state.objective = e.target.value;
    state.meeting = null;
    update();
  };
  $("meeting-results").onclick = (e) => {
    const b = e.target.closest("[data-meeting]");
    if (b) {
      state.meeting = b.dataset.meeting;
      update();
    }
  };
  $("weight").onchange = (e) => {
    state.weight = e.target.value;
    update();
  };
  $("kartenbild").onchange = (e) =>
    setMode(e.target.value === "aeste" ? "one" : "reach");
  $("richtung").onchange = (e) => {
    state.direction = e.target.value;
    update();
  };
  $("reach-filter").oninput = zeigeReichweite;
  $("reach").oninput = (e) => {
    state.limit = Number(e.target.value);
    update();
  };
  $("autobahn-tempo").oninput = (e) => {
    state.autobahnTempo = Number(e.target.value);
    state.meeting = null;
    update();
  };
  $("branches").oninput = (e) => {
    state.branches = Number(e.target.value);
    update();
  };
  $("basin-count").onchange = (e) => {
    state.centers = [];
    state.basinCount = Number(e.target.value);
    update();
  };
  $("about-open").onclick = () => $("about").showModal();
  $("about-close").onclick = () => $("about").close();
  $("about").onclick = (e) => {
    if (e.target === $("about")) {
      const b = $("about").getBoundingClientRect();
      if (
        e.clientX < b.left ||
        e.clientX > b.right ||
        e.clientY < b.top ||
        e.clientY > b.bottom
      )
        $("about").close();
    }
  };
  $("share").onclick = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("Ansichtslink kopiert – er enthält deine ausgewählten Orte.");
    } catch {
      toast(
        "Kopieren nicht möglich. Die aktuelle Adresszeile enthält deinen Ansichtslink.",
      );
    }
  };
  $("export").onclick = () => {
    if (!result) return;
    const c = document.createElement("canvas");
    c.width = 2000;
    c.height = 2400;
    const old = view;
    zielAusschnitt(c.width, c.height - 160);
    draw(c, 1, true);
    view = old;
    draw();
    c.toBlob((blob) => {
      if (!blob) {
        toast("Der Export konnte nicht erstellt werden.");
        return;
      }
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `alle-wege-${state.mode}-${
        state.point
          ? "kartenpunkt"
          : city(state.destination)
              .name.toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
      }.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast("Die Karte wird als PNG gespeichert.");
    });
  };
  $("play").onclick = animate;
  const zoom = (f) => {
    stopAnimation();
    view.zoom = Math.max(1, Math.min(20, view.zoom * f));
    if (view.zoom === 1) view.dx = view.dy = 0;
    draw();
  };
  $("zoom-in").onclick = () => zoom(1.35);
  $("zoom-out").onclick = () => zoom(1 / 1.35);
  $("reset-map").onclick = () => {
    view = { zoom: 1, dx: 0, dy: 0 };
    draw();
  };
  const canvas = $("map");
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    },
    { passive: false },
  );
  canvas.onpointerdown = (e) => {
    if (e.button !== 0) return;
    drag = {
      x: e.clientX,
      y: e.clientY,
      dx: view.dx,
      dy: view.dy,
      moved: false,
      id: e.pointerId,
    };
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (drag) {
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 5) drag.moved = true;
      if (drag.moved) {
        view.dx = drag.dx + dx;
        view.dy = drag.dy + dy;
        scheduleDraw();
      }
      $("hover").hidden = true;
      return;
    }
    if (!result || computing || state.mode === "meet") return;
    const b = canvas.getBoundingClientRect(),
      x = e.clientX - b.left,
      y = e.clientY - b.top,
      n = nearest(
        (x - mapBox.ox) / mapBox.scale,
        (y - mapBox.oy) / mapBox.scale,
      );
    if (n.km > 12) {
      $("hover").hidden = true;
      return;
    }
    const val =
      valueFmt(result.d[n.node]) +
      (result.d[n.node] > result.limit ? " · außerhalb des Zeitbudgets" : "");
    $("hover").textContent = val + " · Modell";
    $("hover").style.left =
      Math.max(8, Math.min(x + 12, mapBox.w - 190)) + "px";
    $("hover").style.top = Math.max(5, y - 33) + "px";
    $("hover").hidden = false;
  };
  canvas.onpointerleave = () => ($("hover").hidden = true);
  canvas.onpointercancel = () => {
    drag = null;
  };
  canvas.onpointerup = (e) => {
    if (!drag) return;
    const clicked = !drag.moved;
    drag = null;
    if (!clicked || !["one", "reach"].includes(state.mode)) return;
    const b = canvas.getBoundingClientRect(),
      p = [
        (e.clientX - b.left - mapBox.ox) / mapBox.scale,
        (e.clientY - b.top - mapBox.oy) / mapBox.scale,
      ],
      n = nearest(...p);
    if (n.km > 20) {
      toast("Bitte einen Punkt nahe dem deutschen Straßennetz wählen.");
      return;
    }
    state.node = n.node;
    state.point = data.nodes[n.node];
    update();
  };
  new ResizeObserver(scheduleDraw).observe($("map-wrap"));
  window.onhashchange = () => {
    readHash();
    state.node = state.point
      ? nearest(...project(...state.point)).node
      : city(state.destination).node;
    zielAusschnitt();
    update({ save: false });
  };
}
async function init() {
  try {
    const responses = await Promise.all([
      fetch("data/roads.json.gz?v=9"),
      fetch("data/borders.json"),
    ]);
    for (const r of responses)
      if (!r.ok)
        throw new Error("Straßendaten nicht verfügbar (" + r.status + ")");
    const bytes = await responses[0].arrayBuffer();
    const sig = new Uint8Array(bytes, 0, 2);
    data = JSON.parse(
      sig[0] === 31 && sig[1] === 139
        ? await new Response(
            new Blob([bytes])
              .stream()
              .pipeThrough(new DecompressionStream("gzip")),
          ).text()
        : new TextDecoder().decode(bytes),
    );
    borders = await responses[1].json();
    const states = {
      "01": "Baden-Württemberg",
      "02": "Bayern",
      "03": "Bremen",
      "04": "Hamburg",
      "05": "Hessen",
      "06": "Niedersachsen",
      "07": "Nordrhein-Westfalen",
      "08": "Rheinland-Pfalz",
      "09": "Saarland",
      10: "Schleswig-Holstein",
      11: "Brandenburg",
      12: "Mecklenburg-Vorpommern",
      13: "Sachsen",
      14: "Sachsen-Anhalt",
      15: "Thüringen",
      16: "Berlin",
    };
    const duplicates = new Map();
    for (const c of data.cities)
      duplicates.set(c.name, (duplicates.get(c.name) || 0) + 1);
    for (const c of data.cities)
      c.label =
        c.name +
        (duplicates.get(c.name) > 1 ? ` (${states[c.state] || c.state})` : "");
    nodeXY = data.nodes.map((p) => project(...p));
    worldEdges = data.edges.map((e) => {
      const p = e[7],
        a = new Float32Array(p.length);
      for (let i = 0; i < p.length; i += 2) {
        const xy = project(p[i], p[i + 1]);
        a[i] = xy[0];
        a[i + 1] = xy[1];
      }
      return a;
    });
    const berlin =
      data.cities.find((c) => c.name === "Berlin") || data.cities[0];
    state.destination = berlin.id;
    state.travelers = ["Berlin", "Hamburg", "München"]
      .map((n) => data.cities.find((c) => c.name === n)?.id)
      .filter(Boolean);
    readHash();
    state.node = state.point
      ? nearest(...project(...state.point)).node
      : city(state.destination).node;
    zielAusschnitt();
    $("cities").innerHTML = data.cities
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label, "de"))
      .map((c) => `<option value="${esc(c.label)}"></option>`)
      .join("");
    $("data-state").textContent =
      `${nf.format(data.meta.nodes)} Knoten · OSM ${data.meta.osmTimestamp?.slice(0, 10) || data.meta.retrieved}`;
    $("data-details").textContent =
      `OSM-Datenstand: ${data.meta.osmTimestamp}. ${nf.format(data.meta.nodes)} Knoten, ${nf.format(data.meta.edges)} Straßenabschnitte, ${nf.format(data.cities.length)} angebundene Orte. Durch Autozug und Fähre verbundenes Netz; ${nf.format(data.meta.excludedNodes)} andere Knoten wurden ausgelassen. Einwohnerzahlen dienen nur der Auswahl der größten Orte; die zusätzlich aufgenommenen Orte sind davon unabhängig.`;
    worker = new Worker("worker.js?v=20261105-2", { type: "module" });
    worker.onmessage = ({ data: msg }) => {
      if (msg.type === "ready") {
        ready = true;
        wire();
        update();
      } else if (msg.type === "result" && msg.id === requestId) {
        result = msg.result;
        computing = false;
        $("export").disabled = false;
        $("play").disabled = false;
        computeMs = msg.ms;
        $("loading").hidden = true;
        $("controls").setAttribute("aria-busy", "false");
        if (state.mode === "reach") reichweitenAusschnitt();
        heading();
        draw();
        $("performance").textContent =
          `${computeMs} ms Rechenzeit · Modell ohne Liveverkehr`;
      } else if (msg.type === "error" && (!msg.id || msg.id === requestId)) {
        computing = false;
        toast("Die Berechnung ist fehlgeschlagen: " + msg.message);
        $("controls").setAttribute("aria-busy", "false");
        if (!result) {
          $("loading").innerHTML =
            "<b>Berechnung fehlgeschlagen.</b><p>Bitte die Seite neu laden.</p>";
        }
      }
    };
    worker.onerror = () => {
      $("loading").hidden = false;
      $("loading").innerHTML =
        "<b>Berechnung nicht verfügbar.</b><p>Bitte die Seite neu laden.</p>";
    };
    worker.postMessage({ type: "init", data });
  } catch (error) {
    $("loading").innerHTML =
      `<b>Das Netz konnte nicht laden.</b><p>${esc(error.message)}</p><button onclick="location.reload()" style="padding:10px">Erneut versuchen</button>`;
  }
}
$("about-open").onclick = () => $("about").showModal();
$("about-close").onclick = () => $("about").close();
$("export").disabled = true;
$("play").disabled = true;
init();
