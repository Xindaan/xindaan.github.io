import { WORLDS, geometryAtWavelength, photonNoise, transitDuration, spectrumGrid } from './atmosphere.js';
import { seededRandom } from './measurements.js';
import { WINDOWS, binAverage } from './spectral-bands.js';

// Public target metadata; no preset or hidden gas field leaves the acquisition closure.
export const TARGETS = Object.freeze([
  { id:'a', name:'Aster 01', distance:8, host:'dwarf', period:15, position:[.22,.37] },
  { id:'b', name:'Aster 02', distance:10, host:'dwarf', period:15, position:[.56,.64] },
  { id:'c', name:'Aster 03', distance:12, host:'dwarf', period:15, position:[.8,.28] },
]);
export const CAMPAIGN = Object.freeze({ budget:480, blockTransits:16, diameter:8, floor:2, resolution:90 });
const grid = spectrumGrid('broad',90);
export function blockCost(targetId) {
  const target=TARGETS.find(t=>t.id===targetId);if(!target)throw new Error('Unbekanntes Ziel.');
  return 2 * CAMPAIGN.blockTransits * transitDuration(target.host); // Equal reference time outside the transits.
}
export function createCampaign(seed=12041) {
  if (!Number.isInteger(seed)) throw new Error('Seed muss ganzzahlig sein.');
  let spent=0,selection=null,events=[];
  // Rotation hides the case assignment from target labels; reproducible from this campaign seed.
  const cases=['mixture','abiotic','cloudy'];
  const shift=((seed%3)+3)%3;
  const targets=TARGETS.map((t,i)=>{
    const world=structuredClone(WORLDS[cases[(i+shift)%3]]),random=seededRandom(seed+i*7919);
    const normal=()=>Math.sqrt(-2*Math.log(Math.max(1e-15,random())))*Math.cos(2*Math.PI*random());
    return { ...t, counts:grid.map(()=>0), blocks:0, points:[],normal,
      clean:grid.map(p=>binAverage(p.wavelength,p.width,w=>geometryAtWavelength(w,world,t.host).depth)),
      offsets:grid.map(()=>CAMPAIGN.floor*normal()),sums:grid.map(()=>0) };
  });
  const snapshot=()=>({budget:CAMPAIGN.budget,spent,remaining:CAMPAIGN.budget-spent,selection,events:events.map(e=>({...e})),
    targets:targets.map(t=>({id:t.id,blocks:t.blocks,spanDays:Math.max(0,t.blocks*CAMPAIGN.blockTransits-1)*t.period,
      points:t.points.map(({wavelength,width,depth,sigma})=>({wavelength,width,depth,sigma}))}))});
  return {
    snapshot,
    observe(id,windowKey) {
      const t=targets.find(t=>t.id===id);if(!t||!Object.hasOwn(WINDOWS,windowKey))throw new Error('Ungültige Beobachtung.');
      const cost=blockCost(id);
      if(spent+cost>CAMPAIGN.budget+1e-9) return {ok:false,reason:'Die verbleibende Teleskopzeit reicht für diesen Block nicht.',state:snapshot()};
      const [lo,hi]=WINDOWS[windowKey];
      const next=t.counts.map((n,j)=>n+(grid[j].wavelength>=lo&&grid[j].wavelength<=hi?CAMPAIGN.blockTransits:0));
      next.forEach((n,j)=>{if(n>t.counts[j])t.sums[j]+=t.normal();});
      t.points=next.flatMap((n,j)=>{
        if(!n)return [];
        const p=grid[j],blocks=n/CAMPAIGN.blockTransits;
        const photon=photonNoise(p.wavelength,{host:t.host,diameter:CAMPAIGN.diameter,distance:t.distance,transits:CAMPAIGN.blockTransits,resolution:90});
        return [{...p,depth:t.clean[j]+t.offsets[j]+photon*t.sums[j]/blocks,sigma:Math.hypot(photon/Math.sqrt(blocks),CAMPAIGN.floor)}];
      });t.counts=next;t.blocks++;spent+=cost;
      events.push({id,window:windowKey,cost,block:t.blocks});return {ok:true,state:snapshot()};
    },
    nominate(id) {
      if(id!==null&&!TARGETS.some(t=>t.id===id))throw new Error('Unbekanntes Ziel.');selection=id;return snapshot();
    },
  };
}
