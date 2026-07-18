/**
 * @module assets
 * Resource packs, SFX, rain audio
 * Lines 998-1393 from game.monolith.html
 * Loaded as source text by main.js and evaluated in one shared scope.
 */

// First-pass resource-pack support (fallbacks stay procedural if a texture is missing)
const RESOURCE_PACK_STORAGE_KEY="blockiecraft_resource_pack";
const RESOURCE_PACK_PRESETS={
  "classic-lite":{id:"classic-lite",name:"Minecraft Classic Edition Lite",folder:"Minecraft Classic Edition Lite"},
  default:{id:"default",name:"Default (Procedural)",folder:""}
};
function normalizeResourcePackId(raw){
  const id=String(raw??"").trim().toLowerCase();
  if(id==="off"||id==="none")return "default";
  return RESOURCE_PACK_PRESETS[id]?id:"classic-lite";
}
function resourcePackTextureRootForPreset(preset){
  if(!preset?.folder)return "";
  return `./assets/resourcepacks/${preset.folder}/assets/minecraft/textures`;
}
const RESOURCE_PACK_SUPPORTED_PROTOCOLS=new Set(["http:","https:"]);
const resourcePackState={
  loaded:false,
  active:false,
  id:"classic-lite",
  name:RESOURCE_PACK_PRESETS["classic-lite"].name,
  textureRoot:resourcePackTextureRootForPreset(RESOURCE_PACK_PRESETS["classic-lite"]),
  block:new Map(), // textureName -> {canvas, texture}
  item:new Map()   // textureName -> {canvas, texture}
};
function configureResourcePack(rawId){
  const id=normalizeResourcePackId(rawId);
  const preset=RESOURCE_PACK_PRESETS[id];
  resourcePackState.id=preset.id;
  resourcePackState.name=preset.name;
  resourcePackState.textureRoot=resourcePackTextureRootForPreset(preset);
  resourcePackState.loaded=false;
  resourcePackState.active=false;
  resourcePackState.block.clear();
  resourcePackState.item.clear();
  try{localStorage.setItem(RESOURCE_PACK_STORAGE_KEY,preset.id);}catch(e){}
}
const RESOURCE_PACK_BLOCK_KEYS=[
  "grass_block_top","grass_block_side","dirt","stone","sand",
  "oak_log","oak_log_top","oak_leaves","snow","glass",
  "cactus_side","cactus_top","cactus_bottom","oak_planks","cobblestone","gravel","torch",
  "red_sand","clay","mud","coal_ore","iron_ore","gold_ore","diamond_ore",
  "crafting_table_top","crafting_table_front","crafting_table_side",
  "furnace_front","furnace_side","furnace_top"
];
const RESOURCE_PACK_ITEM_KEYS=[
  "stick","water_bucket","apple","bread","cooked_porkchop",
  "wooden_pickaxe","stone_pickaxe","iron_pickaxe",
  "wooden_axe","stone_axe","wooden_shovel","stone_shovel",
  "coal","iron_ingot","gold_ingot","diamond"
];
function _rpLoadImage(url){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.decoding="async";
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error(`Failed to load ${url}`));
    img.src=url;
  });
}
function _rpToCanvas16(img){
  const cv=document.createElement("canvas");
  cv.width=cv.height=16;
  const ctx=cv.getContext("2d");
  ctx.imageSmoothingEnabled=false;
  ctx.clearRect(0,0,16,16);
  ctx.drawImage(img,0,0,16,16);
  return cv;
}
function _rpCanvasToTexture(cv){
  const t=new THREE.CanvasTexture(cv);
  t.colorSpace=THREE.SRGBColorSpace;
  t.magFilter=t.minFilter=THREE.NearestFilter;
  t.generateMipmaps=false;
  t.needsUpdate=true;
  return t;
}
async function _rpLoadKey(map,folder,key){
  if(!resourcePackState.textureRoot)return false;
  const url=encodeURI(`${resourcePackState.textureRoot}/${folder}/${key}.png`);
  try{
    const img=await _rpLoadImage(url);
    const canvas=_rpToCanvas16(img);
    map.set(key,{canvas,texture:_rpCanvasToTexture(canvas)});
    return true;
  }catch(e){
    return false;
  }
}
async function loadResourcePackTextures(){
  if(resourcePackState.loaded)return resourcePackState.active;
  if(resourcePackState.id==="default"||!resourcePackState.textureRoot){
    resourcePackState.loaded=true;
    resourcePackState.active=false;
    console.info(`[resourcepack] ${resourcePackState.name} selected, using procedural textures`);
    return false;
  }
  if(!RESOURCE_PACK_SUPPORTED_PROTOCOLS.has(window.location.protocol)){
    resourcePackState.loaded=true;
    resourcePackState.active=false;
    console.info("[resourcepack] Disabled on non-http(s) protocol. Use a local web server to enable pack textures.");
    return false;
  }
  const blockJobs=RESOURCE_PACK_BLOCK_KEYS.map(k=>_rpLoadKey(resourcePackState.block,"block",k));
  const itemJobs=RESOURCE_PACK_ITEM_KEYS.map(k=>_rpLoadKey(resourcePackState.item,"item",k));
  await Promise.all([...blockJobs,...itemJobs]);
  resourcePackState.loaded=true;
  resourcePackState.active=resourcePackState.block.size>0||resourcePackState.item.size>0;
  if(resourcePackState.active){
    console.info(`[resourcepack] Loaded '${resourcePackState.name}' (${resourcePackState.block.size} block, ${resourcePackState.item.size} item textures)`);
  }else{
    console.info("[resourcepack] No pack textures found, using procedural defaults");
  }
  return resourcePackState.active;
}
function rpBlockTexture(name){
  return resourcePackState.block.get(name)?.texture??null;
}
function rpItemCanvas(name){
  return resourcePackState.item.get(name)?.canvas??null;
}

function _rpAverageSaturation(canvas){
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx)return 1;
  const img=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  let satSum=0;
  let count=0;
  for(let i=0;i<img.length;i+=4){
    if(img[i+3]<8)continue;
    const r=img[i]/255;
    const g=img[i+1]/255;
    const b=img[i+2]/255;
    const max=Math.max(r,g,b);
    const min=Math.min(r,g,b);
    const sat=max<=0?0:(max-min)/max;
    satSum+=sat;
    count++;
  }
  return count?satSum/count:1;
}

function rpBlockTextureTinted(name,tintHex,fallback,threshold=0.16){
  const entry=resourcePackState.block.get(name);
  if(!entry)return fallback;

  const srcCanvas=entry.canvas;
  if(!srcCanvas)return entry.texture||fallback;

  const avgSat=_rpAverageSaturation(srcCanvas);
  if(avgSat>threshold)return entry.texture||fallback;

  const cacheKey=`${name}__tint_${tintHex.toString(16)}`;
  const cached=resourcePackState.block.get(cacheKey);
  if(cached?.texture)return cached.texture;

  const tintColor=new THREE.Color(tintHex);
  const tr=Math.round(tintColor.r*255);
  const tg=Math.round(tintColor.g*255);
  const tb=Math.round(tintColor.b*255);

  const cv=document.createElement("canvas");
  cv.width=srcCanvas.width;
  cv.height=srcCanvas.height;
  const ctx=cv.getContext("2d",{willReadFrequently:true});
  if(!ctx)return entry.texture||fallback;

  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(srcCanvas,0,0);
  const img=ctx.getImageData(0,0,cv.width,cv.height);
  const data=img.data;

  for(let i=0;i<data.length;i+=4){
    if(data[i+3]<8)continue;
    data[i]=Math.min(255,Math.round((data[i]*tr)/255));
    data[i+1]=Math.min(255,Math.round((data[i+1]*tg)/255));
    data[i+2]=Math.min(255,Math.round((data[i+2]*tb)/255));
  }

  ctx.putImageData(img,0,0);
  const tintedTex=_rpCanvasToTexture(cv);
  resourcePackState.block.set(cacheKey,{canvas:cv,texture:tintedTex});
  return tintedTex;
}
// ═══════════════════════════════
//  WEB AUDIO SFX ENGINE  (procedural — no external files needed)
// ═══════════════════════════════
let _sfxCtx=null;
function _getSfxCtx(){
  if(!_sfxCtx)_sfxCtx=new(window.AudioContext||window.webkitAudioContext)();
  if(_sfxCtx.state==="suspended")_sfxCtx.resume();
  return _sfxCtx;
}
function _sfxGain(ctx,vol){
  const g=ctx.createGain();
  const masterVol=(GS.masterVolume/100)*0.7;
  const sfxVol=(GS.sfx!==false)?masterVol:0;
  g.gain.value=vol*sfxVol;
  g.connect(ctx.destination);
  return g;
}
// Core tone helper: freq sweep + optional noise layer
function _tone(freq0,freq1,dur,vol,wave="square",decay=0.85){
  if(!GS.sfx)return;
  try{
    const ctx=_getSfxCtx();
    const g=_sfxGain(ctx,vol);
    const osc=ctx.createOscillator();
    const env=ctx.createGain();
    osc.type=wave;
    osc.frequency.setValueAtTime(freq0,ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freq1,10),ctx.currentTime+dur);
    env.gain.setValueAtTime(1,ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur*decay);
    osc.connect(env);env.connect(g);
    osc.start(ctx.currentTime);osc.stop(ctx.currentTime+dur+0.05);
  }catch(e){}
}
function _noise(dur,vol,bandFreq,bandQ=2){
  if(!GS.sfx)return;
  try{
    const ctx=_getSfxCtx();
    const bufLen=ctx.sampleRate*dur;
    const buf=ctx.createBuffer(1,bufLen,ctx.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<bufLen;i++)d[i]=Math.random()*2-1;
    const src=ctx.createBufferSource();src.buffer=buf;
    const bpf=ctx.createBiquadFilter();bpf.type="bandpass";bpf.frequency.value=bandFreq;bpf.Q.value=bandQ;
    const env=ctx.createGain();
    const g=_sfxGain(ctx,vol);
    env.gain.setValueAtTime(1,ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur*0.9);
    src.connect(bpf);bpf.connect(env);env.connect(g);
    src.start(ctx.currentTime);src.stop(ctx.currentTime+dur+0.05);
  }catch(e){}
}
// Named sound events
function sfxFootstep(blockId){
  if(!GS.sfx)return;
  switch(blockId){
    case BLOCK.GRASS:case BLOCK.DIRT:case BLOCK.LEAVES:
      _noise(0.08,0.28,320,1.8);break;
    case BLOCK.STONE:case BLOCK.COBBLESTONE:case BLOCK.FURNACE:
    case BLOCK.COAL_ORE:case BLOCK.IRON_ORE:case BLOCK.GOLD_ORE:case BLOCK.DIAMOND_ORE:
      _noise(0.07,0.35,900,2.2);_tone(120,80,0.06,0.12,"sawtooth");break;
    case BLOCK.GRAVEL:
      _noise(0.08,0.30,620,1.9);_tone(150,95,0.05,0.10,"triangle");break;
    case BLOCK.CLAY:
      _noise(0.09,0.22,260,1.4);break;
    case BLOCK.MUD:
      _noise(0.10,0.24,170,1.1);break;
    case BLOCK.SAND:case BLOCK.RED_SAND:
      _noise(0.09,0.22,200,1.4);break;
    case BLOCK.WOOD:case BLOCK.PLANKS:
      _noise(0.07,0.30,480,2.0);_tone(200,120,0.07,0.10,"triangle");break;
    case BLOCK.SNOW:
      _noise(0.10,0.18,180,1.2);break;
    default:
      _noise(0.08,0.25,400,2.0);
  }
}
function sfxBlockBreak(blockId){
  if(!GS.sfx)return;
  switch(blockId){
    case BLOCK.GRASS:case BLOCK.DIRT:
      _noise(0.18,0.60,280,1.5);_tone(95,55,0.15,0.18,"sawtooth");break;
    case BLOCK.STONE:case BLOCK.COBBLESTONE:case BLOCK.FURNACE:
    case BLOCK.COAL_ORE:case BLOCK.IRON_ORE:case BLOCK.GOLD_ORE:case BLOCK.DIAMOND_ORE:
      _noise(0.20,0.70,1100,2.5);_tone(130,70,0.18,0.22,"sawtooth");break;
    case BLOCK.GRAVEL:
      _noise(0.18,0.62,700,2.0);_tone(160,90,0.12,0.16,"triangle");break;
    case BLOCK.CLAY:
      _noise(0.17,0.48,340,1.4);break;
    case BLOCK.MUD:
      _noise(0.20,0.58,170,1.1);break;
    case BLOCK.SAND:case BLOCK.RED_SAND:
      _noise(0.20,0.55,200,1.3);break;
    case BLOCK.WOOD:case BLOCK.PLANKS:case BLOCK.CRAFT_TABLE:case BLOCK.CHEST:
      _noise(0.16,0.60,420,2.0);_tone(160,90,0.16,0.20,"triangle");break;
    case BLOCK.GLASS:
      _tone(800,200,0.10,0.30,"sine");_noise(0.12,0.40,2000,3);break;
    case BLOCK.LEAVES:
      _noise(0.12,0.40,300,1.6);break;
    case BLOCK.SNOW:
      _noise(0.15,0.40,180,1.2);break;
    default:
      _noise(0.18,0.55,500,2.0);
  }
}
function sfxBlockPlace(blockId){
  if(!GS.sfx)return;
  switch(blockId){
    case BLOCK.STONE:case BLOCK.COBBLESTONE:case BLOCK.FURNACE:
    case BLOCK.COAL_ORE:case BLOCK.IRON_ORE:case BLOCK.GOLD_ORE:case BLOCK.DIAMOND_ORE:
      _tone(200,140,0.07,0.22,"square");_noise(0.08,0.35,900,2);break;
    case BLOCK.GRAVEL:
      _tone(220,150,0.06,0.18,"triangle");_noise(0.08,0.30,620,1.8);break;
    case BLOCK.CLAY:case BLOCK.MUD:
      _tone(180,120,0.05,0.14,"triangle");_noise(0.07,0.22,260,1.4);break;
    case BLOCK.SAND:case BLOCK.RED_SAND:
      _tone(210,150,0.05,0.12,"triangle");_noise(0.07,0.20,210,1.2);break;
    case BLOCK.WOOD:case BLOCK.PLANKS:
      _tone(250,160,0.07,0.22,"triangle");_noise(0.07,0.30,480,2);break;
    case BLOCK.GLASS:
      _tone(600,400,0.06,0.20,"sine");break;
    case BLOCK.TORCH:
      _noise(0.05,0.15,600,3);break;
    default:
      _tone(220,150,0.06,0.18,"square");_noise(0.07,0.28,400,2);
  }
}
function sfxItemPickup(){_tone(880,1200,0.08,0.18,"sine");_tone(1100,1600,0.07,0.14,"sine");}
function sfxXpPickup(){
  _tone(660,1320,0.10,0.20,"sine");
  setTimeout(()=>_tone(880,1760,0.10,0.16,"sine"),60);
}
function sfxPlayerHurt(){_tone(280,120,0.18,0.40,"sawtooth");_noise(0.15,0.30,500,1.5);}
function sfxPlayerDeath(){
  _tone(220,55,0.40,0.55,"sawtooth");
  setTimeout(()=>_tone(180,45,0.35,0.40,"sawtooth"),200);
  setTimeout(()=>_noise(0.30,0.45,350,1.4),400);
}
function sfxMobHurt(type){
  switch(type){
    case"cow":
      _tone(150,95,0.25,0.22,"triangle");
      _noise(0.14,0.12,320,1.4);
      break;
    case"pig":
      _tone(420,260,0.13,0.20,"square");
      _noise(0.08,0.10,700,1.8);
      break;
    case"chicken":
      _tone(980,760,0.08,0.16,"square");
      _noise(0.05,0.08,1400,2.4);
      break;
    case"sheep":
      _tone(260,190,0.20,0.18,"triangle");
      _noise(0.10,0.09,460,1.6);
      break;
    default:
      _tone(300,180,0.15,0.18,"triangle");
  }
}
function sfxMobIdle(type){
  switch(type){
    case"cow":
      _tone(124,94,0.44,0.10,"triangle");
      setTimeout(()=>_tone(112,82,0.36,0.08,"triangle"),180);
      setTimeout(()=>_noise(0.14,0.05,280,1.2),60);
      break;
    case"pig":
      _tone(430,280,0.10,0.10,"square");
      setTimeout(()=>_tone(380,245,0.09,0.08,"square"),85);
      break;
    case"chicken":
      _tone(980,770,0.06,0.08,"square");
      setTimeout(()=>_tone(910,720,0.06,0.07,"square"),55);
      setTimeout(()=>_tone(840,660,0.05,0.06,"square"),110);
      break;
    case"sheep":
      _tone(250,205,0.30,0.10,"triangle");
      setTimeout(()=>_tone(235,190,0.24,0.08,"triangle"),120);
      break;
    default:
      _tone(190,140,0.24,0.08,"triangle");
  }
}
// Rain sound — looping noise node
let _rainNode=null,_rainGain=null;
function startRainSound(){
  if(_rainNode||!GS.sfx)return;
  try{
    const ctx=_getSfxCtx();
    const bufLen=ctx.sampleRate*2;
    const buf=ctx.createBuffer(1,bufLen,ctx.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<bufLen;i++)d[i]=Math.random()*2-1;
    const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;
    // Use bandpass centered around 800Hz for a softer rain sound, not a shrill hiss
    const bpf=ctx.createBiquadFilter();bpf.type="bandpass";bpf.frequency.value=800;bpf.Q.value=0.5;
    const lpf=ctx.createBiquadFilter();lpf.type="lowpass";lpf.frequency.value=2200;
    _rainGain=ctx.createGain();_rainGain.gain.value=0;
    _rainGain.connect(ctx.destination);
    src.connect(bpf);bpf.connect(lpf);lpf.connect(_rainGain);
    src.start();_rainNode=src;
  }catch(e){}
}
function stopRainSound(){
  if(!_rainNode)return;
  try{_rainNode.stop();} catch(e){}
  _rainNode=null;_rainGain=null;
}
function setRainVolume(vol){
  if(_rainGain) _rainGain.gain.setTargetAtTime(vol*(GS.sfx?1:0)*(GS.masterVolume/100)*0.18,_getSfxCtx().currentTime,0.8);
}

// ── Game Settings ─────────────────────────────────────────────
