/* Coordinate convention: x lateral, y forward, z above the desktop. Incidence
   angles passed here are grazing angles measured up from the desktop plane. */
(function(root){
  'use strict';
  const ns=root.DeskPhysics=root.DeskPhysics||{};
  const C=(re,im=0)=>({re,im});
  const add=(a,b)=>C(a.re+b.re,a.im+b.im), sub=(a,b)=>C(a.re-b.re,a.im-b.im);
  const mul=(a,b)=>C(a.re*b.re-a.im*b.im,a.re*b.im+a.im*b.re);
  const div=(a,b)=>{const d=b.re*b.re+b.im*b.im||1e-30;return C((a.re*b.re+a.im*b.im)/d,(a.im*b.re-a.re*b.im)/d)};
  const scale=(a,x)=>C(a.re*x,a.im*x);
  const expj=a=>C(Math.cos(a),Math.sin(a));
  function csqrt(z){const m=Math.hypot(z.re,z.im),a=Math.sqrt(Math.max(0,(m+z.re)/2)),b=Math.sign(z.im||1)*Math.sqrt(Math.max(0,(m-z.re)/2));return C(a,b)}
  function ctan(z){const d=Math.cos(2*z.re)+Math.cosh(2*z.im);return C(Math.sin(2*z.re)/d,Math.sinh(2*z.im)/d)}

  // Delany–Bazley–Miki porous layer over rigid backing, with oblique wave number.
  function porousReflection(f,sigma,thickness,grazing,c=343,rho=1.21){
    const X=Math.max(f/sigma,1e-6);
    const zc=C(rho*c*(1+5.50*Math.pow(1000*X,-.632)), -rho*c*8.43*Math.pow(1000*X,-.632));
    const k0=2*Math.PI*f/c;
    const kc=C(k0*(1+7.81*Math.pow(1000*X,-.618)), -k0*11.41*Math.pow(1000*X,-.618));
    const cosNormal=Math.max(Math.sin(Math.abs(grazing)),.025), kt=k0*Math.sqrt(Math.max(0,1-cosNormal*cosNormal));
    const kz=csqrt(sub(mul(kc,kc),C(kt*kt)));
    const zin=mul(C(0,-1),mul(zc,div(kc,kz)));
    const zsurf=mul(zin,div(C(1),ctan(scale(kz,thickness))));
    const zair=C(rho*c/cosNormal);
    return div(sub(zsurf,zair),add(zsurf,zair));
  }

  // Cephes-style J1 approximation, accurate enough for loudspeaker directivity.
  function j1(x){
    const ax=Math.abs(x); let ans;
    if(ax<8){const y=x*x;const a=x*(72362614232+y*(-7895059235+y*(242396853.1+y*(-2972611.439+y*(15704.48260+y*(-30.16036606))))));const b=144725228442+y*(2300535178+y*(18583304.74+y*(99447.43394+y*(376.9991397+y))));ans=a/b;}
    else{const z=8/ax,y=z*z,xx=ax-2.356194491;const a=1+y*(.00183105+y*(-.00003516396496+y*(.000002457520174+y*(-.000000240337019))));const b=.04687499995+y*(-.0002002690873+y*(.000008449199096+y*(-.00000088228987+y*.000000105787412)));ans=Math.sqrt(.636619772/ax)*(Math.cos(xx)*a-z*Math.sin(xx)*b);if(x<0)ans=-ans;} return ans;
  }
  function piston(f,radius,sinPhi,c){const x=2*Math.PI*f/c*radius*Math.abs(sinPhi);return x<1e-5?1:2*j1(x)/x;}
  function sourceAxis(tiltDeg){const a=tiltDeg*Math.PI/180;return {x:0,y:-Math.cos(a),z:Math.sin(a)};}
  function directionSinPhi(from,to,tilt){const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,l=Math.hypot(dx,dy,dz)||1;const a=sourceAxis(tilt);const dot=(dx*a.x+dy*a.y+dz*a.z)/l;return Math.sqrt(Math.max(0,1-dot*dot));}
  function reflectionAt(s,f,grazing,absorber){return absorber?porousReflection(f,s.absorber_sigma,s.absorber_thickness*.01,grazing,s.c):C(s.rigid_R,0)}
  ns.materials={C,add,sub,mul,div,scale,expj,porousReflection,j1,piston,sourceAxis,directionSinPhi,reflectionAt};
})(window);
