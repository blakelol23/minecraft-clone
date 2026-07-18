/**
 * @module inventory
 * Inventory, crafting, chest, furnace, hotbar icons
 * Lines 2506-4177 from game.monolith.html
 * Loaded as source text by main.js and evaluated in one shared scope.
 */

function mkItem(id,count=1){return{id,count};}
function slotId(s){return s?s.id:BLOCK.AIR;}
function slotCt(s){return s?s.count:0;}
const invSlots=new Array(27).fill(null);
const hotbarSlots=new Array(9).fill(null);
const craftSlots=new Array(4).fill(null);
let craftResult=null;
// Crafting table 3x3 state
const tableSlots=new Array(9).fill(null);
let tableResult=null;
let tableOpen=false;
// Chest state
const chestStorage=new Map(); // "x,y,z" → Array(27) of slot objects
let chestOpen=false;
let chestKey=null; // currently open chest key
// Furnace state
const furnaceStorage=new Map(); // "x,y,z" → {slots:[in,fuel,out], burnTime, burnTimeTotal, cookTime}
let furnaceOpen=false;
let furnaceKey=null;
const FURNACE_SLOT_INPUT=0;
const FURNACE_SLOT_FUEL=1;
const FURNACE_SLOT_OUTPUT=2;
const FURNACE_SMELT_TIME=5.0;
const FURNACE_RECIPES={
  [BLOCK.SAND]:{out:BLOCK.GLASS,count:1,xp:1},
  [BLOCK.IRON_ORE]:{out:ITEM.IRON_INGOT,count:1,xp:2},
  [BLOCK.GOLD_ORE]:{out:ITEM.GOLD_INGOT,count:1,xp:2},
  [ITEM.RAW_MEAT]:{out:ITEM.COOKED_PORKCHOP,count:1,xp:2},
};
const FURNACE_FUEL_TIME={
  [ITEM.COAL]:16,
  [BLOCK.WOOD]:5,
  [BLOCK.PLANKS]:5,
  [ITEM.STICK]:2,
};
function _makeFurnaceState(){
  return{slots:[null,null,null],burnTime:0,burnTimeTotal:0,cookTime:0};
}
function getFurnaceStateForKey(key,create=true){
  if(!key)return null;
  let st=furnaceStorage.get(key);
  if(!st&&create){
    st=_makeFurnaceState();
    furnaceStorage.set(key,st);
  }
  return st||null;
}
function getSmeltRecipe(id){
  return FURNACE_RECIPES[id]||null;
}
function getFuelBurnTime(id){
  return FURNACE_FUEL_TIME[id]||0;
}
let dragItem=null;
let dragFrom=null;
let dragMoved=false;
let dragDropHandled=false;

// ── RECIPES (defined here — MUST be before any init call) ─────────────────
// 2×2 inventory recipes
const RECIPES_2x2=[
  // 1 Wood log → 4 Planks (shapeless)
  {shapeless:true,ingredients:[BLOCK.WOOD],counts:[1],result:{id:BLOCK.PLANKS,count:4}},
  // 2 Planks (vertically) → 4 Sticks
  {shaped:true,grid:[BLOCK.PLANKS,0,BLOCK.PLANKS,0],result:{id:ITEM.STICK,count:4}},
  {shaped:true,grid:[0,BLOCK.PLANKS,0,BLOCK.PLANKS],result:{id:ITEM.STICK,count:4}},
  // 4 Planks → Crafting Table
  {shaped:true,grid:[BLOCK.PLANKS,BLOCK.PLANKS,BLOCK.PLANKS,BLOCK.PLANKS],result:{id:BLOCK.CRAFT_TABLE,count:1}},
];
// 3×3 crafting table recipes (grid: [0..8] top-left→right, left→right each row)
const RECIPES_3x3=[
  // Wood Pickaxe: 3 planks top, sticks center+bottom-center
  {grid:[BLOCK.PLANKS,BLOCK.PLANKS,BLOCK.PLANKS, 0,ITEM.STICK,0, 0,ITEM.STICK,0],result:{id:TOOL.WOOD_PICK,count:1,dur:59}},
  // Stone Pickaxe
  {grid:[BLOCK.COBBLESTONE,BLOCK.COBBLESTONE,BLOCK.COBBLESTONE, 0,ITEM.STICK,0, 0,ITEM.STICK,0],result:{id:TOOL.STONE_PICK,count:1,dur:131}},
  // Wood Axe (right-facing)
  {grid:[BLOCK.PLANKS,BLOCK.PLANKS,0, BLOCK.PLANKS,ITEM.STICK,0, 0,ITEM.STICK,0],result:{id:TOOL.WOOD_AXE,count:1,dur:59}},
  // Stone Axe
  {grid:[BLOCK.COBBLESTONE,BLOCK.COBBLESTONE,0, BLOCK.COBBLESTONE,ITEM.STICK,0, 0,ITEM.STICK,0],result:{id:TOOL.STONE_AXE,count:1,dur:131}},
  // Wood Shovel
  {grid:[0,BLOCK.PLANKS,0, 0,ITEM.STICK,0, 0,ITEM.STICK,0],result:{id:TOOL.WOOD_SHOVEL,count:1,dur:59}},
  // Stone Shovel
  {grid:[0,BLOCK.COBBLESTONE,0, 0,ITEM.STICK,0, 0,ITEM.STICK,0],result:{id:TOOL.STONE_SHOVEL,count:1,dur:131}},
  // Iron Pickaxe
  {grid:[ITEM.IRON_INGOT,ITEM.IRON_INGOT,ITEM.IRON_INGOT, 0,ITEM.STICK,0, 0,ITEM.STICK,0],result:{id:TOOL.IRON_PICK,count:1,dur:250}},
  // Torch (4): coal over stick
  {grid:[0,ITEM.COAL,0, 0,ITEM.STICK,0, 0,0,0],result:{id:BLOCK.TORCH,count:4}},
  // Chest: 8 planks in ring
  {grid:[BLOCK.PLANKS,BLOCK.PLANKS,BLOCK.PLANKS, BLOCK.PLANKS,0,BLOCK.PLANKS, BLOCK.PLANKS,BLOCK.PLANKS,BLOCK.PLANKS],result:{id:BLOCK.CHEST,count:1}},
  // Furnace: 8 cobblestone in ring
  {grid:[BLOCK.COBBLESTONE,BLOCK.COBBLESTONE,BLOCK.COBBLESTONE, BLOCK.COBBLESTONE,0,BLOCK.COBBLESTONE, BLOCK.COBBLESTONE,BLOCK.COBBLESTONE,BLOCK.COBBLESTONE],result:{id:BLOCK.FURNACE,count:1}},
];


const player={
  pos:new THREE.Vector3(0,38,0),vel:new THREE.Vector3(),
  yaw:Math.PI*.25,pitch:-.18,onGround:false,
  mode:"first",bobT:0,footT:0,selIdx:0,_nameTimer:null,
  health:20,maxHealth:20,    // 10 hearts × 2
  hunger:20,maxHunger:20,    // 10 shanks × 2
  saturation:5,
  exhaustion:0,
  regenTick:0,
  starveTick:0,
  fallStartY:null,
  air:300,maxAir:300,drownTick:0,
  lastHurtOverlayAt:0,
  creative:false,
  sneaking:false,sprinting:false,cactusHurtAt:0,
  stepSmoothOffset:0,        // visual Y offset for smooth step-up (decays each frame)
  bodyYaw:Math.PI*.25,       // decoupled from camera yaw for head-look system
  coyoteT:0,
  moveInput:0,
  moveDir:new THREE.Vector2(0,-1),
  airTime:0,
  underFx:0,
  waterEdgeHopCd:0,
  hitHoriz:false,
  safePos:new THREE.Vector3(0,38,0),
  xp:0,xpLevel:0,xpTotal:0  // XP system
};
const iState={hov:null,hovMob:null,breakKey:"",breakT:0,breaking:false,lmb:false,rmb:false,eating:false,eatT:0,placeAnim:0,attackT:0.35};
let pLocked=false,_msgTimer=null,worldTime=0,invOpen=false;
let pendingWorldRuntimeState=null;
let pendingMobRestoreState=null;
let _ignoreMouseUntil=0;
const MOUSE_SPIKE_REJECT=900; // Ignore impossible pointer-lock spikes that can cause instant camera snaps
const MOUSE_DELTA_CLAMP=140;  // Clamp per-event delta to keep motion stable while still allowing fast turns

// ── F3 Debug State ────────────────────────────────────────────────────────────
const f3={
  open:false,          // F3 = toggle full debug screen
  showHitboxes:false,  // F3+B
  showChunkBorders:false, // F3+G (chunk grid lines)
  reducedDebug:false,  // F3+H (toggle advanced tooltips — visual only here)
  pauseOnLostFocus:true, // F3+P
  frustumCaptured:false, // F3+F — capture frustum + freeze ticks (like MC's "Captured frustum")
  _lastUpdate:0,
  _pendingCombo:null,  // key waiting for combo (set when F3 is held)
  _comboCd:0,
};
// Mob hitbox wireframe objects (LineSegments, one per mob, toggled by F3+B)
const _mobHitboxWires=new Map(); // mob object → LineSegments
const _hitboxGeo=new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1));
const _hitboxMat=new THREE.LineBasicMaterial({color:0xff0000,depthTest:false,depthWrite:false,transparent:true,opacity:0.95});
const _playerHitboxMat=new THREE.LineBasicMaterial({color:0xffff00,depthTest:false,depthWrite:false,transparent:true,opacity:0.95});
const _playerHitboxWire=new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(S.playerR*2,S.playerH,S.playerR*2)),
  _playerHitboxMat
);
_playerHitboxWire.visible=false;
_playerHitboxWire.frustumCulled=false;
_playerHitboxWire.renderOrder=999;
scene.add(_playerHitboxWire);
// Chunk border grid lines (F3+G)
let _chunkBorderLines=null;
function _buildChunkBorderLines(){
  if(_chunkBorderLines){scene.remove(_chunkBorderLines);_chunkBorderLines=null;}
  if(!f3.showChunkBorders)return;
  const geo=new THREE.BufferGeometry();
  const verts=[];
  const cx=Math.floor(player.pos.x/S.chunkSize),cz=Math.floor(player.pos.z/S.chunkSize);
  const R=GS.renderDist+1;
  for(let dx=-R;dx<=R+1;dx++){
    const wx=(cx+dx)*S.chunkSize;
    verts.push(wx,0,cz*S.chunkSize-R*S.chunkSize, wx,S.worldH,cz*S.chunkSize-R*S.chunkSize);
    verts.push(wx,0,cz*S.chunkSize+(R+1)*S.chunkSize, wx,S.worldH,cz*S.chunkSize+(R+1)*S.chunkSize);
    verts.push(wx,0,cz*S.chunkSize-R*S.chunkSize, wx,0,cz*S.chunkSize+(R+1)*S.chunkSize);
  }
  for(let dz=-R;dz<=R+1;dz++){
    const wz=(cz+dz)*S.chunkSize;
    verts.push(cx*S.chunkSize-R*S.chunkSize,0,wz, cx*S.chunkSize+(R+1)*S.chunkSize,0,wz);
    verts.push(cx*S.chunkSize-R*S.chunkSize,S.worldH,wz, cx*S.chunkSize+(R+1)*S.chunkSize,S.worldH,wz);
  }
  geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  _chunkBorderLines=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0xff00ff,transparent:true,opacity:0.5,depthTest:false}));
  scene.add(_chunkBorderLines);
}
// ── Captured Frustum debug (F3+F) ───────────────────────────────────────────
// Minecraft-style "[Debug]: Captured frustum": freezes ticks + culling in
// place, drops the player into noclip freecam so they can fly out and see
// exactly which chunks the culling pipeline decided were on/off screen.
let _capturedFrustumGroup=null;
let _freecamPrevNoclip=false;
function _buildCapturedFrustumWire(cam){
  const ndc=[
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1], // near rect
    [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]      // far rect
  ];
  const invProj=new THREE.Matrix4().copy(cam.projectionMatrix).invert();
  const pts=ndc.map(([x,y,z])=>{
    const v=new THREE.Vector3(x,y,z).applyMatrix4(invProj);
    v.applyMatrix4(cam.matrixWorld);
    return v;
  });
  const edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  const verts=[];
  for(const[a,b] of edges)verts.push(pts[a].x,pts[a].y,pts[a].z,pts[b].x,pts[b].y,pts[b].z);
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
  const wire=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x33e0ff,transparent:true,opacity:0.85,depthTest:false}));
  wire.frustumCulled=false;wire.renderOrder=999;
  return wire;
}
function _buildCapturedChunkBoxes(){
  const group=new THREE.Group();
  for(const c of chunkMap.values()){
    if(!c.grp)continue;
    const ox=c.cx*S.chunkSize,oz=c.cz*S.chunkSize;
    const topY=Math.min(S.worldH,(Number.isFinite(c.topY)?c.topY:S.worldH)+4);
    const visible=isChunkVisible(c);
    const geo=new THREE.EdgesGeometry(new THREE.BoxGeometry(S.chunkSize,Math.max(topY,1),S.chunkSize));
    const mat=new THREE.LineBasicMaterial({
      color:visible?0x33ff55:0xff3333,
      transparent:true,opacity:visible?0.28:0.85,depthTest:false
    });
    const box=new THREE.LineSegments(geo,mat);
    box.position.set(ox+S.chunkSize/2,topY/2,oz+S.chunkSize/2);
    box.frustumCulled=false;box.renderOrder=998;
    group.add(box);
  }
  return group;
}
function toggleCapturedFrustum(){
  f3.frustumCaptured=!f3.frustumCaptured;
  if(f3.frustumCaptured){
    _capturedFrustumGroup=new THREE.Group();
    _capturedFrustumGroup.add(_buildCapturedFrustumWire(camera));
    _capturedFrustumGroup.add(_buildCapturedChunkBoxes());
    scene.add(_capturedFrustumGroup);
    _freecamPrevNoclip=!!player.noclip;
    player.noclip=true;
    showMsg('[Debug]: Captured frustum',1600);
  }else{
    if(_capturedFrustumGroup){
      scene.remove(_capturedFrustumGroup);
      _capturedFrustumGroup.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
      _capturedFrustumGroup=null;
    }
    player.noclip=_freecamPrevNoclip;
    showMsg('[Debug]: Cleared captured frustum',1200);
  }
}
const $f3Screen=document.getElementById('f3Screen');
const $f3Left=document.getElementById('f3Left');
const $f3Right=document.getElementById('f3Right');
const $f3Overlay=document.getElementById('f3Overlay');
let _f3LastChunk='';
function updateF3Screen(){
  // Update mob hitbox wires
  const showHB=f3.showHitboxes;
  for(const mob of (mobs||[])){
    if(!_mobHitboxWires.has(mob)){
      const wg=new THREE.EdgesGeometry(new THREE.BoxGeometry(mob.hitW,mob.hitH,mob.hitD));
      const wl=new THREE.LineSegments(wg,_hitboxMat);
      wl.frustumCulled=false;
      wl.renderOrder=999;
      scene.add(wl);_mobHitboxWires.set(mob,wl);
    }
    const wire=_mobHitboxWires.get(mob);
    if(!wire.parent)scene.add(wire);
    wire.visible=showHB;
    if(showHB){
      wire.position.set(mob.pos.x,mob.pos.y+mob.hitH*0.5,mob.pos.z);
      wire.rotation.y=mob.mesh.rotation.y; // rotate with mob facing direction
    }
  }
  // Remove stale hitbox wires for despawned mobs
  for(const [mob,wire] of _mobHitboxWires){
    if(!(mobs||[]).includes(mob)){scene.remove(wire);wire.geometry.dispose();_mobHitboxWires.delete(mob);}
  }
  // Player hitbox
  _playerHitboxWire.visible=showHB;
  if(showHB)_playerHitboxWire.position.set(player.pos.x,player.pos.y+S.playerH*0.5,player.pos.z);
  // Rebuild chunk borders if player chunk changed
  if(f3.showChunkBorders){
    const ck2=`${Math.floor(player.pos.x/S.chunkSize)},${Math.floor(player.pos.z/S.chunkSize)}`;
    if(ck2!==_f3LastChunk){_f3LastChunk=ck2;_buildChunkBorderLines();}
  }
  if(!f3.open)return;
  const now=performance.now();
  if(now-f3._lastUpdate<100)return; // 10 Hz refresh
  f3._lastUpdate=now;
  const cx=Math.floor(player.pos.x/S.chunkSize),cz=Math.floor(player.pos.z/S.chunkSize);
  const lx=((Math.floor(player.pos.x)%S.chunkSize)+S.chunkSize)%S.chunkSize;
  const lz=((Math.floor(player.pos.z)%S.chunkSize)+S.chunkSize)%S.chunkSize;
  const yaw=((-player.yaw*(180/Math.PI))%360+360)%360;
  const pitch=player.pitch*(180/Math.PI);
  const dirs=['South','South-West','West','North-West','North','North-East','East','South-East'];
  const facing=dirs[Math.round(yaw/45)%8];
  const bx=Math.floor(player.pos.x),by=Math.floor(player.pos.y),bz=Math.floor(player.pos.z);
  const underBlock=BLOCK_INFO[getBlock(bx,by-1,bz)]?.name??'Air';
  const inBiome=getCol(bx,bz)?.biome??'unknown';
  const spd=Math.hypot(player.vel.x,player.vel.z).toFixed(2);
  const fps=Math.round(fpsValue||0);
  const rd=GS.renderDist;
  const held=hotbarSlots[player.selIdx];
  const heldName=held?_fmtItemDebugName(held.id):'Air';
  const sneakStr=player.sneaking?'<span style="color:#ffff55">SNEAK</span>':'';
  const sprintStr=player.sprinting?'<span style="color:#55ff55">SPRINT</span>':'';
  $f3Left.innerHTML=
    `<div>BlockieCraft (BlockieCraft Java Edition 1.0)</div>`+
    `<div>FPS: <b style="color:#55ff55">${fps}</b> | RD: ${rd}c</div>`+
    `<div>XYZ: ${player.pos.x.toFixed(3)} / ${player.pos.y.toFixed(3)} / ${player.pos.z.toFixed(3)}</div>`+
    `<div>Block: ${bx} ${by} ${bz}</div>`+
    `<div>Chunk: ${lx} ${by} ${lz} in ${cx} ${cz}</div>`+
    `<div>Facing: ${facing} (${yaw.toFixed(1)} / ${pitch.toFixed(1)})</div>`+
    `<div>Speed: ${spd} m/s &nbsp;${sneakStr}${sprintStr?'&nbsp;'+sprintStr:''}</div>`+
    `<div>onGround: ${player.onGround} | inWater: ${!!waterAtFeet()}</div>`+
    `<div>Holding: ${heldName}</div>`;
  $f3Right.innerHTML=
    `<div>Biome: ${inBiome}</div>`+
    `<div>Under: ${underBlock}</div>`+
    `<div>Mobs: ${(mobs||[]).length}/${MOB_MAX||30}</div>`+
    `<div>Chunks L/D: ${chunkMap.size} / ${dirtyQ.length}</div>`+
    `<div>Particles: ${particles.length}</div>`+
    `<div>Drops: ${dropItems.length}</div>`+
    `<div>Time: ${worldTime.toFixed(3)} (${getAmbientPhaseInfo().phase})</div>`+
    `<div>F3+B: Hitboxes ${f3.showHitboxes?'<b style="color:#55ff55">ON</b>':'OFF'}</div>`+
    `<div>F3+G: Chunk Grid ${f3.showChunkBorders?'<b style="color:#55ff55">ON</b>':'OFF'}</div>`+
    `<div>F3+H: Adv.Tooltips ${f3.reducedDebug?'<b style="color:#55ff55">ON</b>':'OFF'}</div>`+
    `<div>F3+P: Pause on focus loss ${f3.pauseOnLostFocus?'<b style="color:#55ff55">ON</b>':'OFF'}</div>`+
    `<div>F3+F: Captured Frustum ${f3.frustumCaptured?'<b style="color:#33e0ff">ON (ticks frozen)</b>':'OFF'}</div>`;
}
// Double-tap W sprint tracking
let _lastWTap=0,_sprintReleaseTimer=null;
const _nameTagPool=new Map(); // mob → div element
const _ntWorld=new THREE.Vector3();
const _ntNDC=new THREE.Vector3();
let _nameTagNextAt=0;
function _getOrCreateNameTag(mob){
  if(_nameTagPool.has(mob))return _nameTagPool.get(mob);
  const el=document.createElement('div');
  el.className='mob-nametag'+(mob.isBeast?' beast':'');
  el.textContent=mob.customName||(mob.isBeast?'donquavious giggleshit the third':null)||'';
  document.body.appendChild(el);
  _nameTagPool.set(mob,el);
  return el;
}
function updateNameTags(){
  const now=performance.now();
  if(now<_nameTagNextAt)return;
  _nameTagNextAt=now+66;
  // Remove tags for despawned mobs
  for(const [mob,el] of _nameTagPool){
    if(!(mobs||[]).includes(mob)){el.remove();_nameTagPool.delete(mob);}
  }
  for(const mob of (mobs||[])){
    // Only show name tags for named mobs (beast chicken has a name)
    if(!mob.customName&&!mob.isBeast){
      // Hide tag if it somehow exists
      if(_nameTagPool.has(mob))_nameTagPool.get(mob).style.display='none';
      continue;
    }
    const el=_getOrCreateNameTag(mob);
    // Project top of mob's head to screen
    _ntWorld.set(mob.pos.x, mob.pos.y+mob.hitH+0.25, mob.pos.z);
    _ntNDC.copy(_ntWorld).project(camera);
    // Behind camera or too far → hide
    if(_ntNDC.z>1||_ntNDC.z<-1){el.style.display='none';continue;}
    const sx=((_ntNDC.x+1)/2)*innerWidth;
    const sy=((1-_ntNDC.y)/2)*innerHeight;
    // Fade with distance
    const dist=_ntWorld.distanceTo(camera.position);
    const fade=Math.max(0,Math.min(1,1-(dist-2)/22));
    if(fade<=0){el.style.display='none';continue;}
    el.style.display='block';
    el.style.left=sx+'px';
    el.style.top=sy+'px';
    el.style.opacity=fade.toFixed(2);
  }
}

const AMBIENT_TRACK_PATHS={
  day:[
    "Audio/daycycles/579682596-544084417-gameaudio1_day3.mp3",
    "Audio/daycycles/718910105-765582609-gameaudio1_day1.mp3",
    "Audio/daycycles/856497522-588864549-gameaudio_day2.mp3"
  ],
  night:[
    "Audio/nightcycles/gameaudio_night.mp3"
  ]
};

function _mkAmbientTrack(path,phase,index){
  const track=new Audio(path);
  track.preload="auto";
  track.loop=false;
  track.volume=0;
  track._phase=phase;
  track._index=index;
  track._label=path.split("/").pop()||`${phase}-${index+1}`;
  track.addEventListener("ended",()=>onAmbientTrackEnded(track));
  return track;
}

const ambientAudio={
  playlists:{day:[],night:[]},
  allTracks:[],
  tracks:{},
  lastTrackByPhase:{day:null,night:null},
  unlocked:false,currentPhase:null,currentTrack:null,fadingTrack:null,pendingTrack:null,pendingPhase:null,pendingTime:0,fadeElapsed:0,fadeState:"idle"
};

for(const phase of ["day","night"]){
  ambientAudio.playlists[phase]=AMBIENT_TRACK_PATHS[phase].map((path,idx)=>_mkAmbientTrack(path,phase,idx));
}
ambientAudio.allTracks=[...ambientAudio.playlists.day,...ambientAudio.playlists.night];
ambientAudio.allTracks.forEach((track,i)=>{ambientAudio.tracks[`track_${i}`]=track;});

raycaster.far=S.reach;
let chatOpen=false,suggestIdx=-1;

// Leaf decay
const leafDecayQueue=[];
let leafDecayTimer=0;
const LEAF_DECAY_INTERVAL=0.4; // seconds between decay ticks
const LEAF_DECAY_RADIUS=6;     // max distance from log to survive

// Water simulation
const waterLevels=new Map(); // "x,y,z" -> 1..8 (8=source)
const waterSources=new Set();
const waterQueue=[];
const waterScheduled=new Set();
let lastWaterTick=0;
const WATER_TICK=0.11;
const WATER_MAX_LEVEL=8;
var _hDirs=[[1,0],[-1,0],[0,1],[0,-1]];

const cubeGeo=new THREE.BoxGeometry(1,1,1);
const waterGeo=(()=>{
  const g=new THREE.BoxGeometry(1,0.92,1);
  g.translate(0,-0.04,0);
  return g;
})();
const cactusGeo=new THREE.BoxGeometry(0.84,1,0.84);
function mergeBufferGeometries(geometries){
  const pos=[];
  const norm=[];
  const uv=[];
  for(let i=0;i<geometries.length;i++){
    const src=geometries[i];
    const g=src.index?src.toNonIndexed():src;
    const p=g.getAttribute("position");
    const n=g.getAttribute("normal");
    const u=g.getAttribute("uv");
    for(let j=0;j<p.count;j++){
      pos.push(p.getX(j),p.getY(j),p.getZ(j));
      norm.push(n.getX(j),n.getY(j),n.getZ(j));
      uv.push(u.getX(j),u.getY(j));
    }
  }
  const merged=new THREE.BufferGeometry();
  merged.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  merged.setAttribute("normal",new THREE.Float32BufferAttribute(norm,3));
  merged.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  return merged;
}
// Torch uses a thin stem and a crossed flame card, giving placed torches a clearer silhouette.
const torchGeo=(()=>{
  const stem=new THREE.BoxGeometry(0.12,0.58,0.12);
  stem.translate(0,0.05,0);

  const flameA=new THREE.PlaneGeometry(0.30,0.30);
  flameA.translate(0,0.31,0);

  const flameB=flameA.clone();
  flameB.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI*0.5));

  return mergeBufferGeometries([stem,flameA,flameB]);
})();
const partGeo=new THREE.BoxGeometry(.16,.16,.16);

// ── Init ─────────────────────────────────────────────────────
applyLaunchConfigFromMenu();
pendingWorldRuntimeState=loadRuntimeWorldState();
refreshWorldMetaText();
gsApplyAll();
await loadResourcePackTextures();
initMaterials();
buildBlockAtlas();
buildHotbarUI();
buildInventoryUI();
spawnWorld();
gsInitSliders();
gsRefreshUI();
selectSlot(0);
const launchPackLabel=resourcePackState.id==="default"?"Default":"Classic Lite";
showMsg(WORLD_META.fromMenu?`Generating ${WORLD_META.worldName} (${currentWorldPreset().name}) | Pack: ${launchPackLabel}`:"Click to capture mouse",2800);

window.addEventListener("resize",onResize);
document.addEventListener("visibilitychange",onVisChange);
document.addEventListener("pointerlockchange",onPLC);
document.addEventListener("mousemove",onMM);
document.addEventListener("keydown",onKD,{capture:true});
document.addEventListener("keyup",onKU);
document.addEventListener("mousedown",onMD);
document.addEventListener("mouseup",onMU);
document.addEventListener("contextmenu",e=>e.preventDefault());
renderer.domElement.addEventListener("wheel",onWheel,{passive:false});
renderer.domElement.addEventListener("click",()=>{unlockAmbientAudio();if(!pLocked&&!invOpen&&!settingsOpen)safeRequestPointerLock();});
document.getElementById("invOverlay").addEventListener("contextmenu",e=>e.preventDefault());
document.getElementById("tableOverlay").addEventListener("contextmenu",e=>e.preventDefault());
document.getElementById("chestOverlay").addEventListener("contextmenu",e=>e.preventDefault());
document.getElementById("furnaceOverlay").addEventListener("contextmenu",e=>e.preventDefault());
if($recipeBookBtn){
  $recipeBookBtn.addEventListener("click",e=>{
    e.preventDefault();
    if(!invOpen)return;
    showMsg("Recipe Book coming soon",900);
  });
}
animate();

// ═══════════════════════════════
//  PLAYER MODEL BUILD
//  Minecraft proportions: 1 pixel = P = 0.9/16 world units (1.8m player)
//  Scene graph: playerRoot → legPivots, bodyMesh, armPivots, headPivot
//  Body yaw is decoupled from head yaw (see animatePlayerModel)
// ═══════════════════════════════
function buildPlayerModel(){
  const P=0.9/16; // 1 Minecraft pixel in world units
  const skinMat=new THREE.MeshStandardMaterial({map:getPlayerSkin(),roughness:1,metalness:0});
  const av=new THREE.Group();

  // ── LEFT ARM PIVOT at (-6P, 24P) — viewer's left, Steve's right arm ──
  const lAP=new THREE.Group();lAP.position.set(-6*P,24*P,0);av.add(lAP);
  const lArmMesh=skinBox(4*P,12*P,4*P,[[48,20,4,12],[40,20,4,12],[44,16,4,4],[48,16,4,4],[44,20,4,12],[52,20,4,12]],skinMat);
  lArmMesh.position.set(0,-6*P,0);lAP.add(lArmMesh);

  // ── RIGHT ARM PIVOT at (+6P, 24P) — viewer's right, Steve's left arm ──
  const rAP=new THREE.Group();rAP.position.set(6*P,24*P,0);av.add(rAP);
  const rArmMesh=skinBox(4*P,12*P,4*P,[[44,52,4,12],[36,52,4,12],[36,48,4,4],[40,48,4,4],[40,52,4,12],[44,52,4,12]],skinMat);
  rArmMesh.position.set(0,-6*P,0);rAP.add(rArmMesh);
  // Held block (in right hand = lAP = Steve's right arm)
  const hBlock=new THREE.Mesh(new THREE.BoxGeometry(5*P,5*P,5*P),null);
  hBlock.position.set(0,-11*P,3.5*P);hBlock.rotation.set(-.20,-.42,.12);lAP.add(hBlock);

  const hTorch=createHeldTorchModel();
  hTorch.position.set(0,-11*P,3.6*P);
  hTorch.rotation.set(-0.35,0.35,0.08);
  lAP.add(hTorch);

  const hBucket=createHeldBucketModel();
  hBucket.position.set(0,-10.7*P,3.45*P);
  hBucket.rotation.set(-0.16,0.52,0.12);
  lAP.add(hBucket);

  const hIcon=createHeldIconModel(5.1*P);
  hIcon.position.set(0,-11.2*P,3.7*P);
  hIcon.rotation.set(-0.38,0.46,0.12);
  lAP.add(hIcon);

  // ── BODY (8×12×4 px) centered at 18P ──
  const bodyMesh=skinBox(8*P,12*P,4*P,[[28,20,4,12],[16,20,4,12],[20,16,8,4],[28,16,8,4],[20,20,8,12],[32,20,8,12]],skinMat);
  bodyMesh.position.set(0,18*P,0);av.add(bodyMesh);

  // ── LEFT LEG PIVOT at (-2P, 12P) — viewer's left, Steve's right leg ──
  const lLP=new THREE.Group();lLP.position.set(-2*P,12*P,0);av.add(lLP);
  const lLegMesh=skinBox(4*P,12*P,4*P,[[8,20,4,12],[0,20,4,12],[4,16,4,4],[8,16,4,4],[4,20,4,12],[12,20,4,12]],skinMat);
  lLegMesh.position.set(0,-6*P,0);lLP.add(lLegMesh);

  // ── RIGHT LEG PIVOT at (+2P, 12P) — viewer's right, Steve's left leg ──
  const rLP=new THREE.Group();rLP.position.set(2*P,12*P,0);av.add(rLP);
  const rLegMesh=skinBox(4*P,12*P,4*P,[[24,52,4,12],[16,52,4,12],[20,48,4,4],[24,48,4,4],[20,52,4,12],[28,52,4,12]],skinMat);
  rLegMesh.position.set(0,-6*P,0);rLP.add(rLegMesh);

  // ── HEAD PIVOT at (0, 24P) — neck/shoulder level ──
  const headPivot=new THREE.Group();headPivot.position.set(0,24*P,0);headPivot.rotation.order='YXZ';av.add(headPivot);
  const headMesh=skinBox(8*P,8*P,8*P,[[16,8,8,8],[0,8,8,8],[8,0,8,8],[16,0,8,8],[8,8,8,8],[24,8,8,8]],skinMat);
  headMesh.position.set(0,4*P,0);headPivot.add(headMesh);

  av.userData={head:headPivot,bodyMesh,lAP,rAP,lLP,rLP,hBlock,hTorch,hBucket,hIcon,skin:skinMat};
  return av;
}

// ═══════════════════════════════
//  FP ARM BUILD
// The arm lives in hudScene. hudCam is synced to world camera each frame.
// All coords are in hudCam-local view space.
// ═══════════════════════════════
function buildFPArm(){
  const PIXEL=0.0625;
  const skinMat=new THREE.MeshStandardMaterial({map:getPlayerSkin(),roughness:.7,metalness:0});
  const grp=new THREE.Group();
  const shoulderPivot=new THREE.Group();
  grp.add(shoulderPivot);
  // One single arm mesh: 4×12×4 pixels, right arm UVs
  const armMesh=skinBox(4*PIXEL,12*PIXEL,4*PIXEL,
    [[48,20,4,12],[40,20,4,12],[44,16,4,4],[48,16,4,4],[44,20,4,12],[52,20,4,12]],
    skinMat);
  armMesh.position.y=-6*PIXEL;
  shoulderPivot.add(armMesh);
  const hBlock=new THREE.Mesh(new THREE.BoxGeometry(0.30,0.30,0.30),null);
  hBlock.position.set(-0.06,-0.76,-0.22);
  hBlock.rotation.set(0.10,0.65,-0.08);
  shoulderPivot.add(hBlock);

  const hTorch=createHeldTorchModel();
  hTorch.position.set(-0.07,-0.77,-0.21);
  hTorch.rotation.set(-0.30,0.75,-0.03);
  shoulderPivot.add(hTorch);

  const hBucket=createHeldBucketModel();
  hBucket.position.set(-0.08,-0.74,-0.20);
  hBucket.rotation.set(-0.18,0.74,-0.04);
  shoulderPivot.add(hBucket);

  const hIcon=createHeldIconModel(0.30);
  hIcon.position.set(-0.09,-0.75,-0.19);
  hIcon.rotation.set(-0.22,0.86,0.02);
  shoulderPivot.add(hIcon);

  grp.userData={shoulderPivot,hBlock,hTorch,hBucket,hIcon};
  return grp;
}

function createArmorIconSvg(kind){
  const ns="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(ns,"svg");
  svg.setAttribute("viewBox","0 0 24 24");
  svg.setAttribute("aria-hidden","true");

  const add=(d)=>{
    const p=document.createElementNS(ns,"path");
    p.setAttribute("d",d);
    svg.appendChild(p);
  };

  if(kind==="helmet"){
    add("M4 10V7l3-3h10l3 3v3");
    add("M7 10v10h10V10");
    add("M9 13h6");
  }else if(kind==="chestplate"){
    add("M8 4h8l3 3-2 4v9H7v-9L5 7z");
    add("M10 8h4");
  }else if(kind==="leggings"){
    add("M7 4h10v6l-2 2v8h-3v-8h-0v8H9v-8l-2-2z");
    add("M12 4v8");
  }else{
    add("M7 5v8H5v6h6v-5h2v5h6v-6h-2V5");
  }

  return svg;
}

function createArmorIconElement(kind){
  const icon=document.createElement("span");
  icon.className="armor-icon";
  icon.appendChild(createArmorIconSvg(kind));
  return icon;
}

// ═══════════════════════════════
//  INVENTORY UI
// ═══════════════════════════════
function buildInventoryUI(){
  // Armor
  $armorCol.innerHTML="";
  ["helmet","chestplate","leggings","boots"].forEach((kind,i)=>{
    const s=mkSlot("armor",i);
    s.appendChild(createArmorIconElement(kind));
    $armorCol.appendChild(s);
  });
  // Craft grid
  $craftGrid.innerHTML="";
  for(let i=0;i<4;i++) $craftGrid.appendChild(mkSlot("craft",i));
  $craftOut.dataset.slotType="craftout";$craftOut.dataset.idx=0;
  $craftOut.addEventListener("mousedown",e=>{e.preventDefault();takeCraftResult();});
  // Main inventory rows
  $invRows.innerHTML="";
  for(let r=0;r<3;r++){
    const row=document.createElement("div");row.className="inv-row";
    for(let c=0;c<9;c++){const s=mkSlot("inv",r*9+c);row.appendChild(s);}
    $invRows.appendChild(row);
  }
  // Hotbar row inside inventory
  $invHotbarRow.innerHTML="";
  for(let i=0;i<9;i++) $invHotbarRow.appendChild(mkSlot("hotbar",i));
  refreshInvUI();
}

function mkSlot(type,idx){
  const s=document.createElement("div");
  s.className="inv-slot";s.dataset.slotType=type;s.dataset.idx=idx;
  s.addEventListener("mousedown",e=>{e.preventDefault();e.stopPropagation();onSlotMD(e,type,idx);});
  s.addEventListener("mouseup",e=>{e.preventDefault();e.stopPropagation();onSlotMU(e,type,idx);});
  return s;
}

function refreshInvUI(){
  [...$invRows.querySelectorAll(".inv-slot")].forEach((s,i)=>paintSlot(s,invSlots[i],false));
  [...$invHotbarRow.querySelectorAll(".inv-slot")].forEach((s,i)=>paintSlot(s,hotbarSlots[i],i===player.selIdx));
  [...$craftGrid.querySelectorAll(".inv-slot")].forEach((s,i)=>paintSlot(s,craftSlots[i],false));
  updateCraft();paintSlot($craftOut,craftResult,false);
  if(tableOpen)refreshTableUI();
  if(chestOpen)refreshChestUI();
  if(furnaceOpen)refreshFurnaceUI();
}

function paintSlot(el,slot,selected){
  [...el.children].forEach(c=>{
    if(c.tagName==="CANVAS"||c.classList.contains("slot-count")||c.classList.contains("dur-bar"))
      el.removeChild(c);
  });
  el.classList.toggle("sel",selected);
  if(!slot||slot.id===BLOCK.AIR)return;
  const cv=document.createElement("canvas");cv.width=cv.height=16;
  drawItemIcon(cv.getContext("2d"),slot.id);el.appendChild(cv);
  if(slot.count>1){
    const ct=document.createElement("span");ct.className="slot-count";ct.textContent=slot.count;el.appendChild(ct);
  }
  // Durability bar for tools
  if(isTool(slot.id)&&slot.dur!==undefined){
    const ti=TOOL_INFO[slot.id];
    const pct=Math.max(0,slot.dur/(ti?.dur??59));
    const bar=document.createElement("div");bar.className="dur-bar";
    const fill=document.createElement("div");fill.className="dur-bar-fill";
    fill.style.width=`${pct*100}%`;
    const hue=Math.round(pct*120);fill.style.background=`hsl(${hue},100%,50%)`;
    bar.appendChild(fill);el.appendChild(bar);
  }
}

function drawPP(){
  const ctx=$playerCanvas.getContext('2d');
  ctx.clearRect(0,0,58,92);
  const grad=ctx.createLinearGradient(0,0,0,92);
  grad.addColorStop(0,'#94bfec');grad.addColorStop(1,'#e7eef7');
  ctx.fillStyle=grad;ctx.fillRect(0,0,58,92);
  const f=(c,x,y,w,h)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);};
  // Head
  f('#f5b87a',17,4,24,22);                        // skin
  f('#4a2c0e',17,4,24,6);                         // hair band
  f('#4a2c0e',17,4,4,22);f('#4a2c0e',37,4,4,22);  // hair sides
  f('#eceeff',22,12,5,6);f('#eceeff',31,12,5,6);  // eye whites
  f('#1a4fd6',24,14,2,2);f('#1a4fd6',33,14,2,2);  // pupils
  f('#4a2c0e',23,21,12,1);                        // mouth
  // Body (teal shirt)
  f('#3a6b7c',13,28,32,22);
  f('#c8a44a',23,36,12,3);                        // belt
  f('#3a6b7c',13,28,32,6);                        // shirt collar shading
  // Arms
  f('#3a6b7c',4,28,9,16);f('#3a6b7c',45,28,9,16);
  f('#f5b87a',4,40,9,6);f('#f5b87a',45,40,9,6);   // skin on forearm
  // Legs
  f('#283c54',13,52,13,30);f('#283c54',32,52,13,30);
  f('#161008',13,78,13,8);f('#161008',32,78,13,8); // boots
}

function getSlot(type,idx){
  if(type==="inv")return invSlots[idx];
  if(type==="hotbar")return hotbarSlots[idx];
  if(type==="craft")return craftSlots[idx];
  if(type==="table")return tableSlots[idx];
  if(type==="furnace")return getFurnaceSlot(idx);
  if(type==="chest")return getChestSlot(idx);
  return null;
}
function setSlot(type,idx,val){
  if(type==="inv"){invSlots[idx]=val;}
  else if(type==="hotbar"){hotbarSlots[idx]=val;buildHotbarUI();selectSlot(player.selIdx);}
  else if(type==="craft"){craftSlots[idx]=val;updateCraft();}
  else if(type==="table"){tableSlots[idx]=val;updateTableCraft();}
  else if(type==="furnace"){setFurnaceSlot(idx,val);}
  else if(type==="chest"){setChestSlot(idx,val);}
}
function getChestSlot(idx){
  if(!chestKey)return null;
  const arr=chestStorage.get(chestKey);return arr?arr[idx]:null;
}
function setChestSlot(idx,val){
  if(!chestKey)return;
  let arr=chestStorage.get(chestKey);
  if(!arr){arr=new Array(27).fill(null);chestStorage.set(chestKey,arr);}
  arr[idx]=val;
}
function getFurnaceSlot(idx){
  if(!furnaceKey)return null;
  const st=getFurnaceStateForKey(furnaceKey,false);
  return st?st.slots[idx]??null:null;
}
function _canPlaceFurnaceSlot(idx,slot){
  if(!slot)return true;
  if(idx===FURNACE_SLOT_INPUT)return !!getSmeltRecipe(slot.id);
  if(idx===FURNACE_SLOT_FUEL)return getFuelBurnTime(slot.id)>0;
  return false;
}
function setFurnaceSlot(idx,val){
  if(!furnaceKey)return;
  const st=getFurnaceStateForKey(furnaceKey,true);
  if(idx===FURNACE_SLOT_OUTPUT)return;
  if(!_canPlaceFurnaceSlot(idx,val))return;
  st.slots[idx]=val;
}
function onSlotMD(e,type,idx){
  const isRight=e.button===2;
  const cur=getSlot(type,idx);
  if(dragItem===null){
    // Nothing held — pick up
    if(!cur)return;
    if(isRight){
      // Right click: pick up half
      const half=Math.ceil(cur.count/2);
      dragItem=mkItem(cur.id,half);
      const rem=cur.count-half;
      setSlot(type,idx,rem>0?mkItem(cur.id,rem):null);
      dragFrom={type,idx};
    } else {
      // Left click: pick up whole stack
      dragItem={id:cur.id,count:cur.count};
      dragFrom={type,idx};
      setSlot(type,idx,null);
    }
    startDrag(e,dragItem);
  } else {
    // Holding something
    if(type==="furnace"&&!_canPlaceFurnaceSlot(idx,dragItem)){
      showMsg(idx===FURNACE_SLOT_FUEL?"Needs valid fuel":"Cannot smelt that item",700);
      refreshInvUI();
      return;
    }
    if(isRight){
      // Right click: place 1 from held stack
      if(!cur){
        setSlot(type,idx,mkItem(dragItem.id,1));
        dragItem.count--;
        if(dragItem.count<=0){dragItem=null;stopDrag();}
        else startDrag(e,dragItem);
      } else if(cur.id===dragItem.id&&cur.count<64){
        cur.count++;dragItem.count--;
        setSlot(type,idx,cur);
        if(dragItem.count<=0){dragItem=null;stopDrag();}
        else startDrag(e,dragItem);
      } else {
        // Different block — swap
        const prev={id:cur.id,count:cur.count};
        setSlot(type,idx,{id:dragItem.id,count:dragItem.count});
        dragItem=prev;startDrag(e,dragItem);
      }
    } else {
      // Left click: place whole stack or stack/swap
      if(!cur){
        setSlot(type,idx,{id:dragItem.id,count:dragItem.count});
        dragItem=null;stopDrag();
      } else if(cur.id===dragItem.id){
        // Stack
        const total=cur.count+dragItem.count;
        if(total<=64){
          setSlot(type,idx,mkItem(cur.id,total));
          dragItem=null;stopDrag();
        } else {
          setSlot(type,idx,mkItem(cur.id,64));
          dragItem.count=total-64;startDrag(e,dragItem);
        }
      } else {
        // Swap
        const prev={id:cur.id,count:cur.count};
        setSlot(type,idx,{id:dragItem.id,count:dragItem.count});
        dragItem=prev;startDrag(e,dragItem);
      }
    }
    dragFrom=null;
  }
  refreshInvUI();
}

function onSlotMU(e,type,idx){
  if(dragItem===null||e.button!==0||!dragMoved) return;
  if(dragFrom&&dragFrom.type===type&&dragFrom.idx===idx) return;

  if(type==="furnace"&&!_canPlaceFurnaceSlot(idx,dragItem)){
    showMsg(idx===FURNACE_SLOT_FUEL?"Needs valid fuel":"Cannot smelt that item",700);
    refreshInvUI();
    return;
  }

  const cur=getSlot(type,idx);
  if(!cur){
    setSlot(type,idx,mkItem(dragItem.id,dragItem.count));
    dragItem=null;
  } else if(cur.id===dragItem.id){
    const total=cur.count+dragItem.count;
    setSlot(type,idx,mkItem(cur.id,Math.min(64,total)));
    dragItem=total>64?mkItem(cur.id,total-64):null;
  } else {
    setSlot(type,idx,mkItem(dragItem.id,dragItem.count));
    if(dragFrom){
      setSlot(dragFrom.type,dragFrom.idx,mkItem(cur.id,cur.count));
      dragItem=null;
    } else {
      dragItem=mkItem(cur.id,cur.count);
    }
  }

  dragDropHandled=true;
  if(dragItem===null){
    dragFrom=null;
    stopDrag();
  }
  refreshInvUI();
}

// ═══════════════════════════════
//  CRAFTING — 2×2 (inventory) and 3×3 (crafting table)
// ═══════════════════════════════
function _normPattern(grid,cols){
  // Extract the non-empty bounding box of a flat grid, returns {pat,w,h}
  const rows=Math.round(grid.length/cols);
  let r0=rows,r1=-1,c0=cols,c1=-1;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    if(grid[r*cols+c]){r0=Math.min(r0,r);r1=Math.max(r1,r);c0=Math.min(c0,c);c1=Math.max(c1,c);}
  }
  if(r1<0)return{pat:[],w:0,h:0};
  const w=c1-c0+1,h=r1-r0+1;
  const pat=[];
  for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)pat.push(grid[r*cols+c]||0);
  return{pat,w,h};
}
function matchRecipe(slots,recipes){
  const ids=slots.map(s=>s?s.id:0);
  const gridCols=Math.round(Math.sqrt(slots.length)); // 2 for 2×2, 3 for 3×3
  const gn=_normPattern(ids,gridCols);
  for(const r of recipes){
    if(r.shapeless){
      const need=new Map();
      r.ingredients.forEach((ing,i)=>{need.set(ing,(need.get(ing)||0)+(r.counts?r.counts[i]:1));});
      const have=new Map();
      ids.forEach(id=>{if(id!==0)have.set(id,(have.get(id)||0)+1);});
      const totalNeed=[...need.values()].reduce((a,b)=>a+b,0);
      const totalHave=[...have.values()].reduce((a,b)=>a+b,0);
      if(totalNeed===totalHave){
        let ok=true;
        for(const[ing,cnt]of need)if((have.get(ing)||0)<cnt){ok=false;break;}
        if(ok)return r;
      }
    } else {
      // Flexible shaped match: normalize recipe grid independently
      const rcols=r.cols||(r.grid.length===4?2:3);
      const rn=_normPattern(r.grid,rcols);
      if(gn.w===rn.w&&gn.h===rn.h&&gn.pat.length===rn.pat.length){
        if(gn.pat.every((id,i)=>id===rn.pat[i]))return r;
      }
    }
  }
  return null;
}
function consumeRecipe(slots,recipe){
  if(recipe.shapeless){
    const toConsume=new Map();
    recipe.ingredients.forEach((ing,i)=>{toConsume.set(ing,(toConsume.get(ing)||0)+(recipe.counts?recipe.counts[i]:1));});
    for(let i=0;i<slots.length;i++){
      const s=slots[i];if(!s)continue;
      const rem=toConsume.get(s.id)||0;
      if(rem>0){toConsume.set(s.id,rem-1);s.count--;if(s.count<=0)slots[i]=null;}
    }
  } else {
    for(let i=0;i<slots.length;i++){
      if(!slots[i])continue;
      slots[i].count--;if(slots[i].count<=0)slots[i]=null;
    }
  }
}
function updateCraft(){
  const r=matchRecipe(craftSlots,RECIPES_2x2);
  craftResult=r?{id:r.result.id,count:r.result.count,dur:r.result.dur??undefined}:null;
}
function updateTableCraft(){
  const r=matchRecipe(tableSlots,RECIPES_3x3);
  tableResult=r?{id:r.result.id,count:r.result.count,dur:r.result.dur??undefined}:null;
  if($tableOut) paintSlot($tableOut,tableResult,false);
}
function takeCraftResult(){
  if(!craftResult)return;
  const result={id:craftResult.id,count:craftResult.count,dur:craftResult.dur};
  const ei=invSlots.findIndex(s=>!s);
  if(ei<0){showMsg("Inventory full!",1200);return;}
  const r=matchRecipe(craftSlots,RECIPES_2x2);
  if(!r)return;
  consumeRecipe(craftSlots,r);
  const item=mkItem(result.id,result.count);
  if(result.dur!==undefined)item.dur=result.dur;
  addToInventory2(item);
  updateCraft();refreshInvUI();
  const nm=getItemName(result.id);
  showMsg(`Crafted ${nm} ×${result.count}`,700);
}
function takeTableResult(){
  if(!tableResult)return;
  const result={id:tableResult.id,count:tableResult.count,dur:tableResult.dur};
  const r=matchRecipe(tableSlots,RECIPES_3x3);
  if(!r)return;
  consumeRecipe(tableSlots,r);
  const item=mkItem(result.id,result.count);
  if(result.dur!==undefined)item.dur=result.dur;
  addToInventory2(item);
  updateTableCraft();refreshTableUI();
  const nm=getItemName(result.id);
  showMsg(`Crafted ${nm} ×${result.count}`,700);
}
function getItemName(id){
  if(id>=200)return ITEM_INFO[id]?.name??`Item ${id}`;
  if(id>=100)return TOOL_INFO[id]?.name??`Tool ${id}`;
  return BLOCK_INFO[id]?.name??`Block ${id}`;
}
function _fmtItemDebugName(id){
  const base=getItemName(id);
  return f3.reducedDebug?`${base} (#${id})`:base;
}
function addToInventory2(item){
  if(!item||!item.id||item.id===BLOCK.AIR)return 0;
  let remaining=Math.max(1,Math.round(Number(item.count)||1));
  const stackable=!isTool(item.id);

  if(stackable){
    for(let i=0;i<9&&remaining>0;i++){
      const s=hotbarSlots[i];
      if(!s||s.id!==item.id||s.count>=64)continue;
      const add=Math.min(64-s.count,remaining);
      s.count+=add;
      remaining-=add;
    }
    for(let i=0;i<27&&remaining>0;i++){
      const s=invSlots[i];
      if(!s||s.id!==item.id||s.count>=64)continue;
      const add=Math.min(64-s.count,remaining);
      s.count+=add;
      remaining-=add;
    }

    for(let i=0;i<9&&remaining>0;i++){
      if(hotbarSlots[i])continue;
      const add=Math.min(64,remaining);
      hotbarSlots[i]=mkItem(item.id,add);
      remaining-=add;
    }
    for(let i=0;i<27&&remaining>0;i++){
      if(invSlots[i])continue;
      const add=Math.min(64,remaining);
      invSlots[i]=mkItem(item.id,add);
      remaining-=add;
    }
  }else{
    while(remaining>0){
      let placed=false;
      for(let i=0;i<9;i++){
        if(hotbarSlots[i])continue;
        hotbarSlots[i]=mkItem(item.id,1);
        if(Number.isFinite(item.dur))hotbarSlots[i].dur=Math.max(0,Math.round(item.dur));
        if(Number.isFinite(item.maxDur))hotbarSlots[i].maxDur=Math.max(1,Math.round(item.maxDur));
        remaining--;placed=true;break;
      }
      if(placed)continue;
      for(let i=0;i<27;i++){
        if(invSlots[i])continue;
        invSlots[i]=mkItem(item.id,1);
        if(Number.isFinite(item.dur))invSlots[i].dur=Math.max(0,Math.round(item.dur));
        if(Number.isFinite(item.maxDur))invSlots[i].maxDur=Math.max(1,Math.round(item.maxDur));
        remaining--;placed=true;break;
      }
      if(!placed)break;
    }
  }

  buildHotbarUI();
  selectSlot(player.selIdx);
  if(remaining>0)showMsg("Inventory full!",1200);
  return remaining;
}

// ── Crafting table open/close ──────────────────────────────────
function openCraftingTable(){
  tableOpen=true;invOpen=false;chestOpen=false;furnaceOpen=false;
  $tableOverlay.classList.add("open");
  $invOverlay.classList.remove("open");
  if($chestOverlay)$chestOverlay.classList.remove("open");
  if($furnaceOverlay)$furnaceOverlay.classList.remove("open");
  keys.clear();iState.lmb=false;iState.breaking=false;iState.placeAnim=0;
  breakMesh.visible=false;selBox.visible=false;
  if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();
  buildTableUI();
  showMsg("Crafting Table  –  E to close",900);
}
function closeCraftingTable(){
  tableOpen=false;$tableOverlay.classList.remove("open");
  setTimeout(()=>{if(!tableOpen&&!invOpen&&!chestOpen&&!furnaceOpen&&!settingsOpen)safeRequestPointerLock();},80);
}
function buildTableUI(){
  $tableGrid.innerHTML="";
  for(let i=0;i<9;i++)$tableGrid.appendChild(mkSlot("table",i));
  $tableOut.dataset.slotType="tableout";$tableOut.dataset.idx=0;
  $tableOut.addEventListener("mousedown",e=>{e.preventDefault();takeTableResult();},{once:false});
  // Rebuild player inv rows inside table UI
  $tableInvMain.innerHTML="";
  for(let r=0;r<3;r++){
    const row=document.createElement("div");row.className="inv-row";
    for(let c=0;c<9;c++){const s=mkSlot("inv",r*9+c);row.appendChild(s);}
    $tableInvMain.appendChild(row);
  }
  $tableHotbarRow.innerHTML="";
  for(let i=0;i<9;i++)$tableHotbarRow.appendChild(mkSlot("hotbar",i));
  refreshTableUI();
}
function refreshTableUI(){
  if(!tableOpen)return;
  [...$tableGrid.querySelectorAll(".inv-slot")].forEach((s,i)=>paintSlot(s,tableSlots[i],false));
  updateTableCraft();paintSlot($tableOut,tableResult,false);
  [...$tableInvMain.querySelectorAll(".inv-slot")].forEach((s,i)=>paintSlot(s,invSlots[i],false));
  [...$tableHotbarRow.querySelectorAll(".inv-slot")].forEach((s,i)=>paintSlot(s,hotbarSlots[i],i===player.selIdx));
}

// ── Chest open/close ──────────────────────────────────────────
function openChest(wx,wy,wz){
  chestKey=`${wx},${wy},${wz}`;
  if(!chestStorage.has(chestKey))chestStorage.set(chestKey,new Array(27).fill(null));
  chestOpen=true;invOpen=false;tableOpen=false;furnaceOpen=false;
  $chestOverlay.classList.add("open");
  $invOverlay.classList.remove("open");
  $tableOverlay.classList.remove("open");
  $furnaceOverlay.classList.remove("open");
  keys.clear();iState.lmb=false;iState.breaking=false;iState.placeAnim=0;
  breakMesh.visible=false;selBox.visible=false;
  if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();
  buildChestUI();
  showMsg("Chest  –  E to close",900);
}
function closeChest(){
  chestOpen=false;$chestOverlay.classList.remove("open");chestKey=null;
  setTimeout(()=>{if(!tableOpen&&!invOpen&&!chestOpen&&!furnaceOpen&&!settingsOpen)safeRequestPointerLock();},80);
}
function buildChestUI(){
  // 3 rows × 9 columns of chest storage
  $chestStorageRows.innerHTML="";
  for(let r=0;r<3;r++){
    const row=document.createElement("div");row.className="inv-row";
    for(let c=0;c<9;c++){const s=mkSlot("chest",r*9+c);row.appendChild(s);}
    $chestStorageRows.appendChild(row);
  }
  $chestInvMain.innerHTML="";
  for(let r=0;r<3;r++){
    const row=document.createElement("div");row.className="inv-row";
    for(let c=0;c<9;c++){const s=mkSlot("inv",r*9+c);row.appendChild(s);}
    $chestInvMain.appendChild(row);
  }
  $chestHotbarRow.innerHTML="";
  for(let i=0;i<9;i++)$chestHotbarRow.appendChild(mkSlot("hotbar",i));
  refreshChestUI();
}
function refreshChestUI(){
  if(!chestOpen)return;
  const arr=chestStorage.get(chestKey)||[];
  [...$chestStorageRows.querySelectorAll(".inv-slot")].forEach((s,i)=>paintSlot(s,arr[i]??null,false));
  [...$chestInvMain.querySelectorAll(".inv-slot")].forEach((s,i)=>paintSlot(s,invSlots[i],false));
  [...$chestHotbarRow.querySelectorAll(".inv-slot")].forEach((s,i)=>paintSlot(s,hotbarSlots[i],i===player.selIdx));
}

// ── Furnace open/close ───────────────────────────────────────
function openFurnace(wx,wy,wz){
  furnaceKey=`${wx},${wy},${wz}`;
  getFurnaceStateForKey(furnaceKey,true);
  furnaceOpen=true;invOpen=false;tableOpen=false;chestOpen=false;
  $furnaceOverlay.classList.add("open");
  $invOverlay.classList.remove("open");
  $tableOverlay.classList.remove("open");
  $chestOverlay.classList.remove("open");
  keys.clear();iState.lmb=false;iState.breaking=false;iState.placeAnim=0;
  breakMesh.visible=false;selBox.visible=false;
  if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();
  buildFurnaceUI();
  showMsg("Furnace  –  E to close",900);
}
function closeFurnace(){
  furnaceOpen=false;
  $furnaceOverlay.classList.remove("open");
  furnaceKey=null;
  setTimeout(()=>{if(!tableOpen&&!invOpen&&!chestOpen&&!furnaceOpen&&!settingsOpen)safeRequestPointerLock();},80);
}
function buildFurnaceUI(){
  const furnaceRecipeBookBtn=document.getElementById("furnaceRecipeBookBtn");
  if(furnaceRecipeBookBtn&&!furnaceRecipeBookBtn.dataset.bound){
    furnaceRecipeBookBtn.dataset.bound="1";
    furnaceRecipeBookBtn.addEventListener("click",e=>{
      e.preventDefault();
      showMsg("Furnace recipe book coming soon",900);
    });
  }

  if(!$furnaceInput.dataset.bound){
    $furnaceInput.dataset.bound="1";
    $furnaceInput.dataset.slotType="furnace";
    $furnaceInput.dataset.idx=String(FURNACE_SLOT_INPUT);
    $furnaceInput.addEventListener("mousedown",e=>{e.preventDefault();e.stopPropagation();onSlotMD(e,"furnace",FURNACE_SLOT_INPUT);});
    $furnaceInput.addEventListener("mouseup",e=>{e.preventDefault();e.stopPropagation();onSlotMU(e,"furnace",FURNACE_SLOT_INPUT);});
  }
  if(!$furnaceFuel.dataset.bound){
    $furnaceFuel.dataset.bound="1";
    $furnaceFuel.dataset.slotType="furnace";
    $furnaceFuel.dataset.idx=String(FURNACE_SLOT_FUEL);
    $furnaceFuel.addEventListener("mousedown",e=>{e.preventDefault();e.stopPropagation();onSlotMD(e,"furnace",FURNACE_SLOT_FUEL);});
    $furnaceFuel.addEventListener("mouseup",e=>{e.preventDefault();e.stopPropagation();onSlotMU(e,"furnace",FURNACE_SLOT_FUEL);});
  }
  if(!$furnaceOutput.dataset.bound){
    $furnaceOutput.dataset.bound="1";
    $furnaceOutput.addEventListener("mousedown",e=>{
      e.preventDefault();e.stopPropagation();
      takeFurnaceOutput(e.button===2);
    });
  }

  $furnaceInvMain.innerHTML="";
  for(let r=0;r<3;r++){
    const row=document.createElement("div");row.className="inv-row";
    for(let c=0;c<9;c++){const s=mkSlot("inv",r*9+c);row.appendChild(s);}
    $furnaceInvMain.appendChild(row);
  }
  $furnaceHotbarRow.innerHTML="";
  for(let i=0;i<9;i++)$furnaceHotbarRow.appendChild(mkSlot("hotbar",i));
  refreshFurnaceUI();
}
function refreshFurnaceUI(){
  if(!furnaceOpen)return;
  const st=getFurnaceStateForKey(furnaceKey,true);
  paintSlot($furnaceInput,st.slots[FURNACE_SLOT_INPUT],false);
  paintSlot($furnaceFuel,st.slots[FURNACE_SLOT_FUEL],false);
  paintSlot($furnaceOutput,st.slots[FURNACE_SLOT_OUTPUT],false);
  const flamePct=st.burnTimeTotal>0?THREE.MathUtils.clamp(st.burnTime/st.burnTimeTotal,0,1):0;
  const cookPct=THREE.MathUtils.clamp(st.cookTime/FURNACE_SMELT_TIME,0,1);
  $furnaceFlameFill.style.height=`${(flamePct*100).toFixed(1)}%`;
  $furnaceArrowFill.style.width=`${(cookPct*100).toFixed(1)}%`;
  [...$furnaceInvMain.querySelectorAll(".inv-slot")].forEach((s,i)=>paintSlot(s,invSlots[i],false));
  [...$furnaceHotbarRow.querySelectorAll(".inv-slot")].forEach((s,i)=>paintSlot(s,hotbarSlots[i],i===player.selIdx));
}
function takeFurnaceOutput(single=false){
  const st=getFurnaceStateForKey(furnaceKey,false);
  if(!st)return;
  const out=st.slots[FURNACE_SLOT_OUTPUT];
  if(!out||out.count<=0)return;
  const moveCount=Math.max(1,Math.min(out.count,single?1:out.count));
  const moving=mkItem(out.id,moveCount);
  const leftover=addToInventory2(moving);
  const moved=moveCount-leftover;
  if(moved<=0){showMsg("Inventory full!",900);return;}
  out.count-=moved;
  if(out.count<=0)st.slots[FURNACE_SLOT_OUTPUT]=null;
  refreshFurnaceUI();
}
function _canFurnaceOutputAccept(outSlot,recipe){
  if(!recipe)return false;
  if(!outSlot)return true;
  if(outSlot.id!==recipe.out)return false;
  return outSlot.count+recipe.count<=64;
}
function _smeltFurnaceOnce(st,recipe){
  const input=st.slots[FURNACE_SLOT_INPUT];
  if(!input||input.count<=0)return false;
  if(!_canFurnaceOutputAccept(st.slots[FURNACE_SLOT_OUTPUT],recipe))return false;
  if(st.slots[FURNACE_SLOT_OUTPUT])st.slots[FURNACE_SLOT_OUTPUT].count+=recipe.count;
  else st.slots[FURNACE_SLOT_OUTPUT]=mkItem(recipe.out,recipe.count);
  input.count--;
  if(input.count<=0)st.slots[FURNACE_SLOT_INPUT]=null;
  giveXp(recipe.xp||0,true);
  return true;
}
function updateFurnaces(dt){
  for(const[key,st]of furnaceStorage){
    const parts=key.split(",");
    if(parts.length!==3){
      if(furnaceOpen&&furnaceKey===key)closeFurnace();
      furnaceStorage.delete(key);
      continue;
    }
    const fx=Math.floor(Number(parts[0])),fy=Math.floor(Number(parts[1])),fz=Math.floor(Number(parts[2]));
    if(!Number.isFinite(fx)||!Number.isFinite(fy)||!Number.isFinite(fz)||getBlock(fx,fy,fz)!==BLOCK.FURNACE){
      if(furnaceOpen&&furnaceKey===key)closeFurnace();
      furnaceStorage.delete(key);
      continue;
    }

    const input=st.slots[FURNACE_SLOT_INPUT];
    const fuel=st.slots[FURNACE_SLOT_FUEL];
    const recipe=input?getSmeltRecipe(input.id):null;
    const canSmelt=!!recipe&&_canFurnaceOutputAccept(st.slots[FURNACE_SLOT_OUTPUT],recipe);

    if(st.burnTime<=0&&canSmelt&&fuel){
      const burn=getFuelBurnTime(fuel.id);
      if(burn>0){
        st.burnTime=burn;
        st.burnTimeTotal=burn;
        fuel.count--;
        if(fuel.count<=0)st.slots[FURNACE_SLOT_FUEL]=null;
      }
    }

    if(st.burnTime>0)st.burnTime=Math.max(0,st.burnTime-dt);

    if(st.burnTime>0&&canSmelt){
      st.cookTime+=dt;
      while(st.cookTime>=FURNACE_SMELT_TIME){
        if(!_smeltFurnaceOnce(st,recipe))break;
        st.cookTime-=FURNACE_SMELT_TIME;
      }
    }else if(!canSmelt){
      st.cookTime=0;
    }
  }
}

function startDrag(e,stack){
  const ctx=$dgc.getContext("2d");ctx.clearRect(0,0,32,32);
  if(stack&&stack.id!==BLOCK.AIR){
    const t=document.createElement("canvas");t.width=t.height=16;
    drawBlockIcon(t.getContext("2d"),stack.id);ctx.drawImage(t,0,0,32,32);
  }
  $dg.style.display="block";
  dragMoved=false;
  dragDropHandled=false;
  moveDragTo(e);
  document.addEventListener("mousemove",onDragMove);
  document.addEventListener("mouseup",onDragUp);
}
function onDragMove(e){dragMoved=true;moveDragTo(e);}
function moveDragTo(e){$dg.style.left=e.clientX+"px";$dg.style.top=e.clientY+"px";}
function onDragUp(){
  if(dragDropHandled){
    dragDropHandled=false;
    if(dragItem===null){dragFrom=null;stopDrag();}
    refreshInvUI();
    return;
  }
  // Mouseup outside a slot: return item to origin slot
  if(dragItem&&dragFrom){
    const orig=getSlot(dragFrom.type,dragFrom.idx);
    if(!orig){
      setSlot(dragFrom.type,dragFrom.idx,{id:dragItem.id,count:dragItem.count});
    } else if(orig.id===dragItem.id&&orig.count+dragItem.count<=64){
      setSlot(dragFrom.type,dragFrom.idx,mkItem(orig.id,orig.count+dragItem.count));
    } else {
      // Find first empty slot
      const ei=invSlots.findIndex(s=>!s);
      if(ei>=0)invSlots[ei]={id:dragItem.id,count:dragItem.count};
    }
    dragItem=null;dragFrom=null;
    refreshInvUI();
  }
  stopDrag();
}
function stopDrag(){
  $dg.style.display="none";
  dragMoved=false;
  dragDropHandled=false;
  document.removeEventListener("mousemove",onDragMove);
  document.removeEventListener("mouseup",onDragUp);
}

function toggleInventory(force){
  invOpen=force??!invOpen;
  // Close other modals
  if(invOpen){
    tableOpen=false;chestOpen=false;furnaceOpen=false;
    $tableOverlay.classList.remove("open");
    $chestOverlay.classList.remove("open");
    $furnaceOverlay.classList.remove("open");
  }
  $invOverlay.classList.toggle("open",invOpen);
  if(invOpen){
    keys.clear();iState.lmb=false;iState.breaking=false;iState.placeAnim=0;
    breakMesh.visible=false;selBox.visible=false;
    if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();
    refreshInvUI();showMsg("Inventory  –  E to close",800);
  } else {
    stopDrag();
    setTimeout(()=>{ if(!invOpen&&!tableOpen&&!chestOpen&&!furnaceOpen&&!settingsOpen) safeRequestPointerLock(); },80);
  }
  $stats.classList.toggle("show",pLocked&&!invOpen&&!tableOpen&&!chestOpen&&!furnaceOpen&&!settingsOpen);
}

// ═══════════════════════════════
//  HOTBAR UI
// ═══════════════════════════════
function buildHotbarUI(){
  $hotbar.innerHTML="";
  for(let i=0;i<9;i++){
    const s=hotbarSlots[i];
    const slot=document.createElement("div");slot.className="mc-slot";
    if(s&&s.id!==BLOCK.AIR){
      const wrap=document.createElement("div");wrap.className="mc-itemWrap";
      const cv=document.createElement("canvas");cv.width=cv.height=16;
      drawItemIcon(cv.getContext("2d"),s.id);wrap.appendChild(cv);
      if(s.count>1){const ct=document.createElement("span");ct.className="mc-count";ct.textContent=s.count;slot.appendChild(ct);}
      // Tool durability bar in hotbar
      if(isTool(s.id)&&s.dur!==undefined){
        const ti=TOOL_INFO[s.id];const pct=Math.max(0,s.dur/(ti?.dur??59));
        const bar=document.createElement("div");bar.className="dur-bar";
        const fill=document.createElement("div");fill.className="dur-bar-fill";
        fill.style.width=`${pct*100}%`;const hue=Math.round(pct*120);
        fill.style.background=`hsl(${hue},100%,50%)`;bar.appendChild(fill);slot.appendChild(bar);
      }
      slot.appendChild(wrap);
    }
    $hotbar.appendChild(slot);
  }
}

function getPackItemTextureName(id){
  switch(id){
    case ITEM.STICK:return"stick";
    case ITEM.WATER_SOURCE:return"water_bucket";
    case ITEM.APPLE:return"apple";
    case ITEM.BREAD:return"bread";
    case ITEM.COOKED_PORKCHOP:return"cooked_porkchop";
    case ITEM.RAW_MEAT:return"";
    case ITEM.COAL:return"coal";
    case ITEM.IRON_INGOT:return"iron_ingot";
    case ITEM.GOLD_INGOT:return"gold_ingot";
    case ITEM.DIAMOND:return"diamond";
    case TOOL.WOOD_PICK:return"wooden_pickaxe";
    case TOOL.STONE_PICK:return"stone_pickaxe";
    case TOOL.IRON_PICK:return"iron_pickaxe";
    case TOOL.WOOD_AXE:return"wooden_axe";
    case TOOL.STONE_AXE:return"stone_axe";
    case TOOL.WOOD_SHOVEL:return"wooden_shovel";
    case TOOL.STONE_SHOVEL:return"stone_shovel";
    default:return"";
  }
}
function drawPackItemIcon(ctx,id){
  const key=getPackItemTextureName(id);
  if(!key)return false;
  const cv=rpItemCanvas(key);
  if(!cv)return false;
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(cv,0,0,16,16);
  return true;
}

function drawItemIcon(ctx,id){
  ctx.clearRect(0,0,16,16);
  if(drawPackItemIcon(ctx,id))return;
  if(id>=200){
    if(id===ITEM.STICK){
      for(let i=0;i<11;i++){
        ctx.fillStyle=i<3?"#c8a060":(i<8?"#a06820":"#7a4e10");
        ctx.fillRect(i+2,12-i,2,2);
      }
      return;
    }
    if(id===ITEM.APPLE){
      ctx.fillStyle="#5a2a00";
      ctx.fillRect(7,1,2,3);
      ctx.fillStyle="#2f9d2f";
      ctx.fillRect(9,1,3,2);
      ctx.fillStyle="#d12323";
      ctx.fillRect(4,4,8,8);
      ctx.fillStyle="#f55a5a";
      ctx.fillRect(5,5,3,2);
      ctx.fillStyle="#9b1010";
      ctx.fillRect(10,8,2,3);
      return;
    }
    if(id===ITEM.BREAD){
      ctx.fillStyle="#9b6a2c";
      ctx.fillRect(3,5,10,7);
      ctx.fillStyle="#d8aa66";
      ctx.fillRect(3,4,10,4);
      ctx.fillStyle="#f0cc8a";
      ctx.fillRect(4,5,8,1);
      ctx.fillStyle="rgba(120,70,20,0.35)";
      ctx.fillRect(5,8,1,3);ctx.fillRect(8,8,1,3);ctx.fillRect(11,8,1,3);
      return;
    }
    if(id===ITEM.RAW_MEAT){
      ctx.fillStyle="#5e2b22";
      ctx.fillRect(2,6,11,6);
      ctx.fillStyle="#cc7a67";
      ctx.fillRect(3,5,10,5);
      ctx.fillStyle="#f0b0a2";
      ctx.fillRect(4,6,6,2);
      ctx.fillStyle="#f3e3da";
      ctx.fillRect(12,7,2,3);
      return;
    }
    if(id===ITEM.COOKED_PORKCHOP){
      ctx.fillStyle="#6e3222";
      ctx.fillRect(2,6,11,6);
      ctx.fillStyle="#a95a42";
      ctx.fillRect(3,5,10,5);
      ctx.fillStyle="#d9866b";
      ctx.fillRect(4,6,6,2);
      ctx.fillStyle="#ead7c1";
      ctx.fillRect(12,7,2,3);
      return;
    }
    if(id===ITEM.COAL){
      ctx.fillStyle="#1d1d1d";
      ctx.beginPath();ctx.ellipse(8,9,5.2,4.2,-0.35,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#474747";
      ctx.fillRect(6,6,3,2);
      ctx.fillRect(9,9,2,1);
      return;
    }
    if(id===ITEM.IRON_INGOT){
      ctx.fillStyle="#8d949c";
      ctx.fillRect(2,8,12,5);
      ctx.fillStyle="#cfd6de";
      ctx.fillRect(3,7,10,3);
      ctx.fillStyle="#eef2f6";
      ctx.fillRect(4,8,8,1);
      return;
    }
    if(id===ITEM.GOLD_INGOT){
      ctx.fillStyle="#9f7a10";
      ctx.fillRect(2,8,12,5);
      ctx.fillStyle="#f2c645";
      ctx.fillRect(3,7,10,3);
      ctx.fillStyle="#fff091";
      ctx.fillRect(4,8,8,1);
      return;
    }
    if(id===ITEM.DIAMOND){
      ctx.fillStyle="#32a6b8";
      ctx.beginPath();ctx.moveTo(8,2);ctx.lineTo(13,7);ctx.lineTo(8,14);ctx.lineTo(3,7);ctx.closePath();ctx.fill();
      ctx.fillStyle="#8ef0ff";
      ctx.beginPath();ctx.moveTo(8,3);ctx.lineTo(11,7);ctx.lineTo(8,11);ctx.lineTo(5,7);ctx.closePath();ctx.fill();
      return;
    }
    if(id===ITEM.WATER_SOURCE){
      // Draw a bucket outline with water inside
      ctx.fillStyle="#c0c0c0";// bucket base
      ctx.fillRect(3,8,10,6);ctx.fillRect(2,6,12,3);ctx.fillRect(1,5,2,3);ctx.fillRect(13,5,2,3);
      ctx.fillStyle="#407bff";ctx.globalAlpha=0.85;
      ctx.fillRect(3,9,10,5);
      ctx.fillStyle="#7fdcff";ctx.globalAlpha=0.55;
      ctx.fillRect(3,9,10,2);
      ctx.globalAlpha=1;
      // handle
      ctx.strokeStyle="#a0a0a0";ctx.lineWidth=1.2;
      ctx.beginPath();ctx.arc(8,5,5,Math.PI,0);ctx.stroke();
      return;
    }
    return;
  }
  if(id>=100){
    const ti=TOOL_INFO[id];if(!ti)return;
    const isWood=id===TOOL.WOOD_PICK||id===TOOL.WOOD_AXE||id===TOOL.WOOD_SHOVEL;
    const isIron=id===TOOL.IRON_PICK;
    const hc=isWood?"#c8a060":(isIron?"#c7d1da":"#909090");
    const hs=isWood?"#e0c080":(isIron?"#ecf2f8":"#b0b0b0");
    const hd=isWood?"#9a7030":(isIron?"#6e7982":"#606060");
    ctx.save();ctx.translate(8,9);ctx.rotate(-Math.PI*0.22);
    ctx.fillStyle="#9a6020";ctx.fillRect(-1,0,2,9);
    ctx.fillStyle="#c8a060";ctx.fillRect(-1,0,1,9);
    ctx.fillStyle=hc;
    if(ti.type==="pick"){
      ctx.fillRect(-5,-7,10,3);ctx.fillStyle=hs;ctx.fillRect(-5,-8,10,1);
      ctx.fillStyle=hd;ctx.fillRect(-5,-5,2,2);ctx.fillRect(3,-5,2,2);
    }else if(ti.type==="axe"){
      ctx.fillRect(-4,-7,7,5);ctx.fillStyle=hs;ctx.fillRect(-4,-8,7,1);
      ctx.fillStyle=hd;ctx.fillRect(2,-7,1,5);
    }else if(ti.type==="shovel"){
      ctx.fillRect(-2,-7,4,6);ctx.fillStyle=hs;ctx.fillRect(-2,-8,4,1);
    }
    ctx.restore();
    return;
  }
  ctx.save();ctx.translate(8,9);
  if(isBlockItem(id)&&id!==BLOCK.TORCH){
    if(drawTexturedIsoBlock(ctx,id)){ctx.restore();return;}
  }
  switch(id){
    case BLOCK.GRASS: isoBlock(ctx,"#5ba83a","#7a5a30","#6a4e24");break;
    case BLOCK.DIRT:  isoBlock(ctx,"#8c5a30","#6e4522","#7a4e20");break;
    case BLOCK.STONE: isoBlockStone(ctx);break;
    case BLOCK.COBBLESTONE: isoBlockCobble(ctx);break;
    case BLOCK.SAND:  isoBlockSand(ctx);break;
    case BLOCK.WOOD:  isoBlockWood(ctx);break;
    case BLOCK.PLANKS:isoBlockPlanks(ctx);break;
    case BLOCK.LEAVES:isoBlockLeaves(ctx);break;
    case BLOCK.WATER: isoBlockWater(ctx);break;
    case BLOCK.SNOW:  isoBlock(ctx,"#ecf4fc","#c8d8ec","#d8e8f8");break;
    case BLOCK.GLASS: isoBlockGlass(ctx);break;
    case BLOCK.CACTUS:isoBlockCactus(ctx);break;
    case BLOCK.CRAFT_TABLE: isoBlockCraftTable(ctx);break;
    case BLOCK.CHEST: isoBlockChest(ctx);break;
    case BLOCK.TORCH: drawTorchIcon(ctx);break;
    default: isoBlock(ctx,"#aaa","#888","#999");
  }
  ctx.restore();
}
function _drawIsoTexturedFace(ctx,img,p0,p1,p2,p3){
  if(!img)return false;
  ctx.save();
  ctx.imageSmoothingEnabled=false;
  ctx.beginPath();
  ctx.moveTo(p0[0],p0[1]);ctx.lineTo(p1[0],p1[1]);ctx.lineTo(p2[0],p2[1]);ctx.lineTo(p3[0],p3[1]);
  ctx.closePath();ctx.clip();
  ctx.transform((p1[0]-p0[0])/16,(p1[1]-p0[1])/16,(p3[0]-p0[0])/16,(p3[1]-p0[1])/16,p0[0],p0[1]);
  ctx.drawImage(img,0,0,16,16);
  ctx.restore();
  return true;
}
function drawTexturedIsoBlock(ctx,id){
  const faceMats=mats[id];
  if(!faceMats||!faceMats.length)return false;
  const right=faceMats[0]?.map?.image||null;
  const left=faceMats[1]?.map?.image||right;
  const top=faceMats[2]?.map?.image||right;
  if(!right&&!left&&!top)return false;

  const t0=[0,-7],t1=[7,-3],t2=[0,1],t3=[-7,-3];
  const l0=[-7,-3],l1=[0,1],l2=[0,8],l3=[-7,4];
  const r0=[7,-3],r1=[0,1],r2=[0,8],r3=[7,4];

  _drawIsoTexturedFace(ctx,left,l0,l1,l2,l3);
  _drawIsoTexturedFace(ctx,right,r0,r1,r2,r3);
  _drawIsoTexturedFace(ctx,top,t0,t1,t2,t3);

  ctx.fillStyle="rgba(0,0,0,0.18)";
  ctx.beginPath();ctx.moveTo(-7,-3);ctx.lineTo(0,1);ctx.lineTo(0,8);ctx.lineTo(-7,4);ctx.closePath();ctx.fill();
  ctx.fillStyle="rgba(0,0,0,0.08)";
  ctx.beginPath();ctx.moveTo(7,-3);ctx.lineTo(0,1);ctx.lineTo(0,8);ctx.lineTo(7,4);ctx.closePath();ctx.fill();
  ctx.strokeStyle="rgba(0,0,0,0.26)";ctx.lineWidth=0.5;
  ctx.beginPath();
  ctx.moveTo(-7,-3);ctx.lineTo(0,-7);ctx.lineTo(7,-3);ctx.lineTo(0,1);ctx.lineTo(-7,-3);
  ctx.moveTo(0,1);ctx.lineTo(0,8);
  ctx.stroke();
  return true;
}
function isoBlock(ctx,top,left,right){
  ctx.fillStyle=top;
  ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(7,-3);ctx.lineTo(0,1);ctx.lineTo(-7,-3);ctx.closePath();ctx.fill();
  ctx.fillStyle=left;
  ctx.beginPath();ctx.moveTo(-7,-3);ctx.lineTo(0,1);ctx.lineTo(0,8);ctx.lineTo(-7,4);ctx.closePath();ctx.fill();
  ctx.fillStyle=right;
  ctx.beginPath();ctx.moveTo(7,-3);ctx.lineTo(0,1);ctx.lineTo(0,8);ctx.lineTo(7,4);ctx.closePath();ctx.fill();
  ctx.strokeStyle="rgba(0,0,0,0.22)";ctx.lineWidth=0.4;
  ctx.beginPath();ctx.moveTo(-7,-3);ctx.lineTo(0,-7);ctx.lineTo(7,-3);ctx.lineTo(0,1);ctx.lineTo(-7,-3);ctx.moveTo(0,1);ctx.lineTo(0,8);ctx.stroke();
}
function isoBlockStone(ctx){
  isoBlock(ctx,"#959a9f","#6e7478","#828789");
  ctx.fillStyle="rgba(0,0,0,0.18)";
  ctx.fillRect(2,-5,2,1);ctx.fillRect(-3,-3,1,2);ctx.fillRect(1,-2,3,1);
}
function isoBlockCobble(ctx){
  isoBlock(ctx,"#909090","#606060","#787878");
  ctx.fillStyle="rgba(0,0,0,0.22)";
  ctx.fillRect(-5,-5,3,2);ctx.fillRect(2,-4,3,2);ctx.fillRect(-2,-1,2,2);
  ctx.fillStyle="rgba(255,255,255,0.15)";
  ctx.fillRect(-4,-5,2,1);ctx.fillRect(3,-4,2,1);
}
function isoBlockWood(ctx){
  isoBlock(ctx,"#a07840","#6a4820","#7a5426");
  ctx.strokeStyle="rgba(0,0,0,0.28)";ctx.lineWidth=0.4;
  ctx.beginPath();ctx.ellipse(0,-4,3,1.5,0,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.ellipse(0,-4,5.5,2.5,0,0,Math.PI*2);ctx.stroke();
}
function isoBlockPlanks(ctx){
  isoBlock(ctx,"#c8a966","#a88040","#b89246");
  ctx.strokeStyle="rgba(0,0,0,0.18)";ctx.lineWidth=0.5;
  ctx.beginPath();ctx.moveTo(-7,1);ctx.lineTo(0,5);ctx.stroke();
  ctx.beginPath();ctx.moveTo(-5,3);ctx.lineTo(-5,8);ctx.stroke();
  ctx.beginPath();ctx.moveTo(3,2);ctx.lineTo(3,7);ctx.stroke();
}
function isoBlockLeaves(ctx){
  isoBlock(ctx,"#3b8747","#2a6335","#337040");
  ctx.fillStyle="rgba(120,210,100,0.4)";
  [[2,-6],[5,-5],[-3,-4],[4,-2],[-5,-3],[1,-2],[3,0],[-2,1]].forEach(([x,y])=>ctx.fillRect(x,y,1,1));
}
function isoBlockGlass(ctx){
  ctx.globalAlpha=0.65;
  isoBlock(ctx,"#c2eef7","#9acce0","#a8d8ec");
  ctx.globalAlpha=0.35;
  ctx.fillStyle="#fff";
  ctx.beginPath();ctx.moveTo(-2,-6);ctx.lineTo(3,-4);ctx.lineTo(1,-2);ctx.lineTo(-4,-4);ctx.closePath();ctx.fill();
  ctx.globalAlpha=1;
}
function isoBlockWater(ctx){
  ctx.globalAlpha=0.74;
  isoBlock(ctx,"#91ddff","#2d8dcb","#4fb2e6");
  ctx.globalAlpha=0.2;ctx.fillStyle="#f2ffff";
  ctx.beginPath();ctx.moveTo(-5,-4);ctx.lineTo(1,-5);ctx.lineTo(5,-3);ctx.lineTo(0,-2);ctx.lineTo(-6,-2);ctx.closePath();ctx.fill();
  ctx.globalAlpha=0.14;ctx.fillStyle="#ffffff";
  ctx.fillRect(-2,-4,7,1);ctx.fillRect(-4,-1,6,1);
  ctx.globalAlpha=1;
}
function isoBlockSand(ctx){
  isoBlock(ctx,"#efdc9d","#cfb46d","#ddc47b");
  ctx.fillStyle="rgba(128,101,42,0.18)";
  [[-4,-4],[-1,-5],[3,-4],[-3,-1],[2,-1],[-5,2],[1,2],[4,3]].forEach(([x,y])=>ctx.fillRect(x,y,1,1));
}
function isoBlockCactus(ctx){
  isoBlock(ctx,"#67ba43","#2f7c1f","#469d30");
  ctx.fillStyle="rgba(210,255,180,0.55)";
  ctx.fillRect(-4,-5,1,10);ctx.fillRect(0,-4,1,11);ctx.fillRect(4,-5,1,10);
  ctx.fillStyle="#dcf7b2";
  [[-5,-2],[-3,1],[2,-1],[5,2],[-1,3],[3,4]].forEach(([x,y])=>ctx.fillRect(x,y,1,1));
  ctx.globalAlpha=1;
}
function isoBlockCraftTable(ctx){
  isoBlock(ctx,"#4a3010","#b89246","#c8a860");
  ctx.strokeStyle="rgba(255,255,255,0.45)";ctx.lineWidth=0.5;
  ctx.beginPath();ctx.moveTo(-3,-5);ctx.lineTo(4,-1);ctx.stroke();
  ctx.beginPath();ctx.moveTo(-5,-2);ctx.lineTo(2,2);ctx.stroke();
  ctx.fillStyle="#d4a060";ctx.fillRect(-4,2,2,4);ctx.fillRect(3,1,2,4);
}
function isoBlockChest(ctx){
  isoBlock(ctx,"#a06030","#7a4020","#8a5030");
  ctx.fillStyle="rgba(0,0,0,0.2)";
  ctx.beginPath();ctx.moveTo(-7,-1);ctx.lineTo(0,3);ctx.lineTo(7,-1);ctx.lineTo(7,0);ctx.lineTo(0,4);ctx.lineTo(-7,0);ctx.closePath();ctx.fill();
  ctx.fillStyle="#d4a020";ctx.fillRect(-1,-1,2,3);
  ctx.fillStyle="#f0c040";ctx.fillRect(-1,-1,2,1);
}
function drawTorchIcon(ctx){
  ctx.translate(0,-1);
  ctx.fillStyle="#ff4400";ctx.beginPath();ctx.arc(0,-7,2.5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#ff9900";ctx.beginPath();ctx.arc(0,-7,1.8,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#ffee00";ctx.beginPath();ctx.arc(0,-7,1,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#8a5a20";ctx.fillRect(-1,-5,2,12);
  ctx.fillStyle="#c8a060";ctx.fillRect(-1,-5,1,12);
}
function drawBlockIcon(ctx,id){drawItemIcon(ctx,id);}

function selectSlot(idx){
  idx=THREE.MathUtils.clamp(idx,0,8);
  player.selIdx=idx;
  [...$hotbar.children].forEach((s,i)=>s.classList.toggle("active",i===idx));
  const s=hotbarSlots[idx];
  if(s&&s.id!==BLOCK.AIR){
    $itemName.textContent=_fmtItemDebugName(s.id);
    $itemName.classList.add("show");
    clearTimeout(player._nameTimer);
    player._nameTimer=setTimeout(()=>$itemName.classList.remove("show"),2000);
  } else {
    $itemName.classList.remove("show");
  }
}

// ═══════════════════════════════
//  WORLD SPAWN
// ═══════════════════════════════