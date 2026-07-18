/* Coordinate convention: plan is x–y looking down; elevation is y–z looking
   along x. The desktop plane is z=0 and all rendered geometry comes from geometry.js. */
(function(root){
  'use strict';const ns=root.DeskPhysics=root.DeskPhysics||{},G=ns.geometry;
  function setup(canvas){const r=canvas.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1),w=Math.max(320,Math.round(r.width)),h=Math.max(240,Math.round(r.height));if(canvas.width!==w*d||canvas.height!==h*d){canvas.width=w*d;canvas.height=h*d;}const c=canvas.getContext('2d');c.setTransform(d,0,0,d,0,0);return {c,w,h};}
  function colors(){const q=getComputedStyle(document.documentElement);return {bg:q.getPropertyValue('--panel').trim(),line:q.getPropertyValue('--line').trim(),text:q.getPropertyValue('--text').trim(),muted:q.getPropertyValue('--muted').trim(),cyan:q.getPropertyValue('--cyan').trim(),cyan2:q.getPropertyValue('--cyan2').trim(),amber:q.getPropertyValue('--amber').trim(),red:q.getPropertyValue('--red').trim(),blue:q.getPropertyValue('--blue').trim(),purple:q.getPropertyValue('--purple').trim()};}
  function line(c,a,b,color,width=1,dash=[]){c.save();c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.restore();}
  function circle(c,p,r,fill,stroke){c.beginPath();c.arc(p.x,p.y,r,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.stroke()}}
  function arrow(c,a,b,color){line(c,a,b,color,1.3);const t=Math.atan2(b.y-a.y,b.x-a.x);c.fillStyle=color;c.beginPath();c.moveTo(b.x,b.y);c.lineTo(b.x-8*Math.cos(t-.45),b.y-8*Math.sin(t-.45));c.lineTo(b.x-8*Math.cos(t+.45),b.y-8*Math.sin(t+.45));c.fill();}
  function grid(c,w,h,toPx,range,C,unit=.25){c.save();c.strokeStyle=C.line;c.fillStyle=C.muted;c.font='10px system-ui';c.lineWidth=.6;for(let x=Math.ceil(range.x0/unit)*unit;x<=range.x1;x+=unit){const p=toPx(x,0);c.beginPath();c.moveTo(p.x,20);c.lineTo(p.x,h-25);c.stroke();if(Math.abs(x)>1e-4)c.fillText(`${Math.round(x*100)} cm`,p.x+3,h-10)}for(let y=Math.ceil(range.y0/unit)*unit;y<=range.y1;y+=unit){const p=toPx(0,y);c.beginPath();c.moveTo(38,p.y);c.lineTo(w-15,p.y);c.stroke();c.fillText(`${Math.round(y*100)}`,4,p.y-3)}c.restore()}
  function drawPlan(canvas,s,frequency){
    const {c,w,h}=setup(canvas),C=colors(),g=G.solve(s),e=G.zone(g,frequency,s.c);
    c.fillStyle=C.bg;c.fillRect(0,0,w,h);
    const extX=Math.max(Math.abs(g.rect.x0),Math.abs(g.rect.x1),Math.abs(g.speaker.x),e.major)*1.12;
    const yMin=Math.min(-.12,e.cy-e.major*.3),yMax=Math.max(g.speaker.y,g.rect.y1,e.cy+e.major)*1.1;
    const pad={l:42,r:18,t:18,b:28},scale=Math.min((w-pad.l-pad.r)/(2*extX),(h-pad.t-pad.b)/(yMax-yMin));
    const to=(x,y)=>({x:pad.l+(x+extX)*scale,y:h-pad.b-(y-yMin)*scale});
    grid(c,w,h,to,{x0:-extX,x1:extX,y0:yMin,y1:yMax},C);
    const r0=to(g.rect.x0,g.rect.y0),r1=to(g.rect.x1,g.rect.y1);c.fillStyle=C.line;c.globalAlpha=.45;c.fillRect(r0.x,r1.y,r1.x-r0.x,r0.y-r1.y);c.globalAlpha=1;c.strokeStyle=C.muted;c.strokeRect(r0.x,r1.y,r1.x-r0.x,r0.y-r1.y);
    if(s.absorber_on){const a0=to(g.rect.x0,s.absorber_near*.01),a1=to(g.rect.x1,s.absorber_far*.01);c.fillStyle=C.purple;c.globalAlpha=.3;c.fillRect(a0.x,a1.y,a1.x-a0.x,a0.y-a1.y);c.globalAlpha=1;}
    const ep=to(e.cx,e.cy);c.save();c.translate(ep.x,ep.y);c.rotate(-e.angle);for(const [n,a] of [[3,.12],[2,.18],[1,.32]]){c.beginPath();c.ellipse(0,0,e.major*scale*n,e.minor*scale*n,0,0,Math.PI*2);c.strokeStyle=C.cyan;c.globalAlpha=a;c.lineWidth=n===1?1.5:1;c.stroke()}c.restore();c.globalAlpha=1;
    // Shade the exact visible desk/ellipse overlap. This uses the same ellipse geometry as coverage().
    c.save();c.beginPath();c.ellipse(ep.x,ep.y,e.major*scale,e.minor*scale,-e.angle,0,Math.PI*2);c.clip();c.globalAlpha=.18;c.fillStyle=C.cyan;c.fillRect(r0.x,r1.y,r1.x-r0.x,r0.y-r1.y);c.restore();
    const ear=to(0,0),sp=to(g.speaker.x,g.speaker.y),sm=to(-g.speaker.x,g.speaker.y),bp=to(g.bounce.x,g.bounce.y);
    line(c,ear,sp,C.blue,2);line(c,ear,bp,C.amber,2,[6,4]);line(c,bp,sp,C.amber,2,[6,4]);
    circle(c,ear,12,C.panel,C.text);circle(c,{x:ear.x-11,y:ear.y},2.5,C.cyan);circle(c,{x:ear.x+11,y:ear.y},2.5,C.cyan);arrow(c,{x:ear.x,y:ear.y-3},{x:ear.x,y:ear.y-22},C.text);
    function speaker(p,mirrored){c.save();c.translate(p.x,p.y);c.rotate(mirrored?-.25:.25);c.fillStyle=C.blue;c.globalAlpha=.85;c.fillRect(-8,-11,16,22);c.globalAlpha=1;circle(c,{x:0,y:-4},3,C.bg);circle(c,{x:0,y:5},4,C.bg);c.restore()}
    speaker(sp,false);speaker(sm,true);circle(c,bp,6,g.onDesk?C.cyan:C.red,C.bg);
    c.fillStyle=C.text;c.font='11px system-ui';c.fillText(`bounce  x ${(g.bounce.x*100).toFixed(1)} · y ${(g.bounce.y*100).toFixed(1)} cm`,Math.min(w-210,bp.x+9),Math.max(16,bp.y-9));
    c.fillStyle=C.muted;c.fillText(`edge ${g.edge>=0?'+':''}${(g.edge*100).toFixed(1)} cm`,Math.min(w-100,bp.x+9),Math.max(30,bp.y+7));
    c.fillText(`1st zone: ${(e.minor*100).toFixed(1)} × ${(e.major*100).toFixed(1)} cm`,w-185,16);
    c.fillText('y forward ↑',8,15);
  }
  function drawElevation(canvas,s,frequency){
    const {c,w,h}=setup(canvas),C=colors(),g=G.solve(s);c.fillStyle=C.bg;c.fillRect(0,0,w,h);
    const ymin=-.12,ymax=Math.max(g.speaker.y,g.rect.y1)*1.08,zmin=Math.min(-g.ear.z,-.3),zmax=Math.max(g.ear.z,g.speaker.z)+.32,pad={l:43,r:20,t:18,b:28},sc=Math.min((w-pad.l-pad.r)/(ymax-ymin),(h-pad.t-pad.b)/(zmax-zmin));const to=(y,z)=>({x:pad.l+(y-ymin)*sc,y:h-pad.b-(z-zmin)*sc});
    grid(c,w,h,(x,y)=>to(x,y),{x0:ymin,x1:ymax,y0:zmin,y1:zmax},C,.25);
    const deskA=to(g.rect.y0,0),deskB=to(g.rect.y1,0);line(c,deskA,deskB,C.text,4);if(s.absorber_on){line(c,to(s.absorber_near*.01,0),to(s.absorber_far*.01,0),C.purple,7)}
    const ear=to(0,g.ear.z),img=to(0,-g.ear.z),sp=to(g.speaker.y,g.speaker.z),bp=to(g.bounce.y,0);
    line(c,img,sp,C.muted,1,[5,5]);line(c,ear,sp,C.blue,2);line(c,ear,bp,C.amber,2,[6,4]);line(c,bp,sp,C.amber,2,[6,4]);circle(c,ear,6,C.cyan);circle(c,img,5,C.panel,C.muted);circle(c,bp,5,g.onDesk?C.cyan:C.red);
    // Tilted cabinet and acoustic axis.
    const tilt=-s.tilt*Math.PI/180;c.save();c.translate(sp.x,sp.y);c.rotate(tilt);c.fillStyle=C.blue;c.globalAlpha=.8;c.fillRect(-9,-25,18,50);circle(c,{x:-4,y:0},5,C.bg);c.restore();
    const axisLen=.42*sc,axisEnd={x:sp.x-axisLen*Math.cos(tilt),y:sp.y-axisLen*Math.sin(tilt)};arrow(c,sp,axisEnd,C.purple);
    // A frequency-scaled schematic piston lobe around the real axis.
    const narrow=Math.min(.9,.25+frequency/7000);c.save();c.translate(sp.x,sp.y);c.rotate(tilt+Math.PI);c.beginPath();c.moveTo(0,0);c.bezierCurveTo(axisLen*.35,-axisLen*(1-narrow)*.55,axisLen*.85,-axisLen*(1-narrow)*.3,axisLen,0);c.bezierCurveTo(axisLen*.85,axisLen*(1-narrow)*.3,axisLen*.35,axisLen*(1-narrow)*.55,0,0);c.fillStyle=C.purple;c.globalAlpha=.13;c.fill();c.restore();
    // Grazing angle arc.
    c.strokeStyle=C.amber;c.beginPath();c.arc(bp.x,bp.y,31,Math.PI,Math.PI+g.grazing);c.stroke();
    c.fillStyle=C.text;c.font='11px system-ui';c.fillText(`grazing ${(g.grazing*180/Math.PI).toFixed(1)}°`,bp.x-12,bp.y-18);c.fillStyle=C.muted;c.fillText('image ear',img.x+8,img.y+4);c.fillText('z = 0 desktop',deskA.x,deskA.y+17);c.fillText('y forward →',w-82,h-9);
  }
  ns.viz={drawPlan,drawElevation};
})(window);
