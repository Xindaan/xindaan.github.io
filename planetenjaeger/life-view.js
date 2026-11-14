import { SPECIES, WINDOWS } from './lib/spectral-bands.js';
import { WORLDS, HOSTS, generateSpectrum, geometryAtWavelength, transitDuration, photonNoise } from './lib/atmosphere.js';
import { inferSpectrum } from './lib/spectral-inference.js';
import { drawAtmosphere, drawSpectrumChart, drawCoronagraph } from './life-visuals.js';
import { format } from './plots.js';

const GAS_NOTES = {
  water: ['Wasser ist eine Voraussetzung, keine Lebensmeldung.', 'Wasserdampf verrät etwas über die Atmosphäre. Ob unten ein flüssiger Ozean liegt, hängt auch von Temperatur, Druck und Wolken ab.', 'H₂O · 1,4 µm'],
  oxygen: ['Sauerstoff braucht eine Geschichte.', 'Photosynthese kann O₂ liefern. UV-Licht kann aber auch Wasser oder CO₂ spalten und Sauerstoff zurücklassen. Suche deshalb nach Begleitgasen und untersuche den Stern.', 'O₂ · 0,76 µm'],
  methane: ['Methan kann aus Zellen oder aus Gestein kommen.', 'CH₄ zusammen mit O₂ wäre eine interessante Kombination: Unter passenden Bedingungen müssen Quellen die reaktiven Gase nachliefern. Die nötigen Raten und unbelebte Quellen müsste man erst berechnen.', 'CH₄ · 3,3 µm'],
  carbon: ['Kohlendioxid liefert den chemischen Kontext.', 'CO₂ kommt auch auf unbelebten Welten vor. Es hilft, Atmosphäre und mögliche Klimabedingungen einzugrenzen. Das hier ist keine Temperaturmessung.', 'CO₂ · 4,3 µm'],
  monoxide: ['Eine Spur, die unsere erste Erklärung verändern kann.', 'CO zusammen mit CO₂ kann zu photochemischer Sauerstoffproduktion passen. Das ist ein Anlass, unbelebte Erklärungen sorgfältig zu prüfen, kein universeller Ausschluss von Leben.', 'CO · 4,65 µm'],
};
const CASE_NOTES = {
  mixture: 'Erfundene Gesteinswelt mit ausgeprägten Gasbanden. Die Mischung ist ein Gedankenexperiment, keine Kopie der heutigen Erdatmosphäre.',
  abiotic: 'Erfundener Gegenfall: Sauerstoff, CO und CO₂ aus einer angenommenen unbelebten Photochemie. Die Messung muss die Begleitgase erst erkennen.',
  cloudy: 'Dieselbe Gasmischung hinter einem hohen Wolkenschleier. Eine flache Messkurve kann die darunterliegende Atmosphäre verbergen.',
  bare: 'Kontrollversuch: eine undurchsichtige Gesteinsscheibe ohne Atmosphäre. Etwaige Zacken stammen hier aus der Messung.',
};
const VERDICTS = {
  weak: ['Die Daten lassen die Lebensfrage offen.', 'Zurzeit ist keine der modellierten Gasbanden ausreichend gestützt. Das kann an fehlenden Gasen, Wolken oder einer zu schwachen Messung liegen.', 'Mehr Photonen sammeln, Wolkenmodelle vergleichen und den Spektralbereich erweitern. Eine Nicht-Detektion schließt Leben nicht aus.'],
  atmosphere: ['Eine Atmosphäre zeichnet sich ab.', 'Mindestens ein Molekülmuster passt zur Messung. Ein einzelnes Gas erklärt jedoch noch nicht seine Herkunft.', 'Weitere Banden desselben Moleküls und andere Gase suchen. Sternaktivität und alternative Atmosphärenmodelle prüfen.'],
  interesting: ['Eine Mischung, die weitere Fragen verdient.', 'O₂ und CH₄ sind im Lehrmodell durch die Messung gestützt. Diese Kombination wäre interessant für eine Untersuchung chemischen Ungleichgewichts.', 'Quell- und Verlustraten berechnen, unbelebte Chemie testen, UV-Strahlung des Sterns messen und die Beobachtung unabhängig wiederholen.'],
  alternative: ['Eine unbelebte Erklärung wird wichtig.', 'O₂ und CO sind im Lehrmodell gestützt. Diese Kombination verlangt einen Vergleich mit photochemischen Szenarien.', 'CO₂-Photolyse und Wasserverlust mit dem UV-Spektrum des Sterns und weiteren Atmosphärenmerkmalen prüfen. Die Gase allein entscheiden die Lebensfrage nicht.'],
};

export function mountLifeView(container) {
  container.innerHTML = `
    <div class="life-opening"><div><p class="eyebrow">DIE NÄCHSTE FRAGE</p><h2>Ein Planet ist erst <em>der Anfang.</em></h2><p>Ein Hauch Atmosphäre verändert das Sternlicht. Was können wir daraus lesen?</p></div><span class="life-stamp">SYNTHETISCHES<br>SPEKTROSKOPIE-LABOR</span></div>
    <a class="mission-jump" href="#mission">Observatorien & eigene Mission erkunden ↗</a>
    <div class="life-worlds" aria-label="Atmosphären-Szenario">${Object.entries(WORLDS).map(([key,w],i)=>`<button data-world="${key}" aria-pressed="${i===0}"><span>0${i+1}</span>${w.label}</button>`).join('')}</div>
    <section class="life-hero" aria-label="Atmosphäre und Lichtweg">
      <div class="life-illustration"><canvas id="atmosphere-scene" role="img" aria-label="Illustration einer Gesteinswelt: Sternlicht durchquert die Atmosphäre und wird spektral zerlegt"></canvas><p class="life-scene-note">Gesteinswelt mit 1 Erdradius · zentraler Transit · Atmosphäre 100× überhöht · keine Aufnahme</p></div>
      <div class="life-story"><p class="eyebrow">STERNLICHT ALS BOTSCHAFTER</p><h3>Die Atmosphäre<br>als <em>Fingerabdruck.</em></h3><p>Manche Wellenlängen werden stärker absorbiert. Dort erscheint der Planet im Transit ein winziges Stück größer.</p><div class="life-wavelength"><label for="wavelength">Ein Lichtkanal<output id="wavelength-value"></output></label><input id="wavelength" type="range" min="0.6" max="5" step="0.01" value="1.4"><div><span>Sichtbar</span><span>Nahes Infrarot</span></div></div><div class="life-height"><strong id="annulus-value"></strong><span>zusätzliche Bedeckung im gewählten Modellkanal</span></div></div>
    </section>
    <p class="life-case-note" id="life-case-note"></p>
    <div class="life-lab-grid">
      <section class="life-spectrum-panel" aria-labelledby="spectrum-title"><div class="curve-header"><div><p class="eyebrow">01 / ATMOSPHÄRE LESEN</p><h2 id="spectrum-title">Was fehlt im Sternlicht?</h2></div><span class="life-live"><i class="dot mint"></i> Neu berechnet</span></div>
        <div class="life-gases" aria-label="Molekül erkunden">${Object.entries(SPECIES).map(([key,s],i)=>`<button data-gas="${key}" class="gas-${key}" aria-pressed="${i===0}">${s.symbol}<span>${s.name}</span></button>`).join('')}</div>
        <canvas id="atmosphere-spectrum" role="img" aria-label="Synthetische Transittiefe nach Wellenlänge mit Messfehlern und datenbasierter Anpassung"></canvas>
        <div class="life-spectrum-legend"><span><i class="dot mint"></i> Messung ± 1σ</span><span><i class="line gold"></i> Anpassung aus Messdaten</span><label><input id="life-fit-line" type="checkbox" checked> Fit anzeigen</label></div>
        <div class="life-gas-note"><span id="selected-band"></span><h3 id="gas-note-title"></h3><p id="gas-note-text"></p></div>
        <p class="life-precision">Zusätzliche Tiefe relativ zum geschätzten Kontinuum · 1 ppm = ein Millionstel Sternlicht. Bandlagen physikalisch orientiert; Stärken und Breiten vereinfacht.</p>
      </section>
      <aside class="life-instrument" aria-label="Beobachtung planen"><p class="eyebrow">02 / MESSUNG PLANEN</p><h2>Wie viel Licht brauchen wir?</h2>
        <label class="life-select" for="life-host">Zielstern<select id="life-host"><option value="dwarf">Kleiner roter Stern · 0,2 R☉</option><option value="sun">Sonnenähnlich · 1 R☉</option></select></label>
        <label class="control" for="mirror"><span>Spiegeldurchmesser<output id="mirror-value"></output></span><input id="mirror" type="range" min="2" max="12" step="0.5" value="8"></label>
        <label class="control" for="exposures"><span>Beobachtete Transits<output id="exposures-value"></output></span><input id="exposures" type="range" min="1" max="200" step="1" value="64"></label>
        <label class="control" for="life-distance"><span>Entfernung<output id="life-distance-value"></output></span><input id="life-distance" type="range" min="5" max="40" step="1" value="10"></label>
        <label class="control" for="clouds"><span>Wolkenschleier<output id="clouds-value"></output></span><input id="clouds" type="range" min="0" max="1" step="0.01" value="0.1"></label>
        <label class="life-select" for="spectral-window">Spektralbereich<select id="spectral-window"><option value="broad">Breit · 0,6–5 µm</option><option value="optical">Nur optisch · 0,6–1 µm</option><option value="infrared">Nur Infrarot · 1–5 µm</option></select></label>
        <label class="life-select" for="noise-floor">Stabilitätsgrenze<select id="noise-floor"><option value="0">Ideales Photonenlimit</option><option value="2" selected>2 ppm · ambitioniert</option><option value="8">8 ppm · begrenzt</option></select></label>
        <div class="life-cost"><strong id="observing-years"></strong><span id="observing-time"></span></div><button id="more-transits">Doppelt so viele Transits <span>↗</span></button><p class="life-instrument-note" id="instrument-limit"></p><p class="life-instrument-note">Hypothetisches Instrument bei R ≈ 90. Keine Leistungsprognose für Webb oder ein geplantes Teleskop.</p>
      </aside>
    </div>
    <section class="life-evidence" aria-live="polite" aria-labelledby="life-verdict"><div class="life-evidence-header"><div><p class="eyebrow">03 / BEFUNDE HINTERFRAGEN</p><h2 id="life-verdict"></h2></div><span class="life-unresolved">Herkunft offen</span></div><p id="life-verdict-text"></p><div class="life-findings" id="life-findings"></div><div class="life-next"><span>NÄCHSTER GUTER SCHRITT</span><p id="life-next-step"></p></div><div class="life-measurement-footer"><span>Bandtest ausschließlich aus Messwerten · keine Lebenswahrscheinlichkeit</span><button id="life-new-measurement">Neue Messrealisierung ↻</button><button id="life-reset">Experiment zurücksetzen</button></div></section>
    <section class="life-beyond"><div class="life-beyond-heading"><p class="eyebrow">WEITERGEDACHT</p><h2>Es gibt mehr als einen Weg, <em>hinzusehen.</em></h2></div><div class="life-beyond-grid">
      <article class="life-direct"><p class="eyebrow">DIREKTE ABBILDUNG</p><h3>Den Stern ausblenden.</h3><p>Ein Erde–Sonne-Analogon ist im sichtbaren Licht ungefähr zehn Milliarden Mal schwächer als sein Stern. Ein Koronograf unterdrückt dessen Licht.</p><canvas id="coronagraph" role="img" aria-label="Schematische Direktabbildung: Mit zunehmender Sternlichtunterdrückung wird ein Planet sichtbar"></canvas><label class="control" for="suppression"><span>Sternlicht unterdrücken<output id="suppression-value"></output></span><input id="suppression" type="range" min="0" max="10" step="1" value="3"></label><p class="life-direct-note" id="direct-status"></p><p class="life-precision">Eigenes Kontrast-Gedankenexperiment · logarithmische Helligkeitsdarstellung · keine Instrumentensimulation.</p></article>
      <article class="life-questions"><p class="eyebrow">WAS KÖNNTE UNS NOCH ETWAS VERRATEN?</p><details open><summary>Ozeane & Jahreszeiten <span>↗</span></summary><p>Reflektiertes Licht könnte Hinweise auf Wolken, eine glitzernde Oberfläche oder jahreszeitliche Veränderungen geben. Auch Mineralien und Wetter verändern Spektren. Entscheidend wäre ein konsistentes Muster aus mehreren Beobachtungen.</p></details><details><summary>Eine lebendige Welt ohne Sauerstoff? <span>↗</span></summary><p>Die frühe Erde zeigt, warum fehlender Sauerstoff kein Ende der Suche sein muss. Eine Biosphäre kann existieren, ohne eine leicht erkennbare O₂-Signatur in ihrer Atmosphäre zu hinterlassen.</p></details><details><summary>Signale von Technik <span>↗</span></summary><p>Schmalbandige Radiosignale, kurze Laserpulse oder ungewöhnliche industrielle Moleküle sind weitere Suchideen. Ein Kandidat müsste wiederholbar sein, vom Ziel am Himmel stammen und irdische Störungen sowie natürliche Erklärungen überstehen.</p></details><div class="life-final-thought"><span>DER GEDANKE DAHINTER</span><p>Überzeugend würde ein Bild, in dem Atmosphäre, Stern, Oberfläche und zeitliche Veränderung gemeinsam verständlich werden.</p></div></article>
    </div></section>
    <details class="life-method"><summary>Was dieses Labor berechnet – und was noch offen bleibt</summary><div><p>Ein eigenständiger Gesteinsplanet mit 1 Erdradius und 8,4 km atmosphärischer Skalenhöhe. Hier wird bewusst eine andere Welt als im Transit-Ausgangsbeispiel untersucht. Für jeden Lichtkanal wird ein wirksamer Radius berechnet und mit derselben Kreisüberlappung wie im Transitlabor in eine Bedeckungsfläche übersetzt.</p><p>Die Spektralbanden sind analytische Näherungen bekannter Bandlagen, keine Laborquerschnitte. Ihre Gewichte sind keine gemessenen Mischungsverhältnisse. Ein gemeinsamer Wolkenfaktor dämpft die Banden. Reale Strahlungstransport-, Temperatur-, Druck- und Sternfleckenmodelle fehlen.</p><p>Die Auswertung erhält nur Wellenlänge, Binbreite, gemessene Tiefe und Messunsicherheit. Sie minimiert gewichtete quadratische Residuen mit nichtnegativen Bandamplituden und frei angepasstem Kontinuum. Für jedes Gas wird das Modell ohne dieses Gas neu angepasst. √Δχ² ≥ 4 markiert im Lehrmodell eine gestützte Bande; das ist keine kalibrierte Fehlalarmrate.</p><p>Photonenrauschen sinkt mit Spiegeldurchmesser und √Anzahl Transits. Sternradius, Schwarzkörperfarbe, Entfernung und Transitdauer beeinflussen die Photonenzahl. Der Zahlenmaßstab ist frei gewählt; ein stabiler Kanalfehler bleibt als Rauschuntergrenze. Angegebene Jahre sind nur die minimale Zeitspanne zwischen erstem und letztem Transit – ohne Sichtbarkeitslücken oder Terminplanung.</p><p>Webb untersucht bereits Exoplanetenatmosphären. Das geplante Habitable Worlds Observatory verfolgt die direkte Untersuchung erdähnlicher Welten. Keine Einstellung hier sagt voraus, dass ein bestimmtes Teleskop eine Biosignatur entdecken wird.</p><ul>
      <li><a href="https://www.esa.int/Science_Exploration/Space_Science/Exoplanets/What_do_exoplanets_look_like" target="_blank" rel="noreferrer">ESA · Atmosphären durch Transmissionsspektroskopie</a></li>
      <li><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6016572/" target="_blank" rel="noreferrer">Fachübersicht · Beobachtung und molekulare Bandlagen</a></li>
      <li><a href="https://arxiv.org/abs/1602.05584" target="_blank" rel="noreferrer">Schwieterman et al. · Sauerstoff und unbelebte Gegenfälle</a></li>
      <li><a href="https://arxiv.org/abs/1702.01137" target="_blank" rel="noreferrer">Reinhard et al. · Übersehbare Biosphären</a></li>
      <li><a href="https://science.nasa.gov/astrophysics/programs/habitable-worlds-observatory/" target="_blank" rel="noreferrer">NASA · Habitable Worlds Observatory</a></li>
      <li><a href="https://science.nasa.gov/blogs/webb/2023/03/24/how-webbs-coronagraphs-reveal-exoplanets-in-the-infrared/" target="_blank" rel="noreferrer">NASA · Sternlicht unterdrücken</a></li>
      <li><a href="https://science.nasa.gov/universe/search-for-life/searching-for-signs-of-intelligent-life-technosignatures/" target="_blank" rel="noreferrer">NASA · Technosignaturen</a></li>
    </ul><p>Alle Messungen werden lokal erzeugt. Die Quellenlinks sind Hintergrundliteratur; die Anwendung benötigt sie nicht zur Laufzeit.</p></div></details>`;

  const $ = id => container.querySelector(`#${id}`);
  let worldKey = 'mixture', world = structuredClone(WORLDS.mixture), gas = 'water', wavelength = 1.4, seed = 9173;
  let instrument = { host:'dwarf', diameter:8, distance:10, transits:64, floor:2, resolution:90, window:'broad' };
  let result, visible = false, animation = 0, previous = 0;
  function redraw() {
    if (!visible || !result) return;
    drawAtmosphere($('atmosphere-scene'),world,instrument.host,wavelength,gas,animation,worldKey);
    drawSpectrumChart($('atmosphere-spectrum'),result,wavelength,gas,$('life-fit-line').checked);
    drawCoronagraph($('coronagraph'),Number($('suppression').value));
  }
  function updateWavelength() {
    $('wavelength-value').textContent = `${format(wavelength,2)} µm`;
    const g = geometryAtWavelength(wavelength,world,instrument.host);
    $('annulus-value').textContent = `+${format(g.extraDepth,1)} ppm`;
    const note = GAS_NOTES[gas];$('gas-note-title').textContent = note[0];$('gas-note-text').textContent = note[1];$('selected-band').textContent = note[2];
    for (const button of container.querySelectorAll('[data-gas]')) button.setAttribute('aria-pressed',String(button.dataset.gas===gas));
    redraw();
  }
  function updateMeasurement() {
    const data = generateSpectrum(world,instrument,seed);
    result = inferSpectrum(data); // Only measured fields cross this boundary.
    $('mirror-value').textContent = `${format(instrument.diameter,1)} m`;
    $('exposures-value').textContent = String(instrument.transits);
    $('life-distance-value').textContent = `${instrument.distance} pc`;
    $('clouds-value').textContent = `${Math.round(world.clouds*100)} %`;
    $('life-case-note').textContent = CASE_NOTES[worldKey] + (world.clouds !== WORLDS[worldKey].clouds ? ` Wolkenschleier gegenüber diesem Ausgangsfall verändert: ${Math.round(world.clouds*100)} %.` : '');
    const span = (instrument.transits-1)*HOSTS[instrument.host].period/365.25;
    $('observing-years').textContent = `${format(span,1)} Jahre`;
    $('observing-time').textContent = `minimale Zeitspanne · ${format(instrument.transits*transitDuration(instrument.host),0)} h innerhalb der Transits`;
    $('instrument-limit').textContent = photonNoise(1.4,instrument) < instrument.floor
      ? 'Bei 1,4 µm dominiert die Stabilitätsgrenze. Mehr Zeit hilft nur noch wenig; bessere Kalibrierung wird entscheidend.'
      : 'Mehr gesammeltes Licht hilft: Viermal so viele Transits halbieren den Photonenfehler. Die Stabilitätsgrenze bleibt.';
    $('more-transits').disabled = instrument.transits>=200;
    const verdict = VERDICTS[result.category];$('life-verdict').textContent = verdict[0];$('life-verdict-text').textContent=verdict[1];$('life-next-step').textContent=verdict[2];
    if (instrument.window!=='broad') $('life-next-step').textContent += ' Der gewählte Ausschnitt lässt wichtige Begleitbanden außerhalb der Messung.';
    $('life-findings').innerHTML = Object.entries(SPECIES).map(([key,s])=>{const g=result.gases[key];return `<div class="life-finding gas-${key} ${g.supported?'supported':''}"><b>${s.symbol}</b><strong>${!g.sampled?'Nicht im Ausschnitt':g.supported?'Bande gestützt':'Nicht gesichert'}</strong><span>${!g.sampled?'Keine Aussage möglich':`Bandmaß √Δχ² = ${format(g.score,1)}`}</span></div>`;}).join('');
    $('atmosphere-spectrum').setAttribute('aria-label',`Synthetisches Spektrum: ${data.length} Messkanäle. ${verdict[0]} ${Object.entries(SPECIES).map(([key,s])=>`${s.name}: ${!result.gases[key].sampled?'nicht im Ausschnitt':result.gases[key].supported?'Bande gestützt':'nicht gesichert'}`).join('. ')}`);
    updateWavelength();
  }
  function setWorld(key) {
    worldKey=key;world=structuredClone(WORLDS[key]);$('clouds').value=String(world.clouds);$('clouds').disabled=!world.atmosphere;
    for (const button of container.querySelectorAll('[data-world]')) button.setAttribute('aria-pressed',String(button.dataset.world===key));
    updateMeasurement();
  }
  for (const b of container.querySelectorAll('[data-world]')) b.addEventListener('click',()=>setWorld(b.dataset.world));
  for (const b of container.querySelectorAll('[data-gas]')) b.addEventListener('click',()=>{gas=b.dataset.gas;wavelength=SPECIES[gas].focus;$('wavelength').value=String(wavelength);updateWavelength();});
  $('wavelength').addEventListener('input',()=>{wavelength=Number($('wavelength').value);updateWavelength();});
  const fields={mirror:'diameter',exposures:'transits','life-distance':'distance','life-host':'host','spectral-window':'window','noise-floor':'floor'};
  for (const [id,key] of Object.entries(fields)) $(id).addEventListener('input',()=>{instrument[key]=['host','window'].includes(key)?$(id).value:Number($(id).value);updateMeasurement();});
  $('clouds').addEventListener('input',()=>{world.clouds=Number($('clouds').value);updateMeasurement();});
  $('life-fit-line').addEventListener('change',redraw);
  $('more-transits').addEventListener('click',()=>{instrument.transits=Math.min(200,instrument.transits*2);$('exposures').value=String(instrument.transits);updateMeasurement();});
  $('life-new-measurement').addEventListener('click',()=>{seed++;updateMeasurement();});
  $('life-reset').addEventListener('click',()=>{
    instrument={host:'dwarf',diameter:8,distance:10,transits:64,floor:2,resolution:90,window:'broad'};seed=9173;gas='water';wavelength=1.4;
    for(const [id,key] of Object.entries(fields)) $(id).value=String(instrument[key]);$('wavelength').value='1.4';$('suppression').value='3';$('life-fit-line').checked=true;updateSuppression();setWorld('mixture');
  });
  function updateSuppression() {
    const suppression=Number($('suppression').value);
    $('suppression-value').textContent=`10${toSuperscript(suppression)}×`;
    $('direct-status').textContent=suppression<8?'Der Rest des Sternlichts überstrahlt den Planeten noch stark.':suppression<9.8?'Der Kontrast wird günstiger. Die Suche verlangt zusätzlich genügend Photonen und eine saubere Trennung.':'Etwa der nötige Kontrastmaßstab ist erreicht. Auflösung, Restlicht, Staub und Messrauschen bleiben weitere Hürden.';
    redraw();
  }
  $('suppression').addEventListener('input',updateSuppression);
  $('atmosphere-spectrum').addEventListener('click',event=>{
    const rect=$('atmosphere-spectrum').getBoundingClientRect();const fraction=Math.max(0,Math.min(1,(event.clientX-rect.left-48)/(rect.width-64)));
    const [lo,hi]=WINDOWS[instrument.window];wavelength=lo*(hi/lo)**fraction;$('wavelength').value=String(wavelength);updateWavelength();
  });
  new ResizeObserver(redraw).observe(container);
  let frameId=null;
  function frame(now) {
    if(!visible){frameId=null;return;}
    if(now-previous>50){animation+=.016;previous=now;drawAtmosphere($('atmosphere-scene'),world,instrument.host,wavelength,gas,animation,worldKey);}
    frameId=requestAnimationFrame(frame);
  }
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  function restartAnimation(){if(frameId)cancelAnimationFrame(frameId);frameId=null;if(visible&&!reducedMotion.matches)frameId=requestAnimationFrame(frame);}
  reducedMotion.addEventListener('change',restartAnimation);
  updateMeasurement();updateSuppression();
  return { setActive(active){visible=active;restartAnimation();redraw();} };
}
function toSuperscript(n){return String(Math.round(n)).replace(/[0-9]/g,c=>'⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]);}
