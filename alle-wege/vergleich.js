// Gemeinsame Auswahl ueber URL tragen; keine Speicherung persoenlicher Orte.
export function leseZustand(hash, schluessel) {
  try {
    const wert = new URLSearchParams(hash.replace(/^#/, "")).get(schluessel);
    if (!wert || wert.length > 24000) return null;
    const s = JSON.parse(wert);
    return s && typeof s === "object" && !Array.isArray(s) ? s : null;
  } catch { return null; }
}
export function vergleichLink(ziel, strasse, bahn) {
  const p = new URLSearchParams({ v: "1", s: JSON.stringify(strasse), bahn: JSON.stringify(bahn) });
  return `${ziel}#${p}`;
}
const namen = (text) => String(text || "").split("\n").map((s) => s.trim()).filter(Boolean);
const bahnName = (c, orte) => c.name + (orte.filter((p) => p.name === c.name).length > 1 ? ` (${c.state})` : "");
const ortNachName = (name, orte) => orte.find((c) => bahnName(c, orte) === name || c.label === name) || orte.find((c) => c.name === name);
const ortIds = (text, orte) => namen(text).map((n) => {
  const c = ortNachName(n, orte);
  if (!c) throw new Error(`„${n}“ zuerst aus dem Ortsverzeichnis auswählen.`);
  return c.id;
});

export function strasseZuBahn(s, orte, alt = {}) {
  const neu = { ...alt, theme: s.theme, auswahl: { ...alt.auswahl }, uebernahme: "", objective: s.objective || "fair" };
  const c = orte.find((c) => c.id === s.destination);
  const ortListe = (ids) => ids.map((id) => orte.find((c) => c.id === id)).filter(Boolean).map((c) => bahnName(c, orte)).join("\n");
  neu.art = s.mode === "meet" ? "finden" : s.mode === "basins" ? "gebiete" : "reichweite";
  neu.personen = ortListe(s.travelers || []);
  neu.zentren = ortListe(s.seeds || s.centers || []);
  neu["atlas-richtung"] = s.direction === "to" ? "nach" : "von";
  neu.horizont = String(s.limit > 0 ? s.limit * 60 : 480);
  neu.unbegrenztUebernommen = !s.limit;
  if (!s.limit) neu.uebernahme = "Straße ohne Zeitlimit: Die Bahn-Suche ist auf höchstens 8 Stunden begrenzt. Für den Rückwechsel bleibt die unbegrenzte Straßenansicht erhalten, solange du das Zeitlimit nicht änderst.";
  if (s.metric === "distance" && s.mode !== "meet") {
    neu.horizont = alt.horizont || "120";
    neu.uebernahme = "Die Bahn vergleicht Reisezeit statt Straßenentfernung. Das vorherige Straßenmodell bleibt beim Rückwechsel erhalten.";
  }
  neu.strassenBudget = { horizont: neu.horizont, limit: s.limit, metric: s.metric };
  if (c) neu["atlas-ort"] = bahnName(c, orte);
  delete neu.auswahl["atlas-ort"];
  if (s.point) {
    neu["atlas-ort"] = "Übernommener Kartenpunkt";
    neu.auswahl["atlas-ort"] = { name: neu["atlas-ort"], key: "kartenpunkt", punkt: true, lon: s.point[0], lat: s.point[1] };
  }
  // Detailansichten beim reinen Hin-/Rueckwechsel erhalten.
  if (alt.rueckvergleich && JSON.stringify(alt.rueckvergleich) === JSON.stringify(strassenAuswahl(s))) {
    return { ...alt, theme: s.theme };
  }
  return neu;
}
function strassenAuswahl(s) {
  return { mode: s.mode, direction: s.direction, destination: s.destination, point: s.point || null,
    travelers: s.travelers || [], centers: s.centers || [], limit: s.limit, objective: s.objective || "fair" };
}
export function bahnZuStrasse(b, orte, alt = {}) {
  const neu = { ...alt, theme: b.theme, meeting: null };
  const horizon = Number(b.horizont);
  if (Number.isFinite(horizon) && horizon >= 30 && horizon <= 480) neu.limit = horizon / 60;
  if (b.unbegrenztUebernommen && horizon === 480 && alt.limit === 0) neu.limit = 0;
  if (b.strassenBudget?.metric === "distance" && b.strassenBudget.horizont === b.horizont) {
    neu.metric = "distance"; neu.limit = b.strassenBudget.limit;
  } else neu.metric = "time";
  neu.objective = b.objective === "total" ? "total" : "fair";
  neu.travelers = ortIds(b.personen, orte);
  neu.direction = b["atlas-richtung"] === "nach" ? "to" : "from";
  neu.mode = ["finden", "treffen"].includes(b.art) ? "meet" : b.art === "gebiete" ? "basins" : "reach";
  if (neu.mode === "basins") {
    neu.centers = ortIds(b.zentren, orte);
    neu.basinCount = neu.centers.length;
  }
  const feld = b.art === "route" ? "nach" : "atlas-ort";
  const c = ortNachName(b[feld], orte);
  const p = b.auswahl?.[feld];
  if (c) { neu.destination = c.id; neu.point = null; }
  else if (p && p.name === b[feld] && Number.isFinite(p.lon) && Number.isFinite(p.lat)) {
    neu.point = [p.lon, p.lat];
    neu.uebernahme = "Die übernommene Haltestelle wird im Straßenmodell an den nächsten Netzknoten angebunden.";
  } else if (["reichweite", "effekt", "route"].includes(b.art)) {
    throw new Error("Bitte zuerst einen Ort oder eine Haltestelle auswählen.");
  }
  // Hauptaeste und unbegrenztes Netz bei unveraendertem Vergleich behalten.
  if (alt.mode === "one" && neu.mode === "reach") neu.mode = "one";
  if (b.art === "route") {
    neu.uebernahme = "Straße zeigt die Erreichbarkeit zum gewählten Ziel; die einzelne Bahnverbindung bleibt für den Rückwechsel erhalten.";
    neu.direction = "to";
  }
  if (b.art === "treffen") neu.uebernahme = "Die Straßenansicht sucht Treffpunkte im Ortskatalog. Deine eigenen Bahn-Ziele bleiben für den Rückwechsel erhalten.";
  return { strasse: neu, bahn: { ...b, rueckvergleich: strassenAuswahl(neu) } };
}
