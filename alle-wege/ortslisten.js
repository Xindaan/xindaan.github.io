// Gemeinsame Wertelogik fuer einzeln hinzugefuegte Ortsnamen und alte Ansichtslinks.
export function ortsnamen(text) {
  return String(text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}
export function ergaenzeOrt(text, name, maximum = 8) {
  const namen = ortsnamen(text);
  if (namen.includes(name)) throw new Error(`${name} ist schon ausgewählt.`);
  if (namen.length >= maximum)
    throw new Error(
      `Höchstens ${maximum} Orte. Bitte zuerst einen Ort entfernen.`,
    );
  return [...namen, name].join("\n");
}
