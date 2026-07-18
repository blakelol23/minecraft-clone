/**
 * @module ui
 * HUD bars, chat, commands, leaf decay helpers
 * Lines 10222-10780 from game.monolith.html
 * Loaded as source text by main.js and evaluated in one shared scope.
 */

function isSolid(t){return SOLID.has(t);}
function _waterAtWorld(px,py,pz){
  return getBlock(Math.floor(px),Math.floor(py),Math.floor(pz))===BLOCK.WATER;
}
/** 0..1 — how much of the sampled body volume is inside water (stable at block seams). */
function getWaterImmersion(){
  const px=player.pos.x,py=player.pos.y,pz=player.pos.z;
  const r=S.playerR*0.88;
  const yAnkle=py+0.1,yKnee=py+0.45,yChest=py+S.playerH*0.55,yChin=py+S.playerH-0.14;
  const ring=[
    [0,0],[r,0],[-r,0],[0,r],[0,-r],[r*0.65,r*0.65],[-r*0.65,r*0.65]
  ];
  let hit=0,tot=0;
  for(const[ox,oz]of ring){
    const x=px+ox,z=pz+oz;
    for(const yy of[yAnkle,yKnee,yChest,yChin]){
      tot++;
      if(_waterAtWorld(x,yy,z))hit++;
    }
  }
  return tot?hit/tot:0;
}
function waterAtFeet(){
  const px=player.pos.x,py=player.pos.y,pz=player.pos.z;
  const r=S.playerR*0.82,y=py+0.11;
  return _waterAtWorld(px,y,pz)||_waterAtWorld(px+r,y,pz)||_waterAtWorld(px-r,y,pz)||_waterAtWorld(px,y,pz+r)||_waterAtWorld(px,y,pz-r);
}
function headInWater(){
  const px=player.pos.x,pz=player.pos.z,ey=player.pos.y+S.eyeH,r=S.playerR*0.58;
  return _waterAtWorld(px,ey,pz)||_waterAtWorld(px+r,ey,pz)||_waterAtWorld(px-r,ey,pz)||_waterAtWorld(px,ey,pz+r)||_waterAtWorld(px,ey,pz-r);
}
function getHeldSlot(){
  return hotbarSlots[player.selIdx]||null;
}
function isEdibleSlot(slot){
  if(!slot)return false;
  return (ITEM_INFO[slot.id]?.food??0)>0;
}
function addExhaustion(amount){
  if(player.creative||amount<=0)return;
  player.saturation=Math.min(player.saturation,player.hunger);
  player.exhaustion+=amount;
  while(player.exhaustion>=4){
    player.exhaustion-=4;
    if(player.saturation>0)player.saturation=Math.max(0,player.saturation-1);
    else player.hunger=Math.max(0,player.hunger-1);
  }
}
function canEatHeld(){
  const slot=getHeldSlot();
  return isEdibleSlot(slot)&&player.hunger<player.maxHunger;
}
function consumeHeldFood(){
  const slot=getHeldSlot();
  if(!slot)return false;
  const info=ITEM_INFO[slot.id];
  if(!info||!info.food)return false;
  if(player.hunger>=player.maxHunger)return false;
  player.hunger=Math.min(player.maxHunger,player.hunger+info.food);
  player.saturation=Math.min(player.hunger,player.saturation+(info.saturation??0));
  slot.count--;
  if(slot.count<=0)hotbarSlots[player.selIdx]=null;
  buildHotbarUI();
  selectSlot(player.selIdx);
  _tone(460,360,0.09,0.14,"triangle");
  _noise(0.045,0.08,1200,1.2);
  return true;
}
const _lookDir=new THREE.Vector3();
const _fwdDir=new THREE.Vector3();
const _rightDir=new THREE.Vector3();
function lookDir(){return _lookDir.set(-Math.sin(player.yaw)*Math.cos(player.pitch),Math.sin(player.pitch),-Math.cos(player.yaw)*Math.cos(player.pitch));}
function fwdVec(){lookDir();_fwdDir.copy(_lookDir);_fwdDir.y=0;return _fwdDir.normalize();}
function rightVec(){return _rightDir.crossVectors(fwdVec(),UP).normalize();}
function showMsg(text,ms=1200){
  $msg.textContent=text;$msg.classList.add("show");
  clearTimeout(_msgTimer);_msgTimer=setTimeout(()=>$msg.classList.remove("show"),ms);
}

// ═══════════════════════════════
//  HEALTH & HUNGER BARS
// ═══════════════════════════════
var _prevHealth=-1,_prevMaxHealth=-1,_prevHunger=-1,_prevMaxHunger=-1,_prevSat=-1,_prevXp=-1,_prevXpLvl=-1,_prevAir=-1,_prevAirShow=false;
// XP thresholds by level (Minecraft-like: level 0-15 need 2×level+7 XP each)
function xpToNextLevel(lvl){return lvl<16?2*lvl+7:(lvl<31?5*lvl-38:9*lvl-158);}
function giveXp(amount,silent=false){
  if(amount<=0)return;
  player.xp+=amount;player.xpTotal+=amount;
  if(!silent)sfxXpPickup();
  let needed=xpToNextLevel(player.xpLevel);
  while(player.xp>=needed){player.xp-=needed;player.xpLevel++;needed=xpToNextLevel(player.xpLevel);}
}
function updateStatusBars(){
  const show=!invOpen&&!tableOpen&&!chestOpen&&!furnaceOpen&&player.mode==="first";
  const showAir=show&&!player.creative&&headInWater();
  $airBarWrap.style.display=showAir?"flex":"none";
  $healthBar.style.display=show?"flex":"none";
  $hungerBar.style.display=show?"flex":"none";
  $saturationBar.style.display=show?"flex":"none";
  $xpBarWrap.style.display=show?"flex":"none";
  $healthBar.classList.toggle("low",show&&!player.creative&&player.health<=6);
  if(showAir){
    const snapAir=Math.round(player.air*2)/2;
    if(!_prevAirShow||snapAir!==_prevAir){
      _prevAir=snapAir;
      drawAirBubbles($airBar,player.air,player.maxAir);
    }
  }
  _prevAirShow=showAir;
  if(!show)return;
  if(player.health!==_prevHealth||player.maxHealth!==_prevMaxHealth){
    _prevHealth=player.health;_prevMaxHealth=player.maxHealth;
    drawHearts($healthBar,player.health,player.maxHealth,0);
  }
  if(player.hunger!==_prevHunger||player.maxHunger!==_prevMaxHunger){
    _prevHunger=player.hunger;_prevMaxHunger=player.maxHunger;
    drawHearts($hungerBar,player.hunger,player.maxHunger,1);
  }
  const sat=THREE.MathUtils.clamp(Math.round(Math.min(player.maxHunger,player.hunger,Math.max(0,player.saturation))*2)/2,0,player.maxHunger);
  if(sat!==_prevSat||player.maxHunger!==_prevMaxHunger){
    _prevSat=sat;
    drawHearts($saturationBar,sat,player.maxHunger,1,"outline");
  }
  if(player.xp!==_prevXp||player.xpLevel!==_prevXpLvl){
    _prevXp=player.xp;_prevXpLvl=player.xpLevel;
    const needed=xpToNextLevel(player.xpLevel);
    $xpFill.style.width=`${Math.min(100,player.xp/needed*100).toFixed(1)}%`;
    $xpLevelLabel.textContent=player.xpLevel;
  }
}
function updateHudOverlays(){
  const show=!invOpen&&!tableOpen&&!chestOpen&&!furnaceOpen&&player.mode==="first";
  const atkWrap=$attackFill.parentElement;
  atkWrap.style.display=show?"block":"none";
  if(!show){
    $hurtOverlay.style.opacity="0";
    $underwaterOverlay.style.opacity="0";
    $underwaterOverlay.style.filter="";
    $underwaterSurface.style.opacity="0";
    return;
  }
  const hurtAge=performance.now()-(player.lastHurtOverlayAt||0);
  const hurtA=THREE.MathUtils.clamp(1-hurtAge/420,0,1);
  $hurtOverlay.style.opacity=(hurtA*0.95).toFixed(3);

  const uwTarget=headInWater()?1:0;
  player.underFx=THREE.MathUtils.damp(player.underFx||0,uwTarget,uwTarget>0.5?6.8:4.6,1/60);
  const uwPulse=0.95+Math.sin(clock.elapsedTime*1.4)*0.05;
  const uwAlpha=THREE.MathUtils.clamp((player.underFx||0)*0.42*uwPulse,0,0.5);
  $underwaterOverlay.style.opacity=uwAlpha.toFixed(3);
  $underwaterOverlay.style.filter=`saturate(${(1.0+(player.underFx||0)*0.2).toFixed(2)})`;

  const lookUp=THREE.MathUtils.clamp(Math.sin(player.pitch)*0.78+0.22,0,1);
  const surfAlpha=THREE.MathUtils.clamp((player.underFx||0)*(0.14+lookUp*0.54),0,0.66);
  const surfBob=(Math.sin(clock.elapsedTime*1.9)*1.6).toFixed(2);
  const surfScale=(1.016+Math.sin(clock.elapsedTime*0.65)*0.006).toFixed(3);
  $underwaterSurface.style.opacity=surfAlpha.toFixed(3);
  $underwaterSurface.style.transform=`translateY(${surfBob}px) scale(${surfScale})`;

  const atkCd=THREE.MathUtils.clamp(iState.attackT/0.32,0,1);
  $attackFill.style.transform=`scaleX(${atkCd.toFixed(3)})`;
  $attackFill.style.background=atkCd>=0.98
    ?"linear-gradient(90deg,#8fe13b,#d6ff7a)"
    :"linear-gradient(90deg,#e26f24,#ffd66a)";
}
function drawHearts(el,val,max,type,mode="fill"){
  el.innerHTML="";
  const hearts=max/2;
  const SC=2; // scale 2× for bigger icons
  for(let i=0;i<hearts;i++){
    const cv=document.createElement("canvas");cv.width=cv.height=9*SC;cv.className=type===0?"heart":"food";
    const ctx=cv.getContext("2d");
    ctx.scale(SC,SC);
    const full=val>=(i*2+2),half=!full&&val>=(i*2+1);
    if(type===0) drawHeart(ctx,full,half);
    else if(mode==="outline") drawFoodOutline(ctx,full,half);
    else drawFood(ctx,full,half);
    el.appendChild(cv);
  }
}
function drawAirBubbles(el,air,maxAir){
  el.innerHTML="";
  const bubbles=10;
  const units=THREE.MathUtils.clamp((air/Math.max(1,maxAir))*bubbles,0,bubbles);
  const SC=2;
  for(let i=0;i<bubbles;i++){
    const cv=document.createElement("canvas");
    cv.width=cv.height=9*SC;
    cv.className="air";
    const ctx=cv.getContext("2d");
    ctx.scale(SC,SC);
    const full=units>=i+1;
    const half=!full&&units>=i+0.5;
    drawAirBubble(ctx,full,half);
    el.appendChild(cv);
  }
}
function drawAirBubble(ctx,full,half){
  const bubble=[
    [0,0,1,1,1,0,0],
    [0,1,1,0,1,1,0],
    [1,1,0,0,0,1,1],
    [1,0,0,0,0,0,1],
    [1,1,0,0,0,1,1],
    [0,1,1,0,1,1,0],
    [0,0,1,1,1,0,0],
  ];
  const lit=full||half;
  const fillCol=lit?"#bee8ff":"#18283a";
  const shadeCol=lit?"#76bce2":"#0d1723";
  for(let r=0;r<bubble.length;r++)for(let c=0;c<bubble[r].length;c++){
    if(!bubble[r][c])continue;
    let col=(r>=4)?shadeCol:fillCol;
    if(half&&c>=4)col="#18283a";
    ctx.fillStyle=col;
    ctx.fillRect(c+1,r+1,1,1);
  }
  if(lit){
    ctx.fillStyle="#f3fbff";
    ctx.fillRect(3,2,1,1);
    ctx.fillRect(2,3,1,1);
  }
}
function drawHeart(ctx,full,half){
  // Background (empty heart outline)
  ctx.fillStyle="#555";
  const pts=[[1,2],[2,1],[3,0],[4,0],[5,1],[4,2],[3,3],[5,2],[6,1],[7,0],[8,0],[8,1],[7,2],[6,3],[5,4],[4,5],[3,6],[2,5],[1,4]];
  // Simple pixel heart
  const heart=[[0,1,1,0,0,0,1,1,0],[1,1,1,1,0,1,1,1,1],[1,1,1,1,1,1,1,1,1],[0,1,1,1,1,1,1,1,0],[0,0,1,1,1,1,1,0,0],[0,0,0,1,1,1,0,0,0],[0,0,0,0,1,0,0,0,0]];
  const col=full?"#ff0000":half?"#ff0000":"#222";
  const shad=full?"#aa0000":half?"#aa0000":"#111";
  for(let r=0;r<heart.length;r++)for(let c=0;c<heart[r].length;c++){
    if(!heart[r][c])continue;
    ctx.fillStyle=(r>=heart.length-2)?shad:col;
    if(half&&c>=5&&!full)ctx.fillStyle="#222";
    ctx.fillRect(c,r,1,1);
  }
  if(half){
    const halfHeart=[[0,1,1,0],[1,1,1,1],[1,1,1,1],[0,1,1,1],[0,0,1,1],[0,0,0,1],[0,0,0,0]];
    for(let r=0;r<halfHeart.length;r++)for(let c=0;c<halfHeart[r].length;c++){
      if(!halfHeart[r][c])continue;
      ctx.fillStyle=(r>=halfHeart.length-2)?"#aa0000":"#ff0000";
      ctx.fillRect(c,r,1,1);
    }
  }
}
function drawFood(ctx,full,half){
  // Chicken leg / food icon (simplified)
  const col=full?"#c8782a":half?"#c8782a":"#444";
  const hl=full?"#e8a85a":half?"#e8a85a":"#333";
  const shape=getFoodIconShape();
  for(let r=0;r<shape.length;r++)for(let c=0;c<shape[r].length;c++){
    if(!shape[r][c])continue;
    ctx.fillStyle=(r<=1)?hl:col;
    if(half&&c>=4&&r<4&&!full)ctx.fillStyle="#333";
    ctx.fillRect(c,r,1,1);
  }
}

function getFoodIconShape(){
  return [
    [0,0,1,1,1,1,0,0,0],[0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,0],[0,0,1,1,1,1,1,1,0],
    [0,0,0,1,1,1,1,0,0],[0,0,0,0,1,1,0,0,0],[0,0,0,0,1,1,0,0,0],[0,0,0,0,0,1,0,0,0]
  ];
}

function drawFoodOutline(ctx,full,half){
  const edgeA="#ffe56f";
  const edgeB="#d8a92a";
  const shape=getFoodIconShape();
  for(let r=0;r<shape.length;r++)for(let c=0;c<shape[r].length;c++){
    if(!shape[r][c])continue;
    if(half&&c>=4&&r<4&&!full)continue;
    const edge=
      r===0||r===shape.length-1||c===0||c===shape[r].length-1||
      !shape[r-1]?.[c]||!shape[r+1]?.[c]||!shape[r]?.[c-1]||!shape[r]?.[c+1];
    if(!edge)continue;
    ctx.fillStyle=(r<=1)?edgeA:edgeB;
    ctx.fillRect(c,r,1,1);
  }
}

// ═══════════════════════════════
//  LEAF DECAY
// ═══════════════════════════════
function scheduleLeafDecay(x,y,z){
  leafDecayQueue.push({x,y,z,t:clock.elapsedTime+2+Math.random()*3});
}
function updateLeafDecay(dt){
  leafDecayTimer+=dt;
  if(leafDecayTimer<LEAF_DECAY_INTERVAL)return;
  leafDecayTimer=0;
  const now=clock.elapsedTime;
  let write=0;
  const toCheck=[];
  for(let i=0;i<leafDecayQueue.length;i++){
    const e=leafDecayQueue[i];
    if(e.t<=now)toCheck.push(e); else leafDecayQueue[write++]=e;
  }
  leafDecayQueue.length=write;
  for(const{x,y,z}of toCheck){
    if(getBlock(x,y,z)!==BLOCK.LEAVES)continue;
    if(!leafHasNearbyLog(x,y,z)){
      setBlock(x,y,z,BLOCK.AIR);
      // Don't drop anything - natural decay
    }
  }
}
const _leafDirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
function leafHasNearbyLog(lx,ly,lz){
  const visited=new Set();
  const q=[lx,ly,lz,0];
  let head=0;
  while(head<q.length){
    const x=q[head++],y=q[head++],z=q[head++],d=q[head++];
    const k=blockKey(x,y,z);
    if(visited.has(k))continue;
    visited.add(k);
    const b=getBlock(x,y,z);
    if(b===BLOCK.WOOD)return true;
    if(d>=LEAF_DECAY_RADIUS)continue;
    if(b!==BLOCK.LEAVES&&b!==BLOCK.WOOD&&d>0)continue;
    for(let i=0;i<6;i++){
      q.push(x+_leafDirs[i][0],y+_leafDirs[i][1],z+_leafDirs[i][2],d+1);
    }
  }
  return false;
}
// Trigger leaf decay when a wood block is broken near leaves
function triggerNearbyLeafDecay(x,y,z){
  for(let dx=-LEAF_DECAY_RADIUS;dx<=LEAF_DECAY_RADIUS;dx++)
  for(let dy=-LEAF_DECAY_RADIUS;dy<=LEAF_DECAY_RADIUS;dy++)
  for(let dz=-LEAF_DECAY_RADIUS;dz<=LEAF_DECAY_RADIUS;dz++){
    if(Math.abs(dx)+Math.abs(dy)+Math.abs(dz)>LEAF_DECAY_RADIUS)continue;
    if(getBlock(x+dx,y+dy,z+dz)===BLOCK.LEAVES)
      scheduleLeafDecay(x+dx,y+dy,z+dz);
  }
}

// ═══════════════════════════════
//  CHAT SYSTEM
// ═══════════════════════════════
const chatHistory=[];
const ALL_COMMAND_ITEMS=[
  ...Object.entries(BLOCK_INFO).map(([id,info])=>({id:+id,name:info.name.toLowerCase().replace(/ /g,'_')})),
  ...Object.entries(TOOL_INFO).map(([id,info])=>({id:+id,name:info.name.toLowerCase().replace(/ /g,'_')})),
  ...Object.entries(ITEM_INFO).map(([id,info])=>({id:+id,name:info.name.toLowerCase().replace(/ /g,'_')})),
];

function openChat(prefix=""){
  chatOpen=true;
  $chatInputWrap.classList.add("open");
  $chatInput.value=prefix;
  setTimeout(()=>$chatInput.focus(),10);
  if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();
  updateSuggestions();
}
function closeChat(){
  chatOpen=false;
  $chatInputWrap.classList.remove("open");
  $chatSuggest.classList.remove("show");
  $chatInput.value="";
  suggestIdx=-1;
  setTimeout(()=>{if(!invOpen&&!tableOpen&&!chestOpen&&!furnaceOpen&&!settingsOpen)safeRequestPointerLock();},80);
}
function submitChat(){
  const raw=$chatInput.value.trim();
  if(!raw){closeChat();return;}
  processCommand(raw);
  closeChat();
}
function _getCommandSpawnPos(dist=3.5){
  const sx=player.pos.x-Math.sin(player.yaw)*dist;
  const sz=player.pos.z-Math.cos(player.yaw)*dist;
  const col=getCol(Math.floor(sx),Math.floor(sz));
  const sy=col?col.height+1:player.pos.y;
  return{sx,sy,sz};
}
function processCommand(raw){
  if(!raw.startsWith("/")){addChatLine(`Unknown: ${raw}`,"#aaa");return;}
  const parts=raw.slice(1).split(/\s+/);
  const cmd=parts[0].toLowerCase();
  if(cmd==="give"){
    const itemName=(parts[1]||"").toLowerCase();
    const amount=Math.max(1,Math.min(64,parseInt(parts[2])||1));
    const entry=ALL_COMMAND_ITEMS.find(e=>e.name===itemName||e.name.includes(itemName));
    if(!entry){addChatLine(`Unknown item: ${parts[1]}`,"#f88");return;}
    addToInventory2(mkItem(entry.id,amount));
    addChatLine(`Gave ${amount}× ${ALL_COMMAND_ITEMS.find(e=>e.id===entry.id)?.name??entry.id}`,"#aaffaa");
  } else if(cmd==="spawn"){
    const mobName=(parts[1]||"").toLowerCase();
    // Spawn in front of the player at ground level
    const{sx,sy,sz}=_getCommandSpawnPos(3.5);
    if(mobName==="chicken2"){
      if(!mobs||mobs.length>=MOB_MAX){addChatLine("Mob cap reached","#f88");return;}
      spawnMob("chicken",sx,sy,sz);
      const spawned=mobs[mobs.length-1];
      if(spawned){spawned.customName="donquavious giggleshit the third";spawned.isBeast=false;}
      addChatLine("donquavious giggleshit the third has arrived.","#aaffaa");
    } else if(MOB_TYPES.includes(mobName)){
      spawnMob(mobName,sx,sy,sz);
      addChatLine(`Spawned ${mobName}`,"#aaffaa");
    } else {
      addChatLine(`Unknown mob: ${parts[1]}. Try: ${[...MOB_TYPES,"chicken2"].join(", ")}`,"#f88");
    }
  } else if(cmd==="spawnstatic"||cmd==="spawn_static"){
    const mobName=(parts[1]||"").toLowerCase();
    if(!MOB_TYPES.includes(mobName)){
      addChatLine(`Unknown animal: ${parts[1]}. Try: ${MOB_TYPES.join(", ")}`,"#f88");
      return;
    }
    const{sx,sy,sz}=_getCommandSpawnPos(3.5);
    spawnMob(mobName,sx,sy,sz,{noAI:true});
    addChatLine(`Spawned static ${mobName} (no AI)`,"#aaffaa");
  } else if(cmd==="clear"){
    for(let i=0;i<27;i++)invSlots[i]=null;
    for(let i=0;i<9;i++)hotbarSlots[i]=null;
    buildHotbarUI();selectSlot(player.selIdx);
    addChatLine("Cleared inventory","#aaffaa");
  } else if(cmd==="tp"){
    const nx=parseFloat(parts[1]),ny=parseFloat(parts[2]),nz=parseFloat(parts[3]);
    if(!isNaN(nx)&&!isNaN(ny)&&!isNaN(nz)){
      player.pos.set(nx,ny,nz);player.vel.set(0,0,0);
      addChatLine(`Teleported to ${nx} ${ny} ${nz}`,"#aaffaa");
    }else addChatLine("Usage: /tp <x> <y> <z>","#f88");
  } else if(cmd==="time"){
    if(parts[1]==="day")worldTime=0;
    else if(parts[1]==="night")worldTime=S.dayPhaseLen/S.dayLen;
    else{addChatLine("Usage: /time day|night","#f88");return;}
    syncAmbientAudio(true);
    addChatLine(`Set time to ${parts[1]}`,"#aaffaa");
  } else if(cmd==="heal"){
    const amt=parts[1]===undefined?player.maxHealth:Math.max(1,Math.floor(Number(parts[1])||0));
    player.health=Math.min(player.maxHealth,player.health+amt);
    addChatLine(`Healed to ${player.health}/${player.maxHealth}`,"#aaffaa");
  } else if(cmd==="kill"){
    damagePlayer(player.maxHealth+999,"kill");
    addChatLine("Killed player","#ff8888");
  } else if(cmd==="seed"){
    addChatLine(`Seed: ${S.seed} · Input: ${WORLD_META.seedInput} · Preset: ${currentWorldPreset().name}`,"#aaddff");
  } else if(cmd==="gamemode"){
    const mode=(parts[1]||"").toLowerCase();
    if(mode==="creative"||mode==="c"){
      player.creative=true;
      addChatLine("Set gamemode to creative","#aaffaa");
    } else if(mode==="survival"||mode==="s"){
      player.creative=false;
      addChatLine("Set gamemode to survival","#aaffaa");
    } else {
      addChatLine("Usage: /gamemode creative|survival","#f88");
    }
  } else if(cmd==="xp"){
    const amt=Math.floor(Number(parts[1])||0);
    if(!Number.isFinite(amt)||amt===0){addChatLine("Usage: /xp <amount>","#f88");return;}
    if(amt>0){giveXp(amt);addChatLine(`Gave ${amt} XP`,"#aaffaa");}
    else {
      player.xp=Math.max(0,player.xp+amt);
      while(player.xp<0&&player.xpLevel>0){
        player.xpLevel--;
        player.xp+=xpToNextLevel(player.xpLevel);
      }
      if(player.xp<0)player.xp=0;
      addChatLine(`Adjusted XP by ${amt}`,"#aaffaa");
    }
  } else {
    addChatLine(`Unknown command: /${cmd}`,"#f88");
  }
}
let _chatFadeTimer=null;
function addChatLine(text,color="#fff"){
  const div=document.createElement("div");div.className="chat-line";
  div.style.color=color;div.textContent=text;
  $chatLog.insertBefore(div,$chatLog.firstChild);
  // Keep max 8 lines
  while($chatLog.children.length>8)$chatLog.removeChild($chatLog.lastChild);
  clearTimeout(_chatFadeTimer);
  _chatFadeTimer=setTimeout(()=>{
    [...$chatLog.children].forEach(c=>c.classList.add("fade"));
    setTimeout(()=>{
      [...$chatLog.children].forEach(c=>{if(c.classList.contains("fade"))c.remove();});
    },400);
  },6000);
}
function updateChatLog(){}// Chat lines self-manage via timers

function updateSuggestions(){
  const val=$chatInput.value;
  $chatSuggest.innerHTML="";
  suggestIdx=-1;
  const ALL_SPAWN_MOBS=[...MOB_TYPES,"chicken2"].map(n=>({name:n}));
  const ALL_STATIC_MOBS=[...MOB_TYPES].map(n=>({name:n}));
  const COMMANDS=["/give","/spawn","/spawnstatic","/spawn_static","/clear","/tp","/time","/heal","/kill","/seed","/gamemode","/xp"];
  if(val.startsWith("/")&&!val.includes(" ")){
    const pv=val.toLowerCase();
    const matches=COMMANDS.filter(c=>c.startsWith(pv)).slice(0,8);
    if(!matches.length){$chatSuggest.classList.remove("show");return;}
    matches.forEach(m=>{
      const d=document.createElement("div");d.className="suggest-item";
      d.textContent=m;
      d.addEventListener("mousedown",e=>{e.preventDefault();$chatInput.value=`${m} `;$chatSuggest.classList.remove("show");$chatInput.focus();});
      $chatSuggest.appendChild(d);
    });
    $chatSuggest.classList.add("show");
    return;
  }
  if(val.startsWith("/spawn ")){
    const partial=val.slice(7).toLowerCase();
    const matches=ALL_SPAWN_MOBS.filter(e=>e.name.includes(partial)).slice(0,8);
    if(!matches.length){$chatSuggest.classList.remove("show");return;}
    matches.forEach(m=>{
      const d=document.createElement("div");d.className="suggest-item";
      d.textContent=m.name;
      d.addEventListener("mousedown",e=>{e.preventDefault();$chatInput.value=`/spawn ${m.name}`;$chatSuggest.classList.remove("show");$chatInput.focus();});
      $chatSuggest.appendChild(d);
    });
    $chatSuggest.classList.add("show");return;
  }
  if(val.startsWith("/spawnstatic ")||val.startsWith("/spawn_static ")){
    const isUnderscore=val.startsWith("/spawn_static ");
    const prefixLen=isUnderscore?14:13;
    const cmdPrefix=isUnderscore?"/spawn_static ":"/spawnstatic ";
    const partial=val.slice(prefixLen).toLowerCase();
    const matches=ALL_STATIC_MOBS.filter(e=>e.name.includes(partial)).slice(0,8);
    if(!matches.length){$chatSuggest.classList.remove("show");return;}
    matches.forEach(m=>{
      const d=document.createElement("div");d.className="suggest-item";
      d.textContent=m.name;
      d.addEventListener("mousedown",e=>{e.preventDefault();$chatInput.value=`${cmdPrefix}${m.name}`;$chatSuggest.classList.remove("show");$chatInput.focus();});
      $chatSuggest.appendChild(d);
    });
    $chatSuggest.classList.add("show");return;
  }
  if(!val.startsWith("/give ")){$chatSuggest.classList.remove("show");return;}
  const partial=val.slice(6).toLowerCase();
  if(!partial){$chatSuggest.classList.remove("show");return;}
  const matches=ALL_COMMAND_ITEMS.filter(e=>e.name.includes(partial)).slice(0,8);
  if(!matches.length){$chatSuggest.classList.remove("show");return;}
  matches.forEach((m,i)=>{
    const d=document.createElement("div");d.className="suggest-item";
    d.textContent=m.name;
    d.addEventListener("mousedown",e=>{e.preventDefault();$chatInput.value=`/give ${m.name} `;$chatSuggest.classList.remove("show");$chatInput.focus();});
    $chatSuggest.appendChild(d);
  });
  $chatSuggest.classList.add("show");
}
function moveSuggest(dir){
  const items=[...$chatSuggest.querySelectorAll(".suggest-item")];
  if(!items.length)return;
  items.forEach(i=>i.classList.remove("sel"));
  suggestIdx=((suggestIdx+dir)+items.length)%items.length;
  items[suggestIdx].classList.add("sel");
}
function applySuggestion(){
  const sel=$chatSuggest.querySelector(".suggest-item.sel");
  if(!sel)return;
  $chatInput.value=`/give ${sel.textContent} `;
  $chatSuggest.classList.remove("show");
}
$chatInput.addEventListener("input",updateSuggestions);
