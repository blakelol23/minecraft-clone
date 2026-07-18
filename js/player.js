/**
 * @module player
 * Spawn, save/load, pause/settings handlers
 * Lines 4178-4858 from game.monolith.html
 * Loaded as source text by main.js and evaluated in one shared scope.
 */

function spawnWorld(){
  for(const k of [...chunkMap.keys()])unloadChunk(k);
  colCache.clear();
  _villageCache=undefined;
  overrides.clear();
  waterLevels.clear();
  waterSources.clear();
  waterQueue.length=0;
  waterScheduled.clear();
  leafDecayQueue.length=0;
  for(const light of torchLights.values())scene.remove(light);
  torchLights.clear();
  if(Array.isArray(mobs))for(const mob of mobs.slice())_removeMob(mob);
  pendingMobRestoreState=null;
  lastStreamOx=null;lastStreamOz=null;
  const sp=findSpawn(0,0);
  player.pos.copy(sp);player.vel.set(0,0,0);player.onGround=true;
  player.safePos.copy(player.pos);
  if(pendingWorldRuntimeState){
    applyRuntimeWorldState(pendingWorldRuntimeState);
    pendingWorldRuntimeState=null;
  }
  genQueue.length=0;genSet.clear();
  dirtyQ.length=0;dirtySet.clear();
  activeChunkJob=null;
  const now=performance.now();
  lagDebug.startupUntil=now+2600;
  perfTuning.lowSamples=0;
  perfTuning.highSamples=0;
  perfTuning.lastAdjustAt=now;
  perfTuning.settleUntil=now+5200;
  chunkBuildTokenLastAt=now;
  chunkBuildTokens=chunkBuildTokenBurst();
  seedChunks();updateCamera(0.016);
  lagDebug.lastPlayerPos.copy(player.pos);
  lagDebug.lastCameraPos.copy(camera.position);
  lagDebug.lastFrameAt=performance.now();
}

function isSpawnGroundBlock(t){
  return isSolid(t)&&t!==BLOCK.LEAVES&&t!==BLOCK.CACTUS&&t!==BLOCK.GLASS&&t!==BLOCK.WATER&&t!==BLOCK.TORCH;
}

function isPreferredSpawnSurfaceBlock(t){
  return SPAWN_PREFERRED_SURFACES.has(t);
}

function isSpawnAirBlock(t){
  return t===BLOCK.AIR||t===BLOCK.TORCH;
}

function hasSpawnHazardNearby(x,y,z){
  for(let nx=x-1;nx<=x+1;nx++)for(let nz=z-1;nz<=z+1;nz++){
    const feet=getBlock(nx,y+1,nz);
    const head=getBlock(nx,y+2,nz);
    if(feet===BLOCK.WATER||head===BLOCK.WATER||feet===BLOCK.CACTUS||head===BLOCK.CACTUS)return true;
  }
  return false;
}

function spawnRoughnessPenalty(x,z,groundY){
  const n1=getCol(x+1,z).height;
  const n2=getCol(x-1,z).height;
  const n3=getCol(x,z+1).height;
  const n4=getCol(x,z-1).height;
  const rough=Math.max(
    Math.abs(n1-groundY),
    Math.abs(n2-groundY),
    Math.abs(n3-groundY),
    Math.abs(n4-groundY)
  );
  return rough*0.65;
}

function hasPreferredSpawnSupport(x,groundY,z){
  let preferredCount=0;
  for(let nx=x-1;nx<=x+1;nx++)for(let nz=z-1;nz<=z+1;nz++){
    const floor=getBlock(nx,groundY,nz);
    const feet=getBlock(nx,groundY+1,nz);
    if(feet===BLOCK.WATER)return false;
    if(isPreferredSpawnSurfaceBlock(floor))preferredCount++;
  }
  return preferredCount>=5;
}

function isSpawnCandidateSafe(x,groundY,z,requirePreferred=true){
  if(groundY<1||groundY>=S.worldH-3)return false;
  if(groundY<S.waterLevel+1)return false;
  const ground=getBlock(x,groundY,z);
  if(!isSpawnGroundBlock(ground))return false;
  if(requirePreferred&&!isPreferredSpawnSurfaceBlock(ground))return false;
  const feet=getBlock(x,groundY+1,z);
  const head=getBlock(x,groundY+2,z);
  if(!isSpawnAirBlock(feet)||!isSpawnAirBlock(head))return false;
  if(hasSpawnHazardNearby(x,groundY,z))return false;
  if(requirePreferred&&!hasPreferredSpawnSupport(x,groundY,z))return false;
  return true;
}

function findSpawnFallback(ox,oz,maxRing=120){
  let bestPreferred=null;
  let bestDry=null;
  for(let r=0;r<=maxRing;r++){
    const step=r>120?2:1;
    for(let x=ox-r;x<=ox+r;x+=step)for(let z=oz-r;z<=oz+r;z+=step){
      if(r>0&&Math.abs(x-ox)!==r&&Math.abs(z-oz)!==r)continue;
      const col=getCol(x,z);
      if(col.height<S.waterLevel+1)continue;
      const groundY=Math.min(S.worldH-3,Math.max(2,col.height));
      const dist=Math.hypot(x-ox,z-oz);
      const ground=getBlock(x,groundY,z);
      if(!bestDry||groundY>bestDry.groundY||(groundY===bestDry.groundY&&dist<bestDry.dist)){
        bestDry={x,z,groundY,dist};
      }
      if(isPreferredSpawnSurfaceBlock(ground)){
        if(!bestPreferred||groundY>bestPreferred.groundY||(groundY===bestPreferred.groundY&&dist<bestPreferred.dist)){
          bestPreferred={x,z,groundY,dist};
        }
      }
      if(!isSpawnCandidateSafe(x,groundY,z,true))continue;
      return new THREE.Vector3(x+.5,groundY+1.05,z+.5);
    }
  }
  if(bestPreferred)return new THREE.Vector3(bestPreferred.x+.5,bestPreferred.groundY+1.05,bestPreferred.z+.5);
  if(bestDry)return new THREE.Vector3(bestDry.x+.5,bestDry.groundY+1.05,bestDry.z+.5);
  return null;
}

function findSpawn(ox,oz){
  let best=null;
  const maxRing=S.worldPreset==="classic"?64:40;
  for(let r=0;r<=maxRing;r++){
    for(let x=ox-r;x<=ox+r;x++)for(let z=oz-r;z<=oz+r;z++){
      if(r>0&&Math.abs(x-ox)!==r&&Math.abs(z-oz)!==r)continue;

      const col=getCol(x,z);
      const topY=Math.min(S.worldH-3,Math.max(2,col.height+1));
      const minScanY=Math.max(1,col.height-8);
      let groundY=-1;

      for(let y=topY;y>=minScanY;y--){
        const t=getBlock(x,y,z);
        if(isSpawnGroundBlock(t)&&isPreferredSpawnSurfaceBlock(t)){
          groundY=y;
          break;
        }
      }
      if(groundY<1)continue;
      if(groundY<col.height-2)continue; // avoid cave floors below local surface
      if(!isSpawnCandidateSafe(x,groundY,z,true))continue;

      const dist=Math.hypot(x-ox,z-oz);
      const heightPenalty=Math.abs((groundY+1)-(S.waterLevel+6))*0.08;
      const roughPenalty=spawnRoughnessPenalty(x,z,groundY);
      const waterEdgePenalty=groundY<=S.waterLevel+2?3.8:0;
      const score=dist+heightPenalty+roughPenalty+waterEdgePenalty;

      if(!best||score<best.score)best={x,z,y:groundY+1.05,score};
    }
    if(best&&r>=5)break;
  }

  if(!best){
    const fallback=findSpawnFallback(ox,oz,S.worldPreset==="classic"?280:200);
    if(fallback)return fallback;
    const fb=getCol(ox,oz);
    const fy=Math.max(S.waterLevel+2,Math.min(S.worldH-3,fb.height+2));
    return new THREE.Vector3(ox+.5,fy+0.05,oz+.5);
  }
  return new THREE.Vector3(best.x+.5,best.y,best.z+.5);
}

// ═══════════════════════════════
//  GAME SETTINGS SYSTEM
// ═══════════════════════════════
const GS_FPS_OPTIONS=[0,30,60,120,144,240]; // 0 = Unlimited
let _gsSliderDrag=null;
var settingsPanel="pause";

function _cloneSlotForSave(slot){
  if(!slot||typeof slot!=="object")return null;
  const id=Math.round(Number(slot.id));
  if(!Number.isFinite(id)||id===BLOCK.AIR)return null;
  const next={id,count:Math.max(1,Math.min(64,Math.round(Number(slot.count)||1)))};
  if(Number.isFinite(slot.dur))next.dur=Math.max(0,Math.round(slot.dur));
  if(Number.isFinite(slot.maxDur))next.maxDur=Math.max(1,Math.round(slot.maxDur));
  return next;
}
function _writeSlotArray(targetSlots,sourceSlots){
  for(let i=0;i<targetSlots.length;i++){
    targetSlots[i]=Array.isArray(sourceSlots)?_cloneSlotForSave(sourceSlots[i]):null;
  }
}
function _safeNumber(v,fallback=0){
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}
function snapshotMobsForSave(){
  if(!Array.isArray(mobs)||!mobs.length)return [];
  const out=[];
  const maxSave=Math.max(16,Math.min(120,Math.round(_safeNumber(MOB_MAX,30))*2));
  for(const mob of mobs){
    if(!mob||mob.dying||!MOB_DEFS[String(mob.type||"")])continue;
    const px=_safeNumber(mob.pos?.x,NaN);
    const py=_safeNumber(mob.pos?.y,NaN);
    const pz=_safeNumber(mob.pos?.z,NaN);
    if(!Number.isFinite(px)||!Number.isFinite(py)||!Number.isFinite(pz))continue;
    const hpMax=Math.max(1,Math.round(_safeNumber(mob.maxHp,_safeNumber(mob.def?.maxHp,8))));
    out.push({
      type:String(mob.type),
      pos:{x:px,y:py,z:pz},
      hp:THREE.MathUtils.clamp(Math.round(_safeNumber(mob.hp,hpMax)),1,hpMax),
      maxHp:hpMax,
      noAI:mob.noAI===true,
      customName:typeof mob.customName==="string"?mob.customName.slice(0,80):"",
      isBeast:mob.isBeast===true
    });
    if(out.length>=maxSave)break;
  }
  return out;
}
function restoreMobsFromSave(list){
  if(!Array.isArray(mobs))return 0;
  const existing=mobs.slice();
  for(const mob of existing)_removeMob(mob);

  if(!Array.isArray(list)||!list.length)return 0;
  const maxRestore=Math.max(1,Math.round(_safeNumber(MOB_MAX,30)));
  let restored=0;

  for(const raw of list){
    if(restored>=maxRestore)break;
    if(!raw||typeof raw!=="object")continue;
    const type=String(raw.type||"");
    if(!MOB_DEFS[type])continue;

    const px=_safeNumber(raw.pos?.x,NaN);
    const py=_safeNumber(raw.pos?.y,NaN);
    const pz=_safeNumber(raw.pos?.z,NaN);
    if(!Number.isFinite(px)||!Number.isFinite(py)||!Number.isFinite(pz))continue;

    const col=getCol(Math.floor(px),Math.floor(pz));
    const minY=(col?.height??S.waterLevel)+1;
    const y=Math.max(THREE.MathUtils.clamp(py,1,S.worldH-2),minY);

    const spawned=spawnMob(type,px,y,pz,{noAI:raw.noAI===true});
    if(!spawned)continue;

    const hpMax=Math.max(1,Math.round(_safeNumber(raw.maxHp,_safeNumber(spawned.maxHp,_safeNumber(spawned.def?.maxHp,8)))));
    spawned.maxHp=hpMax;
    spawned.hp=THREE.MathUtils.clamp(Math.round(_safeNumber(raw.hp,hpMax)),1,hpMax);
    spawned.air=spawned.maxAir??MOB_MAX_AIR;
    spawned.drownTick=0;

    const customName=String(raw.customName||"").trim();
    if(customName)spawned.customName=customName.slice(0,80);
    spawned.isBeast=raw.isBeast===true;
    restored++;
  }

  if(restored>0)_mobSpawnTimer=2.2+Math.random()*2.4;
  return restored;
}
function tryRestorePendingMobs(){
  if(!Array.isArray(pendingMobRestoreState))return 0;
  if(!Array.isArray(mobs))return 0;
  const restored=restoreMobsFromSave(pendingMobRestoreState);
  pendingMobRestoreState=null;
  return restored;
}
function persistWorldCatalogEntry(){
  const now=Date.now();
  const worldName=(String(WORLD_META.worldName||"Overworld").trim()||"Overworld").slice(0,32);
  const seed=(String(WORLD_META.seedInput||S.seed||"").trim()||String(S.seed)).slice(0,64);
  const preset=normalizePresetValue(S.worldPreset);
  const renderDist=Math.max(2,Math.min(8,Math.round(Number(GS.renderDist)||3)));
  let worlds=[];
  try{
    const raw=JSON.parse(localStorage.getItem(WORLD_STORAGE_KEY)||"[]");
    if(Array.isArray(raw))worlds=raw.filter(w=>w&&typeof w==="object");
  }catch(e){}

  let idx=-1;
  if(WORLD_META.worldId)idx=worlds.findIndex(w=>String(w.id||"")===WORLD_META.worldId);
  if(idx<0){
    idx=worlds.findIndex(w=>
      String(w.worldName||"")===worldName&&
      String(w.seed||"")===seed&&
      normalizePresetValue(w.preset)===preset
    );
  }

  const existing=idx>=0?worlds[idx]:null;
  const id=(WORLD_META.worldId||String(existing?.id||("world-"+now.toString(36)+"-"+hashSeedString(worldName+seed+now).toString(36)))).slice(0,96);
  WORLD_META.worldId=id;

  const entry={
    ...(existing&&typeof existing==="object"?existing:{}),
    id,
    worldName,
    seed,
    preset,
    renderDist,
    createdAt:Number(existing?.createdAt)||now,
    updatedAt:now,
    lastPlayedAt:now
  };
  if(idx>=0)worlds[idx]=entry;
  else worlds.unshift(entry);

  try{
    localStorage.setItem(WORLD_STORAGE_KEY,JSON.stringify(worlds));
    localStorage.setItem(LAST_WORLD_ID_KEY,id);
    return true;
  }catch(e){
    return false;
  }
}
function saveRuntimeWorldState(){
  const payload={
    savedAt:Date.now(),
    seed:S.seed,
    preset:S.worldPreset,
    worldName:WORLD_META.worldName,
    player:{
      pos:{x:player.pos.x,y:player.pos.y,z:player.pos.z},
      vel:{x:player.vel.x,y:player.vel.y,z:player.vel.z},
      yaw:player.yaw,
      pitch:player.pitch,
      health:player.health,
      hunger:player.hunger,
      saturation:player.saturation,
      air:player.air,
      xp:player.xp,
      xpLevel:player.xpLevel,
      xpTotal:player.xpTotal,
      selIdx:player.selIdx
    },
    inv:{
      hotbar:hotbarSlots.map(_cloneSlotForSave),
      inventory:invSlots.map(_cloneSlotForSave)
    },
    mobs:snapshotMobsForSave(),
    worldTime
  };
  try{
    localStorage.setItem(worldStateStorageKey(),JSON.stringify(payload));
    return true;
  }catch(e){
    return false;
  }
}
function loadRuntimeWorldState(){
  try{
    const raw=localStorage.getItem(worldStateStorageKey());
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed!=="object")return null;
    return parsed;
  }catch(e){
    return null;
  }
}
function applyRuntimeWorldState(state){
  if(!state||typeof state!=="object")return false;
  const p=state.player&&typeof state.player==="object"?state.player:{};
  const pos=p.pos&&typeof p.pos==="object"?p.pos:null;
  if(pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.y)&&Number.isFinite(pos.z)){
    player.pos.set(pos.x,pos.y,pos.z);
    player.safePos.copy(player.pos);
  }
  const vel=p.vel&&typeof p.vel==="object"?p.vel:null;
  if(vel&&Number.isFinite(vel.x)&&Number.isFinite(vel.y)&&Number.isFinite(vel.z))player.vel.set(vel.x,vel.y,vel.z);
  else player.vel.set(0,0,0);
  if(Number.isFinite(p.yaw))player.yaw=p.yaw;
  if(Number.isFinite(p.pitch))player.pitch=THREE.MathUtils.clamp(p.pitch,-Math.PI*.48,Math.PI*.48);
  if(Number.isFinite(p.health))player.health=THREE.MathUtils.clamp(Math.round(p.health),0,player.maxHealth);
  if(Number.isFinite(p.hunger))player.hunger=THREE.MathUtils.clamp(Math.round(p.hunger),0,player.maxHunger);
  if(Number.isFinite(p.saturation))player.saturation=Math.max(0,Number(p.saturation));
  if(Number.isFinite(p.air))player.air=THREE.MathUtils.clamp(Math.round(p.air),0,player.maxAir);
  if(Number.isFinite(p.xp))player.xp=Math.max(0,Number(p.xp));
  if(Number.isFinite(p.xpLevel))player.xpLevel=Math.max(0,Math.round(p.xpLevel));
  if(Number.isFinite(p.xpTotal))player.xpTotal=Math.max(0,Math.round(p.xpTotal));
  if(Number.isFinite(state.worldTime))worldTime=Math.max(0,Number(state.worldTime));

  if(state.inv&&typeof state.inv==="object"){
    _writeSlotArray(hotbarSlots,state.inv.hotbar);
    _writeSlotArray(invSlots,state.inv.inventory);
  }
  pendingMobRestoreState=Array.isArray(state.mobs)?state.mobs:null;
  tryRestorePendingMobs();

  if(Number.isFinite(p.selIdx))player.selIdx=THREE.MathUtils.clamp(Math.round(p.selIdx),0,8);
  player.saturation=Math.min(player.saturation,player.hunger);
  const sx=Math.floor(player.pos.x),sy=Math.floor(player.pos.y)-1,sz=Math.floor(player.pos.z);
  if(!isSpawnCandidateSafe(sx,sy,sz,false)){
    const safe=findSpawn(sx,sz);
    player.pos.copy(safe);
    player.vel.set(0,0,0);
  }
  player.safePos.copy(player.pos);
  buildHotbarUI();
  buildInventoryUI();
  selectSlot(player.selIdx);
  return true;
}
function setSettingsPanel(panel){
  settingsPanel=panel==="options"?"options":"pause";
  const pausePanel=document.getElementById('pauseMenuWindow');
  const optionsPanel=document.getElementById('settingsWindow');
  if(pausePanel)pausePanel.classList.toggle('open',settingsPanel==="pause");
  if(optionsPanel)optionsPanel.classList.toggle('open',settingsPanel==="options");
  if(settingsPanel==="options")gsRefreshUI();
}
function pauseBackToGame(){
  closeSettings();
}
function pauseOpenOptions(){
  setSettingsPanel("options");
}
function pauseCloseOptions(){
  setSettingsPanel("pause");
}
function pausePlaceholder(text){
  showMsg(String(text||"Coming soon."),1200);
}
function pauseShowStatistics(){
  showMsg(
    `XYZ ${player.pos.x.toFixed(1)} / ${player.pos.y.toFixed(1)} / ${player.pos.z.toFixed(1)} | HP ${Math.round(player.health)}/${player.maxHealth} | Hunger ${Math.round(player.hunger)}/${player.maxHunger} | XP L${player.xpLevel}`,
    2000
  );
}
function pauseSaveGame(showNotice=true){
  const stateSaved=saveRuntimeWorldState();
  const listSaved=persistWorldCatalogEntry();
  gsSave();
  if(showNotice){
    if(stateSaved&&listSaved)showMsg("Game saved.",1000);
    else if(stateSaved||listSaved)showMsg("Game partially saved.",1300);
    else showMsg("Save failed.",1300);
  }
  return stateSaved||listSaved;
}
function pauseSaveAndQuitToTitle(){
  pauseSaveGame(false);
  settingsOpen=false;
  document.getElementById('settingsOverlay').classList.remove('open');
  showMsg("Saving and returning to title...",900);
  setTimeout(()=>{location.href="index.html";},220);
}

function openSettings(){
  settingsOpen=true;
  document.getElementById('settingsOverlay').classList.add('open');
  setSettingsPanel("pause");
  if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();
}
function closeSettings(){
  settingsOpen=false;
  document.getElementById('settingsOverlay').classList.remove('open');
  setSettingsPanel("pause");
  gsSave();
  setTimeout(()=>{if(!invOpen&&!tableOpen&&!chestOpen&&!furnaceOpen)safeRequestPointerLock();},80);
}
function settingsShowTab(tab){
  document.querySelectorAll('.sw-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));
  const idMap={video:'swVideo',sound:'swSound',controls:'swControls'};
  document.querySelectorAll('.sw-page').forEach(p=>p.classList.toggle('active',p.id===idMap[tab]));
}
function settingsCycleFPS(){
  const idx=GS_FPS_OPTIONS.indexOf(GS.fpsLimit);
  GS.fpsLimit=GS_FPS_OPTIONS[(idx+1)%GS_FPS_OPTIONS.length];
  const el=document.getElementById('sFPS');
  if(el)el.textContent=GS.fpsLimit===0?'Max Framerate: Unlimited':'Max Framerate: '+GS.fpsLimit+' fps';
  gsSave();
}
function settingsToggle(key){
  GS[key]=!GS[key];
  gsApply(key);
  gsRefreshBtn(key);
  gsSave();
}
function gsApply(key){
  switch(key){
    case 'shadows':
      renderer.shadowMap.enabled=GS.shadows;sun.castShadow=GS.shadows;
      if(GS.shadows)renderer.shadowMap.needsUpdate=true;break;
    case 'clouds':cloudGrp.visible=GS.clouds;break;
    case 'particles':
      if(!GS.particles){
        for(let i=particles.length-1;i>=0;i--)scene.remove(particles[i]);
        particles.length=0;
      }
      break;
    case 'viewBobbing':
      if(!GS.viewBobbing){player.bobT=0;player.footT=0;}
      break;
    case 'showFPS':document.getElementById('fpsCounter').style.display=GS.showFPS?'':'none';break;
    case 'sfx':break; // checked at spawn time via GS.sfx
    case 'fullscreen':
      if(GS.fullscreen&&!document.fullscreenElement)
        document.documentElement.requestFullscreen().catch(()=>{GS.fullscreen=false;gsRefreshBtn('fullscreen');});
      else if(!GS.fullscreen&&document.fullscreenElement)document.exitFullscreen();break;
  }
}
function gsApplyAll(){
  // Video
  S.renderDist=GS.renderDist;
  lastStreamOx=null;lastStreamOz=null;
  scene.fog.near=(GS.renderDist-1)*S.chunkSize;
  scene.fog.far=GS.renderDist*S.chunkSize*1.55;
  camera.fov=GS.fov;camera.updateProjectionMatrix();
  // brightness: lerp so 50% = original scene values
  ambLight.intensity=THREE.MathUtils.lerp(0.04,0.32,GS.brightness/100);
  hemiLight.intensity=THREE.MathUtils.lerp(0.6,2.1,GS.brightness/100);
  // Audio
  S.audioVolume=(GS.masterVolume/100)*(GS.musicVolume/100)*0.12;
  // Toggles
  ['shadows','clouds','particles','viewBobbing','showFPS','fullscreen','sfx'].forEach(k=>gsApply(k));
}
function gsRefreshBtn(key){
  const idMap={shadows:'sShadows',clouds:'sClouds',particles:'sParticles',viewBobbing:'sViewBob',showFPS:'sFPSDisp',fullscreen:'sFullscreen',sfx:'sSFX'};
  const el=document.getElementById(idMap[key]);if(!el)return;
  el.textContent=(_gsToggleLabels[key]||key)+': '+(GS[key]?'ON':'OFF');
}
function _fmtFovLabel(v){
  const iv=Math.round(v);
  return iv>=110?'Quake Pro':iv+'°';
}
function gsRefreshUI(){
  // Cycle buttons
  const fpsEl=document.getElementById('sFPS');
  if(fpsEl)fpsEl.textContent=GS.fpsLimit===0?'Max Framerate: Unlimited':'Max Framerate: '+GS.fpsLimit+' fps';
  // Toggle buttons
  Object.keys(_gsToggleLabels).forEach(k=>gsRefreshBtn(k));
  // Sliders
  gsSetSlider('sRD',GS.renderDist,2,8,v=>v+' chunks');
  gsSetSlider('sFOV',GS.fov,60,110,v=>_fmtFovLabel(v));
  gsSetSlider('sBright',GS.brightness,0,100,v=>v+'%');
  gsSetSlider('sVolMaster',GS.masterVolume,0,100,v=>v+'%');
  gsSetSlider('sVolMusic',GS.musicVolume,0,100,v=>v+'%');
  gsSetSlider('sSens',GS.mouseSens,0,100,v=>v+'%');
}
function gsSetSlider(id,val,min,max,fmt){
  const fill=document.getElementById(id+'Fill'),label=document.getElementById(id+'Label');
  if(!fill||!label)return;
  fill.style.width=((val-min)/(max-min)*100)+'%';
  label.textContent=fmt(Math.round(val));
}
// Slider drag setup — called once after DOM exists
function gsInitSliders(){
  function mk(id,min,max,step,onVal){
    const wrap=document.getElementById(id);if(!wrap)return;
    function hit(e){
      const r=wrap.getBoundingClientRect();
      const frac=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
      const v=Math.round((min+frac*(max-min))/step)*step;
      onVal(Math.max(min,Math.min(max,v)));
    }
    wrap.addEventListener('mousedown',e=>{_gsSliderDrag={hit};hit(e);e.stopPropagation();});
  }
  mk('sRD',2,8,1,v=>{
    GS.renderDist=v;S.renderDist=v;
    lastStreamOx=null;lastStreamOz=null;
    scene.fog.near=(v-1)*S.chunkSize;scene.fog.far=v*S.chunkSize*1.55;
    gsSetSlider('sRD',v,2,8,x=>x+' chunks');gsSave();
  });
  mk('sFOV',60,110,1,v=>{
    GS.fov=v;camera.fov=v;camera.updateProjectionMatrix();
    gsSetSlider('sFOV',v,60,110,x=>_fmtFovLabel(x));gsSave();
  });
  mk('sBright',0,100,1,v=>{
    GS.brightness=v;
    ambLight.intensity=THREE.MathUtils.lerp(0.04,0.32,v/100);
    hemiLight.intensity=THREE.MathUtils.lerp(0.6,2.1,v/100);
    gsSetSlider('sBright',v,0,100,x=>x+'%');gsSave();
  });
  mk('sVolMaster',0,100,1,v=>{
    GS.masterVolume=v;S.audioVolume=(v/100)*(GS.musicVolume/100)*0.12;
    Object.values(ambientAudio.tracks||{}).forEach(t=>{if(t&&!t.paused)t.volume=S.audioVolume;});
    gsSetSlider('sVolMaster',v,0,100,x=>x+'%');gsSave();
  });
  mk('sVolMusic',0,100,1,v=>{
    GS.musicVolume=v;S.audioVolume=(GS.masterVolume/100)*(v/100)*0.12;
    Object.values(ambientAudio.tracks||{}).forEach(t=>{if(t&&!t.paused)t.volume=S.audioVolume;});
    gsSetSlider('sVolMusic',v,0,100,x=>x+'%');gsSave();
  });
  mk('sSens',0,100,1,v=>{
    GS.mouseSens=v;gsSetSlider('sSens',v,0,100,x=>x+'%');gsSave();
  });
}
document.addEventListener('mousemove',e=>{if(_gsSliderDrag)_gsSliderDrag.hit(e);});
document.addEventListener('mouseup',()=>{_gsSliderDrag=null;});
document.addEventListener('fullscreenchange',()=>{GS.fullscreen=!!document.fullscreenElement;gsRefreshBtn('fullscreen');});
// Expose settings functions to global scope so HTML onclick attributes can reach them
// (script type="module" runs in its own scope — window assignment is required for inline handlers)
window.openSettings=openSettings;
window.closeSettings=closeSettings;
window.settingsShowTab=settingsShowTab;
window.settingsCycleFPS=settingsCycleFPS;
window.settingsToggle=settingsToggle;
window.pauseBackToGame=pauseBackToGame;
window.pauseOpenOptions=pauseOpenOptions;
window.pauseCloseOptions=pauseCloseOptions;
window.pausePlaceholder=pausePlaceholder;
window.pauseShowStatistics=pauseShowStatistics;
window.pauseSaveGame=pauseSaveGame;
window.pauseSaveAndQuitToTitle=pauseSaveAndQuitToTitle;
window.addEventListener("beforeunload",()=>{
  saveRuntimeWorldState();
  persistWorldCatalogEntry();
});
function gsSave(){
  try{localStorage.setItem('blockiecraft_settings',JSON.stringify(GS));}catch(e){}
}

// ═══════════════════════════════
//  PASSIVE MOB SYSTEM
// ═══════════════════════════════
const PIXEL=0.0625;
const MOB_DEFS={
  cow:{
    body:[12,10,8],head:[8,8,6],leg:[4,6,4],
    bodyColor:0xffffff,headColor:0xffffff,legColor:0xffffff,accentColor:0xffffff,snoutColor:0xd4b69e,
    torsoWScale:1.0,torsoDScale:1.75,scaleXZ:1.0,scaleY:1.0,
    idleSound:5,soundInt:14,speed:1.28,
    maxHp:10,maxSafeDrop:3,
    drop:{id:ITEM.RAW_MEAT,min:2,max:3},
    hitbox:{w:1.06,h:1.30,d:1.08}
  },
  pig:{
    body:[10,8,14],head:[8,8,8],leg:[4,6,4],snout:[4,3,2],
    bodyColor:0xffffff,headColor:0xffffff,legColor:0xffffff,accentColor:0xffffff,snoutColor:0xeda8b8,
    torsoWScale:1.0,torsoDScale:1.0,scaleXZ:0.92,scaleY:0.9,
    idleSound:6,soundInt:12,speed:1.22,
    maxHp:10,maxSafeDrop:3,
    drop:{id:ITEM.RAW_MEAT,min:1,max:2},
    hitbox:{w:0.94,h:0.94,d:0.98}
  },
  chicken:{
    body:[6,8,6],head:[6,6,6],leg:[2,6,2],beak:[2.4,1.4,1.4],
    bodyColor:0xffffff,headColor:0xffffff,legColor:0xffffff,accentColor:0xffffff,combColor:0xffffff,
    torsoWScale:1.0,torsoDScale:1.0,scaleXZ:0.56,scaleY:0.72,
    idleSound:8,soundInt:10,speed:1.35,
    maxHp:4,maxSafeDrop:2,
    drop:{id:ITEM.RAW_MEAT,min:1,max:1},
    hitbox:{w:0.62,h:0.82,d:0.62}
  },
  sheep:{
    body:[12,9,12],head:[7,7,7],leg:[3,7,3],snout:[5,4,3],
    bodyColor:0xffffff,headColor:0xffffff,legColor:0xffffff,accentColor:0xffffff,woolColor:0xffffff,snoutColor:0xbfae9f,
    torsoWScale:1.0,torsoDScale:1.22,scaleXZ:1.0,scaleY:0.98,
    woolPad:2.5,headWoolPad:1.9,
    idleSound:5,soundInt:16,speed:1.18,
    maxHp:8,maxSafeDrop:3,
    drop:{id:ITEM.RAW_MEAT,min:1,max:1},
    hitbox:{w:1.00,h:1.24,d:1.20}
  }
};
var MOB_TYPES=Object.keys(MOB_DEFS);
var mobs=[];
var MOB_MAX=30;
var MOB_SPAWN_RADIUS=28;
var MOB_DESPAWN_RADIUS=48;
const MOB_MELEE_HIT_PAD_XZ=0.10;
const MOB_MELEE_HIT_PAD_Y=0.06;
const MOB_NAV_EVAL_INTERVAL=0.14;
const MOB_NAV_TARGET_REACH=1.05;
const MOB_NAV_STUCK_MOVE_EPS=0.06;
const MOB_NAV_STUCK_TRIGGER=1.1;
const MOB_NAV_CANDIDATE_ANGLES=[0,0.22,-0.22,0.44,-0.44,0.72,-0.72,1.05,-1.05,1.36,-1.36,Math.PI];
const MOB_DEATH_DURATION=0.46;
const MOB_MAX_AIR=220;
const MOB_DROWN_INTERVAL=1.4;
const MOB_STARE_RANGE=4.6;
const MOB_STARE_STILL_TIME=0.72;
const MOB_STARE_LOCK_TIME=0.45;
const MOB_STARE_MAX_HOLD=1.35;
const MOB_STARE_COOLDOWN=2.2;
var _mobSpawnTimer=0;

