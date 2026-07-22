/* Coordinate convention: ear (0,0,h_ear), speaker (D sin theta,D cos theta,h),
   desktop z=0. Core lengths are metres; public UI state uses cm as documented. */
(function(root){
  'use strict';
  const ns=root.DeskPhysics=root.DeskPhysics||{}, G=ns.geometry, M=ns.materials;
  const {C,add,mul,scale,expj}=M;
  const mag=z=>Math.hypot(z.re,z.im), phase=z=>Math.atan2(z.im,z.re);
  const cexpNeg=x=>C(Math.cos(x),-Math.sin(x));

  function driverList(s){
    const out=[{h:s.h_woofer*.01,band:'low'}];
    if(s.two_way&&Number.isFinite(s.h_tweeter)) out.push({h:(s.coaxial?s.h_woofer:s.h_tweeter)*.01,band:'high'});
    return out;
  }
  function crossoverWeight(f,band,s){
    if(!s.two_way)return 1;
    const r=Math.max(f/s.crossover,1e-9), p=Math.max(2,s.crossover_order||4),rp=Math.pow(r,p);
    // Linkwitz–Riley acoustic magnitudes; the two branches are polarity-aligned at crossover.
    return band==='low'?1/(1+rp):rp/(1+rp);
  }
  function driverGeometry(s,h){
    const local=Object.assign({},s,{h_woofer:h*100}); return G.solve(local);
  }
  function qFor(s,f,from,to){
    if(s.directivity==='omni')return 1;
    return M.piston(f,s.piston_radius*.01,M.directionSinPhi(from,to,s.tilt),s.c);
  }
  function directPressure(s,f,drivers){
    const k=2*Math.PI*f/s.c, out=C(0,0);
    for(const d of drivers){
      const g=driverGeometry(s,d.h), from={x:g.speaker.x,y:g.speaker.y,z:d.h};
      const q=qFor(s,f,from,g.ear), w=crossoverWeight(f,d.band,s);
      const p=scale(cexpNeg(k*g.direct),w*q/g.direct); out.re+=p.re;out.im+=p.im;
    }
    return out;
  }
  function referencePressure(s,f,drivers){
    // Ideal coincident, on-axis direct field. It preserves real crossover lobing in the plotted H.
    let w=0; for(const d of drivers)w+=crossoverWeight(f,d.band,s);
    const D=s.D*.01,k=2*Math.PI*f/s.c; return scale(cexpNeg(k*D),w/D);
  }
  function bounceAbsorber(s,g){return s.absorber_on&&g.bounce.y>=s.absorber_near*.01&&g.bounce.y<=s.absorber_far*.01&&g.bounce.x>=g.rect.x0&&g.bounce.x<=g.rect.x1;}

  function pointReflection(s,f,drivers,useCoverage){
    const k=2*Math.PI*f/s.c, out=C(0,0);
    for(const d of drivers){
      const g=driverGeometry(s,d.h);
      if(!useCoverage&&!g.onDesk)continue;
      const from={x:g.speaker.x,y:g.speaker.y,z:d.h}, q=qFor(s,f,from,g.bounce);
      let amp=1, R;
      if(useCoverage){
        const cov=G.coverage(s,g,f,54);
        const rigid=cov.fraction, abs=cov.absorberFraction, total=rigid+abs;
        if(total<=0)continue;
        const rr=M.reflectionAt(s,f,g.grazing,false), ra=abs?M.reflectionAt(s,f,g.grazing,true):C(0,0);
        R=scale(add(scale(rr,rigid),scale(ra,abs)),1/total); amp=Math.sqrt(total);
      }else R=M.reflectionAt(s,f,g.grazing,bounceAbsorber(s,g));
      const w=crossoverWeight(f,d.band,s), p=scale(mul(R,cexpNeg(k*g.reflected)),w*q*amp/g.reflected);
      out.re+=p.re;out.im+=p.im;
    }
    return out;
  }

  function surfaceGrid(s){
    const g=G.solve(s), requested=s.gridStep||.02, width=g.rect.x1-g.rect.x0, depth=g.rect.y1-g.rect.y0;
    const maxElements=100000, step=Math.max(requested,Math.sqrt(width*depth/maxElements));
    const nx=Math.max(1,Math.ceil(width/step)),ny=Math.max(1,Math.ceil(depth/step)),dx=width/nx,dy=depth/ny,n=nx*ny;
    const x=new Float64Array(n),y=new Float64Array(n),r2=new Float64Array(n),cos2=new Float64Array(n),abs=new Uint8Array(n);
    let p=0;for(let j=0;j<ny;j++)for(let i=0;i<nx;i++,p++){
      x[p]=g.rect.x0+(i+.5)*dx;y[p]=g.rect.y0+(j+.5)*dy;
      r2[p]=Math.hypot(x[p],y[p],g.ear.z);cos2[p]=g.ear.z/r2[p];
      abs[p]=s.absorber_on&&y[p]>=s.absorber_near*.01&&y[p]<=s.absorber_far*.01?1:0;
    }
    return {g,x,y,r2,cos2,abs,n,area:dx*dy,step:Math.max(dx,dy),nx,ny};
  }

  function kirchhoffReflection(s,f,drivers,grid){
    const k=2*Math.PI*f/s.c, sum=C(0,0), pref=grid.area/(2*Math.PI);
    for(const d of drivers){
      const gg=driverGeometry(s,d.h), src={x:gg.speaker.x,y:gg.speaker.y,z:d.h}, w=crossoverWeight(f,d.band,s);
      for(let i=0;i<grid.n;i++){
        const dx=grid.x[i]-src.x,dy=grid.y[i]-src.y,r1=Math.hypot(dx,dy,d.h);
        const grazing=Math.asin(Math.min(1,(d.h/r1+grid.cos2[i])*.5));
        const q=qFor(s,f,src,{x:grid.x[i],y:grid.y[i],z:0});
        const R=M.reflectionAt(s,f,grazing,!!grid.abs[i]);
        const e=cexpNeg(k*(r1+grid.r2[i]));
        // Supplied Rayleigh–Sommerfeld kernel. cos(theta_local) is the receive-side normal cosine.
        const kernel=C(1/grid.r2[i],k*grid.cos2[i]);
        const z=mul(mul(R,e),kernel), a=pref*w*q/(r1*grid.r2[i]);
        sum.re+=z.re*a;sum.im+=z.im*a;
      }
    }
    return sum;
  }

  function evaluate(s,frequencies,forcedModel){
    const model=forcedModel||s.model, n=frequencies.length, hre=new Float64Array(n),him=new Float64Array(n),db=new Float64Array(n),cov=new Float64Array(n);
    const drivers=driverList(s), baseG=G.solve(s), grid=model==='kirchhoff'?surfaceGrid(s):null;
    for(let i=0;i<n;i++){
      const f=frequencies[i],direct=directPressure(s,f,drivers),ref= model==='kirchhoff'?kirchhoffReflection(s,f,drivers,grid):pointReflection(s,f,drivers,model==='fresnel');
      const total=add(direct,ref), baseline=referencePressure(s,f,drivers), den=baseline.re*baseline.re+baseline.im*baseline.im||1e-30;
      hre[i]=(total.re*baseline.re+total.im*baseline.im)/den;him[i]=(total.im*baseline.re-total.re*baseline.im)/den;
      db[i]=20*Math.log10(Math.max(1e-8,Math.hypot(hre[i],him[i])));
      cov[i]=G.coverage(s,baseG,f,42).fraction;
    }
    return {frequencies,hre,him,db,coverage:cov,geometry:baseG,grid};
  }

  function smoothLog(f,v,fraction){
    if(!fraction)return new Float64Array(v);const out=new Float64Array(v.length),half=Math.pow(2,1/(2*fraction));
    let lo=0,hi=0,sum=0;for(let i=0;i<v.length;i++){while(hi<v.length&&f[hi]<=f[i]*half)sum+=v[hi++];while(lo<v.length&&f[lo]<f[i]/half)sum-=v[lo++];out[i]=sum/Math.max(1,hi-lo);}return out;
  }
  function combDepth(f,db,lo,hi){let mn=Infinity,mx=-Infinity;for(let i=0;i<f.length;i++)if(f[i]>=lo&&f[i]<=hi){mn=Math.min(mn,db[i]);mx=Math.max(mx,db[i]);}return {swing:mx-mn,min:mn,max:mx};}

  function fft(re,im,inverse){
    const n=re.length;for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
    for(let len=2;len<=n;len<<=1){const a=(inverse?2:-2)*Math.PI/len;for(let i=0;i<n;i+=len)for(let j=0;j<len/2;j++){const c=Math.cos(a*j),d=Math.sin(a*j),u=i+j,v=u+len/2,tr=re[v]*c-im[v]*d,ti=re[v]*d+im[v]*c;re[v]=re[u]-tr;im[v]=im[u]-ti;re[u]+=tr;im[u]+=ti;}}
    if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}return {re,im};
  }
  function unwrap(p){const o=new Float64Array(p.length);o[0]=p[0];let off=0;for(let i=1;i<p.length;i++){const d=p[i]-p[i-1];if(d>Math.PI)off-=2*Math.PI;else if(d<-Math.PI)off+=2*Math.PI;o[i]=p[i]+off;}return o;}
  function timeAnalysis(s,N=2048,sampleRate=48000){
    const one=N/2+1,f=new Float64Array(one);for(let i=0;i<one;i++)f[i]=i*sampleRate/N;
    const ev=evaluate(s,f,s.model),hr=new Float64Array(N),hi=new Float64Array(N),lm=new Float64Array(N),li=new Float64Array(N);
    for(let i=0;i<one;i++){hr[i]=ev.hre[i];hi[i]=ev.him[i];lm[i]=Math.log(Math.max(1e-9,Math.hypot(hr[i],hi[i])));}
    for(let i=1;i<N/2;i++){hr[N-i]=hr[i];hi[N-i]=-hi[i];lm[N-i]=lm[i];}
    const cepR=new Float64Array(lm),cepI=new Float64Array(N);fft(cepR,cepI,true);
    for(let i=1;i<N/2;i++)cepR[i]*=2;for(let i=N/2+1;i<N;i++)cepR[i]=0;cepI.fill(0);fft(cepR,cepI,false);
    const totalP=unwrap(Array.from({length:one},(_,i)=>Math.atan2(ev.him[i],ev.hre[i]))),minP=unwrap(cepI.slice(0,one));
    const gdF=[],gd=[];for(let i=2;i<one-2;i++){const domega=2*Math.PI*(f[i+1]-f[i-1]);const gt=-(totalP[i+1]-totalP[i-1])/domega,gm=-(minP[i+1]-minP[i-1])/domega;gdF.push(f[i]);
      // For a causal stable response, H/H_min is all-pass and its group delay is
      // non-negative. Small negative residues come only from finite-FFT/Hilbert error.
      gd.push(Math.max(0,(gt-gm)*1000));}
    const irR=new Float64Array(hr),irI=new Float64Array(hi);fft(irR,irI,true);
    const ar=new Float64Array(irR),ai=new Float64Array(N);fft(ar,ai,false);for(let i=1;i<N/2;i++){ar[i]*=2;ai[i]*=2;}for(let i=N/2+1;i<N;i++){ar[i]=0;ai[i]=0;}fft(ar,ai,true);
    const time=[],etc=[];let peak=1e-12;for(let i=0;i<N;i++)peak=Math.max(peak,Math.hypot(ar[i],ai[i]));for(let i=0;i<Math.min(N,Math.round(.05*sampleRate));i++){time.push(i/sampleRate*1000);etc.push(20*Math.log10(Math.max(1e-8,Math.hypot(ar[i],ai[i])/peak)));}
    return {gdF:Float64Array.from(gdF),gd:Float64Array.from(gd),time:Float64Array.from(time),etc:Float64Array.from(etc)};
  }
  function verticalPolar(s){
    const angles=new Float64Array(121),db=new Float64Array(121),f=s.crossover,D=s.D*.01,k=2*Math.PI*f/s.c,hw=s.h_woofer*.01,ht=(s.coaxial?s.h_woofer:s.h_tweeter)*.01;
    for(let i=0;i<angles.length;i++){const a=(-60+i)*Math.PI/180,y=-D*Math.cos(a),z=s.h_ear*.01+D*Math.sin(a),rw=Math.hypot(D*Math.cos(a),z-hw),rt=Math.hypot(D*Math.cos(a),z-ht);const p=add(scale(cexpNeg(k*rw),crossoverWeight(f,'low',s)/rw),scale(cexpNeg(k*rt),crossoverWeight(f,'high',s)/rt));angles[i]=a*180/Math.PI;db[i]=20*Math.log10(Math.max(1e-5,mag(p)*D/Math.SQRT2));}
    return {angles,db};
  }
  ns.models={evaluate,smoothLog,combDepth,fft,timeAnalysis,verticalPolar,driverGeometry};
})(window);
