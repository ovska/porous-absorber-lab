/* Coordinate convention: listener ear is (0,0,h_ear); x lateral toward the modelled
   speaker, y forward, and z height above the desktop plane z=0. All core lengths are m. */
(function (root) {
  'use strict';
  const ns = root.DeskPhysics = root.DeskPhysics || {};
  const TAU = Math.PI * 2;
  const rad = d => d * Math.PI / 180;

  function signedRectDistance(x, y, x0, x1, y0, y1) {
    const dx = Math.max(x0 - x, 0, x - x1);
    const dy = Math.max(y0 - y, 0, y - y1);
    if (dx || dy) return -Math.hypot(dx, dy);
    return Math.min(x - x0, x1 - x, y - y0, y1 - y);
  }

  function solve(s) {
    const cm = .01, theta = rad(s.theta);
    const D = s.D * cm, he = s.h_ear * cm, hw = s.h_woofer * cm;
    const x = D * Math.sin(theta), y = D * Math.cos(theta);
    const t = he / (he + hw);
    const bx = t * x, by = t * y;
    const direct = Math.hypot(D, he - hw);
    const reflected = Math.hypot(D, he + hw);
    const delta = reflected - direct;
    const grazing = Math.asin(Math.max(-1, Math.min(1, (he + hw) / reflected)));
    const d1 = Math.hypot(bx, by, he);
    const d2 = Math.hypot(x - bx, y - by, hw);
    const rect = {x0:-s.desk_width*cm/2, x1:s.desk_width*cm/2, y0:s.desk_near*cm, y1:s.desk_far*cm};
    const edge = signedRectDistance(bx, by, rect.x0, rect.x1, rect.y0, rect.y1);
    return {
      speaker:{x,y,z:hw}, mirrorSpeaker:{x:-x,y,z:hw}, ear:{x:0,y:0,z:he},
      imageEar:{x:0,y:0,z:-he}, bounce:{x:bx,y:by,z:0}, t,
      direct, reflected, delta, grazing, d1, d2, rect, edge, onDesk:edge >= 0,
      notch:n => (2*n-1) * s.c / (2 * Math.max(delta,1e-12)),
      horizontalForward:y
    };
  }

  function zone(g, frequency, c) {
    const lambda = c / frequency;
    const r1 = Math.sqrt(lambda * g.d1 * g.d2 / (g.d1 + g.d2));
    const major = r1 / Math.max(Math.abs(Math.sin(g.grazing)), 1e-5);
    const minor = r1;
    const angle = Math.atan2(g.bounce.y, g.bounce.x);
    return {cx:g.bounce.x, cy:g.bounce.y, major, minor, angle, r1};
  }

  function pointInZone(x,y,e,scale=1) {
    const ca=Math.cos(e.angle), sa=Math.sin(e.angle), dx=x-e.cx, dy=y-e.cy;
    const along=dx*ca+dy*sa, across=-dx*sa+dy*ca;
    return (along*along)/(e.major*e.major*scale*scale)+(across*across)/(e.minor*e.minor*scale*scale)<=1;
  }

  // Deterministic ellipse quadrature. The renderer and the Fresnel model call this exact routine.
  function coverage(s,g,frequency,samples=72) {
    const e=zone(g,frequency,s.c), ca=Math.cos(e.angle), sa=Math.sin(e.angle);
    let hit=0,total=0,absorbed=0;
    const an=s.absorber_near*.01, af=s.absorber_far*.01;
    for(let iy=0;iy<samples;iy++) for(let ix=0;ix<samples;ix++) {
      const u=-1+2*(ix+.5)/samples, v=-1+2*(iy+.5)/samples;
      if(u*u+v*v>1) continue;
      total++;
      const x=e.cx+u*e.major*ca-v*e.minor*sa;
      const y=e.cy+u*e.major*sa+v*e.minor*ca;
      const on=x>=g.rect.x0&&x<=g.rect.x1&&y>=g.rect.y0&&y<=g.rect.y1;
      if(on){ hit++; if(s.absorber_on&&y>=an&&y<=af) absorbed++; }
    }
    return {fraction:total ? (hit-absorbed)/total : 0, deskFraction:total?hit/total:0,
      absorberFraction:total?absorbed/total:0, ellipse:e};
  }

  function frequencyGrid(n=420,lo=20,hi=20000){
    const out=new Float64Array(n), ratio=Math.pow(hi/lo,1/(n-1)); let f=lo;
    for(let i=0;i<n;i++){out[i]=f;f*=ratio;} return out;
  }

  ns.geometry={TAU,rad,solve,zone,coverage,pointInZone,frequencyGrid,signedRectDistance};
})(window);
