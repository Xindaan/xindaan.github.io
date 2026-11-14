import { prepare, format } from './plots.js';
const TAU=2*Math.PI;
const dot=(c,x,y,r,color)=>{c.fillStyle=color;c.beginPath();c.arc(x,y,Math.max(0,r),0,TAU);c.fill();};
function stars(c,w,h){for(let i=0;i<90;i++)dot(c,(i*137.53%997)/997*w,(i*i*17.1%701)/701*h,i%7===0?1:.5,'#d2e4ff35');}
export function drawObservatory(canvas,part){
  const {ctx:c,w,h}=prepare(canvas);stars(c,w,h);
  const scale=Math.min(w/620,h/350);c.save();c.translate(w/2,h/2);c.scale(scale,scale);
  const selected=key=>part===key?'#94e9d8':'#557988';
  // Original engineering illustration: no claim to depict a real mission architecture.
  for(let i=4;i>=0;i--){c.fillStyle=i%2?'#3e525e':'#627980';c.globalAlpha=.3+i*.07;c.beginPath();c.moveTo(-170,55+i*5);c.lineTo(18,4+i*4);c.lineTo(195,63+i*5);c.lineTo(-5,139+i*4);c.closePath();c.fill();}
  c.globalAlpha=1;c.strokeStyle=selected('thermal');c.lineWidth=1;c.beginPath();c.moveTo(-170,55);c.lineTo(-5,139);c.lineTo(195,63);c.stroke();
  c.fillStyle='#1c2a3b';c.fillRect(-27,80,57,58);c.strokeStyle=selected('spectra');c.strokeRect(-27,80,57,58);
  c.strokeStyle=selected('stable');c.lineWidth=3;c.beginPath();c.moveTo(-55,20);c.lineTo(-16,-116);c.lineTo(64,20);c.stroke();
  c.save();c.translate(-8,-27);c.scale(1,.87);
  for(let q=-2;q<=2;q++)for(let r=-2;r<=2;r++){if(Math.abs(q+r)>2)continue;const x=31.5*q,y=36.4*(r+q/2);c.beginPath();for(let j=0;j<6;j++){const a=j*TAU/6;const xx=x+20*Math.cos(a),yy=y+20*Math.sin(a);j?c.lineTo(xx,yy):c.moveTo(xx,yy);}c.closePath();const g=c.createLinearGradient(x-20,y-20,x+20,y+20);g.addColorStop(0,'#edc894');g.addColorStop(1,'#806344');c.fillStyle=g;c.fill();c.strokeStyle=selected('mirror');c.lineWidth=.6;c.stroke();}c.restore();
  dot(c,-16,-112,9,'#c1d0d5');c.strokeStyle=selected('contrast');c.lineWidth=1;c.setLineDash([4,5]);c.beginPath();c.moveTo(-240,-104);c.lineTo(-40,-45);c.lineTo(-16,-112);c.lineTo(1,105);c.stroke();c.setLineDash([]);
  c.strokeStyle=selected('spectra');for(let j=0;j<5;j++){c.beginPath();c.moveTo(30,111);c.lineTo(170,85+j*13);c.stroke();}
  const labels=[['SPIEGEL',-190,-50,'mirror'],['STERNSCHATTEN',100,-78,'contrast'],['WÄRMESCHILD',-245,120,'thermal'],['SPEKTROMETER',83,150,'spectra'],['PRÄZISE REGELUNG',70,-137,'stable']];
  c.font='10px "Avenir Next",sans-serif';for(const [text,x,y,key] of labels){c.fillStyle=selected(key);c.fillText(text,x,y);}
  c.restore();
}
export function drawAngular(canvas,r){
  const {ctx:c,w,h}=prepare(canvas);const split=w<600,cellW=split?w:w*.53,cellH=split?h/2:h;
  stars(c,w,h);c.font='11px "Avenir Next",sans-serif';
  const field=Math.max(.17,r.separation*1.5,r.innerWorkingAngle*1.15),unit=(cellW-70)/field;
  const sx=35,sy=cellH*.47,px=sx+r.separation*unit;
  c.save();c.beginPath();c.rect(12,35,cellW-24,cellH-75);c.clip();
  dot(c,sx,sy,r.innerWorkingAngle*unit,'#e8c49513');
  c.strokeStyle='#e8c4954d';c.beginPath();c.arc(sx,sy,r.innerWorkingAngle*unit,0,TAU);c.stroke();
  const psf=Math.max(1,r.resolution*unit*.45);const g=c.createRadialGradient(px,sy,0,px,sy,Math.max(3,psf*2));g.addColorStop(0,r.contrastScaleReached?'#a6ffed':'#7c9b9f');g.addColorStop(1,'#81dece00');dot(c,px,sy,Math.max(3,psf*2),g);
  dot(c,sx,sy,7,'#f7d19c');c.restore();
  c.fillStyle='#c4d9df';c.fillText('VOM STERN TRENNEN',20,23);c.fillStyle='#839aaf';c.font='9px "Avenir Next",sans-serif';c.fillText(`Stern–Planet: ${format(r.separation,3)}″`,20,cellH-34);c.fillText(`Modell-Ausblendewinkel: ${r.innerWorkingAngle<.001?format(r.innerWorkingAngle*1e6,2)+' µas':format(r.innerWorkingAngle,4)+'″'}`,20,cellH-17);
  c.fillStyle='#a5bbca';c.fillText('Stern',Math.max(20,sx-10),sy+24);c.fillText('Planet',Math.min(cellW-47,px+12),sy-12);
  const x0=split?0:cellW,y0=split?cellH:0,cx=x0+(w-x0)/2,cy=y0+cellH*.48,rad=Math.min((w-x0)*.28,cellH*.28);
  c.strokeStyle='#7fa4b02a';c.beginPath();split?(c.moveTo(15,cellH),c.lineTo(w-15,cellH)):(c.moveTo(cellW,20),c.lineTo(cellW,h-20));c.stroke();
  c.fillStyle='#c4d9df';c.font='11px "Avenir Next",sans-serif';c.fillText('DIE SCHEIBE AUFLÖSEN',x0+20,y0+23);
  if(r.elementsAcross<1){const glow=c.createRadialGradient(cx,cy,1,cx,cy,22);glow.addColorStop(0,'#b0f8eb');glow.addColorStop(.2,'#7edadc44');glow.addColorStop(1,'#7edadc00');dot(c,cx,cy,22,glow);}
  else{
    const n=Math.min(60,Math.max(1,Math.floor(r.elementsAcross))),step=rad*2/n;c.save();c.beginPath();c.arc(cx,cy,rad,0,TAU);c.clip();
    for(let i=0;i<n;i++)for(let j=0;j<n;j++){
      const x=(i+.5)/n*2-1,y=(j+.5)/n*2-1;
      let land=0;for(let k=0;k<4;k++){const u=x+(k%2-.5)/n,v=y+(Math.floor(k/2)-.5)/n;land+=Math.sin(u*5+v*2)+Math.cos(v*6-u*3)>0.5?1:0;}
      const l=n<3?.3:land/4;c.fillStyle=`rgb(${Math.round(24+l*74)},${Math.round(71+l*52)},${Math.round(95-l*7)})`;c.fillRect(cx-rad+i*step,cy-rad+j*step,step+.5,step+.5);
    }c.restore();
  }
  c.font='9px "Avenir Next",sans-serif';c.fillStyle='#a9c6c8';c.textAlign='center';c.fillText(r.elementsAcross<1?'Unaufgelöster Lichtpunkt':`${format(r.elementsAcross,1)} Auflösungselemente quer`,cx,y0+cellH-34);c.fillStyle='#7e97ad';c.fillText('Nur Winkelauflösung · fiktive Oberfläche',cx,y0+cellH-17);c.textAlign='left';
}
