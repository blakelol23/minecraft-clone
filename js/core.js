/**
 * @module core
 * Settings, renderer, scene, DOM refs, shared world state
 * Lines 1394-2505 from game.monolith.html
 * Loaded as source text by main.js and evaluated in one shared scope.
 */

var settingsOpen=false;
const GS=(()=>{
  const defaults={
    fpsLimit:0,      // 0=Unlimited, 30/60/120/144/240
    renderDist:3,
    fov:75,
    brightness:50,   // 0–100
    shadows:true,
    clouds:true,
    particles:true,
    viewBobbing:true,
    showFPS:true,
    fullscreen:false,
    masterVolume:50, // 0–100  →  S.audioVolume = val/100*0.12
    musicVolume:100, // 0–100 multiplier on masterVolume
    sfx:true,
    mouseSens:50,    // 0–100  →  yaw/pitch multiplier
  };
  try{return Object.assign({},defaults,JSON.parse(localStorage.getItem('blockiecraft_settings')||'{}'));}
  catch(e){return {...defaults};}
})();
GS.renderDist=THREE.MathUtils.clamp(Math.round(Number(GS.renderDist)||3),2,8);
GS.fov=THREE.MathUtils.clamp(Math.round(Number(GS.fov)||75),60,110);
GS.brightness=THREE.MathUtils.clamp(Math.round(Number(GS.brightness)||50),0,100);
GS.masterVolume=THREE.MathUtils.clamp(Math.round(Number(GS.masterVolume)||50),0,100);
GS.musicVolume=THREE.MathUtils.clamp(Math.round(Number(GS.musicVolume)||100),0,100);
GS.mouseSens=THREE.MathUtils.clamp(Math.round(Number(GS.mouseSens)||50),0,100);

const WORLD_PRESETS={
  classic:{
    name:"Classic",
    base:6.8,landStart:0.17,landEnd:0.75,landBias:0.03,
    contFreq:0.0032,hillFreq:0.0118,ridgeFreq:0.0070,erosionFreq:0.0048,detailFreq:0.033,
    warpFreq:0.0040,warpAmp:12,
    landLift:20.4,hillLift:6.0,detailLift:2.8,mountainLift:28.0,coastShelfLift:3.8,
    oceanDepth:16.2,trenchFreq:0.0098,trenchDepth:4.5,
    riverFreq:0.0152,riverThreshold:0.85,riverDepthMin:1.5,riverDepthRange:2.3,riverCarve:1.38,
    moistFreq:0.0049,tempFreq:0.0048,
    smoothing:0.47,microRelief:0.42,cliffStrength:0.58
  },
  balanced:{
    name:"Balanced",
    base:7.3,landStart:0.18,landEnd:0.74,landBias:0.04,
    contFreq:0.0035,hillFreq:0.0135,ridgeFreq:0.0078,erosionFreq:0.0052,detailFreq:0.040,
    warpFreq:0.0045,warpAmp:16,
    landLift:21.2,hillLift:7.4,detailLift:3.7,mountainLift:31.0,coastShelfLift:4.2,
    oceanDepth:17.8,trenchFreq:0.0106,trenchDepth:5.4,
    riverFreq:0.0168,riverThreshold:0.84,riverDepthMin:1.7,riverDepthRange:2.6,riverCarve:1.58,
    moistFreq:0.0053,tempFreq:0.0050,
    smoothing:0.53,microRelief:0.48,cliffStrength:0.67
  },
  wild:{
    name:"Wild",
    base:7.8,landStart:0.18,landEnd:0.72,landBias:0.05,
    contFreq:0.0038,hillFreq:0.0158,ridgeFreq:0.0091,erosionFreq:0.0054,detailFreq:0.046,
    warpFreq:0.0049,warpAmp:20,
    landLift:22.6,hillLift:9.0,detailLift:5.0,mountainLift:35.0,coastShelfLift:4.8,
    oceanDepth:18.2,trenchFreq:0.0115,trenchDepth:6.5,
    riverFreq:0.0178,riverThreshold:0.83,riverDepthMin:1.9,riverDepthRange:3.0,riverCarve:1.70,
    moistFreq:0.0055,tempFreq:0.0052,
    smoothing:0.58,microRelief:0.55,cliffStrength:0.83
  }
};
const WORLD_META={seedInput:String(S.seed),worldName:"Overworld",fromMenu:false,worldId:""};
const WORLD_STORAGE_KEY="blockiecraft_worlds";
const LAST_WORLD_ID_KEY="blockiecraft_last_world_id";
const WORLD_STATE_STORAGE_PREFIX="blockiecraft_world_state_";

function worldStateStorageKey(){
  const directId=String(WORLD_META.worldId||"").trim();
  if(directId)return WORLD_STATE_STORAGE_PREFIX+directId;
  const fallback=`${WORLD_META.worldName}|${WORLD_META.seedInput}|${normalizePresetValue(S.worldPreset)}`;
  return WORLD_STATE_STORAGE_PREFIX+hashSeedString(fallback).toString(36);
}

function hashSeedString(input){
  let h=2166136261>>>0;
  for(let i=0;i<input.length;i++){
    h^=input.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  h^=h>>>16;h=Math.imul(h,2246822507);h^=h>>>13;h=Math.imul(h,3266489909);h^=h>>>16;
  return ((h>>>0)%2147483646)+1;
}
function normalizeSeedValue(raw){
  const txt=String(raw??"").trim();
  if(!txt)return S.seed;
  if(/^-?\d+$/.test(txt)){
    try{
      const mod=2147483647n;
      let n=BigInt(txt)%mod;
      if(n<0)n+=mod;
      let v=Number(n);
      if(v===0)v=1;
      return v;
    }catch(e){}
  }
  return hashSeedString(txt);
}
function normalizePresetValue(raw){
  const p=String(raw??"").trim().toLowerCase();
  return WORLD_PRESETS[p]?p:"balanced";
}
function currentWorldPreset(){
  return WORLD_PRESETS[S.worldPreset]||WORLD_PRESETS.balanced;
}
function applyLaunchConfigFromMenu(){
  const q=new URLSearchParams(location.search);
  const hasMenuParams=q.has("seed")||q.has("preset")||q.has("renderDist")||q.has("worldName")||q.has("worldId")||q.has("pack");

  const worldId=(q.get("worldId")??"").trim();
  if(worldId)WORLD_META.worldId=worldId.slice(0,96);

  const seedText=(q.get("seed")??"").trim();
  if(seedText){
    WORLD_META.seedInput=seedText;
    S.seed=normalizeSeedValue(seedText);
  }else WORLD_META.seedInput=String(S.seed);

  S.worldPreset=normalizePresetValue(q.get("preset"));

  if(q.has("renderDist")){
    const rd=Number(q.get("renderDist"));
    if(Number.isFinite(rd))GS.renderDist=THREE.MathUtils.clamp(Math.round(rd),2,8);
  }

  const worldName=(q.get("worldName")??"").trim();
  if(worldName)WORLD_META.worldName=worldName.slice(0,32);

  let storedPack="";
  try{storedPack=localStorage.getItem(RESOURCE_PACK_STORAGE_KEY)||"";}catch(e){}
  const selectedPack=normalizeResourcePackId(q.get("pack")||storedPack||resourcePackState.id);
  configureResourcePack(selectedPack);

  WORLD_META.fromMenu=hasMenuParams;
}
let _fpsCapLastTime=0;
let _frameSerial=0;
window.freezeWater=()=>{window._freezeWater=true;console.log('[water] animation frozen');};
window.unfreezeWater=()=>{window._freezeWater=false;console.log('[water] animation resumed');};
window.noclip=(on)=>{player.noclip=(on===undefined?!player.noclip:!!on);console.log('[noclip]',player.noclip?'ON':'OFF');};
const _gsToggleLabels={
  shadows:'Shadows',clouds:'Clouds',particles:'Particles',
  viewBobbing:'View Bobbing',showFPS:'FPS Counter',fullscreen:'Fullscreen',sfx:'Sound Effects'
};
// Hardness = seconds to break bare-handed (Minecraft wiki values)
const BLOCK_INFO={
  [BLOCK.GRASS]:      {name:"Grass",         color:0x67b646,hard:0.90},
  [BLOCK.DIRT]:       {name:"Dirt",          color:0x8a5a34,hard:0.75},
  [BLOCK.STONE]:      {name:"Stone",         color:0x92979e,hard:7.50},  // needs pickaxe
  [BLOCK.SAND]:       {name:"Sand",          color:0xe2cd8a,hard:0.75},
  [BLOCK.WOOD]:       {name:"Wood",          color:0x8c6735,hard:3.00},
  [BLOCK.LEAVES]:     {name:"Leaves",        color:0x3f8f4c,hard:0.30,transparent:true,opacity:.88},
  [BLOCK.WATER]:      {name:"Water",         color:0x2b69a6,hard:999,  transparent:true,opacity:.66},
  [BLOCK.SNOW]:       {name:"Snow",          color:0xf1f6fb,hard:0.15},
  [BLOCK.GLASS]:      {name:"Glass",         color:0xc2eef7,hard:0.45,transparent:true,opacity:.34},
  [BLOCK.CACTUS]:     {name:"Cactus",        color:0x4a8c2a,hard:0.60},
  [BLOCK.PLANKS]:     {name:"Planks",        color:0xc8a966,hard:2.25},
  [BLOCK.TORCH]:      {name:"Torch",         color:0xffcc44,hard:0.05, transparent:true,opacity:1},
  [BLOCK.CRAFT_TABLE]:{name:"Crafting Table",color:0x8b6040,hard:2.50},
  [BLOCK.CHEST]:      {name:"Chest",         color:0xa06030,hard:2.50},
  [BLOCK.COBBLESTONE]:{name:"Cobblestone",   color:0x7a7a7a,hard:6.00},
  [BLOCK.GRAVEL]:     {name:"Gravel",        color:0x8f8b86,hard:0.90},
  [BLOCK.RED_SAND]:   {name:"Red Sand",      color:0xd08a57,hard:0.75},
  [BLOCK.CLAY]:       {name:"Clay",          color:0x9ba7b8,hard:0.90},
  [BLOCK.MUD]:        {name:"Mud",           color:0x5e4734,hard:0.80},
  [BLOCK.FURNACE]:    {name:"Furnace",       color:0x7f858c,hard:7.50},
  [BLOCK.COAL_ORE]:   {name:"Coal Ore",      color:0x74787f,hard:7.50},
  [BLOCK.IRON_ORE]:   {name:"Iron Ore",      color:0x9a8a7f,hard:7.50},
  [BLOCK.GOLD_ORE]:   {name:"Gold Ore",      color:0xac9659,hard:7.50},
  [BLOCK.DIAMOND_ORE]:{name:"Diamond Ore",   color:0x58a7c2,hard:7.50},
};
// Tool info: dur=max durability, speed={blockId: multiplier}
const TOOL_INFO={
  [TOOL.WOOD_PICK]:   {name:"Wood Pickaxe",   color:0xc8a966,dur:59,  type:"pick"},
  [TOOL.STONE_PICK]:  {name:"Stone Pickaxe",  color:0x888888,dur:131, type:"pick"},
  [TOOL.IRON_PICK]:   {name:"Iron Pickaxe",   color:0xc7cdd5,dur:250, type:"pick"},
  [TOOL.WOOD_AXE]:    {name:"Wood Axe",       color:0xc8a966,dur:59,  type:"axe"},
  [TOOL.STONE_AXE]:   {name:"Stone Axe",      color:0x888888,dur:131, type:"axe"},
  [TOOL.WOOD_SHOVEL]: {name:"Wood Shovel",    color:0xc8a966,dur:59,  type:"shovel"},
  [TOOL.STONE_SHOVEL]:{name:"Stone Shovel",   color:0x888888,dur:131, type:"shovel"},
};
const ITEM_INFO={
  [ITEM.STICK]:{name:"Stick",color:0x8c5a20},
  [ITEM.WATER_SOURCE]:{name:"Water Bucket",color:0x407bff},
  [ITEM.APPLE]:{name:"Apple",color:0xd02020,food:4,saturation:2.4},
  [ITEM.BREAD]:{name:"Bread",color:0xc89a4c,food:5,saturation:6.0},
  [ITEM.COOKED_PORKCHOP]:{name:"Cooked Porkchop",color:0xa85a3e,food:8,saturation:12.8},
  [ITEM.RAW_MEAT]:{name:"Raw Meat",color:0xbf6b56,food:3,saturation:4.0},
  [ITEM.COAL]:{name:"Coal",color:0x2d2d2d},
  [ITEM.IRON_INGOT]:{name:"Iron Ingot",color:0xd8dce2},
  [ITEM.GOLD_INGOT]:{name:"Gold Ingot",color:0xf2d154},
  [ITEM.DIAMOND]:{name:"Diamond",color:0x67d8e8},
};
// Speed multipliers: [woodTool, stoneTool] for each tool type
const TOOL_SPEEDS={
  pick:  {blocks:new Set([
    BLOCK.STONE,BLOCK.COBBLESTONE,BLOCK.GLASS,BLOCK.FURNACE,
    BLOCK.COAL_ORE,BLOCK.IRON_ORE,BLOCK.GOLD_ORE,BLOCK.DIAMOND_ORE
  ]),wood:2.0,stone:4.0,iron:6.0},
  axe:   {blocks:new Set([BLOCK.WOOD,BLOCK.PLANKS,BLOCK.CRAFT_TABLE,BLOCK.CHEST,BLOCK.LEAVES]), wood:2.0,stone:4.0,iron:6.0},
  shovel:{blocks:new Set([BLOCK.DIRT,BLOCK.SAND,BLOCK.GRASS,BLOCK.SNOW,BLOCK.GRAVEL,BLOCK.RED_SAND,BLOCK.CLAY,BLOCK.MUD]), wood:2.0,stone:4.0,iron:6.0},
};
const BLOCK_HARVEST_TIER={
  [BLOCK.STONE]:1,
  [BLOCK.COBBLESTONE]:1,
  [BLOCK.FURNACE]:1,
  [BLOCK.COAL_ORE]:1,
  [BLOCK.IRON_ORE]:2,
  [BLOCK.GOLD_ORE]:3,
  [BLOCK.DIAMOND_ORE]:3,
};
function getPickTier(toolId){
  if(toolId===TOOL.WOOD_PICK)return 1;
  if(toolId===TOOL.STONE_PICK)return 2;
  if(toolId===TOOL.IRON_PICK)return 3;
  return 0;
}
function getToolTier(toolSlot){
  if(!toolSlot||!isTool(toolSlot.id))return 0;
  const ti=TOOL_INFO[toolSlot.id];
  if(!ti||ti.type!=="pick")return 0;
  return getPickTier(toolSlot.id);
}
function canHarvestBlock(blockId,toolSlot){
  const need=BLOCK_HARVEST_TIER[blockId]??0;
  if(need<=0)return true;
  return getToolTier(toolSlot)>=need;
}
function getBreakTime(blockId, toolSlot){
  const base=BLOCK_INFO[blockId]?.hard??0.5;
  if(!toolSlot||toolSlot.id<100||toolSlot.id>=200) return base;
  const ti=TOOL_INFO[toolSlot.id];if(!ti)return base;
  const ts=TOOL_SPEEDS[ti.type];if(!ts||!ts.blocks.has(blockId))return base;
  let mult=ts.stone??1;
  if(toolSlot.id===TOOL.WOOD_PICK||toolSlot.id===TOOL.WOOD_AXE||toolSlot.id===TOOL.WOOD_SHOVEL)mult=ts.wood??mult;
  else if(toolSlot.id===TOOL.IRON_PICK)mult=ts.iron??mult;
  return base/mult;
}
function getBlockDrop(blockId,toolSlot){
  if(!canHarvestBlock(blockId,toolSlot))return null;
  if(blockId===BLOCK.STONE) return BLOCK.COBBLESTONE;
  if(blockId===BLOCK.COAL_ORE) return ITEM.COAL;
  if(blockId===BLOCK.IRON_ORE) return BLOCK.IRON_ORE;
  if(blockId===BLOCK.GOLD_ORE) return BLOCK.GOLD_ORE;
  if(blockId===BLOCK.DIAMOND_ORE) return ITEM.DIAMOND;
  if(blockId===BLOCK.GLASS) return null;
  if(blockId===BLOCK.LEAVES) return null; // leaves don't drop items when broken
  return blockId;
}
function isTool(id){return id>=100&&id<200;}
function isRawItem(id){return id>=200;}
function isBlockItem(id){return id>0&&id<100;}
// All placeable blocks (also drives hotbar starter items — tools/raw items excluded)
const ALL_ITEMS=[BLOCK.GRASS,BLOCK.DIRT,BLOCK.STONE,BLOCK.SAND,BLOCK.WOOD,BLOCK.PLANKS,
                 BLOCK.LEAVES,BLOCK.SNOW,BLOCK.GLASS,BLOCK.CACTUS,BLOCK.CRAFT_TABLE,BLOCK.CHEST,BLOCK.COBBLESTONE,
                 BLOCK.GRAVEL,BLOCK.RED_SAND,BLOCK.CLAY,BLOCK.MUD,BLOCK.FURNACE,
                 BLOCK.COAL_ORE,BLOCK.IRON_ORE,BLOCK.GOLD_ORE,BLOCK.DIAMOND_ORE];
const TRANSPARENT=new Set([BLOCK.AIR,BLOCK.LEAVES,BLOCK.WATER,BLOCK.GLASS,BLOCK.TORCH,BLOCK.CACTUS]);
const SOLID=new Set([BLOCK.GRASS,BLOCK.DIRT,BLOCK.STONE,BLOCK.SAND,BLOCK.WOOD,BLOCK.LEAVES,
                     BLOCK.SNOW,BLOCK.GLASS,BLOCK.CACTUS,BLOCK.PLANKS,BLOCK.CRAFT_TABLE,BLOCK.CHEST,BLOCK.COBBLESTONE,
                     BLOCK.GRAVEL,BLOCK.RED_SAND,BLOCK.CLAY,BLOCK.MUD,BLOCK.FURNACE,
                     BLOCK.COAL_ORE,BLOCK.IRON_ORE,BLOCK.GOLD_ORE,BLOCK.DIAMOND_ORE]);
// Torches are NOT solid — player walks through them
// Cube face definitions for merged geometry — CCW winding outward normals
// Face order matches BoxGeometry groups: [+X,-X,+Y,-Y,+Z,-Z]
const CUBE_FACES=[
  {dx:1, dy:0, dz:0, verts:[[1,0,1],[1,0,0],[1,1,0],[1,1,1]]},  // +X
  {dx:-1,dy:0, dz:0, verts:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]]},  // -X
  {dx:0, dy:1, dz:0, verts:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]]},  // +Y
  {dx:0, dy:-1,dz:0, verts:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]},  // -Y
  {dx:0, dy:0, dz:1, verts:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]},  // +Z
  {dx:0, dy:0, dz:-1,verts:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]]},  // -Z
];
// Water face geometry: top face stays at 0.875 (sunken surface look).
// Side faces use FULL height so stacked water blocks have no gap.
const WATER_CUBE_FACES=[
  {dx:1, dy:0, dz:0, verts:[[1,0,1],[1,0,0],[1,1,0],[1,1,1]]},     // +X full
  {dx:-1,dy:0, dz:0, verts:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]]},     // -X full
  {dx:0, dy:1, dz:0, verts:[[0,0.875,1],[1,0.875,1],[1,0.875,0],[0,0.875,0]]}, // +Y top
  {dx:0, dy:-1,dz:0, verts:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]},     // -Y full
  {dx:0, dy:0, dz:1, verts:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]},     // +Z full
  {dx:0, dy:0, dz:-1,verts:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]]},     // -Z full
];
// Blocks merged into atlas BufferGeometry (all use cubeGeo footprint)
const OPAQUE_MERGE=new Set([BLOCK.GRASS,BLOCK.DIRT,BLOCK.STONE,BLOCK.SAND,BLOCK.WOOD,
  BLOCK.SNOW,BLOCK.PLANKS,BLOCK.COBBLESTONE,BLOCK.CRAFT_TABLE,BLOCK.CHEST,
  BLOCK.GRAVEL,BLOCK.RED_SAND,BLOCK.CLAY,BLOCK.MUD,BLOCK.FURNACE,
  BLOCK.COAL_ORE,BLOCK.IRON_ORE,BLOCK.GOLD_ORE,BLOCK.DIAMOND_ORE]);
// Alpha-tested blocks merged into atlas geometry (transparent cutout)
const ALPHA_MERGE=new Set([BLOCK.LEAVES,BLOCK.GLASS]);
// Water blocks use separate merged geometry with WATER_CUBE_FACES
const WATER_MERGE=new Set([BLOCK.WATER]);
const INITIAL_PIXEL_RATIO=Math.min(devicePixelRatio,1.2);

// ── Renderer ───────────────────────────────────────────────── (please dont TOUCHHHHH 😭)
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(INITIAL_PIXEL_RATIO);
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate=false;
renderer.autoClear=false;
document.body.appendChild(renderer.domElement);
window.renderer=renderer; // for dev console access

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x84c9ff);
scene.fog=new THREE.Fog(0x84c9ff,18,130);
window.scene=scene; // for dev console access

// HUD scene for FP arm (rendered with cleared depth each frame)
const hudScene=new THREE.Scene();
const hudCam=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,0.02,10);
hudScene.add(new THREE.AmbientLight(0xffeedd,1.4));
const hudSun=new THREE.DirectionalLight(0xfff8e0,1.4);
hudSun.position.set(2,3,4);hudScene.add(hudSun);
const hudFill=new THREE.DirectionalLight(0x8090c8,0.4);
hudFill.position.set(-1,-1,2);hudScene.add(hudFill);

const camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,0.1,500);
window.camera=camera; // for dev console access
const clock=new THREE.Clock();
const tObj=new THREE.Object3D();
const raycaster=new THREE.Raycaster();
const nmx=new THREE.Matrix3();
const UP=new THREE.Vector3(0,1,0);
const CENTER_NDC={x:0,y:0};
// Reusable vectors — no allocations in hot paths
const _eye=new THREE.Vector3();
const _ideal=new THREE.Vector3();
const _dir=new THREE.Vector3();
const _aPos=new THREE.Vector3();
const _skyN=new THREE.Vector3();
const _sunN=new THREE.Vector3();
const _moonN=new THREE.Vector3();
const _inp=new THREE.Vector3();
const _mv=new THREE.Vector3();
const _prevPos=new THREE.Vector3();
const _moveDelta=new THREE.Vector3();
const _faceN=new THREE.Vector3();
const _camDir=new THREE.Vector3();
const _chunkVec=new THREE.Vector3();
const _chunkCenter=new THREE.Vector3();
const _frustumMat=new THREE.Matrix4();
const _frustum=new THREE.Frustum();
const _chunkBox=new THREE.Box3();
const CHUNK_OCCLUSION_BINS=180;
const CHUNK_OCCLUSION_UPDATE_MS=96;
const CHUNK_OCCLUSION_VISIBILITY_BIAS=0.11;
const CHUNK_OCCLUSION_HORIZON_GROWTH=0.008;
const CHUNK_OCCLUSION_NEAR_DIST_CHUNKS=3.3;
const CHUNK_LOD_NEAR_DIST_CHUNKS=2.8;
const CHUNK_LOD_FAR_DIST_CHUNKS=4.6;
const ENABLE_CHUNK_OCCLUSION=BOOT_QUERY.get("chunkOcclusion")!=="0";
const ENABLE_CHUNK_LOD=BOOT_QUERY.get("chunkLod")==="1";
const _chunkOcclusionBins=new Float32Array(CHUNK_OCCLUSION_BINS);
let _chunkOcclusionLastUpdate=-Infinity;
const _chunkOcclusionVisible=new Map();
const _jitC=new THREE.Color(),_jitA=new THREE.Color(),_jitHSL={h:0,s:0,l:0};
const _skyColor=new THREE.Color();
const SHADOW_UPDATE_INTERVAL=0.48;
let lastShadowUpdate=-Infinity;
// CHUNK_CULL_RADIUS replaced by AABB frustum test in isChunkVisible
let fpsFrames=0,fpsAccum=0,fpsValue=0;
const lagDebug={
  enabled:BOOT_QUERY.get("lagDebug")==="1",
  lastFrameAt:performance.now(),
  lastFrameMs:0,
  lastConsoleAt:0,
  lastKindAt:Object.create(null),
  frameWarnMs:32,
  mixedFrameWarnMs:24,
  schedulerWarnMs:110,
  sectionWarnMs:24,
  chunkWarnMs:28,
  cameraJump:3.5,
  playerJump:3.5,
  startupUntil:0,
  lastCameraPos:new THREE.Vector3(),
  lastPlayerPos:new THREE.Vector3(),
  lastMode:"",
  chunkReason:"startup"
};
const uiDebug={
  lastStatsAt:0,
  lastAudioAt:0,
  lastFpsDomAt:0,
  statsText:"",
  audioText:"",
  fpsText:""
};
const perfTuning={
  pixelRatio:INITIAL_PIXEL_RATIO,
  minPixelRatio:0.9,
  maxPixelRatio:INITIAL_PIXEL_RATIO,
  lastAdjustAt:0,
  lowSamples:0,
  highSamples:0,
  minAdjustGapMs:12000,
  settleUntil:performance.now()+4500,
  lastDownscaleAt:0
};
const ENABLE_DYNAMIC_RESOLUTION=BOOT_QUERY.get("dynamicRes")==="1";
const ENABLE_CHUNK_START_LIMITER=BOOT_QUERY.get("chunkRateLimit")==="1";

function chunkQueuePressure(){
  return genQueue.length+dirtyQ.length+(activeChunkJob?1:0);
}

function getChunkBudgetMs(isContinuing=false){
  const frameMs=lagDebug.lastFrameMs||16;
  const pressure=chunkQueuePressure();
  const startup=performance.now()<lagDebug.startupUntil;
  let budget=isContinuing?2.45:2.05;

  if(startup)budget-=0.55;
  if(pressure>18)budget-=0.75;
  else if(pressure>10)budget-=0.4;

  if(frameMs>24)budget-=0.95;
  else if(frameMs>18)budget-=0.6;
  else if(frameMs>14)budget-=0.3;

  const min=isContinuing?0.32:0.28;
  const max=isContinuing?2.55:2.15;
  return THREE.MathUtils.clamp(budget,min,max);
}

// DOM
const $title=document.getElementById("titleCard");
const $worldMeta=document.getElementById("worldMeta");
const $stats=document.getElementById("stats");
const $audioDebug=document.getElementById("audioDebug");
const $fpsCounter=document.getElementById("fpsCounter");
const $hotbar=document.getElementById("hotbar");
const $itemName=document.getElementById("itemName");
const $invOverlay=document.getElementById("invOverlay");
const $invRows=document.getElementById("invRows");
const $invHotbarRow=document.getElementById("invHotbarRow");
const $armorCol=document.getElementById("armorCol");
const $craftGrid=document.getElementById("craftGrid");
const $craftOut=document.getElementById("craftOut");
const $recipeBookBtn=document.getElementById("recipeBookBtn");
const $playerCanvas=document.getElementById("playerCanvas");
const $breakBar=document.getElementById("breakBar");
const $breakFill=document.getElementById("breakFill");
const $msg=document.getElementById("centerMsg");
const $hurtOverlay=document.getElementById("hurtOverlay");
const $underwaterOverlay=document.getElementById("underwaterOverlay");
const $underwaterSurface=document.getElementById("underwaterSurface");
const $attackFill=document.getElementById("attackFill");
const $dg=document.getElementById("dragGhost");
const $dgc=$dg.querySelector("canvas");
const $airBarWrap=document.getElementById("airBarWrap");
const $airBar=document.getElementById("airBar");
const $healthBar=document.getElementById("healthBar");
const $hungerBar=document.getElementById("hungerBar");
const $saturationBar=document.getElementById("saturationBar");
const $xpBarWrap=document.getElementById("xpBarWrap");
const $xpFill=document.getElementById("xpFill");
const $xpLevelLabel=document.getElementById("xpLevelLabel");
const $chatOverlay=document.getElementById("chatOverlay");
const $chatLog=document.getElementById("chatLog");
const $chatInputWrap=document.getElementById("chatInputWrap");
const $chatInput=document.getElementById("chatInput");
const $chatSuggest=document.getElementById("chatSuggest");
const $sneakInd=document.getElementById("sneakIndicator");
// Crafting table modal refs
const $tableOverlay=document.getElementById("tableOverlay");
const $tableGrid=document.getElementById("tableGrid");
const $tableOut=document.getElementById("tableOut");
const $tableInvMain=document.getElementById("tableInvMain");
const $tableHotbarRow=document.getElementById("tableHotbarRow");
// Chest modal refs
const $chestOverlay=document.getElementById("chestOverlay");
const $chestStorageRows=document.getElementById("chestStorageRows");
const $chestInvMain=document.getElementById("chestInvMain");
const $chestHotbarRow=document.getElementById("chestHotbarRow");
// Furnace modal refs
const $furnaceOverlay=document.getElementById("furnaceOverlay");
const $furnaceInput=document.getElementById("furnaceInput");
const $furnaceFuel=document.getElementById("furnaceFuel");
const $furnaceOutput=document.getElementById("furnaceOutput");
const $furnaceInvMain=document.getElementById("furnaceInvMain");
const $furnaceHotbarRow=document.getElementById("furnaceHotbarRow");
const $furnaceFlameFill=document.getElementById("furnaceFlameFill");
const $furnaceArrowFill=document.getElementById("furnaceArrowFill");
// Torch lights registry (max 64)
const torchLights=new Map(); // "x,y,z" → PointLight

function refreshWorldMetaText(){
  if(!$worldMeta)return;
  const presetName=currentWorldPreset().name;
  $worldMeta.textContent=`World: ${WORLD_META.worldName} · Seed: ${S.seed} · Preset: ${presetName}`;
}

// Data structures
const mats={};
let atlasMat=null,atlasAlphaMat=null,waterMergeMat=null;
const blockFaceUVs={};
const chunkMap=new Map();
const colCache=new Map();
const COL_CACHE_MAX=130000;
const COL_CACHE_TRIM_TO=90000;
const genQueue=[];
const genSet=new Set();
const dirtyQ=[];
const dirtySet=new Set();
let activeChunkJob=null;
let lastStreamOx=null,lastStreamOz=null;
const CHUNK_QUEUE_MIN_CAP=42;
const CHUNK_QUEUE_MAX_CAP=120;
const CHUNK_STREAM_TOPUP_MIN=12;
const CHUNK_STREAM_TOPUP_MAX=54;
const CHUNK_DIRTY_MIN_CAP=36;
const CHUNK_DIRTY_MAX_CAP=96;
const overrides=new Map();
const _nearHM=[];
const particles=[];
const dropItems=[];
const _partMatCache=new Map();
const keys=new Set();
let nextChunkWorkAt=0;
const worldRoot=new THREE.Group();
scene.add(worldRoot);

const CHUNK_DATA_LEN=S.chunkSize*S.worldH*S.chunkSize;
const CHUNK_POOL_MAX=96;
const chunkDataPool=[];
const chunkFacePool=[];
const chunkVisPool=[];

function acquireChunkData(){
  const data=chunkDataPool.pop();
  return data&&data.length===CHUNK_DATA_LEN?data:new Uint8Array(CHUNK_DATA_LEN);
}
function releaseChunkData(data){
  if(!(data instanceof Uint8Array)||data.length!==CHUNK_DATA_LEN)return;
  if(chunkDataPool.length<CHUNK_POOL_MAX)chunkDataPool.push(data);
}
function acquireChunkFaceArray(){
  const arr=chunkFacePool.pop();
  if(arr){arr.length=0;return arr;}
  return [];
}
function releaseChunkFaceArray(arr){
  if(!Array.isArray(arr))return;
  arr.length=0;
  if(chunkFacePool.length<CHUNK_POOL_MAX*3)chunkFacePool.push(arr);
}
function acquireChunkVisMap(){
  const m=chunkVisPool.pop();
  if(m){m.clear();return m;}
  return new Map();
}
function releaseChunkVisMap(m){
  if(!(m instanceof Map))return;
  m.clear();
  if(chunkVisPool.length<CHUNK_POOL_MAX)chunkVisPool.push(m);
}
function releaseChunkJobScratch(job,recycleData=false){
  if(!job)return;
  releaseChunkFaceArray(job.oFaces);
  releaseChunkFaceArray(job.aFaces);
  releaseChunkFaceArray(job.wFaces);
  releaseChunkVisMap(job.vis);
  job.oFaces=null;job.aFaces=null;job.wFaces=null;job.vis=null;
  if(recycleData&&job.data){releaseChunkData(job.data);job.data=null;}
}

let chunkBuildTokenLastAt=performance.now();
let chunkBuildTokens=6;
function chunkBuildRatePerSecond(){
  return THREE.MathUtils.clamp(8+S.renderDist*2.2,10,24);
}
function chunkBuildTokenBurst(){
  return THREE.MathUtils.clamp(3+Math.round(S.renderDist*0.6),4,9);
}
function refillChunkBuildTokens(){
  const now=performance.now();
  const dt=Math.max(0,(now-chunkBuildTokenLastAt)/1000);
  chunkBuildTokenLastAt=now;
  if(dt<=0)return;
  chunkBuildTokens=Math.min(chunkBuildTokenBurst(),chunkBuildTokens+dt*chunkBuildRatePerSecond());
}
function canStartChunkBuild(isDirty=false){
  if(!ENABLE_CHUNK_START_LIMITER)return true;
  refillChunkBuildTokens();
  const cost=isDirty?0.75:1;
  if(chunkBuildTokens<cost)return false;
  chunkBuildTokens-=cost;
  return true;
}

function effectiveStreamRadius(){
  const rd=THREE.MathUtils.clamp(Math.round(S.renderDist)||3,2,8);
  const pressure=chunkQueuePressure();
  const frameMs=lagDebug.lastFrameMs||16;
  let eff=rd;
  if(performance.now()<lagDebug.startupUntil+2600)eff=Math.min(eff,Math.min(5,rd));
  if(pressure>140||frameMs>32)eff=Math.min(eff,rd-1);
  else if((pressure>95||frameMs>26)&&rd>3)eff=Math.min(eff,rd-1);
  return THREE.MathUtils.clamp(eff,2,rd);
}

function desiredGenQueueCap(){
  const effRd=effectiveStreamRadius();
  const base=24+effRd*11;
  return THREE.MathUtils.clamp(base,CHUNK_QUEUE_MIN_CAP,CHUNK_QUEUE_MAX_CAP);
}

function desiredStreamTopupCap(){
  return THREE.MathUtils.clamp(Math.floor(desiredGenQueueCap()*0.45),CHUNK_STREAM_TOPUP_MIN,CHUNK_STREAM_TOPUP_MAX);
}

function desiredDirtyQueueCap(){
  const effRd=effectiveStreamRadius();
  const base=20+effRd*10;
  return THREE.MathUtils.clamp(base,CHUNK_DIRTY_MIN_CAP,CHUNK_DIRTY_MAX_CAP);
}

function compactDirtyQueueToLoaded(){
  let w=0;
  for(let i=0;i<dirtyQ.length;i++){
    const k=dirtyQ[i];
    if(chunkMap.has(k))dirtyQ[w++]=k;
    else dirtySet.delete(k);
  }
  dirtyQ.length=w;
}

function trimDirtyQueueToCap(ox,oz,cap=desiredDirtyQueueCap()){
  if(dirtyQ.length<=cap)return;
  dirtyQ.sort((ka,kb)=>{
    const ca=chunkMap.get(ka),cb=chunkMap.get(kb);
    const da=ca?Math.hypot(ca.cx-ox,ca.cz-oz):Infinity;
    const db=cb?Math.hypot(cb.cx-ox,cb.cz-oz):Infinity;
    return da-db;
  });
  for(let i=cap;i<dirtyQ.length;i++)dirtySet.delete(dirtyQ[i]);
  dirtyQ.length=cap;
}

function queueDirtyChunk(k){
  if(dirtySet.has(k))return;
  dirtySet.add(k);
  dirtyQ.push(k);
  if(dirtyQ.length>desiredDirtyQueueCap()){
    const ox=Math.floor(player.pos.x/S.chunkSize),oz=Math.floor(player.pos.z/S.chunkSize);
    trimDirtyQueueToCap(ox,oz);
  }
}

function compactGenQueueToRange(ox,oz,r){
  let gw=0;
  for(let i=0;i<genQueue.length;i++){
    const e=genQueue[i];
    if(chunkInRange(e.cx,e.cz,ox,oz,r))genQueue[gw++]=e;
    else genSet.delete(ck(e.cx,e.cz));
  }
  genQueue.length=gw;
}

function trimGenQueueToCap(ox,oz,cap=desiredGenQueueCap()){
  if(genQueue.length<=cap)return;
  genQueue.sort((a,b)=>Math.hypot(a.cx-ox,a.cz-oz)-Math.hypot(b.cx-ox,b.cz-oz));
  for(let i=cap;i<genQueue.length;i++){
    const e=genQueue[i];
    genSet.delete(ck(e.cx,e.cz));
  }
  genQueue.length=cap;
}

function queueMissingChunksNear(ox,oz,maxAdds=Infinity,radius=effectiveStreamRadius()){
  const targetCap=desiredGenQueueCap();
  if(genQueue.length>=targetCap||maxAdds<=0)return 0;

  const candidates=[];
  for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){
    const cx=ox+dx,cz=oz+dz;
    const k=ck(cx,cz);
    if(chunkMap.has(k)||genSet.has(k))continue;
    candidates.push({cx,cz,d:Math.hypot(dx,dz)});
  }
  if(!candidates.length)return 0;

  candidates.sort((a,b)=>a.d-b.d);
  const addLimit=Math.min(maxAdds,targetCap-genQueue.length,candidates.length);
  let added=0;
  for(let i=0;i<addLimit;i++){
    if(queueChunk(candidates[i].cx,candidates[i].cz))added++;
  }
  return added;
}

// ── Lighting ─────────────────────────────────────────────────
const hemiLight=new THREE.HemisphereLight(0xc8e8ff,0x4a6830,1.35);
scene.add(hemiLight);
const sun=new THREE.DirectionalLight(0xfff8e8,1.7);
sun.castShadow=true;
sun.shadow.mapSize.set(768,768);
sun.shadow.camera.near=0.5;sun.shadow.camera.far=200;
sun.shadow.camera.left=-65;sun.shadow.camera.right=65;
sun.shadow.camera.top=65;sun.shadow.camera.bottom=-65;
sun.shadow.bias=-0.0002;sun.shadow.normalBias=0.02;
scene.add(sun,sun.target);
const moon=new THREE.DirectionalLight(0x7090d0,.28);
scene.add(moon,moon.target);
// Very low ambient so caves/undersides are actually dark (torches matter)
const ambLight=new THREE.AmbientLight(0x8090b8,0.18);
scene.add(ambLight);
function makeSunTexture(){
  const cv=document.createElement("canvas");
  cv.width=cv.height=32;
  const ctx=cv.getContext("2d");
  ctx.clearRect(0,0,32,32);
  ctx.fillStyle="rgba(0,0,0,0)";
  ctx.fillRect(0,0,32,32);
  ctx.fillStyle="#f7dd66";
  ctx.fillRect(6,6,20,20);
  ctx.fillStyle="#ffe98a";
  ctx.fillRect(8,8,16,16);
  ctx.fillStyle="#fff4b3";
  ctx.fillRect(11,11,10,10);
  const tex=new THREE.CanvasTexture(cv);
  tex.magFilter=THREE.NearestFilter;
  tex.minFilter=THREE.NearestFilter;
  tex.generateMipmaps=false;
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.needsUpdate=true;
  return tex;
}
function makeMoonTexture(){
  const cv=document.createElement("canvas");
  cv.width=cv.height=32;
  const ctx=cv.getContext("2d");
  ctx.clearRect(0,0,32,32);
  ctx.fillStyle="#c9d5ee";
  ctx.fillRect(6,6,20,20);
  ctx.fillStyle="#dde7f7";
  ctx.fillRect(8,8,16,16);
  ctx.fillStyle="#aab8d8";
  [[10,10,2,2],[18,9,3,2],[14,18,2,3],[20,18,2,2],[9,16,2,2]].forEach(([x,y,w,h])=>ctx.fillRect(x,y,w,h));
  const tex=new THREE.CanvasTexture(cv);
  tex.magFilter=THREE.NearestFilter;
  tex.minFilter=THREE.NearestFilter;
  tex.generateMipmaps=false;
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.needsUpdate=true;
  return tex;
}
function makeStarDomeTexture(){
  const cv=document.createElement("canvas");
  cv.width=1024;cv.height=512;
  const ctx=cv.getContext("2d");
  ctx.fillStyle="#03060f";
  ctx.fillRect(0,0,cv.width,cv.height);
  for(let i=0;i<620;i++){
    const x=(Math.random()*cv.width)|0;
    const y=(Math.random()*Math.floor(cv.height*0.86))|0;
    const b=Math.random();
    if(b>0.92){
      ctx.fillStyle="#f6fbff";
      ctx.fillRect(x,y,2,2);
    }else if(b>0.65){
      ctx.fillStyle="#dbe9ff";
      ctx.fillRect(x,y,1,1);
    }else{
      ctx.fillStyle="#b7c8ea";
      ctx.fillRect(x,y,1,1);
    }
  }
  const tex=new THREE.CanvasTexture(cv);
  tex.magFilter=THREE.NearestFilter;
  tex.minFilter=THREE.NearestFilter;
  tex.generateMipmaps=false;
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.wrapS=THREE.RepeatWrapping;
  tex.wrapT=THREE.ClampToEdgeWrapping;
  tex.needsUpdate=true;
  return tex;
}
const sunOrb=new THREE.Mesh(
  new THREE.PlaneGeometry(12,12),
  new THREE.MeshBasicMaterial({map:makeSunTexture(),transparent:true,color:0xffffff,fog:false,depthWrite:false,depthTest:true,side:THREE.DoubleSide})
);
const moonOrb=new THREE.Mesh(
  new THREE.PlaneGeometry(10.4,10.4),
  new THREE.MeshBasicMaterial({map:makeMoonTexture(),transparent:true,color:0xffffff,fog:false,depthWrite:false,depthTest:true,side:THREE.DoubleSide})
);
// Render behind terrain but in front of sky – renderOrder 0 means depth test applies naturally
sunOrb.renderOrder=0;moonOrb.renderOrder=0;scene.add(sunOrb,moonOrb);
const starDome=new THREE.Mesh(
  new THREE.SphereGeometry(230,36,24),
  new THREE.MeshBasicMaterial({map:makeStarDomeTexture(),color:0xffffff,fog:false,transparent:true,opacity:0,depthWrite:false,side:THREE.BackSide,toneMapped:false})
);
scene.add(starDome);
const cloudGrp=new THREE.Group();scene.add(cloudGrp);
for(let i=0;i<16;i++){
  const g=new THREE.Group();
  for(let p=0;p<3+Math.floor(Math.random()*4);p++){
    const m=new THREE.Mesh(new THREE.BoxGeometry(8+Math.random()*8,2+Math.random()*1.6,6+Math.random()*7),new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:.72}));
    m.position.set((Math.random()-.5)*12,(Math.random()-.5)*2,(Math.random()-.5)*10);g.add(m);
  }
  g.position.set((Math.random()-.5)*190,74+Math.random()*26,(Math.random()-.5)*190);
  g.userData.spd=1.6+Math.random()*1.8;cloudGrp.add(g);
}
const selBox=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.018,1.018,1.018)),new THREE.LineBasicMaterial({color:0x000000,transparent:true,opacity:.6}));
selBox.visible=false;scene.add(selBox);

// ── Minecraft-style block breaking crack overlay ─────────────────────────────
// 10 stages matching Minecraft's destroy_stage_0 → destroy_stage_9
// Organic radial crack pattern that looks like real stone breaking
function _buildCrackTextures(){
  const SIZE=64;
  const tArr=[];
  for(let stage=0;stage<10;stage++){
    const cv=document.createElement('canvas');cv.width=cv.height=SIZE;
    const ctx=cv.getContext('2d');
    ctx.clearRect(0,0,SIZE,SIZE);
    const prog=(stage+1)/10; // 0.1 .. 1.0

    // ── Overall darkening tint (gets stronger with stage) ──
    ctx.fillStyle=`rgba(0,0,0,${0.06+prog*0.28})`;
    ctx.fillRect(0,0,SIZE,SIZE);

    // ── Radial cracks from stress points (more organic appearance) ──
    const stressPoints=[
      {x:SIZE*0.5,y:SIZE*0.5,weight:1.0,maxCracks:Math.floor(8+prog*5)},   // center (always dominant)
      {x:SIZE*0.2,y:SIZE*0.25,weight:0.45,maxCracks:Math.floor(3+prog*3)},  // top-left stress
      {x:SIZE*0.8,y:SIZE*0.75,weight:0.40,maxCracks:Math.floor(3+prog*2.5)}, // bottom-right stress  
      {x:SIZE*0.15,y:SIZE*0.8,weight:0.35,maxCracks:Math.floor(2+prog*2)},   // bottom-left stress
      {x:SIZE*0.85,y:SIZE*0.2,weight:0.35,maxCracks:Math.floor(2+prog*2)}    // top-right stress
    ];
    
    for(let pi=0;pi<stressPoints.length;pi++){
      const pt=stressPoints[pi];
      // Only activate stress points at higher stages
      if(prog<pt.weight*0.5)continue;
      
      const numCracks=Math.floor(pt.maxCracks*Math.min(1,(prog-pt.weight*0.4)/0.6));
      for(let c=0;c<numCracks;c++){
        const angle=(c/Math.max(1,numCracks))*Math.PI*2 + stage*0.42 + pi*0.8;
        const crackLen=SIZE*(0.10+prog*0.42)*pt.weight;
        
        // Primary crack stroke
        ctx.strokeStyle=`rgba(0,0,0,${0.62+prog*0.32})`;
        ctx.lineWidth=Math.max(0.7,1.2+prog*1.5);
        ctx.lineCap='round';
        ctx.lineJoin='round';
        
        // Draw main crack with organic branching
        let x=pt.x, y=pt.y;
        ctx.beginPath();
        ctx.moveTo(x, y);
        
        const steps=Math.ceil(crackLen/2.5);
        let px=x, py=y;
        for(let s=0;s<steps;s++){
          const t=s/steps;
          // Jitter increases with progression
          const jitter=Math.sin(s*3.2+c*2.8+stage*1.1+pi)*1.5*(1+prog);
          // Crack slightly curves/bends
          const curveAngle=angle+jitter*0.22+Math.sin(t*Math.PI)*0.3;
          const stepDist=2.2+prog*0.8;
          x+=Math.cos(curveAngle)*stepDist;
          y+=Math.sin(curveAngle)*stepDist;
          ctx.lineTo(Math.max(1,Math.min(SIZE-1,x)),Math.max(1,Math.min(SIZE-1,y)));
        }
        ctx.stroke();
        
        // Secondary branches (tree-like fracturing)
        if(stage>=2 && prog>0.28){
          const numBranches=Math.floor(1+prog*2);
          for(let b=0;b<numBranches;b++){
            const branchAt=Math.floor(steps*0.3)+b;
            if(branchAt>=steps)continue;
            
            // Branch angle perpendicular to main crack
            const branchAngle=angle+Math.PI*0.5+(Math.random()-0.5)*0.8;
            const branchLen=crackLen*0.35;
            
            let bx=pt.x, by=pt.y;
            const bsteps=Math.ceil(branchLen/2.5);
            
            ctx.strokeStyle=`rgba(0,0,0,${0.50+prog*0.25})`;
            ctx.lineWidth=Math.max(0.5,0.8+prog*1.0);
            ctx.beginPath();
            ctx.moveTo(bx,by);
            
            for(let bs=0;bs<bsteps;bs++){
              const bjitter=Math.sin(bs*4.5+c*1.9+stage)*1.0;
              bx+=Math.cos(branchAngle+bjitter*0.18)*2;
              by+=Math.sin(branchAngle+bjitter*0.18)*2;
              ctx.lineTo(Math.max(1,Math.min(SIZE-1,bx)),Math.max(1,Math.min(SIZE-1,by)));
            }
            ctx.stroke();
          }
        }
      }
    }

    // ── Fine fracture dust/cracks (gets denser with progression) ──
    const dustPoints=Math.floor(5+prog*12);
    for(let d=0;d<dustPoints;d++){
      const dx=Math.random()*SIZE;
      const dy=Math.random()*SIZE;
      const dustLen=Math.random()*4+prog*2;
      const dustAngle=Math.random()*Math.PI*2;
      
      ctx.strokeStyle=`rgba(0,0,0,${0.35+prog*0.25})`;
      ctx.lineWidth=Math.max(0.4,0.6+prog*0.8);
      ctx.beginPath();
      ctx.moveTo(dx,dy);
      ctx.lineTo(dx+Math.cos(dustAngle)*dustLen,dy+Math.sin(dustAngle)*dustLen);
      ctx.stroke();
    }

    // ── Radial shadow/depth effect (makes cracks look deeper) ──
    if(stage>=4){
      const grd=ctx.createRadialGradient(SIZE/2,SIZE/2,SIZE*0.1,SIZE/2,SIZE/2,SIZE*0.8);
      grd.addColorStop(0,'rgba(0,0,0,0)');
      grd.addColorStop(0.6,`rgba(0,0,0,${(prog-0.35)*0.25})`);
      grd.addColorStop(1,`rgba(0,0,0,${(prog-0.30)*0.35})`);
      ctx.fillStyle=grd;
      ctx.fillRect(0,0,SIZE,SIZE);
    }

    const t=new THREE.CanvasTexture(cv);
    t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;
    t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;
    tArr.push(t);
  }
  return tArr;
}
const _crackTextures=_buildCrackTextures();
const _crackMats=_crackTextures.map(t=>new THREE.MeshBasicMaterial({
  map:t,transparent:true,opacity:1.0,depthWrite:false,
  polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2
}));
const breakMesh=new THREE.Mesh(new THREE.BoxGeometry(1.002,1.002,1.002),_crackMats[0]);
breakMesh.visible=false;breakMesh.renderOrder=5;scene.add(breakMesh);

// ── Player skin system (must be before buildPlayerModel) ─────
let _playerSkinTex=null;
function getPlayerSkin(){if(!_playerSkinTex)_playerSkinTex=buildDefaultSkin();return _playerSkinTex;}
function setSkin(url){
  const apply=t=>{t.magFilter=t.minFilter=THREE.NearestFilter;t.generateMipmaps=false;t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;_playerSkinTex=t;const sm=playerModel.userData.skin;sm.map=t;sm.needsUpdate=true;};
  if(url){new THREE.TextureLoader().load(url,apply);}else{apply(buildDefaultSkin());}
}
function buildDefaultSkin(){
  const cv=document.createElement('canvas');cv.width=cv.height=64;
  const g=cv.getContext('2d');
  const f=(col,x,y,w,h)=>{g.fillStyle=col;g.fillRect(x,y,w,h);};
  const SK='#f5b87a',HA='#4a2c0e',EY='#1a4fd6',WH='#eceeff',SH='#3a6b7c',PA='#283c54',BT='#161008',AC='#c8a44a';
  f(SK,0,8,32,8);f(HA,8,0,8,8);f(SK,16,0,8,8);f(HA,0,8,32,5);
  f(SK,8,8,8,8);f(HA,8,8,8,2);
  f(WH,9,10,2,3);f(WH,13,10,2,3);
  f(EY,10,11,1,2);f(EY,14,11,1,2);
  f(HA,10,14,4,1);
  f(SH,16,16,24,16);f(AC,20,25,8,2);
  f(PA,0,16,16,12);f(BT,0,28,16,4);
  f(SH,40,16,16,10);f(SK,40,26,16,6);
  f(PA,16,48,16,12);f(BT,16,60,16,4);
  f(SH,32,48,16,10);f(SK,32,58,16,6);
  const t=new THREE.CanvasTexture(cv);
  t.magFilter=t.minFilter=THREE.NearestFilter;t.generateMipmaps=false;t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;
  return t;
}
function skinR(px,py,pw,ph){return[px/64,(64-py-ph)/64,(px+pw)/64,(64-py)/64];}
function remapBoxUV(geo,fr){
  const uv=geo.attributes.uv.array;
  for(let f=0;f<6;f++){const[u0,v0,u1,v1]=fr[f],b=f*8;uv[b]=u0;uv[b+1]=v1;uv[b+2]=u1;uv[b+3]=v1;uv[b+4]=u0;uv[b+5]=v0;uv[b+6]=u1;uv[b+7]=v0;}
  geo.attributes.uv.needsUpdate=true;
}
function skinBox(w,h,d,pxFaces,mat){
  const geo=new THREE.BoxGeometry(w,h,d);
  remapBoxUV(geo,pxFaces.map(r=>skinR(...r)));
  return new THREE.Mesh(geo,mat);
}

const _heldMats={
  torchStem:new THREE.MeshStandardMaterial({color:0x9a6430,roughness:0.9,metalness:0.0}),
  torchHead:new THREE.MeshStandardMaterial({color:0x2b2014,roughness:1.0,metalness:0.0}),
  torchFlame:new THREE.MeshBasicMaterial({color:0xffc766}),
  bucketMetal:new THREE.MeshStandardMaterial({color:0xc7cdd4,roughness:0.42,metalness:0.82}),
  bucketWater:new THREE.MeshStandardMaterial({color:0x4d8eff,roughness:0.2,metalness:0.0,transparent:true,opacity:0.88})
};

function createHeldTorchModel(){
  const grp=new THREE.Group();

  const stem=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.024,0.28,6),_heldMats.torchStem);
  stem.position.y=-0.04;

  const head=new THREE.Mesh(new THREE.BoxGeometry(0.060,0.050,0.060),_heldMats.torchHead);
  head.position.y=0.12;

  const flame=new THREE.Mesh(new THREE.SphereGeometry(0.028,6,6),_heldMats.torchFlame);
  flame.position.y=0.17;

  grp.add(stem,head,flame);
  grp.visible=false;
  return grp;
}

function createHeldBucketModel(){
  const grp=new THREE.Group();

  const shell=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.105,0.17,12,1,true),_heldMats.bucketMetal);
  const base=new THREE.Mesh(new THREE.CircleGeometry(0.104,12),_heldMats.bucketMetal);
  base.rotation.x=-Math.PI*0.5;
  base.position.y=-0.085;

  const water=new THREE.Mesh(new THREE.CylinderGeometry(0.097,0.085,0.082,12),_heldMats.bucketWater);
  water.position.y=-0.015;

  const handle=new THREE.Mesh(new THREE.TorusGeometry(0.118,0.012,8,16,Math.PI),_heldMats.bucketMetal);
  handle.rotation.z=Math.PI;
  handle.position.y=0.032;

  grp.add(shell,base,water,handle);
  grp.visible=false;
  return grp;
}

function createHeldIconModel(size=0.28){
  const cv=document.createElement("canvas");
  cv.width=cv.height=32;
  const tex=new THREE.CanvasTexture(cv);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.magFilter=tex.minFilter=THREE.NearestFilter;
  tex.generateMipmaps=false;
  tex.needsUpdate=true;

  const mat=new THREE.MeshStandardMaterial({
    map:tex,
    transparent:true,
    alphaTest:0.18,
    side:THREE.DoubleSide,
    roughness:0.92,
    metalness:0
  });
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(size,size),mat);
  mesh.userData={canvas:cv,ctx:cv.getContext("2d"),tex,lastId:null};
  mesh.visible=false;
  return mesh;
}

function updateHeldIconModel(mesh,itemId){
  if(!mesh||!mesh.userData)return;
  const ud=mesh.userData;
  if(ud.lastId===itemId)return;
  ud.ctx.clearRect(0,0,32,32);
  ud.ctx.save();
  ud.ctx.scale(2,2);
  drawItemIcon(ud.ctx,itemId);
  ud.ctx.restore();
  ud.tex.needsUpdate=true;
  ud.lastId=itemId;
}

function heldRenderFlags(itemId){
  const id=itemId||BLOCK.AIR;
  const block=!!(id!==BLOCK.AIR&&isBlockItem(id)&&id!==BLOCK.TORCH);
  const torch=id===BLOCK.TORCH;
  const bucket=id===ITEM.WATER_SOURCE;
  const icon=!block&&!torch&&!bucket&&id!==BLOCK.AIR;
  return {block,torch,bucket,icon};
}

// ── Player model ─────────────────────────────────────────────
const playerModel=buildPlayerModel();scene.add(playerModel);

// ── First-person arm ─────────────────────────────────────────
hudScene.add(hudCam);
const fpArm=buildFPArm();hudCam.add(fpArm);

// ── Inventory portrait (3D) ──────────────────────────────────
const invRenderer=new THREE.WebGLRenderer({canvas:$playerCanvas,antialias:false,alpha:false});
invRenderer.setPixelRatio(1);invRenderer.setSize(96,128,false);
invRenderer.outputColorSpace=THREE.SRGBColorSpace;
const invScene=new THREE.Scene();
invScene.background=new THREE.Color(0x94bfec);
invScene.add(new THREE.AmbientLight(0xffeedd,1.3));
const _invDirL=new THREE.DirectionalLight(0xfff8e0,1.1);_invDirL.position.set(2,3,3);invScene.add(_invDirL);
const _invFill=new THREE.DirectionalLight(0x8090c8,0.35);_invFill.position.set(-2,0,1);invScene.add(_invFill);
const invCam=new THREE.PerspectiveCamera(30,96/128,0.05,20);
invCam.position.set(0,0.84,3.62);invCam.lookAt(0,0.82,0);
const invPlayerModel=buildPlayerModel();
invPlayerModel.position.y=-0.12;
invPlayerModel.rotation.y=-0.3;
invScene.add(invPlayerModel);
let _invMX=0,_invMY=0;
document.addEventListener('mousemove',e=>{
  if(!invOpen)return;
  const r=$playerCanvas.getBoundingClientRect();
  _invMX=Math.max(-0.7,Math.min(0.7,(e.clientX-(r.left+r.width*.5))/180));
  _invMY=Math.max(-0.28,Math.min(0.24,(e.clientY-(r.top+r.height*.52))/250));
});

// ═══════════════════════════════
//  STATE
// ═══════════════════════════════
// Inventory slots are {id, count} objects. null = empty.
// Minecraft-accurate: left-click picks up whole stack, places on target
//   - if target empty: place whole stack there
//   - if target same id: stack (up to 64)
//   - if target different id: swap
// Right-click while holding: place 1; right-click empty slot: pick up half