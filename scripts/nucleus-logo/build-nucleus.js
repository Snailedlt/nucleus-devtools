// Builds media/nucleus-{original,plain,line}.svg: Nucleus Co-op's logo (its icon.ico and theme logo.png) rebuilt from
// geometry. Uses the svg-icons skill's scripts (devicon PR #2824, .claude/skills/svg-icons/scripts, npm install there):
//   cd media && SVG_ICONS_SCRIPTS=/path/to/svg-icons/scripts node ../scripts/nucleus-logo/build-nucleus.js   (writes into the current folder)
// crossings.json: which orbit is on top at each of the 12 crossings (read from icon.ico); shine.json: the core.
// Nucleus Co-op logo rebuilt from its geometry (measured from Nucleus Co-op's own icon.ico and theme logo.png):
// three copies of one ellipse rotated 30/90/150 deg, woven as in the original; a disc behind; a core with a shine.
const fs=require('fs');const B=require(process.env.SVG_ICONS_SCRIPTS+'/build');const {paper}=B;const {PaperOffset}=paper;
const X=JSON.parse(fs.readFileSync(__dirname+'/crossings.json'));
const C=new paper.Point(64.12,64.06), RX=58.04, RY=34.5, BAND=12.4;
const ROT={dark:30,mid:90,light:150};
const COL={dark:'#29582b',mid:'#579758',light:'#91c191'};
const ellipse=(r,rx=RX,ry=RY)=>{const e=new paper.Path.Ellipse({center:C,radius:[rx,ry],insert:false});e.rotate(r,C);return e;};
const band=(r,w)=>ellipse(r,RX+w/2,RY+w/2).subtract(ellipse(r,RX-w/2,RY-w/2),{insert:false});
const circle=(c,r)=>new paper.Path.Circle({center:c,radius:r,insert:false});
// visible part of each orbit: its band minus the bands that go over it at their crossings
function orbits(w,gap){
  // at each crossing, cut the whole overlap of the two bands (the piece around the crossing point) out of the
  // band that goes under, widened by the gap: clean straight-through cuts, no stubs at a clip circle's edge
  const out={};
  for(const k of Object.keys(ROT)){
    let p=band(ROT[k],w);
    for(const x of X){ if((x.a===k||x.b===k)&&x.top!==k){
      const over=band(ROT[x.top],w+2*gap);
      const ov=p.intersect(over,{insert:false});
      const pieces=(ov.children&&ov.children.length?ov.children:[ov]).map(c=>c.clone({insert:false}));
      const pt=new paper.Point(x.x,x.y);
      const piece=pieces.sort((a,b)=>a.bounds.center.getDistance(pt)-b.bounds.center.getDistance(pt))[0];
      p=p.subtract(piece,{insert:false}); } }
    out[k]=p;
  }
  return out;
}
const svgOf=(parts)=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">'+parts.join('')+'</svg>';
const d=p=>{const s=B.pathSvg(p,'#000');return s.match(/ d="([^"]+)"/)[1];};
// ---- original
const o=orbits(BAND,0);
const all=B.unionAll(Object.values(o).map(p=>p.clone({insert:false})));
const fit=B.fitMatrix(all.bounds);
const T=p=>{const q=p.clone({insert:false});q.transform(fit);return q;};
const core=circle(C,16.9);
const disc=circle(C,52);
// reflection, drawn like the original: flat peach and white. Peach = a rim along the upper left, a patch around
// the highlight and a rounded tail towards the centre; the red curves in from the lower left between them.
const capsule=(p1,p2,r)=>{const v=p2.subtract(p1).normalize(r).rotate(90);
  const body=new paper.Path({segments:[p1.add(v),p2.add(v),p2.subtract(v),p1.subtract(v)],closed:true,insert:false});
  return body.unite(circle(p1,r),{insert:false}).unite(circle(p2,r),{insert:false});};
const SH=JSON.parse(fs.readFileSync(__dirname+'/shine.json')); // required: it holds the core's tube and ring too
const sh=Object.assign({rimDx:3.4,rimDy:2.2,rimR:16.4,dot:[-5.6,-5.5],dotR:5.6,patchR:8.2,tip:[5.6,3.2],tailR:4.3,round:1.6},SH);
const dotC=C.add(sh.dot);
// the core, read as the original draws it: a peach circle, a red tube bent into a C with round ends, a white
// circle on top. The tube is one even-width arc (the original's is drawn freehand).
const arcTube=(c,R,w,a1,a2)=>{ // true arcs (few nodes): outer arc, round end, inner arc back, round start
  const at=(t,r)=>c.add([Math.cos(t*Math.PI/180)*r,Math.sin(t*Math.PI/180)*r]), m=(a1+a2)/2;
  const o=new paper.Path.Arc({from:at(a1,R+w/2),through:at(m,R+w/2),to:at(a2,R+w/2),insert:false});
  const i=new paper.Path.Arc({from:at(a2,R-w/2),through:at(m,R-w/2),to:at(a1,R-w/2),insert:false});
  const p=new paper.Path({insert:false}); p.addSegments(o.segments); p.addSegments(i.segments); p.closed=true;
  return p.unite(circle(at(a1,R),w/2),{insert:false}).unite(circle(at(a2,R),w/2),{insert:false});};
const tube=arcTube(C.add(sh.tubeC),sh.tubeR,sh.tubeW,sh.a1,sh.a2).intersect(core,{insert:false});
const dot=circle(dotC,sh.dotR); const dotRing=circle(dotC,sh.dotR+sh.ring);
const gc=fit.transform(C);
const sc=fit.scaling.x;
const parts=[
 '<defs><radialGradient id="g" cx="'+gc.x.toFixed(2)+'" cy="'+gc.y.toFixed(2)+'" r="'+(52*sc).toFixed(2)+'" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#46594f"/><stop offset=".4" stop-color="#3a4d46"/><stop offset=".65" stop-color="#334842"/><stop offset="1" stop-color="#1f3335"/></radialGradient></defs>',
 '<path fill="url(#g)" d="'+d(T(disc))+'"/>',
 ...['mid','light','dark'].map(k=>'<path fill="'+COL[k]+'" d="'+d(T(o[k]))+'"/>'),
 '<path fill="#fab280" d="'+d(T(core))+'"/>',
 '<path fill="#f15758" d="'+d(T(tube))+'"/>',
 '<path fill="#fab280" d="'+d(T(dotRing))+'"/>',
 '<path fill="#fff" d="'+d(T(dot))+'"/>'];
const write=(n,s)=>fs.writeFileSync(n+'.svg',B.prefixIds(B.optimize(s),n)+'\n');
write('nucleus-original',svgOf(parts));
// ---- plain: one colour, one path; weave shown by gaps, core solid, disc left out
const og=orbits(BAND,1.4);
let plain=B.unionAll([...Object.values(og),core.clone({insert:false})]); plain.transform(B.fitMatrix(plain.bounds));
write('nucleus-plain',B.pathSvg(plain,'#579758'));
// ---- line: centre-line orbits of width 4 woven with gaps, core as a ring of width 4
const LW=4;
const ol=orbits(LW,2);
const ring=core.subtract(circle(C,16.9-LW),{insert:false});
let line=B.unionAll([...Object.values(ol),ring]); line.transform(B.fitMatrix(line.bounds));
write('nucleus-line',B.pathSvg(line,'#579758'));
