// Original, locally generated model. Metres; +Y up, -Z forward.
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFile } from 'node:fs/promises';

globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};
const car = new T.Group();
car.name = 'BrunoGT';
const paint = new T.MeshPhysicalMaterial({ color: '#276690', metalness: .78, roughness: .25, clearcoat: 1, clearcoatRoughness: .16 });
const rubber = new T.MeshStandardMaterial({ color: '#151719', roughness: .92 });
const trim = new T.MeshStandardMaterial({ color: '#20242b', metalness: .4, roughness: .4 });
const alloy = new T.MeshStandardMaterial({ color: '#bbc4ce', metalness: .9, roughness: .22 });
const glass = new T.MeshPhysicalMaterial({ color: '#152b3a', metalness: .35, roughness: .12, clearcoat: 1 });
const red = new T.MeshStandardMaterial({ color: '#a40812', emissive: '#ff1010', emissiveIntensity: .7 });
red.name = 'BrakeLights';
const white = new T.MeshStandardMaterial({ color: '#e4f7ff', emissive: '#b9e7ff', emissiveIntensity: 3 });
function mesh(geo, mat, name, pos = [0,0,0], parent = car) {
  const m = new T.Mesh(geo, mat); m.name = name; m.position.set(...pos); parent.add(m); return m;
}
const boxGeometries = new Map();
function box(name, size, pos, mat = paint, radius = .04, parent = car) {
  const key = [...size, radius].join(',');
  if (!boxGeometries.has(key)) boxGeometries.set(key, new RoundedBoxGeometry(...size, 2, radius));
  return mesh(boxGeometries.get(key), mat, name, pos, parent);
}
// Longitudinal sections shape the rounded nose, hood, shoulders and rear deck.
const sections = [[-2.12,.70,.05,.23],[-1.92,.91,-.05,.38],[-1.35,.97,-.08,.49],[-.72,.94,-.1,.52],[.65,.96,-.1,.52],[1.38,.98,-.06,.55],[1.98,.88,.02,.42],[2.1,.74,.09,.32]];
const verts = [], indices = [];
for (const [z,w,b,t] of sections) {
  for (const [x,y] of [[-w*.88,b],[-w,b+.12],[-w,t-.10],[-w*.82,t],[w*.82,t],[w,t-.10],[w,b+.12],[w*.88,b]]) verts.push(x,y,z);
}
for(let s=0;s<sections.length-1;s++) for(let i=0;i<8;i++) { const a=s*8+i,b=s*8+(i+1)%8,c=b+8,d=a+8; indices.push(a,c,b,a,d,c); }
for(let i=1;i<7;i++) { indices.push(0,i,i+1); const a=(sections.length-1)*8; indices.push(a,a+i+1,a+i); }
const bodyGeo = new T.BufferGeometry(); bodyGeo.setAttribute('position',new T.Float32BufferAttribute(verts,3)); bodyGeo.setIndex(indices); bodyGeo.computeVertexNormals();
mesh(bodyGeo,paint,'SculptedBody');
box('Floor',[1.65,.16,3.65],[0,-.10,0],trim);
// Sloped glass canopy with a separate roof and structural pillars.
const canopy = new T.BufferGeometry();
canopy.setAttribute('position',new T.Float32BufferAttribute([-.81,.50,-.88,.81,.50,-.88,-.66,1.07,-.30,.66,1.07,-.30,-.66,1.07,.54,.66,1.07,.54,-.82,.52,1.20,.82,.52,1.20],3));
canopy.setIndex([0,2,1,1,2,3,2,4,3,3,4,5,4,6,5,5,6,7,0,6,2,2,6,4,1,3,7,3,5,7]); canopy.computeVertexNormals();
mesh(canopy,glass,'Glazing');
box('Roof',[1.36,.09,.91],[0,1.09,.13]);
function bar(name,a,b,r,mat=paint) { const start=new T.Vector3(...a),end=new T.Vector3(...b), d=end.clone().sub(start); const m=mesh(new T.CylinderGeometry(r,r,d.length(),10),mat,name,start.add(end).multiplyScalar(.5).toArray()); m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()); }
for(const s of [-1,1]) {
  bar('A_Pillar',[s*.81,.5,-.88],[s*.66,1.08,-.30],.035);
  bar('C_Pillar',[s*.66,1.08,.54],[s*.82,.52,1.2],.055);
  bar('B_Pillar',[s*.81,.52,.28],[s*.67,1.07,.28],.025,trim);
  box('Sill',[.12,.15,2.05],[s*.94,-.02,.05],trim);
  box('DoorHandle',[.035,.04,.20],[s*.956,.47,.45],alloy,.012);
  box('Mirror',[.24,.12,.27],[s*1.02,.66,-.58],paint);
  box('Headlight',[.50,.075,.08],[s*.58,.30,-2.02],white,.025);
  box('TailLight',[.54,.08,.075],[s*.55,.34,2.025],red,.022);
  box('FrontIntake',[.32,.12,.065],[s*.63,.12,-2.045],trim);
  const exhaust = mesh(new T.CylinderGeometry(.065,.065,.15,20),alloy,'Exhaust',[s*.65,.03,2.04]); exhaust.rotation.x=Math.PI/2;
}
box('Grille',[.65,.14,.06],[0,.12,-2.10],trim);
for(let i=-3;i<=3;i++) box('GrilleFin',[.018,.11,.02],[i*.08,.12,-2.14],alloy,.004);
box('Splitter',[1.8,.045,.23],[0,-.03,-1.94],trim);
box('Diffuser',[1.7,.13,.22],[0,-.015,1.94],trim);
box('RearLip',[1.64,.055,.17],[0,.48,1.88]);
for(const [index,x,z] of [[0,-.97,-1.30],[1,.97,-1.30],[2,-.97,1.30],[3,.97,1.30]]) {
  const wheel=new T.Group(); wheel.name=`Wheel_${index}`; wheel.position.set(x,-.28,z); car.add(wheel);
  const tire=mesh(new T.CylinderGeometry(.35,.35,.25,48),rubber,'Tire',[0,0,0],wheel); tire.rotation.z=Math.PI/2;
  for(const side of [-1,1]) {
    const ring=mesh(new T.TorusGeometry(.255,.027,10,48),alloy,'Rim',[side*.13,0,0],wheel); ring.rotation.y=Math.PI/2;
    const disc=mesh(new T.CylinderGeometry(.22,.22,.012,40),alloy,'BrakeDisc',[side*.10,0,0],wheel); disc.rotation.z=Math.PI/2;
    for(let j=0;j<5;j++) { const a=j*Math.PI*2/5; const spoke=box('Spoke',[.025,.052,.43],[side*.14,0,0],alloy,.012,wheel); spoke.rotation.x=a; }
    const hub=mesh(new T.CylinderGeometry(.065,.065,.035,24),trim,'Hub',[side*.155,0,0],wheel); hub.rotation.z=Math.PI/2;
  }
  for(let j=0;j<40;j++) { const a=j*Math.PI/20; const tread=box('Tread',[.22,.012,.028],[0,Math.cos(a)*.35,Math.sin(a)*.35],trim,.003,wheel); tread.rotation.x=a; }
}
car.updateMatrixWorld(true);
const glb=await new GLTFExporter().parseAsync(car,{binary:true});
await writeFile(new URL('../public/models/bruno-gt.glb',import.meta.url),Buffer.from(glb));
console.log(`bruno-gt.glb: ${glb.byteLength} bytes`);
