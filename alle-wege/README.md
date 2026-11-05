# Alle Wege · Deutschland

Deutschsprachiger Strassen- und Fahrplanatlas: Erreichbarkeit von/nach einem Ort, faire Treffpunkte, Einzugsgebiete und Lebensorte (welcher Wohnort liegt am guenstigsten zu den Menschen, die man besucht, und was aendert ein Umzug).

**Website:** https://xindaan.github.io/alle-wege/

## Lokal starten

```sh
python3 -m http.server 8765
```

Dann http://localhost:8765/ oeffnen. Alle Dateien sind statisch, ohne Build oder Abhaengigkeiten. HTML, CSS, JavaScript und Daten verwenden relative Pfade und funktionieren auch in Unterordnern.

## Bedienung

- Strasse: Ort, Richtung und Zeitbudget waehlen. **Fahrzeit** beantwortet, wie weit man kommt; **Hauptaeste** zeigt, welche Routen sich buendeln. Beide gehoeren zur Ansicht **Erreichbarkeit**; die Seite startet mit Hauptaesten ueber ganz Deutschland.
- Bahn & Bus: Datum, Uhrzeit, Richtung und Umstiege festlegen, dann berechnen. Graue Linien sind ein vereinfachtes Orientierungsnetz. Auswahl einer Haltestelle zeichnet die vom Fahrplandienst gelieferten Fahrtabschnitte ein; gestrichelt sind Fusswege.
- Ortsauswahl bei Bahn wie bei Strasse: Orte einzeln suchen, mit Enter/Pfeil hinzufuegen und ueber × entfernen. Das gilt auch fuer Zentren und eigene Treffpunkte.
- Bahn-Treffpunkte: bester gemeinsamer Haltepunkt und bis zu vier Alternativen mit mindestens 20 km Abstand. Nummern entsprechen der Liste; Linienfarben den Startorten. Die Anreisen zum besten Vorschlag werden automatisch nach der Suche geladen.
- Die Treffpunkt-Rangfolge minimiert die laengste Anreise, danach die Summe. Sie garantiert keine gleich langen Fahrten oder praktische Eignung des Ortes.

Wenn im Sollfahrplan kein gemeinsamer Treffpunkt innerhalb des Zeitlimits liegt, wird dies mit einer Erklaerung angezeigt. Die naechste Zeitstufe kann direkt neu berechnet werden; das urspruengliche Limit wird nicht still erweitert.

Heidesee nutzt Friedersdorf als Bezugspunkt und den dortigen Bahnhof. Weitere Ortsteile lassen sich im Strassenatlas auf der Karte waehlen. Persoenliche Katalogergaenzungen bleiben aus Standardvorschlaegen heraus.

## Daten, Lizenzen und Grenzen

Der Anwendungscode steht unter [MIT](LICENSE.txt). Keine fremden App-Quelltexte wurden uebernommen.

- Strassennetz: © [OpenStreetMap-Mitwirkende](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Auch die abgeleitete Datenbank [roads.json.gz](data/roads.json.gz) steht unter ODbL. Herkunft, Modellgeschwindigkeiten und Grenzen: [metadata.json](data/metadata.json).
- Orte: [GeoNames](https://www.geonames.org/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), ergaenzt um OpenStreetMap-Orte. OSM-Ergaenzungen sind mit `osm-`-IDs gekennzeichnet.
- Grenzen und vereinfachtes Bahnnetz: [Natural Earth](https://www.naturalearthdata.com/), Public Domain. Bahnnetz-Quelldatei, Abrufdatum und Hash stehen in [rail-network.json](data/rail-network.json). Dieses generalisierte Netz bestimmt keine Erreichbarkeit und ist nicht vollstaendig.
- Bahn und Bus: [Transitous](https://transitous.org/), [Datenquellen und Lizenzen](https://transitous.org/sources/). Atlas und Treffpunktrangfolge verwenden den Sollfahrplan, Details verfuegbare Echtzeitdaten. [API-Regeln](https://transitous.org/api/): nichtkommerziell, Open Source, ressourcenschonende Nutzung. Breite oder automatisierte Nutzung vorher mit dem Betreiber abstimmen. Die Anwendung begrenzt neue Fahrplanabfragen auf 40 pro Browser und Tag; dies ist keine dienstweite Lastbegrenzung.
- Fonts: DM Sans und Libre Caslon Display, SIL Open Font License; Lizenztexte unter `fonts/`.

Strassenzeiten sind Modellwerte ohne Liveverkehr, Ampelwartezeit, Abbiegeverbote und vollstaendige lokale Strassen. Autobahnen: 130 km/h, begrenzt durch niedrigere erfasste Limits. Sylt-Autozug: 35 Minuten Fahrt + 45 Minuten Terminalpuffer. Sylt-Faehre: 40 + 30 Minuten, inklusive Strassenanschluss ueber Daenemark. Ueberfahrten ohne Fahrplan-, Kapazitaets- oder Nachtbetriebsmodell; Fahrzeiten und feste Terminalpuffer werden automatisch eingerechnet, ohne eigene Insel-Einstellungen. Quellen dazu in `metadata.json`.

Strassenrouting rechnet lokal. Explizite Bahnsuchen uebertragen Orte und Reiseparameter an Transitous. Keine Tracker, keine Standortabfrage; nur der Kontingentzaehler wird lokal gespeichert. Ansichtslinks enthalten die gewaehlten Eingaben und starten keine Bahnsuche beim Oeffnen.

## Idee und Kontakt

Inspiriert von [All Roads Lead To](https://all-roads-lead-to.netlify.app/), von Ethan Mollick vorgestellt und seinerseits von Arterial Mapping inspiriert. Eigenstaendige Umsetzung fuer Deutschland.

[Kontakt / Fehler melden](https://github.com/Xindaan/xindaan.github.io/issues)
