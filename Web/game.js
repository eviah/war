// ============================================================================
//  GLOBAL WARFARE — browser tactical slice  (v0.4)
//  NEW: multi-map theaters · route-drawing planning board · in-engine cinematic
//       transition · escalating waypoint encounters → boss fight → plant flag ·
//       smarter line-of-sight AI · rebuilt flyable jet.
// ============================================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const $ = id => document.getElementById(id);
const boot = m => { const el = $('boot-msg'); if (el) el.textContent = m; };
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;

// ===========================================================================
//  CONTENT TABLES
// ===========================================================================
const WEAPONS = {
  rifle:   { name:'M4A1 CARBINE', mag:30, reserve:150, rpm:700, modes:['AUTO','SEMI'], dmg:34, muzzle:240, mass:3.4, recoil:0.012, spread:0.012, jamChance:0.012, adsZoom:1.3 },
  carbine: { name:'MP5 SMG',      mag:30, reserve:200, rpm:800, modes:['AUTO','SEMI'], dmg:24, muzzle:200, mass:3.0, recoil:0.009, spread:0.018, jamChance:0.018, adsZoom:1.2 },
  lmg:     { name:'M249 SAW',     mag:100,reserve:300, rpm:720, modes:['AUTO'],        dmg:40, muzzle:230, mass:7.5, recoil:0.018, spread:0.024, jamChance:0.02,  adsZoom:1.15 },
  sniper:  { name:'M107 .50 CAL', mag:5,  reserve:40,  rpm:50,  modes:['SEMI'],        dmg:160,muzzle:300, mass:6.5, recoil:0.05,  spread:0.0008,jamChance:0.006, adsZoom:5.0 },
  pistol:  { name:'M17 SIDEARM',  mag:17, reserve:85,  rpm:450, modes:['SEMI'],        dmg:24, muzzle:160, mass:0.9, recoil:0.014, spread:0.02,  jamChance:0.01,  adsZoom:1.1 },
  rpg:     { name:'RPG-7 BAZOOKA',mag:1,  reserve:10,  rpm:40,  modes:['SEMI'],        dmg:0,  muzzle:72,  mass:7.0, recoil:0.06,  spread:0.004, jamChance:0.0,   adsZoom:1.2, rocket:true, splash:19, splashDmg:700 },
};
const FACTIONS = [
  { id:'usa',    name:'UNITED STATES', sub:'U.S. Army', color:0x2a4d9b, camo:0x4b5320 },
  { id:'russia', name:'RUSSIA',        sub:'VDV',       color:0xb33a3a, camo:0x6b6b4a },
  { id:'china',  name:'CHINA',         sub:'PLA',       color:0xde2910, camo:0x5a6b3a },
  { id:'uk',     name:'UNITED KINGDOM',sub:'Royal Marines', color:0x1d3a8a, camo:0x55603a },
];
const TARGETS = ['RUSSIA','CHINA','IRAN','NORTH KOREA','UNITED STATES'];
const MAPS = {
  newyork: { name:'NEW YORK',   ground:0x33363c, kind:'city',     time:'dusk' },
  desert:  { name:'DESERT WAR', ground:0xae9466, kind:'compound', time:'day'  },
  harbor:  { name:'HARBOR ZONE',ground:0x44484d, kind:'harbor',   time:'night'},
};
const MISSIONS = {
  hvt:     { name:'HIGH VALUE KILL',       sub:'Decapitation strike' },
  recon:   { name:'DEEP RECON / SABOTAGE', sub:'Cut the supply lines' },
  air:     { name:'BEHIND-LINES STRIKE',   sub:'Overrun the district' },
  combined:{ name:'COMBINED ARMS STRIKE',  sub:'Armored spearhead' },
};
const TIMES = {
  dawn:  { name:'DAWN',   sun:[-60,40,40],  sunColor:0xffd9a0, sunInt:2.2, hemi:0.7, sky:[0x2a4a73,0x9fb2c6,0xe6c79b], fog:0x9aa9bc, exposure:1.05, lit:0.25 },
  day:   { name:'MIDDAY', sun:[-40,90,30],  sunColor:0xfff4e0, sunInt:2.6, hemi:0.9, sky:[0x3f7bd0,0xa9c4e6,0xdfe9f3], fog:0x9fb0c2, exposure:0.92, lit:0.0 },
  dusk:  { name:'DUSK',   sun:[60,18,-30],  sunColor:0xff9050, sunInt:1.8, hemi:0.45,sky:[0x20304f,0x8a6a8f,0xff8c55], fog:0x6a5566, exposure:1.1,  lit:0.6 },
  night: { name:'NIGHT',  sun:[-30,60,20],  sunColor:0x9fb4e0, sunInt:0.4, hemi:0.22,sky:[0x05080f,0x0c1426,0x1a2238], fog:0x0d141f, exposure:1.35, lit:1.0 },
};
const WEATHERS = {
  clear:    { name:'CLEAR',    fogDensity:0.0026, windBase:2.5 },
  overcast: { name:'OVERCAST', fogDensity:0.006,  windBase:4.0 },
  fog:      { name:'HEAVY FOG',fogDensity:0.014,  windBase:1.5 },
  storm:    { name:'STORM',    fogDensity:0.009,  windBase:8.0 },
};
const CONFIG = { map:'newyork', faction:'usa', target:'RUSSIA', mission:'hvt', time:'dusk', weather:'clear', weapon:'rifle', squad:4 };
// ---- world-conquest campaign ----
const NATIONS=[
  {id:'usa',    name:'UNITED STATES', flag:'\u{1F1FA}\u{1F1F8}', color:0x2a4d9b, camo:0x4b5320, landmark:'liberty',   map:'newyork', time:'dusk',  strength:6},
  {id:'russia', name:'RUSSIA',        flag:'\u{1F1F7}\u{1F1FA}', color:0xb33a3a, camo:0x6b6b4a, landmark:'kremlin',   map:'newyork', time:'night', strength:6},
  {id:'china',  name:'CHINA',         flag:'\u{1F1E8}\u{1F1F3}', color:0xde2910, camo:0x5a6b3a, landmark:'pagoda',    map:'newyork', time:'dusk',  strength:6},
  {id:'france', name:'FRANCE',        flag:'\u{1F1EB}\u{1F1F7}', color:0x2a4db0, camo:0x55603a, landmark:'eiffel',    map:'newyork', time:'dusk',  strength:5},
  {id:'uk',     name:'UNITED KINGDOM',flag:'\u{1F1EC}\u{1F1E7}', color:0x1d3a8a, camo:0x55603a, landmark:'bigben',    map:'newyork', time:'overcast',strength:5},
  {id:'germany',name:'GERMANY',       flag:'\u{1F1E9}\u{1F1EA}', color:0x333333, camo:0x4a4a3a, landmark:'gate',      map:'newyork', time:'day',   strength:5},
  {id:'japan',  name:'JAPAN',         flag:'\u{1F1EF}\u{1F1F5}', color:0xbc002d, camo:0x556655, landmark:'pagoda',    map:'newyork', time:'dawn',  strength:5},
  {id:'india',  name:'INDIA',         flag:'\u{1F1EE}\u{1F1F3}', color:0xff9933, camo:0x55603a, landmark:'taj',       map:'newyork', time:'day',   strength:4},
  {id:'italy',  name:'ITALY',         flag:'\u{1F1EE}\u{1F1F9}', color:0x009246, camo:0x55603a, landmark:'colosseum', map:'newyork', time:'dusk',  strength:4},
  {id:'brazil', name:'BRAZIL',        flag:'\u{1F1E7}\u{1F1F7}', color:0x009c3b, camo:0x4b6b3a, landmark:'christ',    map:'harbor',  time:'day',   strength:4},
  {id:'iraq',   name:'IRAQ',          flag:'\u{1F1EE}\u{1F1F6}', color:0x2e7d32, camo:0xb8a06a, landmark:'minaret',   map:'desert',  time:'day',   strength:3},
  {id:'egypt',  name:'EGYPT',         flag:'\u{1F1EA}\u{1F1EC}', color:0xc8a23d, camo:0xc8b48a, landmark:'pyramid',   map:'desert',  time:'day',   strength:3},
  {id:'spain',  name:'SPAIN',         flag:'\u{1F1EA}\u{1F1F8}', color:0xc60b1e, camo:0x9a7b3a, landmark:'colosseum', map:'newyork', time:'dusk',  strength:4},
  {id:'turkey', name:'TURKEY',        flag:'\u{1F1F9}\u{1F1F7}', color:0xe30a17, camo:0x8a7b4a, landmark:'minaret',   map:'desert',  time:'dusk',  strength:4},
  {id:'korea',  name:'SOUTH KOREA',   flag:'\u{1F1F0}\u{1F1F7}', color:0x2a4d9b, camo:0x4a5a3a, landmark:'pagoda',    map:'newyork', time:'night', strength:5},
  {id:'canada', name:'CANADA',        flag:'\u{1F1E8}\u{1F1E6}', color:0xd52b1e, camo:0x4b5320, landmark:'bigben',    map:'harbor',  time:'overcast',strength:4},
  {id:'mexico', name:'MEXICO',        flag:'\u{1F1F2}\u{1F1FD}', color:0x006847, camo:0xa08a4a, landmark:'pyramid',   map:'desert',  time:'day',   strength:3},
  {id:'australia',name:'AUSTRALIA',   flag:'\u{1F1E6}\u{1F1FA}', color:0x00843d, camo:0x9a8a4a, landmark:'gate',      map:'harbor',  time:'day',   strength:4},
  {id:'saudi',  name:'SAUDI ARABIA',  flag:'\u{1F1F8}\u{1F1E6}', color:0x006c35, camo:0xc8b48a, landmark:'minaret',   map:'desert',  time:'day',   strength:4},
  {id:'ukraine',name:'UKRAINE',       flag:'\u{1F1FA}\u{1F1E6}', color:0x0057b7, camo:0x6b6b4a, landmark:'kremlin',   map:'newyork', time:'overcast',strength:5},
  {id:'israel', name:'ISRAEL',        flag:'\u{1F1EE}\u{1F1F1}', color:0x0038b8, camo:0xc8b48a, landmark:'minaret',   map:'desert',  time:'dusk',  strength:4},
  {id:'argentina',name:'ARGENTINA',   flag:'\u{1F1E6}\u{1F1F7}', color:0x74acdf, camo:0x4b6b3a, landmark:'christ',    map:'harbor',  time:'day',   strength:3},
  {id:'poland', name:'POLAND',        flag:'\u{1F1F5}\u{1F1F1}', color:0xdc143c, camo:0x55603a, landmark:'gate',      map:'newyork', time:'overcast',strength:4},
  {id:'greece', name:'GREECE',        flag:'\u{1F1EC}\u{1F1F7}', color:0x0d5eaf, camo:0x9a8a4a, landmark:'colosseum', map:'newyork', time:'day',   strength:3},
  {id:'sweden', name:'SWEDEN',        flag:'\u{1F1F8}\u{1F1EA}', color:0x006aa7, camo:0x55603a, landmark:'bigben',    map:'harbor',  time:'overcast',strength:4},
];
const nationById=id=>NATIONS.find(n=>n.id===id)||NATIONS[0];
const campaign={ player:null, target:null, treasury:1000, owned:new Set(), turn:1, news:'', army:4, deployed:0, up:{squad:0,health:0,damage:0,reserves:0} };
function maxArmy(){ return 4+campaign.up.squad*2; }
function saveGame(){ try{ localStorage.setItem('gw_save',JSON.stringify({player:campaign.player,treasury:campaign.treasury,owned:[...campaign.owned],turn:campaign.turn,army:campaign.army,up:campaign.up})); }catch(e){} }
function loadGame(){ try{ const s=JSON.parse(localStorage.getItem('gw_save')); if(s&&s.player){ campaign.player=s.player; campaign.treasury=s.treasury; campaign.owned=new Set(s.owned); campaign.turn=s.turn||1; campaign.army=s.army!=null?s.army:4; campaign.up=Object.assign({squad:0,health:0,damage:0,reserves:0},s.up||{}); CONFIG.faction=s.player; return true; } }catch(e){} return false; }
function wipeSave(){ try{ localStorage.removeItem('gw_save'); }catch(e){} }

// world bounds / objective anchors
const GRID=5, BLOCK=40, STREET=18, CELL=BLOCK+STREET, WB=GRID*CELL; // ~290
const insertion = new THREE.Vector3(0,0,WB*0.78);
const hqPos     = new THREE.Vector3(0,0,-WB*0.78);
const SPIRE     = new THREE.Vector3(CELL*2.5,0,CELL*1.5); // Empire-State-style landmark
const UPV       = new THREE.Vector3(0,1,0);

// ===========================================================================
//  RENDERER / SCENES
// ===========================================================================
boot('BOOTING RENDERER…');
const app=$('app');
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(0.85); // slightly below native for headroom on integrated GPUs
renderer.shadowMap.enabled=false; renderer.toneMapping=THREE.ACESFilmicToneMapping;
app.appendChild(renderer.domElement);
const scene=new THREE.Scene(); scene.fog=new THREE.FogExp2(0xa9b6c4,0.006);
const camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,0.05,4000);
const FOV_HIP=75;
const gunScene=new THREE.Scene(); const gunCam=new THREE.PerspectiveCamera(80,innerWidth/innerHeight,0.002,5);
const skyMat=new THREE.ShaderMaterial({ side:THREE.BackSide,
  uniforms:{ top:{value:new THREE.Color(0x2a4a73)}, mid:{value:new THREE.Color(0x9fb2c6)}, bot:{value:new THREE.Color(0xe6c79b)} },
  vertexShader:`varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader:`varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; void main(){ float h=normalize(vP).y; vec3 c=h>0.0?mix(mid,top,pow(h,0.7)):mix(mid,bot,pow(-h,0.5)); gl_FragColor=vec4(c,1.0);} `});
const skyMesh=new THREE.Mesh(new THREE.SphereGeometry(1600,32,16),skyMat); scene.add(skyMesh);
const hemi=new THREE.HemisphereLight(0xbcd2ec,0x2a2a2a,0.85); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff1d6,2.2); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.near=1; sun.shadow.camera.far=300; sun.shadow.camera.left=-95; sun.shadow.camera.right=95; sun.shadow.camera.top=95; sun.shadow.camera.bottom=-95; sun.shadow.bias=-0.0005;
scene.add(sun); scene.add(sun.target);
const fill=new THREE.DirectionalLight(0x6688cc,0.35); fill.position.set(50,30,-40); scene.add(fill);

// ===========================================================================
//  TEXTURES
// ===========================================================================
function noiseTex(size,base,spread){ const c=document.createElement('canvas'); c.width=c.height=size; const ctx=c.getContext('2d'); const img=ctx.createImageData(size,size);
  for(let i=0;i<size*size;i++){ const n=base+(Math.random()-0.5)*spread; img.data[i*4]=img.data[i*4+1]=img.data[i*4+2]=clamp(n,0,255); img.data[i*4+3]=255; }
  ctx.putImageData(img,0,0); const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t; }
function facadeTex(tint,litChance){ const W=128,H=256,c=document.createElement('canvas'); c.width=W;c.height=H; const ctx=c.getContext('2d');
  const e=document.createElement('canvas'); e.width=W;e.height=H; const ex=e.getContext('2d');
  ctx.fillStyle=tint; ctx.fillRect(0,0,W,H); ex.fillStyle='#000'; ex.fillRect(0,0,W,H);
  const cols=6,rows=12,mx=6,my=6,ww=(W-mx*(cols+1))/cols,wh=(H-my*(rows+1))/rows;
  for(let r=0;r<rows;r++)for(let col=0;col<cols;col++){ const x=mx+col*(ww+mx),y=my+r*(wh+my),lit=Math.random()<litChance;
    ctx.fillStyle=lit?'#ffd98a':'#1b2330'; ctx.fillRect(x,y,ww,wh); if(lit){ ex.fillStyle='#ffcf7a'; ex.fillRect(x,y,ww,wh); } }
  const map=new THREE.CanvasTexture(c); map.wrapS=map.wrapT=THREE.RepeatWrapping; map.repeat.set(2,4);
  const emap=new THREE.CanvasTexture(e); emap.wrapS=emap.wrapT=THREE.RepeatWrapping; emap.repeat.set(2,4); return {map,emap}; }

// ===========================================================================
//  GROUND + COLLIDERS + DESTRUCTION
// ===========================================================================
function groundHeight(){ return 0; }
let ground=null;
const colliders=[]; const emissiveMats=[];
function addCollider(mesh,opt={}){ mesh.updateMatrixWorld(true);
  const c={ box:new THREE.Box3().setFromObject(mesh), mesh, thin:!!opt.thin, hp:opt.hp||Infinity, destructible:!!opt.destructible, explosive:!!opt.explosive, building:!!opt.building };
  colliders.push(c); mesh.userData.col=c; return c; }
function isBlocked(x,z,pad=1){ for(const c of colliders){ if(!c.building && c.box.max.y<2) continue; const b=c.box;
  if(x>b.min.x-pad&&x<b.max.x+pad&&z>b.min.z-pad&&z<b.max.z+pad&&b.max.y>2) return true; } return false; }
function hasLOS(a,b){ for(const c of colliders){ if(!c.building) continue; if(rayHitsBox(a,b,c.box)) return false; } return true; }

// mark shared/reused resources so disposal never frees them (they're used across many objects)
function protMat(m){ if(m){ m.userData.protected=true; if(m.map)m.map.userData.protected=true; if(m.emissiveMap)m.emissiveMap.userData.protected=true; } return m; }
const matMetal=protMat(new THREE.MeshStandardMaterial({color:0x556070,roughness:0.45,metalness:0.85}));
const matConcrete=protMat(new THREE.MeshStandardMaterial({map:noiseTex(128,140,40),color:0x8f8a80,roughness:0.92}));
const matSand=protMat(new THREE.MeshStandardMaterial({color:0xb8a778,roughness:1.0}));
const matWood=protMat(new THREE.MeshStandardMaterial({map:noiseTex(128,120,50),color:0x8a5a2b,roughness:0.85}));

const debris=[]; const sparkGeo=new THREE.SphereGeometry(0.05,4,4); const particles=[];
// ---- particle object pool (reuse spark meshes instead of new/dispose) ----
const PARTS=[];
function getPart(color){ for(const p of PARTS){ if(!p.inUse){ p.inUse=true; p.mesh.visible=true; p.mesh.material.color.setHex(color); p.mesh.material.opacity=1; p.mesh.scale.setScalar(1); return p; } }
  const m=new THREE.Mesh(sparkGeo,new THREE.MeshBasicMaterial({color,transparent:true})); m.frustumCulled=false; scene.add(m); const o={mesh:m,inUse:true}; PARTS.push(o); return o; }
function destroyProp(c){ if(!c.mesh.parent) return; const p=c.mesh.position.clone();
  const sz=new THREE.Vector3(); c.box.getSize(sz); const big=Math.max(sz.x,sz.z); const tall=sz.y>10;
  const count=clamp(Math.floor(big*0.5),6,22), ds=clamp(big*0.05,0.25,1.6);
  for(let i=0;i<count;i++){ const s=new THREE.Mesh(new THREE.BoxGeometry(ds,ds*0.8,ds),matConcrete); s.position.set(p.x+(Math.random()-0.5)*sz.x,0.8+Math.random()*Math.min(sz.y,12),p.z+(Math.random()-0.5)*sz.z); scene.add(s);
    debris.push({mesh:s,vel:new THREE.Vector3((Math.random()-0.5)*9,2+Math.random()*7,(Math.random()-0.5)*9),av:new THREE.Vector3(Math.random()*6,Math.random()*6,Math.random()*6),life:2.5+Math.random()*1.5}); }
  // dust cloud
  for(let i=0;i<(tall?16:8);i++){ const o=getPart(0x9a948c); o.mesh.material.opacity=0.7; o.mesh.position.set(p.x+(Math.random()-0.5)*sz.x,Math.random()*sz.y*0.7,p.z+(Math.random()-0.5)*sz.z); o.mesh.scale.setScalar(6+Math.random()*8);
    particles.push({part:o,vel:new THREE.Vector3((Math.random()-0.5)*3,1+Math.random()*2,(Math.random()-0.5)*3),life:1.4,grav:-1.5}); }
  if(tall) sfxExplosion();
  if(c.explosive){ explode(p.clone().setY(1),9,80); sfxExplosion(); }
  if(c.mesh.userData&&c.mesh.userData.cap) scene.remove(c.mesh.userData.cap);
  scene.remove(c.mesh); const i=colliders.indexOf(c); if(i>=0) colliders.splice(i,1); }
function damageProp(c,dmg){ if(!c.destructible) return; c.hp-=dmg; if(c.hp<=0) destroyProp(c); }
function stepDebris(dt){ for(let i=debris.length-1;i>=0;i--){ const d=debris[i]; d.vel.y-=18*dt; d.mesh.position.addScaledVector(d.vel,dt); d.mesh.rotation.x+=d.av.x*dt; d.mesh.rotation.y+=d.av.y*dt;
  if(d.mesh.position.y<0.1){ d.mesh.position.y=0.1; d.vel.multiplyScalar(0.3); d.vel.y*=-0.3; } d.life-=dt; if(d.life<=0){ disposeGeo(d.mesh); scene.remove(d.mesh); debris.splice(i,1); } } }
function explode(pos,radius,dmg){ const l=new THREE.PointLight(0xffaa55,40,radius*3,2); l.position.copy(pos); scene.add(l); setTimeout(()=>scene.remove(l),120);
  for(let i=0;i<14;i++){ const o=getPart(i<7?0xffcc66:0x553a2a); o.mesh.position.copy(pos);
    particles.push({part:o,vel:new THREE.Vector3((Math.random()-0.5)*14,Math.random()*12,(Math.random()-0.5)*14),life:0.8,grav:8}); }
  for(const u of allUnits()){ if(!u.alive) continue; const d=u.group.position.distanceTo(pos); if(d<radius) damageUnit(u,dmg*(1-d/radius),null); }
  for(const c of [...colliders]){ if(!c.destructible) continue; const d=c.box.distanceToPoint(pos); if(d<radius) damageProp(c,dmg*(1-d/radius)); }
  const pd=player.pos.distanceTo(pos); if(pd<radius&&player.vehicle==null) hurtPlayer(dmg*0.5*(1-pd/radius)); }

// ===========================================================================
//  MAP BUILDERS
// ===========================================================================
let hqBuilding=null, flagGroup=null, mapBuilt=false;
// wipe the whole battlefield so a fresh, different map can be generated per nation
// free GPU buffers (geometry + non-shared materials/textures) so rebuilds/spawns don't leak → crash
function disposeGeo(o){ if(!o) return; const list=[]; if(o.traverse) o.traverse(c=>{ if(c.isMesh) list.push(c); }); else if(o.isMesh) list.push(o);
  for(const c of list){ const g=c.geometry; if(g&&!g.userData.keep&&!g.userData.protected&&g!==sparkGeo&&g!==arrowGeo) g.dispose();
    const m=c.material; if(m) (Array.isArray(m)?m:[m]).forEach(mat=>{ if(!mat||mat.userData.protected) return; if(mat.map&&!mat.map.userData.protected) mat.map.dispose(); if(mat.emissiveMap&&!mat.emissiveMap.userData.protected) mat.emissiveMap.dispose(); mat.dispose(); }); } }
function clearMap(){ const keep=new Set([skyMesh,hemi,sun,sun.target,fill,fpBody]); if(navArrows) navArrows.forEach(a=>keep.add(a));
  for(const t of TRACERS){ keep.add(t.line); t.inUse=false; t.line.visible=false; }
  for(const p of PARTS){ keep.add(p.mesh); p.inUse=false; p.mesh.visible=false; }
  for(let i=scene.children.length-1;i>=0;i--){ const o=scene.children[i]; if(!keep.has(o)){ disposeGeo(o); scene.remove(o); } }
  colliders.length=0; ground=null; tank=null; jet=null; hqMeshes.length=0; flagGroup=null;
  beacons.length=0; debris.length=0; particles.length=0; shells.length=0; projectiles.length=0; grenades.length=0;
  birds.length=0; dogs.length=0; stationMeshes.length=0; stations.length=0; mapBuilt=false; }
// give each nation a distinct colour cast on ground + buildings so maps don't look identical
const _white=new THREE.Color(0xffffff);
function tintMap(accentHex, baseGroundHex){ const acc=new THREE.Color(accentHex);
  if(ground&&ground.material&&ground.material.color) ground.material.color.copy(new THREE.Color(baseGroundHex)).lerp(acc,0.14);
  for(const m of buildingMats) m.color.copy(_white).lerp(acc,0.22);
  for(const c of colliders){ if(c.building && c.mesh.material && c.mesh.material.color && buildingMats.indexOf(c.mesh.material)<0) c.mesh.material.color.lerp(acc,0.16); } }
// ---- 4 distinct biomes ----
const BIOMES={
  aztec:  { name:'DAY OF THE DEAD DESERT', ground:0xb8895a, gn:[150,40], time:'dusk',  build:'aztec',  animals:0x2a2418 },
  asia:   { name:'ASIAN MOUNTAIN TEMPLE',  ground:0x566b3a, gn:[95,30],  time:'day',   build:'asia',   animals:0xf2f2f2 },
  future: { name:'NEON FUTURE CITY',       ground:0x14161c, gn:[28,14],  time:'night', build:'future', animals:0x00e5ff, neon:true },
  beach:  { name:'TROPICAL BEACH',         ground:0xd8c79a, gn:[180,28], time:'day',   build:'beach',  animals:0xf6f6f0 },
};
const NATION_BIOME={ usa:'future',russia:'future',china:'asia',france:'beach',uk:'future',germany:'future',japan:'asia',india:'asia',italy:'beach',brazil:'beach',iraq:'aztec',egypt:'aztec',spain:'beach',turkey:'aztec',korea:'asia',canada:'future',mexico:'aztec',australia:'beach',saudi:'aztec',ukraine:'future',israel:'aztec',argentina:'beach',poland:'future',greece:'beach',sweden:'future' };
function biomeOf(id){ return NATION_BIOME[id]||'aztec'; }
function buildMap(){ if(mapBuilt) return; mapBuilt=true;
  const B=BIOMES[CONFIG.biome]||BIOMES.aztec; CONFIG.time=B.time;
  const gt=noiseTex(256,B.gn[0],B.gn[1]); gt.repeat.set(80,80);
  ground=new THREE.Mesh(new THREE.PlaneGeometry(WB*4,WB*4), new THREE.MeshStandardMaterial({map:gt,color:B.ground,roughness:0.95}));
  ground.rotation.x=-Math.PI/2; scene.add(ground);
  if(B.build==='aztec') buildAztec(); else if(B.build==='asia') buildAsia(); else if(B.build==='future') buildFuture(); else buildBeach();
  buildHQ(); buildVehicles(); buildBase(); spawnBiomeAnimals(B.animals);
}
function clearAround(x,z){ return Math.hypot(x-insertion.x,z-insertion.z)<72 || Math.hypot(x-hqPos.x,z-hqPos.z)<74; }
function buildAztec(){ const adobe=new THREE.MeshStandardMaterial({color:0xc8a878,roughness:1}), stone=new THREE.MeshStandardMaterial({color:0x9a8a6a,roughness:1});
  for(let i=0;i<34;i++){ const x=(Math.random()-0.5)*WB*1.7,z=(Math.random()-0.5)*WB*1.7; if(clearAround(x,z)||isBlocked(x,z,3)) continue;
    const w=6+Math.random()*10,d=6+Math.random()*10,h=3+Math.random()*7; spawnBox(x,z,w,h,d,Math.random()<0.5?adobe:stone,{destructible:true,hp:Math.floor(60+h*3)}); }
  for(let i=0;i<14;i++){ const x=(Math.random()-0.5)*WB*1.6,z=(Math.random()-0.5)*WB*1.6; if(isBlocked(x,z,2)) continue; spawnBox(x,z,1.2,4+Math.random()*4,1.2,stone,{destructible:true,hp:110}); } // steles
  for(let i=0;i<22;i++){ const x=(Math.random()-0.5)*WB*1.8,z=(Math.random()-0.5)*WB*1.8; if(isBlocked(x,z,1)) continue;
    if(Math.random()<0.5){ const c=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.4,2+Math.random()*2,7),new THREE.MeshStandardMaterial({color:0x3a6b2a,roughness:1})); c.position.set(x,1.3,z); scene.add(c); }
    else { const s=new THREE.Mesh(new THREE.SphereGeometry(0.32,8,6),new THREE.MeshStandardMaterial({color:0xece6d6,roughness:0.9})); s.position.set(x,0.32,z); scene.add(s); } } // cactus + skulls
  for(let i=0;i<12;i++){ const x=(Math.random()-0.5)*WB*1.2,z=(Math.random()-0.5)*WB*1.2; const col=new THREE.Color().setHSL(Math.random(),0.85,0.55);
    const b=new THREE.Mesh(new THREE.PlaneGeometry(1.4,0.9),new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:0.35,side:THREE.DoubleSide})); b.position.set(x,4+Math.random()*2.5,z); b.rotation.y=Math.random()*3; scene.add(b); } // papel picado
  scatterCover(); }
function buildAsia(){ const wood=new THREE.MeshStandardMaterial({color:0x7a3a2a,roughness:0.9}), roofM=new THREE.MeshStandardMaterial({color:0x8a2b2b,roughness:0.8}), rock=new THREE.MeshStandardMaterial({color:0x6a6a5a,roughness:1});
  for(let s=0;s<6;s++){ const sz=30-s*4.6,h=3; const step=new THREE.Mesh(new THREE.BoxGeometry(sz*2,h,sz*2),rock); step.position.set(hqPos.x,h/2+s*h,hqPos.z); scene.add(step); addCollider(step,{building:true,destructible:false,hp:99999}); } // climbable mountain
  for(let i=0;i<20;i++){ const x=(Math.random()-0.5)*WB*1.6,z=(Math.random()-0.5)*WB*1.6; if(clearAround(x,z)||Math.hypot(x-hqPos.x,z-hqPos.z)<70||isBlocked(x,z,3)) continue;
    const w=6+Math.random()*8,h=4+Math.random()*5; spawnBox(x,z,w,h,w,wood,{destructible:true,hp:Math.floor(80+h*3)});
    const roof=new THREE.Mesh(new THREE.ConeGeometry(w*0.92,2.6,4),roofM); roof.position.set(x,h+1.3,z); roof.rotation.y=Math.PI/4; scene.add(roof); }
  for(let i=0;i<26;i++){ const x=(Math.random()-0.5)*WB*1.8,z=(Math.random()-0.5)*WB*1.8; if(isBlocked(x,z,1.5)) continue;
    if(Math.random()<0.6){ const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.3,2.5,6),new THREE.MeshStandardMaterial({color:0x5a3a2a})); tr.position.set(x,1.3,z); scene.add(tr);
      const fol=new THREE.Mesh(new THREE.SphereGeometry(1.5+Math.random(),8,6),new THREE.MeshStandardMaterial({color:0xf6b4d0,roughness:1})); fol.position.set(x,3.4,z); fol.scale.y=0.9; scene.add(fol); } // cherry blossom
    else { for(let b=0;b<3;b++){ const bm=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.1,4+Math.random()*2,6),new THREE.MeshStandardMaterial({color:0x6a8a3a})); bm.position.set(x+(Math.random()-0.5),2.6,z+(Math.random()-0.5)); scene.add(bm); } } } // bamboo
  scatterCover(); }
function buildFuture(){ const neon=[0x00e5ff,0xff2bd6,0x2bff88,0xffd02b];
  for(let gx=-GRID;gx<=GRID;gx++)for(let gz=-GRID;gz<=GRID;gz++){ const x=gx*CELL,z=gz*CELL; if(clearAround(x,z)||(Math.abs(x)<CELL&&Math.abs(z)<CELL)||Math.random()<0.5) continue;
    const w=10+Math.random()*14,h=22+Math.random()*70,nc=neon[Math.abs(gx*2+gz)%neon.length];
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,w),new THREE.MeshStandardMaterial({color:0x0a0c12,emissive:nc,emissiveIntensity:0.3,roughness:0.4,metalness:0.7})); m.position.set(x,h/2,z); scene.add(m); addCollider(m,{building:true,destructible:true,hp:Math.floor(120+h*2)}); emissiveMats.push(m.material); }
  for(let i=-6;i<=6;i++){ const strip=new THREE.Mesh(new THREE.PlaneGeometry(0.5,WB*2),new THREE.MeshBasicMaterial({color:neon[(i+6)%4]})); strip.rotation.x=-Math.PI/2; strip.position.set(i*42,0.06,0); scene.add(strip); }
  scatterCover(); }
function buildBeach(){ const water=new THREE.Mesh(new THREE.PlaneGeometry(WB*4,WB*1.8),new THREE.MeshStandardMaterial({color:0x1a6a8a,roughness:0.1,metalness:0.6})); water.rotation.x=-Math.PI/2; water.position.set(0,0.06,WB*1.5); scene.add(water);
  for(let i=0;i<26;i++){ const x=(Math.random()-0.5)*WB*1.7,z=(Math.random()-0.5)*WB*1.2-WB*0.2; if(clearAround(x,z)||isBlocked(x,z,2)) continue;
    if(Math.random()<0.6){ const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.26,5,6),new THREE.MeshStandardMaterial({color:0x8a6a3a})); tr.position.set(x,2.5,z); tr.rotation.z=(Math.random()-0.5)*0.3; scene.add(tr);
      for(let f=0;f<5;f++){ const fr=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.1,0.5),new THREE.MeshStandardMaterial({color:0x2a8a3a})); fr.position.set(x,4.7,z); fr.rotation.y=f*1.25; fr.rotation.z=0.35; scene.add(fr); } } // palm
    else { spawnBox(x,z,4,2.5,4,new THREE.MeshStandardMaterial({color:0xc8a060,roughness:0.9}),{destructible:true,hp:80}); const roof=new THREE.Mesh(new THREE.ConeGeometry(3.4,1.6,4),new THREE.MeshStandardMaterial({color:0x8a6a3a})); roof.position.set(x,3.5,z); roof.rotation.y=Math.PI/4; scene.add(roof); } } // beach hut
  scatterCover(); }
function spawnBiomeAnimals(col){ const drone=col===0x00e5ff; for(let i=0;i<(drone?6:10);i++) makeBird(col,drone); for(let i=0;i<3;i++) makeDog(); }
const buildingMats=[];
function ensureBuildingMats(){ if(buildingMats.length) return; const tints=['#3b4250','#454b54','#5a5048','#414b52','#4a4640'];
  for(const t of tints){ const f=facadeTex(t,0.4); const m=new THREE.MeshStandardMaterial({map:f.map,emissiveMap:f.emap,emissive:0xffcf7a,emissiveIntensity:0,roughness:0.85,metalness:0.1}); protMat(m); buildingMats.push(m); emissiveMats.push(m); } }
function buildCity(){ ensureBuildingMats();
  for(let gx=-GRID;gx<=GRID;gx++)for(let gz=-GRID;gz<=GRID;gz++){ const cx=gx*CELL,cz=gz*CELL;
    if(Math.hypot(cx-insertion.x,cz-insertion.z)<72) continue; // clear forward operating base
    if(Math.hypot(cx-hqPos.x,cz-hqPos.z)<76) continue;          // clear enemy capital plaza
    if(Math.hypot(cx-SPIRE.x,cz-SPIRE.z)<34) continue;          // clear the spire plaza
    if(Math.abs(cx)<CELL&&Math.abs(cz)<CELL) continue;          // central crossroads
    if(Math.random()<0.52) continue;                            // thin out density for integrated GPU
    const sub=Math.random()<0.25?2:1;
    for(let s=0;s<sub;s++){ const fw=(BLOCK-(sub>1?6:0))/sub, off=sub>1?(s?fw/2+3:-(fw/2+3)):0;
      const w=fw*(0.7+Math.random()*0.25),d=BLOCK*(0.55+Math.random()*0.35),h=18+Math.random()*Math.random()*90;
      const mat=buildingMats[(Math.abs(gx*3+gz)+s)%buildingMats.length];
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(cx+off,h/2,cz); m.castShadow=m.receiveShadow=true; scene.add(m); addCollider(m,{building:true,destructible:true,hp:Math.floor(70+h*2)});
      const cap=new THREE.Mesh(new THREE.BoxGeometry(w*0.4,3,d*0.4),matConcrete); cap.position.set(cx+off,h+1.5,cz); scene.add(cap); m.userData.cap=cap; } }
  buildLandmarks(); detailCity(); scatterCover(); }
function buildCompound(){ // desert: sparse 1-3 story compounds
  for(let i=0;i<70;i++){ const x=(Math.random()-0.5)*WB*1.7,z=(Math.random()-0.5)*WB*1.7; if(Math.hypot(x,z)<CELL||isBlocked(x,z,4)) continue;
    if(Math.hypot(x-insertion.x,z-insertion.z)<72||Math.hypot(x-hqPos.x,z-hqPos.z)<76) continue;
    const w=8+Math.random()*14,d=8+Math.random()*14,h=4+Math.random()*8;
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:0xc8b48a,roughness:0.95})); m.position.set(x,h/2,z); m.castShadow=m.receiveShadow=true; scene.add(m); addCollider(m,{building:true,destructible:true,hp:Math.floor(120+h*9)}); }
  scatterCover(); }
function buildHarbor(){ ensureBuildingMats(); // warehouses + stacked containers
  for(let i=0;i<26;i++){ const x=(Math.random()-0.5)*WB*1.6,z=(Math.random()-0.5)*WB*1.6; if(Math.hypot(x,z)<CELL||isBlocked(x,z,5)) continue; if(Math.hypot(x-insertion.x,z-insertion.z)<76||Math.hypot(x-hqPos.x,z-hqPos.z)<80) continue;
    const w=18+Math.random()*16,d=22+Math.random()*18,h=10+Math.random()*8;
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:0x6a6e73,roughness:0.8,metalness:0.3})); m.position.set(x,h/2,z); m.castShadow=m.receiveShadow=true; scene.add(m); addCollider(m,{building:true,destructible:true,hp:Math.floor(150+h*8)}); }
  // container stacks (cover)
  for(let i=0;i<70;i++){ const x=(Math.random()-0.5)*WB*1.7,z=(Math.random()-0.5)*WB*1.7; if(isBlocked(x,z,2)) continue;
    const col=new THREE.Color().setHSL(Math.random(),0.6,0.4); const stack=1+(Math.random()<0.4?1:0);
    for(let s=0;s<stack;s++){ const m=new THREE.Mesh(new THREE.BoxGeometry(2.4,2.4,6),new THREE.MeshStandardMaterial({color:col,roughness:0.7,metalness:0.4})); m.position.set(x,1.2+s*2.45,z); m.castShadow=m.receiveShadow=true; scene.add(m); addCollider(m,{destructible:s>0,hp:200}); } } }
function spawnBox(x,z,w,h,d,mat,opt){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,h/2,z); m.rotation.y=(Math.random()-0.5)*0.4; scene.add(m); addCollider(m,opt||{}); return m; }
function scatterCover(){ let placed=0;
  for(let i=0;i<50&&placed<22;i++){ const x=(Math.random()-0.5)*WB*1.7,z=(Math.random()-0.5)*WB*1.7; if(isBlocked(x,z,3)) continue; makeCar(x,z); placed++; }
  for(let i=0;i<26;i++){ const x=(Math.random()-0.5)*WB*1.7,z=(Math.random()-0.5)*WB*1.7; if(isBlocked(x,z,2)) continue; const t=Math.random();
    if(t<0.5){ const m=new THREE.Mesh(new THREE.BoxGeometry(2.6,1.0,1.0),matSand); m.position.set(x,0.5,z); m.castShadow=true; scene.add(m); addCollider(m); }
    else { const m=new THREE.Mesh(new THREE.BoxGeometry(1.4,1.4,1.4),matWood); m.position.set(x,0.7,z); m.castShadow=true; scene.add(m); addCollider(m,{destructible:true,hp:70}); } } }
function makeCar(x,z){ const g=new THREE.Group(); const col=new THREE.Color().setHSL(Math.random(),0.4,0.4);
  const body=new THREE.Mesh(new THREE.BoxGeometry(2.0,0.8,4.4),new THREE.MeshStandardMaterial({color:col,roughness:0.35,metalness:0.6})); body.position.y=0.7; g.add(body);
  const cab=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.7,2.2),new THREE.MeshStandardMaterial({color:0x223,roughness:0.2,metalness:0.3})); cab.position.y=1.35; g.add(cab);
  g.position.set(x,0,z); g.rotation.y=Math.random()<0.5?0:Math.PI/2; g.children.forEach(c=>c.castShadow=true); scene.add(g); return addCollider(g,{destructible:true,hp:90,explosive:true}); }
const hqMeshes=[];
function buildHQ(){ // flag objective (built once); landmark built/swapped by rebuildHQ
  flagGroup=new THREE.Group(); const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,6,8),matMetal); pole.position.y=3; flagGroup.add(pole);
  const fc=factionDef().color; const flag=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.6),new THREE.MeshStandardMaterial({color:fc,side:THREE.DoubleSide,emissive:fc,emissiveIntensity:0.3})); flag.position.set(1.3,5,0); flagGroup.add(flag);
  flagGroup.position.copy(hqPos); flagGroup.visible=false; scene.add(flagGroup); rebuildHQ('liberty'); }
function rebuildHQ(kind){ // swap the enemy capital to the target nation's landmark
  for(const c of hqMeshes){ scene.remove(c); const i=colliders.findIndex(x=>x.mesh===c); if(i>=0) colliders.splice(i,1); } hqMeshes.length=0;
  const g=buildCapital(kind); g.position.copy(hqPos); g.position.z-=4; scene.add(g); g.updateMatrixWorld(true);
  addCollider(g,{building:true,destructible:true,hp:6000}); hqMeshes.push(g); }
function buildCapital(kind){ const g=new THREE.Group(); const stone=new THREE.MeshStandardMaterial({color:0xc8bfa8,roughness:0.9});
  const metal=new THREE.MeshStandardMaterial({color:0x8a8f96,roughness:0.5,metalness:0.7}); const gold=new THREE.MeshStandardMaterial({color:0xc8a24a,roughness:0.4,metalness:0.7});
  const dark=new THREE.MeshStandardMaterial({color:0x5a4636,roughness:0.85});
  const add=(m)=>{ m.castShadow=m.receiveShadow=true; g.add(m); return m; };
  if(kind==='eiffel'){ // tapering lattice tower
    const lv=[[26,2,18],[18,20,26],[11,16,46],[5,18,62]]; for(const[w,,y] of lv){}
    add(new THREE.Mesh(new THREE.BoxGeometry(26,18,26),metal)).position.y=9;
    add(new THREE.Mesh(new THREE.BoxGeometry(16,22,16),metal)).position.y=29;
    add(new THREE.Mesh(new THREE.BoxGeometry(7,26,7),metal)).position.y=53;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.6,2.5,22,8),metal)).position.y=77;
    const arch=add(new THREE.Mesh(new THREE.TorusGeometry(9,1.4,8,16,Math.PI),metal)); arch.position.y=14; arch.rotation.z=Math.PI;
  } else if(kind==='bigben'){ const body=add(new THREE.Mesh(new THREE.BoxGeometry(12,46,12),stone)); body.position.y=23;
    const clock=add(new THREE.Mesh(new THREE.CylinderGeometry(4,4,0.6,20),gold)); clock.rotation.x=Math.PI/2; clock.position.set(0,40,6.2);
    add(new THREE.Mesh(new THREE.ConeGeometry(8,14,4),dark)).position.y=53;
  } else if(kind==='pyramid'){ add(new THREE.Mesh(new THREE.ConeGeometry(30,34,4),new THREE.MeshStandardMaterial({color:0xcdb887,roughness:1}))).position.y=17;
  } else if(kind==='pagoda'){ add(new THREE.Mesh(new THREE.BoxGeometry(16,20,16),new THREE.MeshStandardMaterial({color:0x8a2b2b,roughness:0.8}))).position.y=10;
    for(let i=0;i<3;i++){ const r=add(new THREE.Mesh(new THREE.ConeGeometry(14-i*3.5,4,4),dark)); r.position.y=22+i*8; }
  } else if(kind==='colosseum'){ const ring=add(new THREE.Mesh(new THREE.CylinderGeometry(22,22,18,28,1,true),stone)); ring.position.y=9;
    const ring2=add(new THREE.Mesh(new THREE.CylinderGeometry(17,17,12,28,1,true),stone)); ring2.position.y=6;
  } else if(kind==='christ'){ add(new THREE.Mesh(new THREE.BoxGeometry(14,18,14),stone)).position.y=9;
    add(new THREE.Mesh(new THREE.CylinderGeometry(2,3,20,10),stone)).position.y=28;
    add(new THREE.Mesh(new THREE.SphereGeometry(2,12,10),stone)).position.y=40;
    const arms=add(new THREE.Mesh(new THREE.BoxGeometry(20,2.2,2.2),stone)); arms.position.y=34;
  } else if(kind==='taj'){ add(new THREE.Mesh(new THREE.BoxGeometry(26,16,26),new THREE.MeshStandardMaterial({color:0xeae6dc,roughness:0.7}))).position.y=8;
    add(new THREE.Mesh(new THREE.SphereGeometry(9,20,16),new THREE.MeshStandardMaterial({color:0xeae6dc,roughness:0.6}))).position.y=22;
    add(new THREE.Mesh(new THREE.ConeGeometry(2,6,12),gold)).position.y=34;
    for(const[mx,mz] of[[-15,15],[15,15],[-15,-15],[15,-15]]){ const mn=add(new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.6,30,10),new THREE.MeshStandardMaterial({color:0xeae6dc,roughness:0.7}))); mn.position.set(mx,15,mz); }
  } else if(kind==='kremlin'){ add(new THREE.Mesh(new THREE.BoxGeometry(20,34,20),new THREE.MeshStandardMaterial({color:0x8a3030,roughness:0.85}))).position.y=17;
    add(new THREE.Mesh(new THREE.ConeGeometry(7,10,8),gold)).position.y=39; // onion-ish
    add(new THREE.Mesh(new THREE.SphereGeometry(4,16,12),gold)).position.y=46;
  } else if(kind==='gate'){ for(const x of[-12,-4,4,12]){ const col=add(new THREE.Mesh(new THREE.CylinderGeometry(1.6,1.6,22,12),stone)); col.position.set(x,11,0); }
    add(new THREE.Mesh(new THREE.BoxGeometry(32,5,8),stone)).position.y=24;
  } else if(kind==='minaret'){ add(new THREE.Mesh(new THREE.BoxGeometry(22,16,22),new THREE.MeshStandardMaterial({color:0xd8c79a,roughness:0.9}))).position.y=8;
    add(new THREE.Mesh(new THREE.SphereGeometry(8,18,14,0,6.28,0,1.6),gold)).position.y=16;
    const tower=add(new THREE.Mesh(new THREE.CylinderGeometry(2,2.4,34,12),new THREE.MeshStandardMaterial({color:0xd8c79a,roughness:0.9}))); tower.position.set(14,17,0);
  } else { // liberty / default
    add(new THREE.Mesh(new THREE.CylinderGeometry(16,18,2,24),stone)).position.y=1;
    add(new THREE.Mesh(new THREE.BoxGeometry(11,13,11),stone)).position.y=8.5;
    add(new THREE.Mesh(new THREE.CylinderGeometry(2.4,3.4,15,12),new THREE.MeshStandardMaterial({color:0x4aae8c,roughness:0.65}))).position.y=22.5;
    add(new THREE.Mesh(new THREE.SphereGeometry(1.7,16,12),new THREE.MeshStandardMaterial({color:0x4aae8c}))).position.y=31.5;
  }
  return g; }
let tank=null, jet=null;
function buildVehicles(){ makeTank(insertion.x-10,insertion.z-6); makeJet(insertion.x+26,insertion.z+4); }

// ---- Forward Operating Base (stages the tank + jet) ----
function buildBase(){ const bx=insertion.x, bz=insertion.z;
  const hm=new THREE.MeshStandardMaterial({color:0x3a4046,roughness:0.7,metalness:0.4});
  // helipad
  const pad=new THREE.Mesh(new THREE.CircleGeometry(7,32),new THREE.MeshStandardMaterial({color:0x202226,roughness:0.95})); pad.rotation.x=-Math.PI/2; pad.position.set(bx+14,0.02,bz+8); scene.add(pad);
  // open hangar over the jet
  const roof=new THREE.Mesh(new THREE.BoxGeometry(16,0.6,14),hm); roof.position.set(bx+26,7,bz+4); roof.castShadow=true; scene.add(roof);
  const back=new THREE.Mesh(new THREE.BoxGeometry(16,7,0.6),hm); back.position.set(bx+26,3.5,bz-3); back.castShadow=true; scene.add(back); addCollider(back);
  for(const sx of[-8,8]){ const wall=new THREE.Mesh(new THREE.BoxGeometry(0.6,7,14),hm); wall.position.set(bx+26+sx,3.5,bz+4); wall.castShadow=true; scene.add(wall); addCollider(wall); }
  // command tents (behind spawn)
  for(let i=0;i<4;i++){ const tent=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.4,5,12,1,false,0,Math.PI),new THREE.MeshStandardMaterial({color:0x4b5320,roughness:0.95})); tent.rotation.z=Math.PI/2; tent.position.set(bx-20+i*5,2.4,bz+18); tent.castShadow=true; scene.add(tent); }
  // sandbag perimeter arc (north of spawn, doesn't block the advance south)
  for(let a=-1.15;a<=1.15;a+=0.2){ const sx=bx+Math.sin(a)*32, sz=bz+12+Math.cos(a)*9; const m=new THREE.Mesh(new THREE.BoxGeometry(3,1,1.2),matSand); m.position.set(sx,0.5,sz); m.rotation.y=-a; m.castShadow=true; scene.add(m); addCollider(m); }
  // fuel + crates
  for(let i=0;i<6;i++){ const b=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,1.4,12),matMetal); b.position.set(bx-28+i*1.3,0.7,bz+2); b.castShadow=true; scene.add(b); addCollider(b,{destructible:true,hp:30,explosive:true}); }
  // base flag (uses your real country flag)
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,9,8),matMetal); pole.position.set(bx-6,4.5,bz+13); scene.add(pole);
  const ftex=flagTexture(campaign.player||'usa'); const flag=new THREE.Mesh(new THREE.PlaneGeometry(3,1.9),new THREE.MeshStandardMaterial({map:ftex,emissiveMap:ftex,emissive:0xffffff,emissiveIntensity:0.3,side:THREE.DoubleSide})); flag.position.set(-4.5+bx,7.6,bz+13); scene.add(flag);
  // watchtower
  const tw=new THREE.Group(); for(const[sx,sz] of[[-2,-2],[2,-2],[-2,2],[2,2]]){ const leg=new THREE.Mesh(new THREE.BoxGeometry(0.3,9,0.3),matMetal); leg.position.set(sx,4.5,sz); tw.add(leg); }
  const deck=new THREE.Mesh(new THREE.BoxGeometry(5,0.4,5),matWood); deck.position.y=9; tw.add(deck);
  const twroof=new THREE.Mesh(new THREE.ConeGeometry(4,2,4),new THREE.MeshStandardMaterial({color:0x3a4029,roughness:0.9})); twroof.position.y=11; tw.add(twroof);
  tw.position.set(bx+34,0,bz+22); tw.children.forEach(c=>c.castShadow=true); scene.add(tw); addCollider(deck);
  // radar dish
  const radar=new THREE.Group(); const mast=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.18,5,8),matMetal); mast.position.y=2.5; radar.add(mast);
  const dish=new THREE.Mesh(new THREE.SphereGeometry(2,16,8,0,6.28,0,1.0),new THREE.MeshStandardMaterial({color:0x999,roughness:0.4,metalness:0.6,side:THREE.DoubleSide})); dish.position.y=5; dish.rotation.x=1.0; radar.add(dish);
  radar.position.set(bx-34,0,bz+20); radar.children.forEach(c=>c.castShadow=true); scene.add(radar);
  // perimeter HESCO walls
  for(let i=-4;i<=4;i++){ const w=new THREE.Mesh(new THREE.BoxGeometry(4,1.6,1.4),matSand); w.position.set(bx+i*4.2,0.8,bz+30); w.castShadow=true; scene.add(w); addCollider(w); }
  // jeeps
  for(let i=0;i<3;i++){ makeCar(bx-10+i*5,bz+24); }
  // command bunker
  const bunker=new THREE.Mesh(new THREE.BoxGeometry(11,3.6,7),matConcrete); bunker.position.set(bx-32,1.8,bz+34); bunker.castShadow=bunker.receiveShadow=true; scene.add(bunker); addCollider(bunker);
  const sandbag2=new THREE.Mesh(new THREE.BoxGeometry(11,1.1,1.2),matSand); sandbag2.position.set(bx-32,0.55,bz+30); sandbag2.castShadow=true; scene.add(sandbag2); addCollider(sandbag2);
  // floodlights (glow at night)
  for(const [lx,lz] of [[bx-20,bz+34],[bx+22,bz+34],[bx,bz+42]]){ const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.13,7,6),matMetal); pole.position.set(lx,3.5,lz); pole.castShadow=true; scene.add(pole);
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.4,0.45),new THREE.MeshStandardMaterial({color:0x222,emissive:0xfff0c0,emissiveIntensity:1.6})); lamp.position.set(lx,6.9,lz); scene.add(lamp); emissiveMats.push(lamp.material); }
  // runway strip leading off the airfield
  const runway=new THREE.Mesh(new THREE.PlaneGeometry(9,64),new THREE.MeshStandardMaterial({color:0x191b1f,roughness:0.95})); runway.rotation.x=-Math.PI/2; runway.position.set(bx+26,0.03,bz-22); runway.receiveShadow=true; scene.add(runway);
  for(let i=-5;i<=5;i++){ const dash=new THREE.Mesh(new THREE.PlaneGeometry(0.5,2.4),new THREE.MeshBasicMaterial({color:0xcfc060})); dash.rotation.x=-Math.PI/2; dash.position.set(bx+26,0.05,bz-22+i*5.5); scene.add(dash); }
}

// ---- NYC landmarks ----
function buildLandmarks(){
  // East River along the +X edge + reflective water
  const water=new THREE.Mesh(new THREE.PlaneGeometry(WB*1.4,WB*3.2), new THREE.MeshStandardMaterial({color:0x16384f,roughness:0.12,metalness:0.7})); water.rotation.x=-Math.PI/2; water.position.set(WB*1.55,0.06,0); water.receiveShadow=true; scene.add(water);
  // Statue of Liberty on a harbor island
  const sg=new THREE.Group(); const stone=new THREE.MeshStandardMaterial({color:0x6f6a60,roughness:0.92}); const cu=new THREE.MeshStandardMaterial({color:0x4aae8c,roughness:0.65});
  const island=new THREE.Mesh(new THREE.CylinderGeometry(16,18,2,24),stone); island.position.y=1; sg.add(island);
  const base=new THREE.Mesh(new THREE.BoxGeometry(11,13,11),stone); base.position.y=8.5; sg.add(base);
  const body=new THREE.Mesh(new THREE.CylinderGeometry(2.4,3.4,15,12),cu); body.position.y=22.5; sg.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(1.7,16,12),cu); head.position.y=31.5; sg.add(head);
  for(let k=0;k<7;k++){ const sp=new THREE.Mesh(new THREE.ConeGeometry(0.32,1.8,6),cu); const a=(k/6-0.5)*2.4; sp.position.set(Math.sin(a)*1.8,33,Math.cos(a)*1.8); sp.rotation.x=0.3; sg.add(sp); }
  const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.7,9,8),cu); arm.position.set(3.0,30,0); arm.rotation.z=-0.5; sg.add(arm);
  const torch=new THREE.Mesh(new THREE.SphereGeometry(1.1,12,8),new THREE.MeshStandardMaterial({color:0xffcf6a,emissive:0xffaa33,emissiveIntensity:1.6})); torch.position.set(5.2,33.5,0); sg.add(torch);
  sg.position.set(WB*1.4,0,WB*0.5); sg.children.forEach(c=>c.castShadow=true); scene.add(sg);
  // Empire-State-style spire
  const spireG=new THREE.Group(); const mat=buildingMats[0]; const levels=[[24,46],[17,34],[11,30],[6,24]]; let y=0;
  for(const[lw,lh] of levels){ const b=new THREE.Mesh(new THREE.BoxGeometry(lw,lh,lw),mat); b.position.y=y+lh/2; b.castShadow=b.receiveShadow=true; spireG.add(b); y+=lh; }
  const ant=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.8,22,8),matMetal); ant.position.y=y+11; spireG.add(ant);
  const bTop=new THREE.Mesh(new THREE.SphereGeometry(0.9,12,8),new THREE.MeshStandardMaterial({color:0xff5555,emissive:0xff2222,emissiveIntensity:2})); bTop.position.y=y+22; spireG.add(bTop);
  spireG.position.copy(SPIRE); scene.add(spireG); spireG.updateMatrixWorld(true); addCollider(spireG,{building:true,destructible:true,hp:1800});
  // Brooklyn-style bridge toward the water
  const deck=new THREE.Mesh(new THREE.BoxGeometry(WB*1.1,1,9),new THREE.MeshStandardMaterial({color:0x4a4e52,roughness:0.9})); deck.position.set(WB*1.05,9,-WB*0.55); scene.add(deck);
  for(const bxo of[-WB*0.3,WB*0.3]){ const py=new THREE.Mesh(new THREE.BoxGeometry(3,34,3),matConcrete); py.position.set(WB*1.05+bxo,17,-WB*0.55); py.castShadow=true; scene.add(py); }
}

// ---- City detail: streetlights + trees (decor, no colliders so movement stays free) ----
function detailCity(){
  for(let i=0;i<16;i++){ const x=(Math.random()-0.5)*WB*1.8,z=(Math.random()-0.5)*WB*1.8; if(isBlocked(x,z,1)) continue; makeStreetlight(x,z); }
  for(let i=0;i<24;i++){ const x=(Math.random()-0.5)*WB*1.8,z=(Math.random()-0.5)*WB*1.8; if(isBlocked(x,z,1.5)) continue; makeTree(x,z); }
}
function makeStreetlight(x,z){ const g=new THREE.Group();
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.16,6,8),matMetal); pole.position.y=3; g.add(pole);
  const arm=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.12,0.12),matMetal); arm.position.set(0.7,6,0); g.add(arm);
  const lamp=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.2,0.4),new THREE.MeshStandardMaterial({color:0x2a2a2a,emissive:0xffe9b0,emissiveIntensity:1.5})); lamp.position.set(1.4,5.9,0); g.add(lamp);
  emissiveMats.push(lamp.material); g.position.set(x,0,z); g.children.forEach(c=>c.castShadow=true); scene.add(g); }
function makeTree(x,z){ const g=new THREE.Group();
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.32,3,8),new THREE.MeshStandardMaterial({color:0x5a3d24,roughness:0.95})); trunk.position.y=1.5; g.add(trunk);
  const fol=new THREE.Mesh(new THREE.SphereGeometry(1.6+Math.random(),10,8),new THREE.MeshStandardMaterial({color:0x355e2a,roughness:1})); fol.position.y=3.6; fol.scale.y=1.2; g.add(fol);
  g.position.set(x,0,z); g.children.forEach(c=>c.castShadow=true); scene.add(g); }

// ---- Wildlife (birds circling, dogs wandering) ----
const birds=[], dogs=[];
function spawnAnimals(){ for(let i=0;i<10;i++) makeBird(); for(let i=0;i<4;i++) makeDog(); }
function makeBird(col,drone){ const g=new THREE.Group(); const m=new THREE.MeshStandardMaterial({color:col!=null?col:0x222428, emissive:drone?col:0x000000, emissiveIntensity:drone?1:0});
  const lw=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.05,0.4),m); lw.position.x=-0.6; g.add(lw);
  const rw=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.05,0.4),m); rw.position.x=0.6; g.add(rw);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3,0.2,0.8),m)); scene.add(g);
  birds.push({g,ang:Math.random()*6.28,r:40+Math.random()*70,cx:(Math.random()-0.5)*WB,cz:(Math.random()-0.5)*WB,y:(drone?22:38)+Math.random()*28,sp:0.18+Math.random()*0.2,flap:Math.random()*6.28,lw,rw}); }
function makeDog(){ const m=new THREE.MeshStandardMaterial({color:0x6b5536,roughness:0.9}); const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.4,1.0),m); body.position.y=0.5; g.add(body);
  const head=new THREE.Mesh(new THREE.BoxGeometry(0.35,0.35,0.4),m); head.position.set(0,0.65,0.6); g.add(head);
  for(const[lx,lz] of[[-0.15,0.4],[0.15,0.4],[-0.15,-0.4],[0.15,-0.4]]){ const leg=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.5,0.12),m); leg.position.set(lx,0.25,lz); g.add(leg); }
  let x,z,t=0; do{ x=(Math.random()-0.5)*WB*1.5; z=(Math.random()-0.5)*WB*1.5; t++; } while(isBlocked(x,z,1)&&t<24);
  g.position.set(x,0,z); g.children.forEach(c=>c.castShadow=true); scene.add(g); dogs.push({g,dir:Math.random()*6.28,t:0}); }
function stepAnimals(dt,time){
  for(const b of birds){ b.ang+=b.sp*dt; b.g.position.set(b.cx+Math.cos(b.ang)*b.r,b.y+Math.sin(time+b.flap)*2,b.cz+Math.sin(b.ang)*b.r); b.g.rotation.y=-b.ang; const f=Math.sin(time*8+b.flap)*0.5; b.lw.rotation.z=f; b.rw.rotation.z=-f; }
  for(const d of dogs){ d.t-=dt; if(d.t<=0){ d.dir+=(Math.random()-0.5)*1.6; d.t=1+Math.random()*2.5; }
    const np=d.g.position.clone().add(new THREE.Vector3(Math.sin(d.dir),0,Math.cos(d.dir)).multiplyScalar(2.6*dt));
    if(!isBlocked(np.x,np.z,0.6)&&Math.hypot(np.x,np.z)<WB*1.6) d.g.position.copy(np); else d.dir+=2.3; d.g.rotation.y=d.dir; } }

// ---- Ground navigation arrows (follow these to the objective) ----
let navArrows=null;
const arrowGeo=new THREE.BufferGeometry();
arrowGeo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,1.0, -0.55,0,-0.45, 0.55,0,-0.45],3)); arrowGeo.computeVertexNormals();
function ensureArrows(){ if(navArrows) return; navArrows=[]; const col=factionDef().color;
  for(let i=0;i<14;i++){ const m=new THREE.Mesh(arrowGeo,new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.5,side:THREE.DoubleSide,depthWrite:false})); m.visible=false; scene.add(m); navArrows.push(m); } }
function stepNavArrows(dt,time){ ensureArrows();
  const target= missionPhase==='plant'?hqPos:(encounters[curObj]?encounters[curObj].pos:null);
  if(!target||player.vehicle){ navArrows.forEach(a=>a.visible=false); return; }
  const dir=new THREE.Vector3(target.x-player.pos.x,0,target.z-player.pos.z); const dist=dir.length();
  if(dist<3){ navArrows.forEach(a=>a.visible=false); return; } dir.normalize(); const head=Math.atan2(dir.x,dir.z);
  const spacing=4, flow=(time*3)%spacing;
  navArrows.forEach((a,i)=>{ const d=3+i*spacing+flow; if(d<Math.min(dist-1,54)){ a.position.set(player.pos.x+dir.x*d,0.16,player.pos.z+dir.z*d); a.rotation.set(0,head,0); a.material.opacity=0.2+0.4*Math.max(0,1-i/14); a.visible=true; } else a.visible=false; }); }

// ===========================================================================
//  ROUTE / OBJECTIVE BEACONS
// ===========================================================================
const beacons=[];
function makeBeacon(pos,color){ const g=new THREE.Group();
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.6,0.6,40,12,1,true), new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.18,side:THREE.DoubleSide,depthWrite:false})); beam.position.y=20; g.add(beam);
  const ring=new THREE.Mesh(new THREE.RingGeometry(2.6,3.2,32), new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.6,side:THREE.DoubleSide})); ring.rotation.x=-Math.PI/2; ring.position.y=0.1; g.add(ring);
  g.position.copy(pos); g.visible=false; scene.add(g); beacons.push(g); return g; }

// ===========================================================================
//  WEAPON VIEWMODEL + FP BODY
// ===========================================================================
boot('ASSEMBLING ARSENAL…');
const weapon=new THREE.Group();
const matGun=protMat(new THREE.MeshStandardMaterial({color:0x444b54,roughness:0.5,metalness:0.6}));
const matGunDark=protMat(new THREE.MeshStandardMaterial({color:0x2b3138,roughness:0.55,metalness:0.45}));
const matGrip=protMat(new THREE.MeshStandardMaterial({color:0x3a382f,roughness:0.85}));
const matSleeve=protMat(new THREE.MeshStandardMaterial({color:0x2c2f27,roughness:0.92}));
const matGlove=protMat(new THREE.MeshStandardMaterial({color:0x1c1c1c,roughness:0.9}));
let flashLight,flashSprite;
function buildViewmodel(kind){ while(weapon.children.length) weapon.remove(weapon.children[0]);
  const part=(w,h,d,x,y,z,m)=>{ const e=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m); e.position.set(x,y,z); weapon.add(e); return e; }; let mz=-0.62;
  if(kind==='sniper'){ part(0.06,0.08,0.55,0,0,-0.2,matGun); part(0.05,0.05,0.5,0,0.01,-0.6,matGunDark); mz=-0.85; part(0.05,0.10,0.10,0,-0.085,-0.05,matGrip); part(0.05,0.06,0.30,0,-0.01,0.22,matGrip); part(0.06,0.06,0.22,0,0.075,-0.15,matGunDark); part(0.045,0.045,0.04,0,0.085,-0.04,new THREE.MeshStandardMaterial({color:0x141a1f,roughness:0.2,metalness:0.4})); }
  else if(kind==='pistol'){ part(0.05,0.06,0.18,0,0,-0.05,matGun); part(0.04,0.04,0.04,0,0.005,-0.16,matGunDark); mz=-0.2; part(0.045,0.11,0.06,0,-0.08,0.0,matGrip); }
  else if(kind==='lmg'){ part(0.07,0.09,0.45,0,0,-0.15,matGun); part(0.05,0.05,0.5,0,0.005,-0.55,matGunDark); mz=-0.82; part(0.05,0.11,0.10,0,-0.09,-0.05,matGrip); part(0.06,0.16,0.16,0,-0.12,-0.25,matGrip); part(0.05,0.06,0.18,0,0.05,-0.10,matGunDark); }
  else if(kind==='rpg'){ part(0.09,0.09,1.0,0,0,-0.35,matGunDark); part(0.13,0.13,0.3,0,0,0.28,matGun); part(0.12,0.16,0.16,0,0.0,-0.78,matGunDark); part(0.05,0.11,0.09,0,-0.08,-0.05,matGrip); part(0.035,0.08,0.07,0,0.085,-0.18,matGun); mz=-0.92; }
  else { const len=kind==='carbine'?0.45:0.55; part(0.06,0.07,0.40,0,0,-0.12,matGun); part(0.045,0.045,len,0,0.004,-0.42,matGunDark); mz=-0.42-len/2; const g=part(0.05,0.10,0.10,0,-0.085,-0.05,matGrip); g.rotation.x=0.35; part(0.04,0.13,0.07,0,-0.10,-0.30,matGrip); part(0.05,0.05,0.18,0,0.055,-0.10,matGunDark); part(0.035,0.035,0.02,0,0.075,-0.02,new THREE.MeshStandardMaterial({color:0x141a1f,roughness:0.2,metalness:0.4})); part(0.05,0.06,0.16,0,-0.01,0.16,matGrip); }
  const arm=(len,x,y,z,rx,ry,mat)=>{ const a=new THREE.Mesh(new THREE.CapsuleGeometry(0.052,len,5,9),mat); a.position.set(x,y,z); a.rotation.set(rx,ry,0); weapon.add(a); };
  const hand=(x,y,z)=>{ const palm=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.055,0.1),matGlove); palm.position.set(x,y,z); palm.rotation.x=0.25; weapon.add(palm);
    for(let fi=0;fi<4;fi++){ const fg=new THREE.Mesh(new THREE.BoxGeometry(0.018,0.025,0.07),matGlove); fg.position.set(x-0.03+fi*0.02,y+0.005,z-0.07); fg.rotation.x=0.7; weapon.add(fg); }
    const thumb=new THREE.Mesh(new THREE.BoxGeometry(0.022,0.025,0.05),matGlove); thumb.position.set(x+0.05,y+0.01,z-0.01); thumb.rotation.z=0.5; weapon.add(thumb); };
  arm(0.52,0.08,-0.3,0.16,0.95,0.22,matSleeve); hand(0.02,-0.1,-0.04);   // right forearm + hand on the grip
  arm(0.58,-0.12,-0.28,-0.3,1.18,-0.42,matSleeve); hand(-0.02,-0.06,mz+0.2); // left forearm + hand on the handguard
  flashLight=new THREE.PointLight(0xffd28a,0,6,2); weapon.add(flashLight); flashLight.position.set(0,0.01,mz);
  flashSprite=new THREE.Sprite(new THREE.SpriteMaterial({color:0xffd089,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false})); flashSprite.scale.set(0.22,0.22,0.22); flashSprite.position.set(0,0.01,mz-0.04); weapon.add(flashSprite); }
weapon.position.set(0.18,-0.2,-0.5); weapon.scale.setScalar(0.8); gunScene.add(weapon);
gunScene.add(new THREE.HemisphereLight(0xcfe0f0,0x404448,1.7)); const gunKey=new THREE.DirectionalLight(0xffffff,2.2); gunKey.position.set(-1,2,1); gunScene.add(gunKey); const gunFill=new THREE.DirectionalLight(0x88aaff,0.8); gunFill.position.set(2,1,2); gunScene.add(gunFill);
const muzzleWorld=new THREE.Vector3(); function getMuzzleWorld(){ muzzleWorld.copy(camera.position).add(forward.clone().multiplyScalar(0.7)).add(rightVec.clone().multiplyScalar(0.18)).add(new THREE.Vector3(0,-0.1,0)); return muzzleWorld; }
const fpBody=new THREE.Group(); const matBodyArmor=protMat(new THREE.MeshStandardMaterial({color:0x4b5320,roughness:0.8}));
function buildBody(){ while(fpBody.children.length) fpBody.remove(fpBody.children[0]);
  // lower body only — you see your legs when looking down, never a chest blob by the gun
  const pelvis=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.28,0.3),matBodyArmor); pelvis.position.y=0.96; fpBody.add(pelvis);
  const rig=new THREE.Mesh(new THREE.BoxGeometry(0.46,0.18,0.14),new THREE.MeshStandardMaterial({color:0x2b2f22,roughness:0.9})); rig.position.set(0,1.05,0.16); fpBody.add(rig);
  const lLeg=new THREE.Mesh(new THREE.CapsuleGeometry(0.13,0.74,4,8),matBodyArmor); lLeg.position.set(-0.14,0.42,0); fpBody.add(lLeg);
  const rLeg=new THREE.Mesh(new THREE.CapsuleGeometry(0.13,0.74,4,8),matBodyArmor); rLeg.position.set(0.14,0.42,0); fpBody.add(rLeg);
  const lBoot=new THREE.Mesh(new THREE.BoxGeometry(0.17,0.12,0.34),matGlove); lBoot.position.set(-0.14,0.06,0.06); fpBody.add(lBoot);
  const rBoot=new THREE.Mesh(new THREE.BoxGeometry(0.17,0.12,0.34),matGlove); rBoot.position.set(0.14,0.06,0.06); fpBody.add(rBoot);
  fpBody.userData={lLeg,rLeg}; }
buildBody(); scene.add(fpBody);
// swap the first-person body to the real soldier model once it's loaded (1 instance, no shadow)
function buildBodyFromModel(){ try{ if(!soldierProto) return; while(fpBody.children.length) fpBody.remove(fpBody.children[0]);
  const body=skeletonClone(soldierProto); body.scale.setScalar(soldierScale); body.position.y=0; body.rotation.y=0;
  body.traverse(o=>{ if(o.isMesh){ o.castShadow=false; o.receiveShadow=false; o.frustumCulled=false; } });
  fpBody.add(body); fpBody.userData={lLeg:{rotation:{x:0}},rLeg:{rotation:{x:0}},isModel:true}; }catch(e){ console.log('[fpbody] '+e); } }

// ===========================================================================
//  UNITS
// ===========================================================================
const friendlies=[], enemies=[]; const allUnits=()=>friendlies.concat(enemies);
function factionDef(){ return nationById(campaign.player||CONFIG.faction); }
// country-flag texture for soldier banners (color + flag glyph + name)
const _flagTexCache={};
function flagTexture(nationId){ if(_flagTexCache[nationId]) return _flagTexCache[nationId];
  const n=nationById(nationId); const c=document.createElement('canvas'); c.width=128; c.height=84; const ctx=c.getContext('2d');
  ctx.fillStyle='#'+new THREE.Color(n.color).getHexString(); ctx.fillRect(0,0,128,84);
  ctx.strokeStyle='rgba(255,255,255,.55)'; ctx.lineWidth=5; ctx.strokeRect(3,3,122,78);
  ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='bold 34px "Segoe UI Emoji",Arial'; try{ ctx.fillText(n.flag,64,30); }catch(e){}
  ctx.font='bold 20px Arial'; ctx.fillText(n.name.split(' ')[0].slice(0,9),64,62);
  const t=new THREE.CanvasTexture(c); t.userData.protected=true; _flagTexCache[nationId]=t; return t; }
// load the real soldier GLB once (used for up to MODEL_CAP units; procedural fallback otherwise)
let soldierProto=null, soldierScale=1, modelCount=0, MODEL_CAP_RT=0;
// The supplied Solider.glb is 82MB / 137k tris / 46 meshes — far too heavy for smooth realtime.
// Soldiers use the light procedural model. Set USE_SOLDIER_MODEL=true only with an optimized model.
const USE_SOLDIER_MODEL=false; // 82MB/137k-tri model freezes integrated GPUs — procedural soldiers used for smooth play
if(USE_SOLDIER_MODEL) try{ new GLTFLoader().load('./assets/Solider.glb', gltf=>{ soldierProto=gltf.scene;
  const box=new THREE.Box3().setFromObject(soldierProto); const sz=new THREE.Vector3(); box.getSize(sz); soldierScale=1.85/(sz.y||1.85);
  let tris=0,meshes=0; soldierProto.traverse(o=>{ if(o.isMesh&&o.geometry){ meshes++; const idx=o.geometry.index; tris += idx? idx.count/3 : (o.geometry.attributes.position.count/3); o.castShadow=false; o.receiveShadow=false; o.frustumCulled=true; o.geometry.userData.keep=true; if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(protMat); } });
  console.log('[soldier] loaded h='+(sz.y||0).toFixed(2)+' tris='+Math.round(tris)+' meshes='+meshes);
  if(tris>120000){ MODEL_CAP_RT=1; console.log('[soldier] high-poly model -> capping to 1 instance (integrated GPU)'); }
  /* NOTE: not using the full model as the FP body — the camera sits inside the solid
     mesh (no separable head) and it fills the screen. FP body stays procedural. */ }, undefined, e=>{ console.log('[soldier] load failed: '+(e&&e.message||e)); }); }catch(e){ console.log('[soldier] loader error '+e); }
function makeUnit(x,z,team){ const fd=factionDef(); const uniform=team==='blue'?fd.camo:0x6e3b3b, accent=team==='blue'?fd.color:0xcc3333;
  const g=new THREE.Group(); let lLeg,rLeg;
  if(soldierProto && modelCount<MODEL_CAP_RT){ modelCount++;
    const body=skeletonClone(soldierProto); body.scale.setScalar(soldierScale); body.position.y=0; body.rotation.y=0;
    if(team==='red') body.traverse(o=>{ if(o.isMesh&&o.material){ o.material=o.material.clone(); if(o.material.color) o.material.color.lerp(new THREE.Color(0x7a1010),0.35); } });
    g.add(body); lLeg=rLeg={rotation:{x:0}};
  } else {
    const matBody=new THREE.MeshStandardMaterial({color:uniform,roughness:0.8}); const matVest=new THREE.MeshStandardMaterial({color:accent,roughness:0.7});
    const matSkin=new THREE.MeshStandardMaterial({color:0xb08a6a,roughness:0.85}); const matHelm=new THREE.MeshStandardMaterial({color:team==='blue'?0x3a4029:0x4a3030,roughness:0.7});
    const torso=new THREE.Mesh(new THREE.CapsuleGeometry(0.28,0.7,4,10),matBody); torso.position.y=1.2; torso.castShadow=true; g.add(torso);
    const vest=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.32),matVest); vest.position.set(0,1.2,0.05); g.add(vest);
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.18,16,12),matSkin); head.position.y=1.9; head.castShadow=true; g.add(head);
    const helm=new THREE.Mesh(new THREE.SphereGeometry(0.21,16,10,0,6.28,0,1.7),matHelm); helm.position.y=1.94; g.add(helm);
    const lArm=new THREE.Mesh(new THREE.CapsuleGeometry(0.08,0.5,4,8),matBody); lArm.position.set(-0.36,1.25,0.05); lArm.rotation.z=0.2; g.add(lArm);
    const rArm=new THREE.Mesh(new THREE.CapsuleGeometry(0.08,0.5,4,8),matBody); rArm.position.set(0.30,1.2,0.2); rArm.rotation.x=-1.0; g.add(rArm);
    lLeg=new THREE.Mesh(new THREE.CapsuleGeometry(0.12,0.65,4,8),matBody); lLeg.position.set(-0.13,0.45,0); g.add(lLeg);
    rLeg=new THREE.Mesh(new THREE.CapsuleGeometry(0.12,0.65,4,8),matBody); rLeg.position.set(0.13,0.45,0); g.add(rLeg);
    const pack=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.55,0.22),new THREE.MeshStandardMaterial({color:team==='blue'?0x2f3320:0x3a2222,roughness:0.95})); pack.position.set(0,1.25,-0.28); pack.castShadow=true; g.add(pack);
    const lBoot=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.16,0.34),matHelm); lBoot.position.set(-0.13,0.1,0.04); g.add(lBoot);
    const rBoot=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.16,0.34),matHelm); rBoot.position.set(0.13,0.1,0.04); g.add(rBoot);
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.11,0.16,8),matSkin); neck.position.y=1.66; g.add(neck);
    const shoulders=new THREE.Mesh(new THREE.BoxGeometry(0.64,0.18,0.34),matVest); shoulders.position.set(0,1.52,0.02); g.add(shoulders);
    const lHand=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6),matSkin); lHand.position.set(-0.4,1.0,0.14); g.add(lHand);
    const rHand=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6),matSkin); rHand.position.set(0.33,1.0,0.34); g.add(rHand);
  }
  // real country-flag banner so you can recognize which side a soldier is on
  const flagNation = team==='blue' ? (campaign.player||'usa') : (campaign.target||'russia');
  const ftex=flagTexture(flagNation);
  const fpole=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,1.25,6),matMetal); fpole.position.set(-0.3,2.3,-0.05); g.add(fpole);
  const fflag=new THREE.Mesh(new THREE.PlaneGeometry(0.7,0.46),new THREE.MeshStandardMaterial({map:ftex,emissiveMap:ftex,emissive:0xffffff,emissiveIntensity:0.3,side:THREE.DoubleSide,roughness:0.8})); fflag.position.set(0.06,2.72,-0.05); g.add(fflag);
  g.traverse(o=>{ if(o.isMesh) o.castShadow=false; }); // soldiers don't cast shadows (big shadow-pass saving)
  g.position.set(x,0,z); scene.add(g);
  const u={ group:g,head:null,torso:null,team,hp:team==='blue'?130:100,alive:true,dead:0,vel:new THREE.Vector3(),phase:Math.random()*6.28,speed:(team==='blue'?3.6:2.7)+Math.random()*0.8,
    headY:1.9,torsoY:1.2,headR:0.26,torsoR:0.52,lastShot:0,lLeg,rLeg,state:'advance',stateT:0,coverPt:null,accuracy:team==='blue'?0.03:0.05 };
  (team==='blue'?friendlies:enemies).push(u); return u; }
function spawnAround(center,n,team,spread=8){ const arr=[]; for(let i=0;i<n;i++){ let x,z,t=0; do{ x=center.x+(Math.random()-0.5)*spread*2; z=center.z+(Math.random()-0.5)*spread*2; t++; } while(isBlocked(x,z,1.5)&&t<24); arr.push(makeUnit(x,z,team)); } return arr; }
// a pack of enemies that charge and swarm the player
function spawnRush(){ const n=2+Math.floor(Math.random()*2); toast('⚠ ENEMY PACK CHARGING — DEFEND!'); shout('contact');
  for(let i=0;i<n;i++){ const a=Math.random()*6.28,r=36+Math.random()*22; let x=player.pos.x+Math.cos(a)*r,z=player.pos.z+Math.sin(a)*r;
    if(Math.abs(x)>WB*1.7) x=clamp(x,-WB*1.7,WB*1.7); if(Math.abs(z)>WB*1.7) z=clamp(z,-WB*1.7,WB*1.7);
    const u=makeUnit(x,z,'red'); u.rush=true; u.speed=1.7+Math.random()*0.6; u.accuracy=0.07; u.hp=70;
    if(u.torso&&u.torso.material){ u.torso.material=u.torso.material.clone(); u.torso.material.emissive=new THREE.Color(0x551111); u.torso.material.emissiveIntensity=0.5; } } }

// ===========================================================================
//  PROJECTILES
// ===========================================================================
const projectiles=[]; const G=9.81,DRAG_K=0.0009; let wind=new THREE.Vector3(2.5,0,-1.2);
// ---- tracer object pool (reuse Line objects instead of new/dispose every shot) ----
const tracerMatA=new THREE.LineBasicMaterial({color:0xffe08a,transparent:true,opacity:0.85});
const tracerMatB=new THREE.LineBasicMaterial({color:0xff7a4d,transparent:true,opacity:0.85});
const TRACERS=[];
function getTracer(enemy){ for(const t of TRACERS){ if(!t.inUse){ t.inUse=true; t.line.visible=true; t.line.material=enemy?tracerMatB:tracerMatA; return t; } }
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
  const line=new THREE.Line(geo, enemy?tracerMatB:tracerMatA); line.frustumCulled=false; scene.add(line);
  const t={line,inUse:true}; TRACERS.push(t); return t; }
function freeTracer(t){ if(!t) return; t.inUse=false; t.line.visible=false; }
const tmpV=new THREE.Vector3(),tmpA=new THREE.Vector3(),tmpB=new THREE.Vector3(),tmpC=new THREE.Vector3(),tmpH=new THREE.Vector3(),tmpT=new THREE.Vector3();
function spawnBullet(origin,dir,opt){ const p={pos:origin.clone(),vel:dir.clone().multiplyScalar(opt.muzzle),life:4.0,dmg:opt.dmg,team:opt.team,fromPlayer:!!opt.fromPlayer,prev:origin.clone()};
  p.tracer=getTracer(opt.team==='red'); projectiles.push(p); }
function killProjectile(p){ freeTracer(p.tracer); const i=projectiles.indexOf(p); if(i>=0) projectiles.splice(i,1); }
function segHitsSphere(a,b,c,r){ const ab=tmpA.copy(b).sub(a); const t=clamp(tmpB.copy(c).sub(a).dot(ab)/Math.max(ab.lengthSq(),1e-6),0,1); return tmpC.copy(a).addScaledVector(ab,t).distanceToSquared(c)<=r*r; }
function rayHitsBox(a,b,box){ if(box.containsPoint(a)||box.containsPoint(b)) return true; const d=tmpA.copy(b).sub(a); let tmin=0,tmax=1;
  for(const ax of['x','y','z']){ if(Math.abs(d[ax])<1e-8){ if(a[ax]<box.min[ax]||a[ax]>box.max[ax]) return false; } else { let t1=(box.min[ax]-a[ax])/d[ax],t2=(box.max[ax]-a[ax])/d[ax]; if(t1>t2){const s=t1;t1=t2;t2=s;} tmin=Math.max(tmin,t1); tmax=Math.min(tmax,t2); if(tmin>tmax) return false; } } return true; }
function stepProjectile(p,dt){ p.prev.copy(p.pos); const rel=tmpV.copy(p.vel).sub(wind); const sp=rel.length(); const acc=new THREE.Vector3(0,-G,0); if(sp>0) acc.addScaledVector(rel,-DRAG_K*sp);
  p.vel.addScaledVector(acc,dt); p.pos.addScaledVector(p.vel,dt); p.life-=dt;
  if(p.pos.y<=0.02){ spawnImpact(p.pos,0x6c6c70,false); killProjectile(p); return; }
  for(const u of allUnits()){ if(!u.alive||u.team===p.team) continue; const ep=u.group.position;
    if(segHitsSphere(p.prev,p.pos,tmpH.set(ep.x,ep.y+u.headY,ep.z),u.headR)){ unitHit(u,p,2.4,tmpH); return; }
    if(segHitsSphere(p.prev,p.pos,tmpT.set(ep.x,ep.y+u.torsoY,ep.z),u.torsoR)){ unitHit(u,p,1.0,tmpT); return; } }
  if(p.team==='red'&&player.vehicle==null){
    if(segHitsSphere(p.prev,p.pos,tmpH.set(player.pos.x,player.pos.y+(crouching?1.15:1.62),player.pos.z),0.2)){ hurtPlayer(Math.max(p.dmg*0.8,player.maxHp*0.5)); toast('⚠ HEADSHOT'); sfxHeadshot(); killProjectile(p); return; }
    if(segHitsSphere(p.prev,p.pos,tmpT.set(player.pos.x,player.pos.y+1.05,player.pos.z),0.42)){ hurtPlayer(p.dmg*0.8); killProjectile(p); return; } }
  for(const c of colliders){ if(rayHitsBox(p.prev,p.pos,c.box)){ if(c.destructible) damageProp(c,p.dmg);
    if(c.thin&&p.vel.length()>120&&Math.random()<0.55){ p.vel.multiplyScalar(0.55); spawnImpact(p.pos,0xcfc9bd,true); } else { spawnImpact(p.pos,0x8090a0,false); killProjectile(p); return; } } }
  if(p.life<=0){ killProjectile(p); return; }
  const a=p.prev,b=p.pos,attr=p.tracer.line.geometry.attributes.position,arr=attr.array; arr[0]=a.x;arr[1]=a.y;arr[2]=a.z;arr[3]=b.x;arr[4]=b.y;arr[5]=b.z; attr.needsUpdate=true; }
function unitHit(u,p,mult,where){ spawnImpact(where,u.isBoss?0x8090a0:0x8a1020,false,!u.isBoss); const wasAlive=u.alive; damageUnit(u,p.dmg*mult,p.vel); if(p.fromPlayer){ showHitmarker(!u.alive); if(mult>2){ sfxHeadshot(); showHitmarker(true); } else sfxHit(); if(!u.alive){ addScore(u.isBoss?600:(mult>2?150:100)); if(wasAlive&&Math.random()<0.4) shout('kill'); } } killProjectile(p); }
function damageUnit(u,dmg,vel){ if(!u.alive) return; u.hp-=dmg; if(vel&&!u.isBoss) u.vel.addScaledVector(vel.clone().setY(0).normalize(),0.8);
  if(u.hp<=0){ u.alive=false; u.dead=0.0001; if(u.isBoss){ explode(u.group.position.clone().setY(2),16,200); sfxExplosion(); } else u.group.children.forEach(c=>{ if(c.material) c.material=c.material.clone(); }); if(u.team==='red') onEnemyKilled(u); } }

// ===========================================================================
//  PARTICLES + AUDIO
// ===========================================================================
function spawnImpact(pos,color,dust,blood){ const n=blood?12:8; for(let i=0;i<n;i++){ const o=getPart(color); o.mesh.position.copy(pos);
  particles.push({part:o,vel:new THREE.Vector3((Math.random()-0.5)*4,Math.random()*4,(Math.random()-0.5)*4),life:dust?0.7:0.5,grav:blood?9:(dust?1:6)}); } }
function stepParticles(dt){ for(let i=particles.length-1;i>=0;i--){ const p=particles[i]; const m=p.part.mesh; p.vel.y-=p.grav*dt; m.position.addScaledVector(p.vel,dt); p.life-=dt; m.material.opacity=Math.max(0,p.life*2); m.scale.multiplyScalar(1-dt*2); if(p.life<=0){ p.part.inUse=false; m.visible=false; particles.splice(i,1); } } }
let actx=null, master=null; function audio(){ if(!actx){ actx=new (window.AudioContext||window.webkitAudioContext)(); master=actx.createGain(); master.gain.value=0.7; master.connect(actx.destination); } return actx; }
let _noiseBuf=null;
function noiseBuf(){ if(!_noiseBuf){ const ac=audio(); _noiseBuf=ac.createBuffer(1,ac.sampleRate,ac.sampleRate); const d=_noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; } return _noiseBuf; }
// reuse one white-noise buffer; shape duration/decay with a gain envelope (no per-shot allocation)
function noiseBurst(dur,freq,gain,type='lowpass',decay=2){ const ac=audio(); const src=ac.createBufferSource(); src.buffer=noiseBuf(); src.loop=true;
  const f=ac.createBiquadFilter(); f.type=type; f.frequency.value=freq; const g=ac.createGain(); g.gain.setValueAtTime(gain,ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0008,ac.currentTime+dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(); src.stop(ac.currentTime+dur+0.03); }
function tone(type,f0,f1,dur,gain){ const ac=audio(),o=ac.createOscillator(),g=ac.createGain(); o.type=type; o.frequency.setValueAtTime(f0,ac.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),ac.currentTime+dur); g.gain.setValueAtTime(gain,ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+dur); o.connect(g); g.connect(master); o.start(); o.stop(ac.currentTime+dur+0.02); }
// punchy, weapon-specific gunfire: sharp crack (noise) + body thump (osc)
function sfxShoot(kind){ kind=kind||'rifle';
  if(kind==='sniper'){ noiseBurst(0.05,3000,0.55,'highpass',1); tone('square',150,38,0.32,0.55); tone('sawtooth',420,120,0.12,0.3); }
  else if(kind==='lmg'){ noiseBurst(0.04,2200,0.4,'highpass',1); tone('square',180,45,0.12,0.38); }
  else if(kind==='pistol'){ noiseBurst(0.03,2600,0.32,'highpass',1); tone('square',240,70,0.09,0.3); }
  else if(kind==='carbine'){ noiseBurst(0.03,2400,0.34,'highpass',1); tone('square',200,55,0.1,0.32); }
  else { noiseBurst(0.04,2100,0.4,'highpass',1); tone('square',185,48,0.12,0.36); } }
function sfxHit(){ noiseBurst(0.07,700,0.32,'bandpass'); tone('sine',420,160,0.07,0.18); }
function sfxHeadshot(){ tone('square',1400,600,0.12,0.4); noiseBurst(0.05,3000,0.25,'highpass',1); }
let _lastEnemyShot=0;
function sfxEnemyShot(dist){ const now=performance.now(); if(now-_lastEnemyShot<55) return; _lastEnemyShot=now; const v=clamp(1-dist/90,0.05,0.55); noiseBurst(0.04,1700,0.18*v,'highpass',1); }
function sfxReload(){ noiseBurst(0.05,1200,0.25,'highpass'); setTimeout(()=>noiseBurst(0.05,900,0.25,'highpass'),320); setTimeout(()=>tone('square',300,120,0.08,0.3),660); }
function sfxClick(){ noiseBurst(0.03,2800,0.16,'highpass',1); }
function sfxFoot(){ noiseBurst(0.05,260,0.12,'lowpass'); }
function sfxExplosion(){ noiseBurst(0.7,360,0.7,'lowpass',1.4); tone('sine',110,28,0.6,0.6); tone('sine',60,20,0.8,0.5); }
function sfxCannon(){ noiseBurst(0.12,900,0.7,'highpass',1); sfxExplosion(); }
function sfxJet(){ noiseBurst(0.3,400,0.18); }
// combat voice barks for a real-firefight vibe (throttled so they don't overlap)
let _lastShout=0;
const SHOUTS={ reload:['Reloading!','Changing mags!','Cover me!'], kill:['Enemy down!','Tango down!','Got him!','Target neutralized!'],
  contact:['Contact!','Enemy spotted!','Multiple hostiles, push!','They\'re flanking!'], grenade:['Frag out!','Grenade!','Fire in the hole!'],
  hit:['I\'m hit!','Taking fire!','Man down!'], move:['Move up!','Push forward!','On me, advance!'] };
function shout(kind){ const now=performance.now(); if(now-_lastShout<1700) return; if(!SHOUTS[kind]) return; _lastShout=now;
  // short synthesized vocal bark (no TTS — speech synthesis can stall the main thread)
  tone('sawtooth',260+Math.random()*60,150,0.16,0.16); setTimeout(()=>tone('sawtooth',320+Math.random()*60,180,0.12,0.13),110); }

// ===========================================================================
//  PLAYER + WEAPON STATE
// ===========================================================================
const player={ pos:new THREE.Vector3().copy(insertion), vel:new THREE.Vector3(), onGround:true, height:1.7, crouchHeight:1.05, hp:100, maxHp:100, stamina:100, mass:1.0, yaw:Math.PI, pitch:0, lean:0, vehicle:null };
let forward=new THREE.Vector3(0,0,-1), rightVec=new THREE.Vector3(1,0,0), speed2D=0; let ads=false,crouching=false,sprinting=false;
const ws={ kind:'rifle', def:WEAPONS.rifle, mag:30, reserve:150, modeIdx:0, lastShot:0, reloading:false, jammed:false, chambering:false };
let recoilPitch=0,recoilYaw=0,kick=0;
function equip(kind){ ws.kind=kind; ws.def=WEAPONS[kind]; ws.mag=ws.def.mag; ws.reserve=Math.floor(ws.def.reserve*(1+0.3*campaign.up.reserves)); ws.modeIdx=0; ws.jammed=false; ws.reloading=false; buildViewmodel(kind); player.mass=1+ws.def.mass*0.1; updateWeaponHUD(); }
function curMode(){ return ws.def.modes[ws.modeIdx]; }
function applyRecoil(){ recoilPitch+=ws.def.recoil*(ads?0.5:1)+Math.random()*ws.def.recoil*0.3; recoilYaw+=(Math.random()-0.5)*ws.def.recoil*0.6; kick=0.05+ws.def.recoil; }
function muzzleFlash(){ if(!flashLight) return; flashLight.intensity=5+Math.random()*3; flashSprite.material.opacity=0.85; flashSprite.material.rotation=Math.random()*6.28; flashSprite.scale.setScalar(0.18+Math.random()*0.12); }
function shoot(){ if(ws.reloading||ws.chambering) return; if(ws.jammed){ sfxClick(); return; } const now=performance.now(),interval=60000/ws.def.rpm; if(now-ws.lastShot<interval) return; if(ws.mag<=0){ sfxClick(); return; }
  ws.lastShot=now; ws.mag--; if(ws.def.jamChance&&Math.random()<ws.def.jamChance){ ws.jammed=true; sfxClick(); updateWeaponHUD(); return; }
  if(ws.def.rocket){ const dir=forward.clone(); const origin=getMuzzleWorld();
    const rk=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.13,0.85,8),new THREE.MeshStandardMaterial({color:0x4a5560,roughness:0.5,metalness:0.4})); rk.position.copy(origin); rk.quaternion.setFromUnitVectors(UPV,dir.clone()); scene.add(rk);
    shells.push({pos:origin.clone(),vel:dir.multiplyScalar(ws.def.muzzle),life:6,fromPlayer:true,dmg:ws.def.splashDmg*(1+0.2*campaign.up.damage),radius:ws.def.splash,mesh:rk,smoke:0});
    muzzleFlash(); applyRecoil(); sfxExplosion(); updateWeaponHUD(); return; }
  const dir=forward.clone(); const sp=(ads?ws.def.spread*0.18:ws.def.spread)+speed2D*0.0012; dir.x+=(Math.random()-0.5)*sp; dir.y+=(Math.random()-0.5)*sp; dir.z+=(Math.random()-0.5)*sp; dir.normalize();
  spawnBullet(getMuzzleWorld(),dir,{muzzle:ws.def.muzzle,dmg:ws.def.dmg*(1+0.2*campaign.up.damage),team:'blue',fromPlayer:true,tracerColor:0xffe08a}); muzzleFlash(); applyRecoil(); sfxShoot(ws.kind); updateWeaponHUD(); }
function reload(){ if(ws.reloading||ws.chambering) return; if(ws.jammed){ ws.chambering=true; toast('CLEARING MALFUNCTION'); sfxReload(); setTimeout(()=>{ ws.jammed=false; ws.chambering=false; updateWeaponHUD(); },900); return; }
  if(ws.mag===ws.def.mag||ws.reserve===0) return; ws.reloading=true; sfxReload(); if(Math.random()<0.6) shout('reload'); setTimeout(()=>{ const need=ws.def.mag-ws.mag,take=Math.min(need,ws.reserve); ws.mag+=take; ws.reserve-=take; ws.reloading=false; updateWeaponHUD(); }, ws.kind==='lmg'?1700:1000); }
function chamberCheck(){ if(ws.reloading||ws.chambering) return; ws.chambering=true; toast(`CHAMBER CHECK — ${ws.mag>0?'ROUND CHAMBERED':'EMPTY'} · ${ws.mag}/${ws.def.mag}`); setTimeout(()=>{ ws.chambering=false; },700); }
function toggleMode(){ ws.modeIdx=(ws.modeIdx+1)%ws.def.modes.length; updateWeaponHUD(); }

// ===========================================================================
//  VEHICLES
// ===========================================================================
function makeTank(x,z){ const g=new THREE.Group(); const camo=new THREE.MeshStandardMaterial({color:0x4a5240,roughness:0.85,metalness:0.25}); const dark=new THREE.MeshStandardMaterial({color:0x2a3026,roughness:0.9});
  const hull=new THREE.Mesh(new THREE.BoxGeometry(3.4,1.0,5.4),camo); hull.position.y=1.0; hull.castShadow=true; g.add(hull);
  const glacis=new THREE.Mesh(new THREE.BoxGeometry(3.4,0.6,1.4),camo); glacis.position.set(0,0.85,-2.6); glacis.rotation.x=-0.5; g.add(glacis);
  for(const sx of[-1.75,1.75]){ const tr=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.95,5.6),dark); tr.position.set(sx,0.55,0); g.add(tr); for(let i=-2;i<=2;i++){ const w=new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.42,0.72,12),new THREE.MeshStandardMaterial({color:0x15170f})); w.rotation.z=Math.PI/2; w.position.set(sx,0.45,i*1.1); g.add(w); } }
  const turret=new THREE.Group(); turret.position.y=1.75; const tb=new THREE.Mesh(new THREE.BoxGeometry(2.6,0.8,3.0),camo); tb.castShadow=true; turret.add(tb);
  const mantlet=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.6,0.6),dark); mantlet.position.set(0,0,-1.6); turret.add(mantlet);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.16,4.4,16),matMetal); barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.05,-3.4); turret.add(barrel);
  g.add(turret); g.position.set(x,0,z); scene.add(g); tank={type:'tank',group:g,turret,barrel,yaw:0,speed:0,ammo:12,reload:0,hp:600}; }
function makeJet(x,z){ const g=new THREE.Group(); const body=new THREE.MeshStandardMaterial({color:0x6a7078,roughness:0.5,metalness:0.6}); const dark=new THREE.MeshStandardMaterial({color:0x2a2e33,roughness:0.6,metalness:0.5});
  const fuse=new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.35,7.0,16),body); fuse.rotation.x=Math.PI/2; fuse.castShadow=true; g.add(fuse);
  const nose=new THREE.Mesh(new THREE.ConeGeometry(0.55,1.6,16),body); nose.rotation.x=-Math.PI/2; nose.position.z=-4.0; g.add(nose);
  const canopy=new THREE.Mesh(new THREE.SphereGeometry(0.5,16,12),new THREE.MeshStandardMaterial({color:0x101820,roughness:0.1,metalness:0.4})); canopy.scale.set(1,0.7,1.8); canopy.position.set(0,0.45,-1.2); g.add(canopy);
  const wing=new THREE.Mesh(new THREE.BoxGeometry(9.0,0.16,1.8),body); wing.position.set(0,0,0.4); wing.castShadow=true; g.add(wing);
  const stab=new THREE.Mesh(new THREE.BoxGeometry(3.4,0.14,1.0),body); stab.position.set(0,0,3.2); g.add(stab);
  const tail=new THREE.Mesh(new THREE.BoxGeometry(0.16,1.4,1.2),body); tail.position.set(0,0.7,3.2); g.add(tail);
  g.position.set(x,0.9,z); scene.add(g); const ab=new THREE.PointLight(0x66bbff,0,8,2); ab.position.set(0,0,4); g.add(ab);
  jet={type:'jet',group:g,ab,vel:new THREE.Vector3(),airspeed:0,throttle:0.4,gunCooldown:0,hp:300}; }
function nearestVehicle(){ let best=null,bd=6.5; for(const v of[tank,jet]){ if(!v) continue; const d=player.pos.distanceTo(v.group.position); if(d<bd){ bd=d; best=v; } } return best; }
const shells=[];
// ---- throwable TNT (key G) ----
const grenades=[]; let tntCount=3;
function throwTNT(){ if(hubMode||player.vehicle) return; if(tntCount<=0){ toast('NO TNT LEFT'); return; } tntCount--;
  const m=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.3,0.42),new THREE.MeshStandardMaterial({color:0x922,roughness:0.7})); m.position.copy(getMuzzleWorld()); scene.add(m);
  const dir=forward.clone(); dir.y+=0.22; dir.normalize(); grenades.push({mesh:m,vel:dir.multiplyScalar(24).add(new THREE.Vector3(0,3.5,0)),fuse:1.7});
  toast('💣 TNT OUT — '+tntCount+' LEFT'); shout('grenade'); }
function stepGrenades(dt){ for(let i=grenades.length-1;i>=0;i--){ const gr=grenades[i]; gr.vel.y-=18*dt; gr.mesh.position.addScaledVector(gr.vel,dt); gr.mesh.rotation.x+=dt*6; gr.fuse-=dt;
  if(gr.mesh.position.y<0.16){ gr.mesh.position.y=0.16; gr.vel.y*=-0.4; gr.vel.x*=0.6; gr.vel.z*=0.6; }
  if(gr.fuse<=0){ explode(gr.mesh.position.clone(),15,420); sfxExplosion(); scene.remove(gr.mesh); grenades.splice(i,1); } } }
function fireCannon(){ const t=tank; if(!t||t.reload>0||t.ammo<=0) return; t.ammo--; t.reload=3.5;
  const dir=new THREE.Vector3(0,0,-1).applyQuaternion(t.turret.getWorldQuaternion(new THREE.Quaternion())); dir.y+=Math.sin(clamp(player.pitch,-0.2,0.35)); dir.normalize();
  const origin=t.barrel.getWorldPosition(new THREE.Vector3()).add(dir.clone().multiplyScalar(2.4)); shells.push({pos:origin,vel:dir.multiplyScalar(140),life:5,fromPlayer:true}); sfxCannon();
  const l=new THREE.PointLight(0xffcc66,40,30,2); l.position.copy(origin); scene.add(l); setTimeout(()=>scene.remove(l),100); $('tank-ammo').textContent=t.ammo; }
function stepShells(dt){ for(let i=shells.length-1;i>=0;i--){ const s=shells[i]; s.vel.y-=G*dt*(s.mesh?0.45:1); s.pos.addScaledVector(s.vel,dt); s.life-=dt;
  if(s.mesh){ s.mesh.position.copy(s.pos); if(s.vel.lengthSq()>0.01) s.mesh.quaternion.setFromUnitVectors(UPV,s.vel.clone().normalize());
    s.smoke=(s.smoke||0)+dt; if(s.smoke>0.05){ s.smoke=0; const o=getPart(0x999999); o.mesh.material.opacity=0.6; o.mesh.position.copy(s.pos); o.mesh.scale.setScalar(3); particles.push({part:o,vel:new THREE.Vector3((Math.random()-0.5),0.6,(Math.random()-0.5)),life:0.6,grav:-1}); } }
  let hit=s.pos.y<=0.1; if(!hit) for(const c of colliders){ if(c.box.containsPoint(s.pos)){ hit=true; break; } }
  if(!hit&&s.fromPlayer) for(const u of enemies){ if(u.alive&&u.group.position.distanceTo(s.pos)<1.8){ hit=true; break; } }
  if(!hit&&!s.fromPlayer&&player.vehicle==null&&player.pos.distanceTo(s.pos)<2) hit=true;
  if(hit){ explode(s.pos.clone(),s.radius||12,s.dmg||150); if(s.mesh) scene.remove(s.mesh); shells.splice(i,1); } else if(s.life<=0){ if(s.mesh) scene.remove(s.mesh); shells.splice(i,1); } } }
function jetFireGun(){ const j=jet; if(!j||j.gunCooldown>0) return; j.gunCooldown=0.07; const dir=new THREE.Vector3(0,0,-1).applyQuaternion(j.group.quaternion); const origin=j.group.position.clone().add(dir.clone().multiplyScalar(4.5)); spawnBullet(origin,dir,{muzzle:500,dmg:60,team:'blue',fromPlayer:true,tracerColor:0xffaa44}); sfxShoot(); }

// ===========================================================================
//  BOSS (enemy tank)
// ===========================================================================
function makeBossTank(pos){ const g=new THREE.Group(); const camo=new THREE.MeshStandardMaterial({color:0x5a2a2a,roughness:0.85,metalness:0.3}); const dark=new THREE.MeshStandardMaterial({color:0x301818,roughness:0.9});
  const hull=new THREE.Mesh(new THREE.BoxGeometry(3.8,1.2,6.0),camo); hull.position.y=1.1; hull.castShadow=true; g.add(hull);
  for(const sx of[-1.9,1.9]){ const tr=new THREE.Mesh(new THREE.BoxGeometry(0.8,1.1,6.2),dark); tr.position.set(sx,0.6,0); g.add(tr); }
  const turret=new THREE.Group(); turret.position.y=2.0; const tb=new THREE.Mesh(new THREE.BoxGeometry(3.0,1.0,3.4),camo); turret.add(tb);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.2,5.0,16),matMetal); barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.1,-3.6); turret.add(barrel);
  g.add(turret); g.position.copy(pos); scene.add(g);
  const u={ group:g,turret,head:tb,torso:hull,team:'red',hp:1400,alive:true,dead:0,vel:new THREE.Vector3(),isBoss:true,headY:2.4,torsoY:1.4,headR:1.4,torsoR:2.0,lastShot:0,fireT:2.5,lLeg:{rotation:{}},rLeg:{rotation:{}} };
  enemies.push(u); return u; }
// mobile enemy tank that drives at the player and shells them
function makeEnemyTank(pos){ const g=new THREE.Group(); const camo=new THREE.MeshStandardMaterial({color:0x4a3030,roughness:0.85,metalness:0.3}); const dark=new THREE.MeshStandardMaterial({color:0x281414,roughness:0.9});
  const hull=new THREE.Mesh(new THREE.BoxGeometry(3.2,1.0,5.2),camo); hull.position.y=1.0; hull.castShadow=true; g.add(hull);
  for(const sx of[-1.6,1.6]){ const tr=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.95,5.4),dark); tr.position.set(sx,0.55,0); g.add(tr); }
  const turret=new THREE.Group(); turret.position.y=1.7; const tb=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.85,2.8),camo); turret.add(tb);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.16,4.2,14),matMetal); barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.08,-3.2); turret.add(barrel);
  g.add(turret); g.position.copy(pos); g.position.y=0; scene.add(g);
  const u={ group:g,turret,head:tb,torso:hull,team:'red',hp:520,alive:true,dead:0,vel:new THREE.Vector3(),isTank:true,headY:1.9,torsoY:1.0,headR:1.2,torsoR:1.7,lastShot:0,fireT:2.0,lLeg:{rotation:{}},rLeg:{rotation:{}} };
  enemies.push(u); return u; }
function stepEnemyTank(u,dt,t){ if(!u.alive){ u.dead+=dt; u.group.rotation.z=Math.min(0.4,u.dead*0.4); if(u.dead<0.1){ explode(u.group.position.clone().setY(1.5),12,120); sfxExplosion(); } if(u.dead>4) u.group.visible=false; return; }
  const tp=player.pos; const to=tmpV.copy(tp).setY(0).sub(u.group.position.clone().setY(0)); const dist=to.length(); to.normalize();
  const yaw=Math.atan2(to.x,to.z); u.group.rotation.y=lerp(u.group.rotation.y,yaw,dt*1.1);
  if(dist>20){ const np=u.group.position.clone().addScaledVector(to,6*dt); if(!isBlocked(np.x,np.z,2.4)) u.group.position.copy(np); else u.group.position.addScaledVector(new THREE.Vector3(to.z,0,-to.x),4*dt); }
  u.group.position.y=0; if(u.turret) u.turret.rotation.y=lerp(u.turret.rotation.y, yaw-u.group.rotation.y, dt*2);
  u.fireT-=dt; if(u.fireT<=0 && player.vehicle==null && dist<95){ u.fireT=3.0+Math.random(); const dir=tp.clone().setY(1.3).sub(u.group.position.clone().setY(1.8)).normalize(); const origin=u.group.position.clone().setY(1.8).add(dir.clone().multiplyScalar(4)); shells.push({pos:origin,vel:dir.multiplyScalar(95),life:6,fromPlayer:false}); sfxCannon(); } }

// ===========================================================================
//  INPUT
// ===========================================================================
const keys={}; let jetMouseX=0,jetMouseY=0;
addEventListener('keydown',e=>{ keys[e.code]=true; if(!gameStarted||cinematic.active) return;
  if(player.vehicle){ if(e.code==='KeyF') exitVehicle(); return; }
  if(e.code==='KeyR') reload(); if(e.code==='KeyB') toggleMode(); if(e.code==='KeyT') chamberCheck(); if(e.code==='KeyV') cycleOrder(); if(e.code==='KeyG') throwTNT(); if(e.code==='KeyE'){ hubMode?hubInteract():tryInteract(); }
  if(['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6'].includes(e.code)){ const arr=['rifle','carbine','lmg','sniper','pistol','rpg']; const k=arr[+e.code.slice(5)-1]; if(k) equip(k); } });
addEventListener('keyup',e=>{ keys[e.code]=false; });
let pointerLocked=false; const canvas=renderer.domElement;
function lock(){ canvas.requestPointerLock(); }
function anyMenuOpen(){ return ['worldmap','upgrades','endscreen','nationselect','planning','briefing','settings'].some(id=>{ const e=$(id); return e&&!e.classList.contains('hidden'); }); }
document.addEventListener('pointerlockchange',()=>{ pointerLocked=document.pointerLockElement===canvas; $('crosshair').classList.toggle('hidden',!pointerLocked||player.vehicle!=null);
  // only show PAUSE during live play (never while a menu/overlay is open)
  $('pause').classList.toggle('hidden', pointerLocked||cinematic.active||!gameStarted||gameOver||gameWon||anyMenuOpen()); });
addEventListener('mousemove',e=>{ if(!pointerLocked) return; if(player.vehicle?.type==='jet'){ jetMouseX+=e.movementX; jetMouseY+=e.movementY; return; } const sens=ads?0.0014:0.0024; player.yaw-=e.movementX*sens; player.pitch-=e.movementY*sens; player.pitch=clamp(player.pitch,-1.5,1.5); });
let firing=false;
addEventListener('mousedown',e=>{ if(cinematic.active){ endCinematic(); return; } if(!pointerLocked){ if(gameStarted&&!gameOver&&!gameWon) lock(); return; }
  if(player.vehicle?.type==='tank'){ if(e.button===0) fireCannon(); return; } if(player.vehicle?.type==='jet'){ if(e.button===0) firing=true; return; }
  if(e.button===0){ firing=true; if(curMode()!=='AUTO') shoot(); } if(e.button===2) ads=true; });
addEventListener('mouseup',e=>{ if(e.button===0) firing=false; if(e.button===2) ads=false; });
addEventListener('contextmenu',e=>e.preventDefault()); addEventListener('resize',onResize);
function tryInteract(){ const v=nearestVehicle(); if(v){ enterVehicle(v); return; } }
function enterVehicle(v){ player.vehicle=v; ads=false; firing=false; fpBody.visible=false;
  if(v.type==='tank'){ $('tankhud').style.display='block'; $('planehud').style.display='none'; toast('MOUNTED — M1 ABRAMS'); }
  else { $('planehud').style.display='block'; $('tankhud').style.display='none'; // launch into stable level flight
    v.group.position.set(player.pos.x,70,player.pos.z); v.group.quaternion.identity(); v.airspeed=150; v.throttle=0.6; v.vel.set(0,0,-150); toast('AIRBORNE — F-16'); }
  $('crosshair').classList.add('hidden'); $('hud').classList.add('hidden'); }
function exitVehicle(){ const v=player.vehicle; player.vehicle=null; $('tankhud').style.display='none'; $('planehud').style.display='none'; $('hud').classList.remove('hidden'); $('crosshair').classList.remove('hidden'); fpBody.visible=true;
  const off=new THREE.Vector3(3.5,0,0).applyQuaternion(v.group.quaternion); player.pos.copy(v.group.position).add(off); player.pos.y=0; }

// ===========================================================================
//  CAPTAIN ORDERS
// ===========================================================================
const ORDERS=['FOLLOW','HOLD','ADVANCE','REGROUP','SUPPRESS']; let orderIdx=0;
function cycleOrder(){ orderIdx=(orderIdx+1)%ORDERS.length; $('order-val').textContent=ORDERS[orderIdx]; toast('SQUAD ORDER: '+ORDERS[orderIdx]); }

// ===========================================================================
//  HUD
// ===========================================================================
let score=0, regenT=0, miniTick=0;
function addScore(n){ score+=n; $('score-val').textContent=score; }
function updateWeaponHUD(){ $('weapon-name').textContent=ws.def.name; $('ammo-mag').textContent=ws.mag; $('ammo-res').textContent='/ '+ws.reserve; $('mode-val').textContent=curMode(); $('jam-warn').style.opacity=ws.jammed?'1':'0';
  const arr=[['1','rifle'],['2','carbine'],['3','lmg'],['4','sniper'],['5','pistol'],['6','rpg']]; $('weapon-belt').innerHTML=arr.map(([k,id])=>`<div class="w ${id===ws.kind?'active':''}"><b>${k}</b> ${WEAPONS[id].name.split(' ')[0]}</div>`).join(''); }
function updateHealthHUD(){ const pct=Math.max(0,player.hp/player.maxHp)*100,fill=$('health-fill'); fill.style.width=pct+'%'; fill.style.background=pct>50?'linear-gradient(90deg,#3ddc84,#7CFFB2)':pct>25?'linear-gradient(90deg,#e8b339,#ffd479)':'linear-gradient(90deg,#c0392b,#ff6b5b)'; $('stamina-fill').style.width=player.stamina+'%'; }
let hmTimer=0; function showHitmarker(kill){ const hm=$('hitmarker'); hm.style.opacity='1'; hm.querySelector('div').style.background=kill?'#ff4444':'#fff'; hmTimer=0.18; }
let flashTimer=0; function damageFlash(){ $('damage-flash').style.opacity='1'; flashTimer=0.25; }
function hurtPlayer(d){ player.hp-=d; regenT=0; updateHealthHUD(); damageFlash(); if(player.hp<=0&&!gameOver&&!gameWon) doGameOver(); }
let toastTimer=0; function toast(m){ const t=$('toast'); t.textContent=m; t.style.opacity='1'; toastTimer=2.4; }
const COMPASS=['N','NE','E','SE','S','SW','W','NW'];
const miniC=$('minimap'), mctx=miniC?miniC.getContext('2d'):null; const _msz=new THREE.Vector3();
function drawMinimap(){ if(!mctx) return; const W=miniC.width,H=miniC.height,cx=W/2,cy=H/2,R=170,s=(cx-8)/R; mctx.clearRect(0,0,W,H);
  const px=player.pos.x,pz=player.pos.z;
  mctx.fillStyle='rgba(120,150,180,.18)';
  for(const c of colliders){ if(!c.building) continue; const dx=c.mesh.position.x-px,dz=c.mesh.position.z-pz; if(Math.abs(dx)>R||Math.abs(dz)>R) continue; c.box.getSize(_msz); mctx.fillRect(cx+dx*s-_msz.x*s/2,cy+dz*s-_msz.z*s/2,Math.max(1.5,_msz.x*s),Math.max(1.5,_msz.z*s)); }
  const obj=missionPhase==='plant'?hqPos:(encounters[curObj]?encounters[curObj].pos:null);
  if(obj){ const dx=clamp(obj.x-px,-R,R),dz=clamp(obj.z-pz,-R,R); mctx.fillStyle='#ffc24a'; mctx.beginPath(); mctx.arc(cx+dx*s,cy+dz*s,4,0,6.28); mctx.fill(); }
  mctx.fillStyle='#46d1ff'; for(const f of friendlies){ if(!f.alive) continue; const dx=f.group.position.x-px,dz=f.group.position.z-pz; if(Math.abs(dx)>R||Math.abs(dz)>R) continue; mctx.fillRect(cx+dx*s-1.6,cy+dz*s-1.6,3.2,3.2); }
  for(const e of enemies){ if(!e.alive) continue; const dx=e.group.position.x-px,dz=e.group.position.z-pz; if(Math.abs(dx)>R||Math.abs(dz)>R) continue; mctx.fillStyle=e.isBoss?'#ff44ff':(e.rush?'#ff8a3a':'#ff4d4d'); const r=e.isBoss?3.5:2; mctx.fillRect(cx+dx*s-r,cy+dz*s-r,r*2,r*2); }
  mctx.fillStyle='#7CFFB2'; for(const v of [tank,jet]){ if(!v) continue; const dx=v.group.position.x-px,dz=v.group.position.z-pz; if(Math.abs(dx)>R||Math.abs(dz)>R) continue; mctx.fillRect(cx+dx*s-2.5,cy+dz*s-2.5,5,5); }
  mctx.fillStyle='#fff'; mctx.beginPath(); mctx.arc(cx,cy,3,0,6.28); mctx.fill();
  mctx.strokeStyle='#fff'; mctx.lineWidth=1.5; mctx.beginPath(); mctx.moveTo(cx,cy); mctx.lineTo(cx-Math.sin(player.yaw)*10,cy-Math.cos(player.yaw)*10); mctx.stroke(); }

// ===========================================================================
//  MISSION: waypoints / encounters / flag
// ===========================================================================
let routeWorld=[], enemyRouteWorld=[], encounters=[], curObj=0, flagPlanting=0, missionPhase='advance', rushTimer=18, bossTriggered=false, raidTimer=40;
function spawnBaseRaid(){ const n=3+Math.floor(Math.random()*3); toast('⚠ ENEMIES ATTACKING THE BASE — DEFEND!'); shout('contact');
  for(let i=0;i<n;i++){ const a=Math.random()*6.28,r=42+Math.random()*22; const x=insertion.x+Math.cos(a)*r,z=insertion.z+Math.sin(a)*r; const u=makeUnit(x,z,'red'); u.speed=2.9+Math.random()*0.9; } }
function buildMission(){ // routeWorld already set from planning; create encounters
  encounters=[]; const sizes=[3,4,5]; // escalating skirmishes
  for(let i=1;i<routeWorld.length-1;i++){ encounters.push({ pos:routeWorld[i].clone(), size:sizes[Math.min(i-1,sizes.length-1)]+Math.floor(i/2), units:[], spawned:false, cleared:false, boss:false }); }
  encounters.push({ pos:hqPos.clone(), size:4, units:[], spawned:false, cleared:false, boss:true }); // final assault
  // beacons for each objective
  for(const e of encounters) e.beacon=makeBeacon(e.pos, 0xffc24a);
  curObj=0; setObjectiveBeacon();
  // enemies are on the battlefield from the start (non-boss encounters spawn now)
  for(const e of encounters){ if(!e.boss) triggerEncounter(e,true); }
  // roaming garrison spread across the AO
  for(let i=0;i<4;i++){ let x,z,t=0; do{ x=(Math.random()-0.5)*WB*1.4; z=(Math.random()-0.5)*WB*1.1; t++; } while(isBlocked(x,z,2)&&t<20); makeUnit(x,z,'red'); }
}
function setObjectiveBeacon(){ beacons.forEach((b,i)=>{ b.visible = (i===curObj); }); }
function triggerEncounter(e,silent){ e.spawned=true;
  if(e.boss){ // enemy push line reinforcements + boss tank + elites
    spawnAround(e.pos.clone().setZ(e.pos.z+10), 4, 'red', 12).forEach(u=>e.units.push(u));
    e.units.push(makeBossTank(e.pos.clone().setZ(e.pos.z-6).setY(0)));
    toast('⚠ ENEMY ARMOR — FINAL ASSAULT'); flagGroup.visible=false;
  } else { const us=spawnAround(e.pos, e.size, 'red', 10); us.forEach(u=>e.units.push(u));
    if(us[0]){ us[0].isCaptain=true; us[0].hp=200; us[0].group.scale.setScalar(1.14); } // squad captain leads the assault
    if(curObj>=1 && Math.random()<0.55){ e.units.push(makeEnemyTank(e.pos.clone().setZ(e.pos.z-8))); toast('⚠ ENEMY TANK INBOUND'); }
    if(!silent) toast('CONTACT — CLEAR THE AREA'); }
  // also send a few enemies down the enemy route toward the player
  if(enemyRouteWorld.length>1 && Math.random()<0.7){ const sp=enemyRouteWorld[0]; spawnAround(sp,2,'red',6); }
}
function checkObjectives(){ if(curObj>=encounters.length) return; const e=encounters[curObj];
  const distRef=player.vehicle?player.vehicle.group.position:player.pos; const d=Math.hypot(distRef.x-e.pos.x,distRef.z-e.pos.z);
  if(!e.spawned && d<26) triggerEncounter(e);
  if(e.spawned && !e.cleared && e.units.every(u=>!u.alive)){ e.cleared=true;
    if(e.boss){ // final cleared -> plant flag
      missionPhase='plant'; flagGroup.position.copy(hqPos); flagGroup.visible=true; beacons[curObj].visible=false; toast('CAPITAL CLEAR — PLANT YOUR FLAG (HOLD E)');
    } else { curObj++; setObjectiveBeacon(); addScore(50); toast('AREA SECURED — ADVANCE'); }
  }
  // objective HUD
  if(missionPhase==='plant'){ $('obj-prog').textContent='PLANT THE FLAG — HOLD E'; }
  else { const left=e.spawned?e.units.filter(u=>u.alive).length:'—'; $('obj-prog').textContent= e.boss?('FINAL ASSAULT · HOSTILES '+left):(`OBJECTIVE ${curObj+1}/${encounters.length} · ${e.spawned?('HOSTILES '+left):'ADVANCE TO MARKER'}`); }
}
function onEnemyKilled(u){ /* score handled in unitHit */ }

// ===========================================================================
//  MOVEMENT
// ===========================================================================
function moveAndCollide(dt){ forward.set(-Math.sin(player.yaw),0,-Math.cos(player.yaw)); rightVec.set(forward.z,0,-forward.x).normalize();
  crouching=keys['ControlLeft']||keys['KeyC']; const wantSprint=(keys['ShiftLeft']||keys['ShiftRight'])&&!ads&&!crouching; sprinting=wantSprint&&player.stamina>1&&speed2D>0.5;
  if(sprinting) player.stamina=Math.max(0,player.stamina-dt*18); else player.stamina=Math.min(100,player.stamina+dt*12); if(player.stamina<=0) sprinting=false;
  const wantLean=(keys['KeyQ']?1:0)-(keys['KeyE']?1:0); player.lean=lerp(player.lean,wantLean*0.32,dt*10);
  const wish=new THREE.Vector3(); if(keys['KeyW']) wish.add(forward); if(keys['KeyS']) wish.sub(forward); if(keys['KeyD']) wish.add(rightVec); if(keys['KeyA']) wish.sub(rightVec); if(wish.lengthSq()>0) wish.normalize();
  let target=sprinting?8.5:crouching?2.6:ads?3.2:5.2; const accel=(player.onGround?55:12)/player.mass;
  const desired=wish.multiplyScalar(target); const cur=new THREE.Vector3(player.vel.x,0,player.vel.z); cur.lerp(desired,Math.min(1,accel*dt/Math.max(target,0.001))); player.vel.x=cur.x; player.vel.z=cur.z;
  if(keys['Space']&&player.onGround){ player.vel.y=5.4; player.onGround=false; } player.vel.y-=16*dt;
  const next=player.pos.clone(),r=0.35; const tryAxis=(axis,amt)=>{ next[axis]+=amt; const feet=next.y,head=next.y+(crouching?player.crouchHeight:player.height);
    for(const c of colliders){ const b=c.box; if(next.x+r>b.min.x&&next.x-r<b.max.x&&next.z+r>b.min.z&&next.z-r<b.max.z&&head>b.min.y&&feet<b.max.y){ next[axis]-=amt; player.vel[axis]=0; return; } } };
  tryAxis('x',player.vel.x*dt); tryAxis('z',player.vel.z*dt); next.y+=player.vel.y*dt; if(next.y<=0){ next.y=0; player.vel.y=0; player.onGround=true; } else player.onGround=false;
  player.pos.copy(next); speed2D=Math.hypot(player.vel.x,player.vel.z); }

// ===========================================================================
//  AI (line-of-sight, cover, flanking)
// ===========================================================================
function nearestAlive(fromPos,list){ let best=null,bd=1e9; for(const e of list){ if(!e.alive) continue; const d=e.group.position.distanceToSquared(fromPos); if(d<bd){bd=d;best=e;} } return best; }
function fireFrom(unit,targetPos,team,dmg,spread){ const origin=unit.group.position.clone().setY(1.4); const dir=targetPos.clone().sub(origin).normalize();
  dir.x+=(Math.random()-0.5)*spread; dir.y+=(Math.random()-0.5)*spread; dir.z+=(Math.random()-0.5)*spread; spawnBullet(origin,dir.normalize(),{muzzle:220,dmg,team,tracerColor:team==='blue'?0x88ccff:0xff7755});
  if(team==='red' && Math.random()<0.5) sfxEnemyShot(unit.group.position.distanceTo(player.pos)); }
function stepBoss(u,dt){ if(!u.alive){ u.dead+=dt; u.group.rotation.z=Math.min(0.3,u.dead*0.3); u.group.children.forEach(c=>{}); if(u.dead>4) u.group.visible=false; return; }
  const tp=player.pos; const ang=Math.atan2(tp.x-u.group.position.x,tp.z-u.group.position.z); u.turret.rotation.y=lerp(u.turret.rotation.y,ang-u.group.rotation.y+Math.PI,dt*1.5);
  u.fireT-=dt; if(u.fireT<=0 && player.vehicle==null){ u.fireT=3.0; const dir=tp.clone().setY(1.4).sub(u.group.position.clone().setY(2.2)).normalize(); const origin=u.group.position.clone().setY(2.2).add(dir.clone().multiplyScalar(4)); shells.push({pos:origin,vel:dir.multiplyScalar(90),life:6,fromPlayer:false}); sfxCannon(); } }
function stepUnit(u,dt,t,enemyList,goal){ if(u.isBoss){ stepBoss(u,dt); return; } if(u.isTank){ stepEnemyTank(u,dt,t); return; }
  if(!u.alive){ if(u._gone) return; u.dead+=dt; u.group.rotation.x=Math.min(Math.PI/2,u.dead*4); u.group.position.y=-Math.min(0.4,u.dead*0.6); u.group.children.forEach(c=>{ if(c.material){ c.material.transparent=true; c.material.opacity=Math.max(0,1-(u.dead-1.4)); } }); if(u.dead>3){ disposeGeo(u.group); scene.remove(u.group); u._gone=true; } return; }
  if(u.rush){ // charging swarmer: sprint straight at the player and melee/fire
    const tp=player.pos; const to=tmpV.copy(tp).setY(0).sub(u.group.position.clone().setY(0)); const dist=to.length(); to.normalize(); u.group.rotation.y=Math.atan2(to.x,to.z);
    u.vel.lerp(to.multiplyScalar(u.speed*2.2),dt*3); u.vel.multiplyScalar(0.92);
    const np=u.group.position.clone().addScaledVector(u.vel,dt); if(!isBlocked(np.x,np.z,0.7)) u.group.position.copy(np); else u.vel.set(-u.vel.z,0,u.vel.x);
    u.group.position.y=Math.abs(Math.sin(t*9+u.phase))*0.18; // lunging hops
    if(dist<2.6 && player.vehicle==null){ hurtPlayer(dt*22); }
    else { const now=performance.now(); if(dist<42 && now-u.lastShot>520){ u.lastShot=now; fireFrom(u,tp.clone().setY(1.4),'red',9,0.06); } }
    const rs=Math.min(1,u.vel.length()); u.lLeg.rotation.x=Math.sin(t*11+u.phase)*0.7*rs; u.rLeg.rotation.x=-Math.sin(t*11+u.phase)*0.7*rs; return; }
  const eye=u.group.position.clone().setY(1.5); const tgt=nearestAlive(u.group.position,enemyList);
  let move=new THREE.Vector3(); let los=false,dist=999;
  if(tgt){ const tp=tgt.group.position.clone().setY(1.4); dist=u.group.position.distanceTo(tgt.group.position);
    u.losT=(u.losT||0)-dt; if(u.losT<=0){ u.los=hasLOS(eye,tp); u.losT=0.22+Math.random()*0.16; } los=u.los;
    const toT=tmpV.copy(tgt.group.position).setY(0).sub(u.group.position.clone().setY(0)).normalize(); u.group.rotation.y=Math.atan2(toT.x,toT.z);
    // ALWAYS keep moving: close the distance to the enemy until a tight standoff, then circle
    const standoff = u.isCaptain?9:11;
    if(dist>standoff){ move.copy(toT).multiplyScalar(u.speed*(los?1.05:1.35)); }
    else { const side=Math.sin(t*0.8+u.phase)>0?1:-1; move.set(toT.z*side,0,-toT.x*side).multiplyScalar(u.speed*0.9); } // strafe/circle when close
    // occasional flank push to feel coordinated
    if(u.state!=='flank' && Math.random()<dt*0.25){ u.state='flank'; u.stateT=0.7+Math.random(); }
    if(u.state==='flank'){ u.stateT-=dt; const side=Math.sin(u.phase)>0?1:-1; move.add(new THREE.Vector3(toT.z*side,0,-toT.x*side).multiplyScalar(u.speed*0.7)); if(u.stateT<=0) u.state='advance'; }
    // fire whenever there's a line of sight and we're roughly in range
    if(los && dist<75){ const now=performance.now(); const moving=move.lengthSq()>0.1; const sp=(dist<22?0.02:0.045)+(moving?0.03:0);
      const rof=u.isCaptain?420:(u.team==='red'?600:480); if(now-u.lastShot>(rof+Math.random()*450)){ u.lastShot=now; fireFrom(u,tp,u.team,u.team==='red'?(u.isCaptain?10:7):14,sp); } }
  } else if(goal){ const tg=tmpV.copy(goal).setY(0).sub(u.group.position.clone().setY(0)); if(tg.length()>3) move.copy(tg.normalize()).multiplyScalar(u.speed*1.2); }
  // squad order override (friendlies): stick close to the captain, sprint to catch up
  if(u.team==='blue' && goal && (!tgt || dist>32)){ const tg=tmpV.copy(goal).setY(0).sub(u.group.position.clone().setY(0)); const gl=tg.length(); if(gl>1.6) move.copy(tg.normalize()).multiplyScalar(u.speed*(gl>10?3.4:1.9)); }
  u.vel.lerp(move,dt*4); u.vel.multiplyScalar(0.9);
  // slide along walls (axis-separated) and steer around when fully blocked, so they don't get stuck
  const cur=u.group.position; const nx=cur.x+u.vel.x*dt, nz=cur.z+u.vel.z*dt;
  if(!isBlocked(nx,nz,0.6)){ cur.x=nx; cur.z=nz; u.stuck=0; }
  else if(!isBlocked(nx,cur.z,0.6)){ cur.x=nx; u.vel.z=0; }
  else if(!isBlocked(cur.x,nz,0.6)){ cur.z=nz; u.vel.x=0; }
  else { u.stuck=(u.stuck||0)+dt; u.vel.applyAxisAngle(UPV,(u.stuck>0.6?1:-1)*1.2); if(u.stuck>1.5){ u.phase+=2; u.stuck=0; } }
  const spd=Math.min(1,u.vel.length()); u.group.position.y=spd>0.4?Math.abs(Math.sin(t*9+u.phase))*0.05:0; u.lLeg.rotation.x=Math.sin(t*6+u.phase)*0.4*spd; u.rLeg.rotation.x=-Math.sin(t*6+u.phase)*0.4*spd; }
function stepFactions(dt,t){ const order=ORDERS[orderIdx]; let goal=null;
  if(order==='ADVANCE'){ const e=nearestAlive(player.pos,enemies); goal=e?e.group.position:(encounters[curObj]?encounters[curObj].pos:null); } else if(order==='REGROUP') goal=player.pos;
  const playerProxy={alive:player.hp>0,group:{position:player.pos}};
  // forward unit basis for formation placement
  const fwd=new THREE.Vector3(-Math.sin(player.yaw),0,-Math.cos(player.yaw)), rgt=new THREE.Vector3(fwd.z,0,-fwd.x);
  const live=friendlies.filter(f=>f.alive);
  let slot=0;
  for(const f of friendlies){ let g=goal;
    if(order==='FOLLOW' && f.alive){ const idx=slot++; const side=(idx%2===0?-1:1); // tight wedge right behind captain
      g=player.pos.clone().addScaledVector(fwd,-2.2-Math.floor(idx/2)*1.6).addScaledVector(rgt,side*(1.6+Math.floor(idx/2)*0.6)); }
    stepUnit(f,dt,t,enemies,g); }
  for(const e of enemies) stepUnit(e,dt,t,friendlies.concat([playerProxy]),null); }

// ===========================================================================
//  VEHICLE STEP
// ===========================================================================
function stepTank(dt){ if(!tank) return; tank.reload=Math.max(0,tank.reload-dt); $('tank-reload').textContent=tank.reload>0?'RELOADING '+tank.reload.toFixed(1)+'s':(tank.ammo>0?'READY':'EMPTY'); if(player.vehicle!==tank) return;
  const fwd=(keys['KeyW']?1:0)-(keys['KeyS']?1:0),turn=(keys['KeyA']?1:0)-(keys['KeyD']?1:0); tank.speed=lerp(tank.speed,fwd*10,dt*1.5); tank.yaw+=turn*dt*0.9*(Math.abs(tank.speed)>0.5?1:0.3);
  const dir=new THREE.Vector3(-Math.sin(tank.yaw),0,-Math.cos(tank.yaw)); const np=tank.group.position.clone().addScaledVector(dir,tank.speed*dt); if(!isBlocked(np.x,np.z,2.2)) tank.group.position.copy(np); else tank.speed*=-0.2;
  tank.group.position.y=0; tank.group.rotation.y=tank.yaw; tank.turret.rotation.y=lerp(tank.turret.rotation.y,player.yaw-tank.yaw+Math.PI,dt*6); tank.barrel.rotation.x=Math.PI/2-clamp(player.pitch,-0.2,0.35);
  $('tank-spd').textContent=Math.round(Math.abs(tank.speed)*3.6);
  const eye=tank.group.position.clone().add(new THREE.Vector3(0,3.2,0)); camera.position.copy(eye); const ly=player.yaw,lp=clamp(player.pitch,-0.6,0.4); const ld=new THREE.Vector3(-Math.sin(ly)*Math.cos(lp),Math.sin(lp),-Math.cos(ly)*Math.cos(lp)); camera.up.set(0,1,0); camera.lookAt(eye.clone().add(ld)); }
function stepJet(dt){ if(!jet) return; const j=jet; if(player.vehicle!==j) return;
  j.throttle=clamp(j.throttle+((keys['KeyW']?1:0)-(keys['KeyS']?1:0))*dt*0.5,0.1,1);
  const pitchRate=clamp(jetMouseY*0.0016,-0.04,0.04); const rollRate=clamp(jetMouseX*0.0016,-0.05,0.05)+((keys['KeyD']?1:0)-(keys['KeyA']?1:0))*dt*1.4; jetMouseX=0; jetMouseY=0;
  const q=j.group.quaternion; q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchRate,0,rollRate)));
  const roll=new THREE.Euler().setFromQuaternion(q,'ZYX').z; q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.sin(roll)*1.2*dt));
  const fdir=new THREE.Vector3(0,0,-1).applyQuaternion(q); const thrust=70+j.throttle*180; j.airspeed=lerp(j.airspeed,thrust,dt*0.5); j.vel.copy(fdir).multiplyScalar(j.airspeed); if(j.airspeed<100) j.vel.y-=(100-j.airspeed)*0.25;
  j.group.position.addScaledVector(j.vel,dt); if(j.group.position.y<8){ j.group.position.y=8; } j.ab.intensity=lerp(j.ab.intensity,j.throttle*6,dt*5);
  j.gunCooldown=Math.max(0,j.gunCooldown-dt); if(firing) jetFireGun(); if(Math.random()<dt*3) sfxJet();
  const back=new THREE.Vector3(0,1.8,10).applyQuaternion(q); const cpos=j.group.position.clone().add(back); camera.position.lerp(cpos,clamp(dt*6,0,1)); camera.up.set(0,1,0).applyQuaternion(q); camera.lookAt(j.group.position.clone().add(fdir.clone().multiplyScalar(30)));
  $('jet-spd').textContent=Math.round(j.airspeed*3.6); $('jet-alt').textContent=Math.round(j.group.position.y)+' m'; $('jet-thr').textContent=Math.round(j.throttle*100)+'%'; }

// ===========================================================================
//  ENVIRONMENT
// ===========================================================================
function applyEnvironment(){ const T=TIMES[CONFIG.time]||TIMES.dusk, W=WEATHERS[CONFIG.weather]||WEATHERS.clear;
  sun.color.setHex(T.sunColor); sun.intensity=T.sunInt; hemi.intensity=T.hemi; renderer.toneMappingExposure=T.exposure;
  skyMat.uniforms.top.value.setHex(T.sky[0]); skyMat.uniforms.mid.value.setHex(T.sky[1]); skyMat.uniforms.bot.value.setHex(T.sky[2]); scene.fog.color.setHex(T.fog); scene.fog.density=W.fogDensity; wind.set(W.windBase,0,-W.windBase*0.4);
  for(const m of emissiveMats) m.emissiveIntensity=T.lit;
  // biome sky/atmosphere overrides
  const B=BIOMES[CONFIG.biome];
  if(B&&B.build==='future'){ skyMat.uniforms.top.value.setHex(0x06040f); skyMat.uniforms.mid.value.setHex(0x24083a); skyMat.uniforms.bot.value.setHex(0x4a1060); scene.fog.color.setHex(0x14081e); scene.fog.density=0.009; for(const m of emissiveMats) m.emissiveIntensity=Math.max(m.emissiveIntensity,1.0); }
  else if(B&&B.build==='aztec'){ skyMat.uniforms.top.value.setHex(0x3a2350); skyMat.uniforms.mid.value.setHex(0xa05540); skyMat.uniforms.bot.value.setHex(0xe89a4a); scene.fog.color.setHex(0x9a6a52); }
  else if(B&&B.build==='beach'){ scene.fog.color.setHex(0xbfe0e6); scene.fog.density=0.003; }
}

// ===========================================================================
//  CINEMATIC
// ===========================================================================
let _voice=null;
function pickVoice(){ try{ const vs=speechSynthesis.getVoices(); _voice=vs.find(x=>/david|daniel|george|fred|mark|guy|male/i.test(x.name))||vs.find(x=>x.lang&&x.lang.startsWith('en'))||vs[0]||null; }catch(e){} }
if(window.speechSynthesis){ pickVoice(); speechSynthesis.onvoiceschanged=pickVoice; }
function speak(text){ try{ if(!window.speechSynthesis) return; const u=new SpeechSynthesisUtterance(text); u.rate=0.94; u.pitch=0.7; u.volume=1; if(_voice) u.voice=_voice; speechSynthesis.speak(u); }catch(e){} }
const cinematic={ active:false, t:0, dur:11, keys:[], lines:[], spoken:-1 };
function runCinematic(done){ cinematic.active=true; cinematic.t=0; cinematic.done=done; cinematic.spoken=-1;
  $('cinematic').style.display='block'; try{ speechSynthesis.cancel(); }catch(e){}
  const M=MISSIONS[CONFIG.mission]; const me=factionDef().name, foe=CONFIG.target;
  cinematic.lines=[ `Commander. ${me} is counting on you.`,
                    `Target nation: ${foe}. Their capital is in our sights.`,
                    `Operation ${M.name}. We breach, we advance through the city.`,
                    `Cut down everything they send. Reach their capital.`,
                    `Plant our flag, and ${foe} falls. Move out!` ];
  // camera path: high orbit over HQ sweeping to insertion
  cinematic.keys=[ { p:new THREE.Vector3(hqPos.x-60,90,hqPos.z+40), look:hqPos.clone().setY(30) },
                   { p:new THREE.Vector3(0,55,0), look:new THREE.Vector3(0,10,-40) },
                   { p:insertion.clone().add(new THREE.Vector3(-8,18,18)), look:insertion.clone().setY(2) },
                   { p:insertion.clone().add(new THREE.Vector3(0,2.5,4)), look:insertion.clone().setY(1.6).add(new THREE.Vector3(0,0,-4)) } ];
  if(actx) {} }
function stepCinematic(dt){ cinematic.t+=dt; const f=clamp(cinematic.t/cinematic.dur,0,1);
  const seg=f*(cinematic.keys.length-1); const i=Math.min(Math.floor(seg),cinematic.keys.length-2); const lt=seg-i;
  const a=cinematic.keys[i], b=cinematic.keys[i+1]; const sm=lt*lt*(3-2*lt);
  camera.position.lerpVectors(a.p,b.p,sm); const look=a.look.clone().lerp(b.look,sm); camera.up.set(0,1,0); camera.lookAt(look);
  const li=Math.min(cinematic.lines.length-1,Math.floor(f*cinematic.lines.length)); const el=$('cine-text'); if(el.textContent!==cinematic.lines[li]){ el.textContent=cinematic.lines[li]; el.style.opacity='1'; }
  if(li!==cinematic.spoken){ cinematic.spoken=li; speak(cinematic.lines[li]); }
  if(f>=1) endCinematic(); }
function endCinematic(){ if(!cinematic.active) return; cinematic.active=false; $('cinematic').style.display='none'; $('cine-text').style.opacity='0'; try{ speechSynthesis.cancel(); }catch(e){} const d=cinematic.done; cinematic.done=null; if(d) d(); }

// ===========================================================================
//  LOOP
// ===========================================================================
let gameStarted=false,gameOver=false,gameWon=false,hubMode=false; const clock=new THREE.Clock();
function onResize(){ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); gunCam.aspect=innerWidth/innerHeight; gunCam.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); composer.setSize(innerWidth,innerHeight); fxaaPass.material.uniforms['resolution'].value.set(1/innerWidth,1/innerHeight); }
boot('WIRING POST FX…');
const composer=new EffectComposer(renderer); composer.addPass(new RenderPass(scene,camera)); const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth/2,innerHeight/2),0.4,0.6,0.85); composer.addPass(bloom);
const fxaaPass=new ShaderPass(FXAAShader); fxaaPass.material.uniforms['resolution'].value.set(1/innerWidth,1/innerHeight); composer.addPass(fxaaPass); composer.addPass(new OutputPass());
let bob=0, footT=0;
function update(dt,t){
  if(cinematic.active){ stepCinematic(dt); return; }
  if(!gameStarted||!pointerLocked||gameOver||gameWon) return;
  stepFactions(dt,t); stepTank(dt); stepJet(dt);
  for(let i=projectiles.length-1;i>=0;i--) stepProjectile(projectiles[i],dt); stepShells(dt); stepGrenades(dt); stepParticles(dt); stepDebris(dt);
  if(!hubMode) checkObjectives(); stepAnimals(dt,t); stepNavArrows(dt,t);
  // periodic enemy rush waves that charge the player (battle only)
  if(!hubMode){ rushTimer-=dt; if(rushTimer<=0){ rushTimer=28+Math.random()*22; if(enemies.filter(e=>e.alive).length<16) spawnRush(); } }
  if(hubMode){ raidTimer-=dt; if(raidTimer<=0){ raidTimer=55+Math.random()*40; if(enemies.filter(e=>e.alive).length<8) spawnBaseRaid(); } }
  // reaching the capital triggers the final defenders + unlocks the flag (no strict-order softlock)
  if(!hubMode){ const dHQ=Math.hypot(player.pos.x-hqPos.x,player.pos.z-hqPos.z);
    if(!bossTriggered && dHQ<40){ bossTriggered=true; const fe=encounters[encounters.length-1]; if(fe&&!fe.spawned) triggerEncounter(fe); flagGroup.visible=true; missionPhase='plant'; toast('STORM THE CAPITAL — CLEAR THE AREA, THEN PLANT YOUR FLAG'); }
    // flag planting: be at the flag with the immediate area clear of enemies
    if(missionPhase==='plant' && player.vehicle==null){
      const clear=!enemies.some(u=>u.alive && u.group.position.distanceTo(player.pos)<30);
      if(dHQ<8 && clear && keys['KeyE']){ flagPlanting+=dt; $('obj-prog').textContent=`PLANTING THE FLAG… ${Math.round(flagPlanting/2.5*100)}%`; if(flagPlanting>=2.5 && !gameWon) doWin(); }
      else { flagPlanting=Math.max(0,flagPlanting-dt*1.5); if(dHQ<8 && !clear) $('obj-prog').textContent='⚠ CLEAR THE ENEMIES TO PLANT THE FLAG'; else if(dHQ<8) $('obj-prog').textContent='HOLD E TO PLANT THE FLAG'; } } }
  // beacon spin
  for(const b of beacons){ if(b.visible) b.rotation.y+=dt*1.5; }

  if(player.vehicle){ /* camera in step */ }
  else { moveAndCollide(dt); if(firing&&curMode()==='AUTO') shoot();
    recoilPitch=lerp(recoilPitch,0,dt*6); recoilYaw=lerp(recoilYaw,0,dt*6); kick=lerp(kick,0,dt*8);
    if(flashLight){ flashLight.intensity=lerp(flashLight.intensity,0,dt*18); flashSprite.material.opacity=lerp(flashSprite.material.opacity,0,dt*22); }
    const targetFov=ads?(FOV_HIP/ws.def.adsZoom):FOV_HIP; camera.fov=lerp(camera.fov,targetFov,dt*10); camera.updateProjectionMatrix();
    const moving=speed2D>0.5&&player.onGround; bob+=dt*speed2D*1.6; const bobY=moving?Math.sin(bob*2)*0.035*(sprinting?1.4:1):0,bobX=moving?Math.cos(bob)*0.025:0;
    footT-=dt; if(moving&&footT<=0){ footT=sprinting?0.3:0.46; sfxFoot(); }
    const eyeH=(crouching?player.crouchHeight:player.height); const leanOff=rightVec.clone().multiplyScalar(player.lean*0.5);
    camera.position.copy(player.pos).add(new THREE.Vector3(bobX,eyeH+bobY,0)).add(leanOff);
    const lp=player.pitch+recoilPitch,ly=player.yaw+recoilYaw; const dir=new THREE.Vector3(-Math.sin(ly)*Math.cos(lp),Math.sin(lp),-Math.cos(ly)*Math.cos(lp)); camera.up.set(0,1,0).applyAxisAngle(dir,-player.lean*0.5); camera.lookAt(camera.position.clone().add(dir));
    fpBody.visible=player.pitch<-0.2; // only show your body when looking down — never block the forward view
    fpBody.position.set(player.pos.x-forward.x*0.22,0,player.pos.z-forward.z*0.22); fpBody.rotation.y=player.yaw; fpBody.scale.y=crouching?0.7:1.0; const sp=Math.min(1,speed2D/5); fpBody.userData.lLeg.rotation.x=Math.sin(bob*2)*0.5*sp; fpBody.userData.rLeg.rotation.x=-Math.sin(bob*2)*0.5*sp;
    const tgtPos=ads?new THREE.Vector3(0,-0.075,-0.46):new THREE.Vector3(0.18,-0.2,-0.5); weapon.position.lerp(tgtPos,dt*12); weapon.position.z+=kick*0.5; weapon.rotation.x=lerp(weapon.rotation.x,kick*1.2+(moving?Math.sin(bob*2)*0.01:0),dt*12); weapon.rotation.y=lerp(weapon.rotation.y,-recoilYaw*2+(moving?Math.cos(bob)*0.01:0),dt*12); }

  if(hmTimer>0){ hmTimer-=dt; if(hmTimer<=0) $('hitmarker').style.opacity='0'; }
  if(flashTimer>0){ flashTimer-=dt; if(flashTimer<=0) $('damage-flash').style.opacity='0'; }
  if(toastTimer>0){ toastTimer-=dt; if(toastTimer<=0) $('toast').style.opacity='0'; }
  const W=WEATHERS[CONFIG.weather]||WEATHERS.clear; wind.x=W.windBase+Math.sin(t*0.2)*1.5; wind.z=-W.windBase*0.4+Math.cos(t*0.17)*1.5; $('wind-val').textContent=`${wind.length().toFixed(1)} m/s ${wind.x>=0?'E':'W'}`;
  let deg=(THREE.MathUtils.radToDeg(player.yaw)%360+360)%360; $('compass').textContent=COMPASS[Math.round(deg/45)%8];
  $('stance-val').textContent=player.vehicle?(player.vehicle.type==='tank'?'ARMOR':'AIRBORNE'):ads?'READY · ADS':crouching?'CROUCH':sprinting?'SPRINT':'PATROL';
  $('cnt-blue').textContent=friendlies.filter(f=>f.alive).length+1; $('cnt-red').textContent=enemies.filter(e=>e.alive).length;
  // health regen: heal once you've avoided damage for a few seconds
  regenT+=dt; if(regenT>4 && player.hp<player.maxHp && player.hp>0){ player.hp=Math.min(player.maxHp,player.hp+24*dt); }
  updateHealthHUD(); if((miniTick=(miniTick+1)%3)===0) drawMinimap();
  const pr=$('prompt');
  if(hubMode){ const st=nearestStation(); if(st){ pr.innerHTML=`<kbd>E</kbd> ${st.label}`; pr.style.opacity='1'; } else pr.style.opacity='0';
    const tgt=campaign.target?nationById(campaign.target).name:'NONE — use Command Terminal';
    $('obj-title').textContent='HOME BASE'; $('obj-prog').textContent=`$${campaign.treasury} · Army ${campaign.army}/${maxArmy()} · Target: ${tgt}`; }
  else { const v=player.vehicle?null:nearestVehicle(); if(v){ pr.innerHTML=`<kbd>E</kbd> ${v.type==='tank'?'MOUNT TANK':'BOARD JET'}`; pr.style.opacity='1'; } else if(missionPhase==='plant'&&Math.hypot(player.pos.x-hqPos.x,player.pos.z-hqPos.z)<6){ pr.innerHTML='<kbd>E</kbd> HOLD TO PLANT FLAG'; pr.style.opacity='1'; } else pr.style.opacity='0'; }
  const T=TIMES[CONFIG.time]||TIMES.dusk; const focus=player.vehicle?player.vehicle.group.position:player.pos; sun.position.set(focus.x+T.sun[0],T.sun[1],focus.z+T.sun[2]); sun.target.position.copy(focus); }
// direct render — no bloom/FXAA composer (the post passes were a big cost)
function render(){ renderer.render(scene,camera); if(!player.vehicle&&!cinematic.active&&gameStarted){ renderer.autoClear=false; renderer.clearDepth(); renderer.render(gunScene,gunCam); renderer.autoClear=true; } }
function loop(){ requestAnimationFrame(loop); const dt=Math.min(clock.getDelta(),0.05); update(dt,clock.elapsedTime); render(); }
let worldDone=false;
function cleanupBattle(){ for(const u of allUnits()){ disposeGeo(u.group); scene.remove(u.group); } friendlies.length=0; enemies.length=0;
  for(const p of projectiles) freeTracer(p.tracer); projectiles.length=0;
  for(const s of shells){ if(s.mesh) scene.remove(s.mesh); } shells.length=0;
  for(const b of beacons) scene.remove(b); beacons.length=0;
  for(const d of debris){ disposeGeo(d.mesh); scene.remove(d.mesh); } debris.length=0;
  for(const pa of particles){ pa.part.inUse=false; pa.part.mesh.visible=false; } particles.length=0;
  for(const gr of grenades) scene.remove(gr.mesh); grenades.length=0;
  if(navArrows) navArrows.forEach(a=>a.visible=false);
  encounters.length=0; curObj=0; missionPhase='advance'; player.vehicle=null; modelCount=0; }
function aiTurn(){ campaign.turn++; campaign.news=''; const foes=NATIONS.filter(n=>!campaign.owned.has(n.id)); const conq=[...campaign.owned].filter(id=>id!==campaign.player);
  if(foes.length && conq.length && Math.random()<0.45){ const lost=conq[(Math.random()*conq.length)|0]; campaign.owned.delete(lost); const att=foes[(Math.random()*foes.length)|0]; campaign.news=`⚠ ${nationById(att).name} counter-attacked and RETOOK ${nationById(lost).name}! Reconquer it.`; } }
function endBattle(won){ gameStarted=false; document.exitPointerLock(); $('hud').classList.add('hidden'); $('tankhud').style.display='none'; $('planehud').style.display='none';
  const n=nationById(campaign.target);
  // casualties: soldiers who died are lost from your army
  const alive=friendlies.filter(f=>f.alive).length; const deaths=Math.max(0,(campaign.deployed||0)-alive);
  campaign.army=maxArmy(); // reinforcements arrive after every battle — your squad is restored to full
  const reward=n.strength*500; // 500 coins per star (strength rating)
  if(won){ campaign.owned.add(campaign.target); campaign.treasury+=reward; } else { campaign.treasury=Math.max(0,campaign.treasury-100); }
  aiTurn(); saveGame();
  if(NATIONS.every(x=>campaign.owned.has(x.id))){ worldDone=true; $('end-title').textContent='THE WORLD IS YOURS'; $('end-sub').textContent='TOTAL VICTORY'; $('end-tag').textContent=`${factionDef().name} now rules every nation on Earth. Treasury $${campaign.treasury}.`; $('endscreen').classList.remove('hidden'); return; }
  $('end-title').textContent= won?'VICTORY':'OPERATION FAILED'; $('end-sub').textContent= won?`${n.name} CONQUERED`:`${n.name} HELD THE LINE`;
  const cas=deaths>0?` ${deaths} soldier(s) lost — recruit more.`:'';
  $('end-tag').textContent=(won?`+$${reward} earned (${n.strength}★ × $500).`:'You were pushed back.')+cas+' Return to base, upgrade, then deploy again.'; campaign.target=null; $('endscreen').classList.remove('hidden'); }
function doGameOver(){ gameOver=true; endBattle(false); }
function doWin(){ gameWon=true; endBattle(true); }

// ===========================================================================
//  PLANNING — route drawing
// ===========================================================================
let planPhase=1, planmap=null, pctx=null, drawing=false, playerPath=[], enemyPath=[];
function w2c(wx,wz,cw,ch){ return [ (wx/(2*WB)+0.5)*cw, (wz/(2*WB)+0.5)*ch ]; }
function c2w(cx,cy,cw,ch){ return new THREE.Vector3((cx/cw-0.5)*2*WB,0,(cy/ch-0.5)*2*WB); }
function drawPlanMap(){ const cw=planmap.width,ch=planmap.height,ctx=pctx; ctx.clearRect(0,0,cw,ch);
  ctx.fillStyle='#0a0f16'; ctx.fillRect(0,0,cw,ch);
  // grid
  ctx.strokeStyle='rgba(80,110,140,.18)'; ctx.lineWidth=1; for(let i=0;i<=10;i++){ const p=i/10; ctx.beginPath(); ctx.moveTo(p*cw,0); ctx.lineTo(p*cw,ch); ctx.moveTo(0,p*ch); ctx.lineTo(cw,p*ch); ctx.stroke(); }
  // city blocks footprint hint
  ctx.fillStyle='rgba(90,120,150,.10)'; for(let gx=-GRID;gx<=GRID;gx++)for(let gz=-GRID;gz<=GRID;gz++){ if(Math.abs(gx*CELL)<CELL&&Math.abs(gz*CELL)<CELL) continue; const [bx,by]=w2c(gx*CELL,gz*CELL,cw,ch); ctx.fillRect(bx-BLOCK/(2*WB)*cw*0.5,by-BLOCK/(2*WB)*ch*0.5,BLOCK/(2*WB)*cw*0.5,BLOCK/(2*WB)*ch*0.5); }
  // insertion + HQ
  const [ix,iy]=w2c(insertion.x,insertion.z,cw,ch); const [hx,hy]=w2c(hqPos.x,hqPos.z,cw,ch);
  ctx.fillStyle='#3ddc84'; ctx.beginPath(); ctx.arc(ix,iy,9,0,6.28); ctx.fill(); ctx.fillStyle='#bff5d2'; ctx.font='11px monospace'; ctx.fillText('INSERTION',ix+12,iy+4);
  ctx.fillStyle='#ff5050'; ctx.beginPath(); ctx.moveTo(hx,hy-12); ctx.lineTo(hx,hy+12); ctx.lineTo(hx+16,hy-4); ctx.closePath(); ctx.fill(); ctx.fillStyle='#ffb3b3'; ctx.fillText('ENEMY CAPITAL',hx+12,hy+18);
  // player path
  if(playerPath.length>1){ ctx.strokeStyle='#46d1ff'; ctx.lineWidth=3; ctx.beginPath(); playerPath.forEach((p,i)=>{ const [x,y]=w2c(p.x,p.z,cw,ch); i?ctx.lineTo(x,y):ctx.moveTo(x,y); }); ctx.stroke(); }
  // enemy path
  if(enemyPath.length>1){ ctx.strokeStyle='#ff7755'; ctx.lineWidth=3; ctx.setLineDash([8,6]); ctx.beginPath(); enemyPath.forEach((p,i)=>{ const [x,y]=w2c(p.x,p.z,cw,ch); i?ctx.lineTo(x,y):ctx.moveTo(x,y); }); ctx.stroke(); ctx.setLineDash([]); }
}
function setupPlanCanvas(){ planmap=$('planmap'); pctx=planmap.getContext('2d');
  const pos=e=>{ const r=planmap.getBoundingClientRect(); const cx=(e.clientX-r.left)/r.width*planmap.width, cy=(e.clientY-r.top)/r.height*planmap.height; return c2w(cx,cy,planmap.width,planmap.height); };
  planmap.onmousedown=e=>{ drawing=true; const arr=planPhase===1?playerPath:enemyPath; arr.length=0; arr.push(pos(e)); drawPlanMap(); };
  planmap.onmousemove=e=>{ if(!drawing) return; const arr=planPhase===1?playerPath:enemyPath; const w=pos(e); if(arr.length===0||w.distanceTo(arr[arr.length-1])>10) arr.push(w); drawPlanMap(); };
  planmap.onmouseup=()=>{ drawing=false; }; planmap.onmouseleave=()=>{ drawing=false; };
  $('plan-clear').onclick=()=>{ (planPhase===1?playerPath:enemyPath).length=0; drawPlanMap(); };
  $('plan-next').onclick=()=>{ if(planPhase===1){ planPhase=2; $('plan-phase').textContent='PHASE 2 — DRAW THE ENEMY PUSH'; $('plan-hint').textContent='Now plot how the enemy advances toward you (red dashed). Their reinforcements will flow down this line. Then commit.'; $('plan-next').style.display='none'; $('plan-commit').style.display='inline-block'; drawPlanMap(); } };
  $('plan-commit').onclick=commitPlan;
  drawPlanMap();
}
function resample(path,n){ // returns n points incl forced start=insertion, end=hq
  const pts=[insertion.clone(),...path,hqPos.clone()]; // total polyline
  // compute cumulative length
  let total=0; const seg=[]; for(let i=1;i<pts.length;i++){ const l=pts[i].distanceTo(pts[i-1]); seg.push(l); total+=l; }
  const out=[]; for(let k=0;k<n;k++){ let target=total*k/(n-1),acc=0,idx=0; while(idx<seg.length&&acc+seg[idx]<target){ acc+=seg[idx]; idx++; } const lt=seg[idx]?(target-acc)/seg[idx]:0; out.push(pts[idx].clone().lerp(pts[Math.min(idx+1,pts.length-1)],lt)); }
  out[0].copy(insertion); out[out.length-1].copy(hqPos); return out; }

// ===========================================================================
//  FLOW: briefing → planning → cinematic → mission
// ===========================================================================
function chip(label,sub,sel){ return `<div class="chip ${sel?'sel':''}">${label}${sub?`<small>${sub}</small>`:''}</div>`; }
function buildBriefing(){
  $('g-map').innerHTML=Object.entries(MAPS).map(([k,v])=>chip(v.name,'',k===CONFIG.map)).join('');
  $('g-faction').innerHTML=FACTIONS.map(f=>chip(f.name,f.sub,f.id===CONFIG.faction)).join('');
  $('g-target').innerHTML=TARGETS.map(t=>chip(t,'',t===CONFIG.target)).join('');
  $('g-mission').innerHTML=Object.entries(MISSIONS).map(([k,m])=>chip(m.name,m.sub,k===CONFIG.mission)).join('');
  $('g-time').innerHTML=Object.entries(TIMES).map(([k,v])=>chip(v.name,'',k===CONFIG.time)).join('');
  $('g-weather').innerHTML=Object.entries(WEATHERS).map(([k,v])=>chip(v.name,'',k===CONFIG.weather)).join('');
  $('g-weapon').innerHTML=Object.entries(WEAPONS).map(([k,v])=>chip(v.name,`${v.mass}kg · ${v.mag} rds`,k===CONFIG.weapon)).join('');
  $('g-squad').innerHTML=[2,4,6,8].map(n=>chip(n+' MEN','',n===CONFIG.squad)).join('');
  wireGroup('g-map',Object.keys(MAPS),'map',v=>{ CONFIG.time=MAPS[v].time; }); wireGroup('g-faction',FACTIONS.map(f=>f.id),'faction'); wireGroup('g-target',TARGETS,'target'); wireGroup('g-mission',Object.keys(MISSIONS),'mission'); wireGroup('g-time',Object.keys(TIMES),'time'); wireGroup('g-weather',Object.keys(WEATHERS),'weather'); wireGroup('g-weapon',Object.keys(WEAPONS),'weapon'); wireGroup('g-squad',[2,4,6,8],'squad'); }
function wireGroup(id,values,key,extra){ const el=$(id); [...el.children].forEach((c,i)=>{ c.onclick=()=>{ CONFIG[key]=values[i]; [...el.children].forEach(x=>x.classList.remove('sel')); c.classList.add('sel'); if(extra) extra(values[i]); }; }); }
function openPlanning(){ buildMap(); applyEnvironment(); $('briefing').classList.add('hidden'); $('planning').classList.remove('hidden'); planPhase=1; playerPath.length=0; enemyPath.length=0; $('plan-phase').textContent='PHASE 1 — DRAW YOUR ADVANCE'; $('plan-next').style.display='inline-block'; $('plan-commit').style.display='none'; setupPlanCanvas(); }
function commitPlan(){ routeWorld=resample(playerPath,5); enemyRouteWorld= enemyPath.length>1?resample(enemyPath,4):[hqPos.clone(),insertion.clone()];
  $('planning').classList.add('hidden'); runCinematic(startMission); }
function startMission(){ cleanupBattle(); gameStarted=true; hubMode=false; gameOver=false; gameWon=false; score=0; orderIdx=0; missionPhase='advance'; flagPlanting=0; rushTimer=18; tntCount=3; bossTriggered=false;
  applyUpgrades();
  player.pos.copy(insertion); player.maxHp=100+campaign.up.health*30; player.hp=player.maxHp; player.stamina=100; player.vehicle=null; player.yaw=0; player.pitch=0; fpBody.visible=true;
  matBodyArmor.color.setHex(factionDef().camo);
  const dep=Math.min(campaign.army,8); campaign.deployed=dep;
  for(let i=0;i<dep;i++){ const a=i/Math.max(1,dep)*6.28; makeUnit(insertion.x+Math.cos(a)*4,insertion.z+Math.sin(a)*3,'blue'); }
  buildMission(); equip(CONFIG.weapon); $('order-val').textContent=ORDERS[orderIdx]; updateHealthHUD();
  $('hud').classList.remove('hidden'); $('obj-title').textContent='ASSAULT · '+nationById(campaign.target).name;
  toast('FOLLOW THE ROUTE — REACH THE CAPITAL'); lock(); }

// ---- campaign screens ----
function applyUpgrades(){ CONFIG.squad=Math.min(8,4+campaign.up.squad); player.maxHp=100+campaign.up.health*30; }
function buildNationSelect(){ $('nation-grid').innerHTML=NATIONS.map(n=>`<div class="chip" data-id="${n.id}" style="pointer-events:auto;min-width:150px;text-align:center;font-size:14px"><div style="font-size:32px;line-height:1.1">${n.flag}</div>${n.name}<small>STRENGTH ${n.strength}</small></div>`).join('');
  [...$('nation-grid').children].forEach(c=>{ c.onclick=()=>pickNation(c.dataset.id); }); }
function pickNation(id){ campaign.player=id; campaign.owned=new Set([id]); campaign.treasury=1000; campaign.turn=1; campaign.news=''; campaign.target=null; campaign.army=4; campaign.up={squad:0,health:0,damage:0,reserves:0}; CONFIG.faction=id; worldDone=false; saveGame();
  $('nationselect').classList.add('hidden'); enterHub(); }
function showWorldMap(){ try{speechSynthesis.cancel();}catch(e){} buildWorldGrid(); $('treasury').textContent=campaign.treasury; $('turn').textContent=campaign.turn; $('terr').textContent=campaign.owned.size; $('terrtot').textContent=NATIONS.length; $('world-sub').textContent=`SELECT A NATION TO INVADE · ARMY ${campaign.army}/${maxArmy()}`; $('world-status').textContent=campaign.news||''; $('endscreen').classList.add('hidden'); $('worldmap').classList.remove('hidden'); }
function buildWorldGrid(){ $('world-grid').innerHTML=NATIONS.map(n=>{ const me=n.id===campaign.player, mine=campaign.owned.has(n.id); const label=me?'YOUR CAPITAL':(mine?'CONQUERED':'INVADE'); const bc=mine?'#3ddc84':'#ff5050';
    return `<div class="chip" data-id="${n.id}" style="pointer-events:${mine?'none':'auto'};min-width:140px;text-align:center;font-size:13px;border-color:${bc};opacity:${mine&&!me?0.7:1}"><div style="font-size:26px;line-height:1.1">${n.flag}</div>${n.name}<small>${label} · STR ${n.strength}</small></div>`; }).join('');
  [...$('world-grid').children].forEach(c=>{ const id=c.dataset.id; if(!campaign.owned.has(id)) c.onclick=()=>invadeNation(id); }); }
// from the Command Terminal: set the target, then return to base to deploy
function invadeNation(id){ const n=nationById(id); campaign.target=id; CONFIG.target=n.name; campaign.news=`TARGET SET: ${n.name}. Board the aircraft at the airfield to deploy.`;
  $('worldmap').classList.add('hidden'); toast(`Target: ${n.name} — head to the airfield`); resumeHub(); }
const UPGRADES=[ {key:'squad',name:'SQUAD SIZE',desc:'+1 soldier in your squad',base:300},{key:'health',name:'BODY ARMOR',desc:'+30 max health',base:250},{key:'damage',name:'FIREPOWER',desc:'+20% weapon damage',base:280},{key:'reserves',name:'AMMO RESERVES',desc:'+30% reserve ammo',base:200} ];
function buildUpgrades(){ $('up-treasury').textContent=campaign.treasury;
  const rc=120, full=campaign.army>=maxArmy(), canRec=!full&&campaign.treasury>=rc;
  let html=`<div class="chip" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;width:100%;border-color:#3ddc84"><span>STANDING ARMY <small>${campaign.army}/${maxArmy()} soldiers — casualties are permanent, recruit to replace</small></span><button class="urecruit" style="pointer-events:auto;background:${canRec?'#3ddc84':'#444'};border:none;border-radius:5px;padding:8px 16px;color:#08111c;font-weight:700;cursor:pointer">RECRUIT $${rc}</button></div>`;
  html+=UPGRADES.map(u=>{ const lvl=campaign.up[u.key],cost=u.base*(lvl+1); return `<div class="chip" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;width:100%"><span>${u.name} <small>LVL ${lvl} — ${u.desc}</small></span><button class="ubuy" data-key="${u.key}" data-cost="${cost}" style="pointer-events:auto;background:${campaign.treasury>=cost?'#e8b339':'#444'};border:none;border-radius:5px;padding:8px 16px;color:#08111c;font-weight:700;cursor:pointer">$${cost}</button></div>`; }).join('');
  $('upgrade-list').innerHTML=html;
  const rb=document.querySelector('.urecruit'); if(rb) rb.onclick=()=>{ if(campaign.army<maxArmy()&&campaign.treasury>=rc){ campaign.treasury-=rc; campaign.army++; saveGame(); buildUpgrades(); } };
  [...document.querySelectorAll('.ubuy')].forEach(b=>{ b.onclick=()=>{ const cost=+b.dataset.cost,key=b.dataset.key; if(campaign.treasury>=cost){ campaign.treasury-=cost; campaign.up[key]++; saveGame(); buildUpgrades(); } }; }); }
// ---- HOME BASE HUB (walk around, recruit, pick target, board plane) ----
let stations=[], stationMeshes=[];
function buildHubStations(){ for(const m of stationMeshes) scene.remove(m); stationMeshes.length=0; stations.length=0;
  const mk=(x,z,type,label,color)=>{ stations.push({pos:new THREE.Vector3(x,0,z),type,label});
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,16,12,1,true),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.25,side:THREE.DoubleSide,depthWrite:false})); beam.position.set(x,8,z); scene.add(beam); stationMeshes.push(beam);
    const ring=new THREE.Mesh(new THREE.RingGeometry(2.2,2.8,28),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.6,side:THREE.DoubleSide})); ring.rotation.x=-Math.PI/2; ring.position.set(x,0.12,z); scene.add(ring); stationMeshes.push(ring); };
  mk(insertion.x-6, insertion.z+11,'target','COMMAND TERMINAL — choose target nation',0x46d1ff);
  mk(insertion.x-18, insertion.z+9,'depot','ARMORY — recruit soldiers & upgrade',0xe8b339);
  mk(jet?jet.group.position.x:insertion.x+26, jet?jet.group.position.z:insertion.z+4,'airfield','AIRFIELD — deploy to battle',0x3ddc84); }
function nearestStation(){ let best=null,bd=5.5; for(const s of stations){ const d=Math.hypot(player.pos.x-s.pos.x,player.pos.z-s.pos.z); if(d<bd){bd=d;best=s;} } return best; }
function hubInteract(){ const s=nearestStation(); if(!s) return;
  if(s.type==='target') openTargetSelect();
  else if(s.type==='depot'){ document.exitPointerLock(); buildUpgrades(); $('upgrades').classList.remove('hidden'); }
  else if(s.type==='airfield'){ if(campaign.target) deployToBattle(); else toast('Pick a target at the Command Terminal first.'); } }
function openTargetSelect(){ document.exitPointerLock(); buildWorldGrid(); $('treasury').textContent=campaign.treasury; $('turn').textContent=campaign.turn; $('terr').textContent=campaign.owned.size; $('terrtot').textContent=NATIONS.length; $('world-sub').textContent=`SELECT TARGET · ARMY ${campaign.army}/${maxArmy()}`; $('world-status').textContent=campaign.news||''; $('worldmap').classList.remove('hidden'); }
function spawnHubSquad(){ const dep=Math.min(campaign.army,8); for(let i=0;i<dep;i++){ const a=i/Math.max(1,dep)*6.28; makeUnit(insertion.x+Math.cos(a)*5,insertion.z+7+Math.sin(a)*4,'blue'); } }
function enterHub(){ cleanupBattle(); CONFIG.biome=biomeOf(campaign.player); clearMap(); buildMap(); applyUpgrades();
  applyEnvironment(); rebuildHQ('liberty');
  hubMode=true; gameStarted=true; gameOver=false; gameWon=false; missionPhase='hub'; raidTimer=40;
  player.maxHp=100+campaign.up.health*30; player.hp=player.maxHp; player.stamina=100; player.vehicle=null; player.pos.set(insertion.x,0,insertion.z); player.yaw=Math.PI; player.pitch=0; fpBody.visible=true;
  matBodyArmor.color.setHex(factionDef().camo);
  equip(CONFIG.weapon||'rifle'); buildHubStations(); spawnHubSquad();
  $('worldmap').classList.add('hidden'); $('upgrades').classList.add('hidden'); $('endscreen').classList.add('hidden'); $('nationselect').classList.add('hidden'); $('hud').classList.remove('hidden');
  toast('HOME BASE — recruit & upgrade at the ARMORY, set a TARGET, then deploy at the AIRFIELD'); lock(); }
function resumeHub(){ hubMode=true; gameStarted=true; $('worldmap').classList.add('hidden'); $('upgrades').classList.add('hidden'); $('hud').classList.remove('hidden'); lock(); }
function deployToBattle(){ const n=nationById(campaign.target); CONFIG.biome=biomeOf(campaign.target);
  cleanupBattle(); clearMap(); buildMap(); applyEnvironment(); // fresh biome battlefield for this nation
  routeWorld=resample([],5); enemyRouteWorld=[hqPos.clone(),insertion.clone()];
  rebuildHQ(n.landmark);
  hubMode=false; $('worldmap').classList.add('hidden'); $('upgrades').classList.add('hidden'); runCinematic(startMission); }

$('upgrades-btn').onclick=()=>{ buildUpgrades(); $('worldmap').classList.add('hidden'); $('upgrades').classList.remove('hidden'); };
$('upgrades-back').onclick=()=>{ $('upgrades').classList.add('hidden'); resumeHub(); };
$('restart-btn').addEventListener('click',()=>{ if(worldDone){ wipeSave(); location.reload(); } else { $('endscreen').classList.add('hidden'); enterHub(); } });
const ncb=$('newcampaign-btn'); if(ncb) ncb.onclick=()=>{ wipeSave(); location.reload(); };
$('settings-btn').onclick=()=>{ $('worldmap').classList.add('hidden'); $('settings').classList.remove('hidden'); };
$('set-back').onclick=()=>{ $('settings').classList.add('hidden'); openTargetSelect(); };
$('set-newcampaign').onclick=()=>{ wipeSave(); location.reload(); };
$('set-change-country').onclick=()=>{ wipeSave(); campaign.player=null; $('settings').classList.add('hidden'); $('worldmap').classList.add('hidden'); $('hud').classList.add('hidden'); buildNationSelect(); $('nationselect').classList.remove('hidden'); };

buildNationSelect(); const _loaded=loadGame(); boot('READY');
setTimeout(()=>{ $('loading').classList.add('hidden'); if(_loaded){ enterHub(); } else { $('nationselect').classList.remove('hidden'); } loop(); },250);
