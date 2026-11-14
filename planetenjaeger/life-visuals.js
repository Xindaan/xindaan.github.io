import { prepare, format } from './plots.js';
import { geometryAtWavelength } from './lib/atmosphere.js';
import { SPECIES } from './lib/spectral-bands.js';

const TAU=Math.PI*2;
function circle(ctx,x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,Math.max(0,r),0,TAU);ctx.fill();}
function strokeCircle(ctx,x,y,r,color,width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();}

export function drawAtmosphere(canvas,world,host,wavelength,gas,t,worldKey){
  const {ctx,w,h}=prepare(canvas);if(w<2)return;
  const cx=w*.51,cy=h*.49,r=Math.min(w*.2,h*.245);
  const geometry=geometryAtWavelength(wavelength,world,host);
  const atmosphere=r*geometry.height/6371*100;
  for(let j=0;j<110;j++)circle(ctx,((j*137.507+53)%997)/997*w,((j*j*11.73+19)%613)/613*h,j%12===0?1:.5,j%3===0?'#dce9ff55':'#abc8ee25');
  const starlight=ctx.createRadialGradient(-w*.14,cy,0,-w*.14,cy,w*.63);
  starlight.addColorStop(0,'#efc08738');starlight.addColorStop(.5,'#e7b77a0a');starlight.addColorStop(1,'#efc08700');ctx.fillStyle=starlight;ctx.fillRect(0,0,w,h);
  const glow=ctx.createRadialGradient(cx,cy,r*.92,cx,cy,r+Math.max(4,atmosphere));
  glow.addColorStop(0,'#64d2d400');glow.addColorStop(.3,world.atmosphere?'#6ce9dc22':'#00000000');glow.addColorStop(.8,world.atmosphere?'#81e9df0c':'#00000000');glow.addColorStop(1,'#6ce9dc00');circle(ctx,cx,cy,r+Math.max(4,atmosphere),glow);
  if(world.atmosphere){strokeCircle(ctx,cx,cy,r+atmosphere,'#8ee5dd35');strokeCircle(ctx,cx,cy,r+atmosphere*.45,'#8ee5dd15');}
  const offsets=[-r-atmosphere*.22,-r-atmosphere*.65,r+atmosphere*.38];
  offsets.forEach((offset,j)=>{
    const yy=cy+offset;
    ctx.strokeStyle='#ffd19339';ctx.lineWidth=1;ctx.setLineDash(j===2?[4,6]:[]);ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(cx,yy);ctx.stroke();
    const colored=SPECIES[gas].color;ctx.strokeStyle=colored+'60';ctx.beginPath();ctx.moveTo(cx,yy);ctx.lineTo(w,yy);ctx.stroke();ctx.setLineDash([]);
    const at=(t*70+j*113)%(w+20)-10;circle(ctx,at,yy,2.1,at<cx?'#ffe0ad':colored);
  });
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.clip();
  const arid=worldKey==='abiotic'||worldKey==='bare';
  const ocean=ctx.createLinearGradient(cx-r,cy-r,cx+r,cy+r);ocean.addColorStop(0,arid?'#c28b62':'#3b9ea7');ocean.addColorStop(.5,arid?'#665344':'#185a70');ocean.addColorStop(1,'#0c1729');circle(ctx,cx,cy,r,ocean);
  for(let k=0;k<7;k++){
    const angle=k*2.399;const x=cx+Math.cos(angle)*r*.68,y=cy+Math.sin(angle)*r*.65;
    ctx.fillStyle=arid?(k%2?'#857966':'#5b4940'):(k%2?'#698f77':'#456e66');ctx.beginPath();
    for(let j=0;j<=80;j++){const a=j/80*TAU;const radius=r*(.21+.05*Math.sin(a*3+k)+.04*Math.cos(a*7-k));const xx=x+Math.cos(a)*radius*(k%2?1.6:1),yy=y+Math.sin(a)*radius*.7;j?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);}ctx.fill();
  }
  if(world.atmosphere)for(let k=0;k<8;k++){
    ctx.strokeStyle=`rgba(220,240,237,${.07+world.clouds*.35})`;ctx.lineWidth=r*(.035+world.clouds*.08);ctx.beginPath();
    const yy=cy-r*.8+k*r*.23;ctx.moveTo(cx-r,yy);ctx.bezierCurveTo(cx-r*.3,yy-r*.13,cx+r*.2,yy+r*.26,cx+r,yy-r*.06);ctx.stroke();
  }
  const shade=ctx.createLinearGradient(cx-r,cy,cx+r,cy);shade.addColorStop(0,'#0a102000');shade.addColorStop(.45,'#0a102011');shade.addColorStop(.78,'#050b1baf');shade.addColorStop(1,'#050913fa');circle(ctx,cx,cy,r,shade);ctx.restore();
  strokeCircle(ctx,cx,cy,r,world.atmosphere?'#a7e9e666':'#b5a39355',1.3);
  ctx.font='9px "Avenir Next", sans-serif';ctx.fillStyle='#cdbb9e';ctx.fillText('VOM STERN',18,cy+6);
  ctx.fillStyle='#9bafc2';ctx.textAlign='right';ctx.fillText('ZUM SPEKTROMETER',w-18,cy+6);ctx.textAlign='left';
  ctx.font='10px "Avenir Next", sans-serif';
  if(world.atmosphere){
    const labelX=Math.min(cx+r+28,w-84);
    ctx.strokeStyle='#95c2c960';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx+r*.75,cy+r*.75);ctx.lineTo(labelX,cy+r+24);ctx.lineTo(labelX+55,cy+r+24);ctx.stroke();
    ctx.fillStyle='#b4d4d5';ctx.fillText('Atmosphäre',labelX,cy+r+40);
  } else {ctx.fillStyle='#c3b8a5';ctx.fillText('Keine Gashülle',cx-35,cy+r+38);}
  const rainbow=ctx.createLinearGradient(w*.24,0,w*.77,0);['#a6a0ff','#84c5f3','#8be0d7','#d4dd92','#efbf88','#e89195'].forEach((c,j)=>rainbow.addColorStop(j/5,c));
  ctx.fillStyle=rainbow;ctx.globalAlpha=.7;ctx.fillRect(w*.24,h-28,w*.53,2);ctx.globalAlpha=1;ctx.fillStyle='#91a1b6';ctx.font='8px "Avenir Next", sans-serif';ctx.fillText('LICHTKANÄLE · FALSCHFARBEN',w*.24,h-10);
}

export function drawSpectrumChart(canvas,result,selected,gas,showFit){
  const {ctx,w,h}=prepare(canvas);if(w<2)return;
  const points=result.points,left=48,right=16,top=40,bottom=34;
  const lo=points[0].wavelength-points[0].width/2,hi=points.at(-1).wavelength+points.at(-1).width/2;
  const x=value=>left+Math.log(value/lo)/Math.log(hi/lo)*(w-left-right);
  const residual=p=>p.depth-result.baseline;
  let min=-3,max=12;
  for(const p of points){min=Math.min(min,residual(p)-p.sigma);max=Math.max(max,residual(p)+p.sigma);}
  const pad=(max-min)*.06;min-=pad;max+=pad;
  const y=value=>top+(max-value)/(max-min)*(h-top-bottom);
  ctx.font='9px "Avenir Next", sans-serif';ctx.fillStyle='#99adbf';ctx.fillText('Zusätzliche Bedeckung (ppm)',left,14);
  for(let j=0;j<4;j++){const value=min+(max-min)*j/3;ctx.strokeStyle='#9eb2cb1b';ctx.beginPath();ctx.moveTo(left,y(value));ctx.lineTo(w-right,y(value));ctx.stroke();ctx.fillStyle='#8c9fb4';ctx.textAlign='right';ctx.fillText(format(value,0),left-9,y(value)+3);}
  const ticks=[.6,.76,1,1.4,2,3.3,4.3,5].filter(v=>v>=lo-.001&&v<=hi+.001);
  for(const value of ticks){ctx.textAlign='center';ctx.fillStyle='#8c9fb4';if(w<500&&value===.76&&lo<.7)continue;ctx.fillText(format(value,value===.76?2:1),x(value),h-17);}
  ctx.textAlign='right';ctx.fillText('Wellenlänge (µm) · logarithmisch',w-right,h-2);ctx.textAlign='left';
  ctx.save();ctx.beginPath();ctx.rect(left,top,w-left-right,h-top-bottom);ctx.clip();
  for(const [center,width] of SPECIES[gas].bands){ctx.fillStyle=SPECIES[gas].color+'10';ctx.fillRect(x(Math.max(lo,center-width*1.5)),top,x(center+width*1.5)-x(Math.max(lo,center-width*1.5)),h-top-bottom);}
  ctx.strokeStyle='#9db3c854';ctx.lineWidth=1;ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(left,y(0));ctx.lineTo(w-right,y(0));ctx.stroke();ctx.setLineDash([]);
  for(const p of points){ctx.strokeStyle='#8ddddc40';ctx.beginPath();ctx.moveTo(x(p.wavelength),y(residual(p)-p.sigma));ctx.lineTo(x(p.wavelength),y(residual(p)+p.sigma));ctx.stroke();circle(ctx,x(p.wavelength),y(residual(p)),1.6,'#a4e5ddbb');}
  if(showFit){ctx.strokeStyle='#ffd093';ctx.lineWidth=1.8;ctx.beginPath();points.forEach((p,j)=>{j?ctx.lineTo(x(p.wavelength),y(p.predicted-result.baseline)):ctx.moveTo(x(p.wavelength),y(p.predicted-result.baseline));});ctx.stroke();}
  if(selected>=lo&&selected<=hi){ctx.strokeStyle=SPECIES[gas].color;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x(selected),top);ctx.lineTo(x(selected),h-bottom);ctx.stroke();circle(ctx,x(selected),top+3,3,SPECIES[gas].color);}
  ctx.restore();
  ctx.textAlign='right';ctx.fillStyle=SPECIES[gas].color;ctx.font='9px "Avenir Next", sans-serif';ctx.fillText(selected<lo||selected>hi?'Gewählter Lichtkanal liegt außerhalb des Ausschnitts':`${format(selected,2)} µm · ${SPECIES[gas].symbol}`,w-right,29);ctx.textAlign='left';
}

export function drawCoronagraph(canvas,suppression){
  const {ctx,w,h}=prepare(canvas);if(w<2)return;
  const cx=w*.33,cy=h*.48,px=w*.72,py=h*.51;
  for(let j=0;j<34;j++)circle(ctx,(j*107.3%421)/421*w,(j*j*21.3%311)/311*h,.65,'#bfd1ea39');
  const glare=Math.max(.02,1-suppression/10);
  const bloom=ctx.createRadialGradient(cx,cy,1,cx,cy,w*.6);bloom.addColorStop(0,`rgba(255,215,155,${Math.min(1,.5+glare)})`);bloom.addColorStop(.22,`rgba(215,196,178,${glare*.6})`);bloom.addColorStop(1,'#e2caa000');circle(ctx,cx,cy,w*.6,bloom);
  strokeCircle(ctx,cx,cy,w*.35,'#9cb3cf26');
  if(suppression>4){circle(ctx,cx,cy,19,'#090f1b');strokeCircle(ctx,cx,cy,19,'#a2b1c34d');}
  else circle(ctx,cx,cy,9,'#ffe9c6');
  const visibility=1/(1+10**(9-suppression));circle(ctx,px,py,3.8,`rgba(124,224,207,${visibility})`);
  if(suppression>8.2){strokeCircle(ctx,px,py,10,`rgba(124,224,207,${visibility*.4})`);ctx.font='10px "Avenir Next",sans-serif';ctx.fillStyle='#a8cfc9';ctx.fillText('Planet',px+17,py+4);}
  ctx.fillStyle='#889baf';ctx.font='9px "Avenir Next",sans-serif';ctx.fillText(suppression>4?'Sternmaske':'Stern',cx-23,h-10);ctx.textAlign='right';ctx.fillText('Kontrastmaßstab ≈ 10⁻¹⁰',w-5,h-10);ctx.textAlign='left';
}
