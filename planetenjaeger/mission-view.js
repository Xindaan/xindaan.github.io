import { createCampaign, TARGETS, CAMPAIGN, blockCost } from './lib/mission.js';
import { inferSpectrum } from './lib/spectral-inference.js';
import { SPECIES } from './lib/spectral-bands.js';
import { drawSpectrumChart } from './life-visuals.js';
import { prepare, format } from './plots.js';

const titles={weak:'Noch keine belastbaren Gasbanden.',atmosphere:'Eine Atmosphäre verdient einen genaueren Blick.',interesting:'Eine interessante Mischung. Ihre Herkunft bleibt offen.',alternative:'Eine unbelebte Erklärung muss geprüft werden.'};
export function mountCampaign(root){
  root.innerHTML=`<div class="campaign-intro"><div><p class="eyebrow">DEINE BEOBACHTUNGSKAMPAGNE</p><h2>Drei Welten. <em>480 Stunden.</em></h2><p>Du entscheidest, wohin das Teleskop blickt. Welche Welt verdient eine Folgemission?</p></div><span class="obs-badge">Simulierte Blindfälle</span></div>
  <div class="campaign-grid"><section class="target-map" aria-label="Fiktive Zielsterne"><div class="target-map-grid"></div>${TARGETS.map(t=>`<button class="target-star target-${t.id}" data-target="${t.id}" aria-pressed="${t.id==='a'}"><i></i><b>${t.name}</b><span>${t.distance} pc</span></button>`).join('')}<p>Erfundene Zielkarte · keine astronomischen Koordinaten</p></section>
  <aside class="campaign-console"><p class="eyebrow" id="campaign-target"></p><h3>Welche Frage stellst du zuerst?</h3><p>Alle drei Sterne: 0,2 R☉. Bekannte Transitperiode: 15 Tage. Die Atmosphären sind verborgen.</p><label for="campaign-window">Spektralbereich<select id="campaign-window"><option value="optical">Sauerstoff-Bereich · 0,6–1 µm</option><option value="infrared">Begleitgase · 1–5 µm</option><option value="broad">Gesamtes Spektrum · 0,6–5 µm</option></select></label><div class="campaign-budget"><strong id="campaign-budget"></strong><span>Teleskopzeit übrig</span><progress id="campaign-progress" max="480" value="480" aria-label="Verbleibende Teleskopzeit"></progress></div><button id="campaign-observe" class="obs-primary">16 Transits beobachten <span>↗</span></button><p id="campaign-cost"></p><p class="obs-fine">Hypothetisches 8-m-Instrument, R ≈ 90, 2 ppm Stabilitätsgrenze. Ein Block umfasst Transit- und gleich lange Referenzmessungen. Breite Abdeckung kostet hier gleich viel; reale Instrumente können andere Grenzen haben.</p></aside></div>
  <section class="campaign-data" aria-live="polite"><div class="obs-row"><div><p class="eyebrow">DAS FORSCHUNGSJOURNAL</p><h3 id="campaign-verdict"></h3></div><span id="campaign-span"></span></div><canvas id="campaign-spectrum" role="img" aria-label="Noch keine Messung für dieses Ziel"></canvas><div class="campaign-gases" id="campaign-gases"></div><p id="campaign-next"></p><div class="obs-row campaign-actions"><button id="campaign-nominate">Dieses Ziel für weitere Forschung wählen</button><button id="campaign-reset">Kampagne neu beginnen</button></div><p id="campaign-choice"></p><p class="obs-fine">Die Auswertung bekommt ausschließlich Spektralmesswerte und Fehler. Kein Gasnachweis bestätigt Leben. Eine flache Kurve kann eine verborgene Atmosphäre oder eine atmosphärenlose Welt bedeuten.</p></section>
  <details class="campaign-journal"><summary>Beobachtungen und Zeitverbrauch</summary><ol id="campaign-events"></ol></details>`;
  const $=id=>root.querySelector('#'+id);let campaign=createCampaign(),target='a',visible=false,result=null;
  function redraw(){if(!visible)return;if(result)drawSpectrumChart($('campaign-spectrum'),result,.76,'oxygen',true);else{const {ctx,w,h}=prepare($('campaign-spectrum'));ctx.fillStyle='#8298b2';ctx.font='13px "Avenir Next",sans-serif';ctx.textAlign='center';ctx.fillText('Dieses Ziel hat noch keine Spektralmessung.',w/2,h/2);}}
  function render(){
    const s=campaign.snapshot(),t=s.targets.find(t=>t.id===target),pub=TARGETS.find(t=>t.id===target);result=t.points.length?inferSpectrum(t.points):null;
    $('campaign-target').textContent=`${pub.name.toUpperCase()} · ${pub.distance} PC`;
    $('campaign-budget').textContent=`${format(s.remaining,1)} h`;$('campaign-progress').value=s.remaining;
    $('campaign-cost').textContent=`Nächster Block: ${format(blockCost(target),1)} h · 16 zusätzliche Transits.`;
    $('campaign-observe').disabled=s.remaining<blockCost(target)-1e-9;
    if($('campaign-observe').disabled)$('campaign-cost').textContent='Das Restbudget reicht für keinen weiteren Beobachtungsblock.';
    $('campaign-verdict').textContent=result?titles[result.category]:'Eine neue Frage. Noch keine Daten.';
    $('campaign-span').textContent=t.blocks?`${t.blocks*CAMPAIGN.blockTransits} beobachtete Transits · mindestens ${format(t.spanDays/365.25,1)} Jahre für dieses Ziel`:'';
    $('campaign-gases').innerHTML=result?Object.entries(SPECIES).map(([k,g])=>`<div class="gas-${k}"><b>${g.symbol}</b><span>${!result.gases[k].sampled?'Nicht gemessen':result.gases[k].supported?'Bande gestützt':'Nicht gesichert'}</span></div>`).join(''):'';
    let next='Wähle einen Spektralbereich und sammle den ersten Beobachtungsblock.';
    if(result){
      const missing=Object.values(result.gases).some(g=>!g.sampled);
      next=missing?'Wichtige Begleitgase liegen außerhalb deiner bisherigen Messung. Ein ergänzender Spektralbereich kann Erklärungen besser unterscheiden.':result.category==='weak'?'Die Daten entscheiden noch wenig. Du kannst tiefer messen, ein anderes Ziel vergleichen oder die verbleibende Unsicherheit bewusst stehen lassen.':result.category==='alternative'?'O₂ und CO sind gestützt. Als nächste unabhängige Untersuchung wären UV-Spektrum des Sterns und photochemische Modelle sinnvoll.':'Prüfe, ob die Banden bei weiteren Messungen bestehen bleiben. Für ihre Herkunft brauchst du zusätzlich Sternaktivität, Chemie und alternative Modelle.';
    }
    $('campaign-next').textContent=next;
    $('campaign-nominate').disabled=!result;
    const chosen=TARGETS.find(t=>t.id===s.selection);
    $('campaign-choice').textContent=chosen?`Deine Forschungspriorität: ${chosen.name}. Das ist eine Entscheidung über die nächste Beobachtung, keine Behauptung über Leben.`:'Noch keine Forschungspriorität festgelegt.';
    $('campaign-events').innerHTML=s.events.length?s.events.map(e=>`<li>${TARGETS.find(t=>t.id===e.id).name} · ${e.window==='optical'?'0,6–1':e.window==='infrared'?'1–5':'0,6–5'} µm · ${format(e.cost,1)} h</li>`).join(''):'<li>Noch keine Beobachtungen.</li>';
    $('campaign-spectrum').setAttribute('aria-label',result?`${pub.name}: ${t.points.length} Spektralkanäle. ${titles[result.category]}`:'Noch keine Messung für dieses Ziel');
    for(const b of root.querySelectorAll('[data-target]'))b.setAttribute('aria-pressed',String(b.dataset.target===target));redraw();
  }
  for(const b of root.querySelectorAll('[data-target]'))b.addEventListener('click',()=>{target=b.dataset.target;render();});
  $('campaign-observe').addEventListener('click',()=>{campaign.observe(target,$('campaign-window').value);render();});
  $('campaign-nominate').addEventListener('click',()=>{campaign.nominate(target);render();});
  $('campaign-reset').addEventListener('click',()=>{campaign=createCampaign();target='a';$('campaign-window').value='optical';render();});
  new ResizeObserver(redraw).observe(root);render();return{setActive(v){visible=v;redraw();}};
}
