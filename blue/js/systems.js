/**
 * @module systems
 * Game loop, input, player movement, water, particles, ambient
 * Lines 6053-8454 from game.monolith.html
 * Loaded as source text by main.js and evaluated in one shared scope.
 */

function animate(){
  requestAnimationFrame(animate);
  const frameStart=performance.now();
  _frameSerial++;
  if(document.hidden&&f3.pauseOnLostFocus){lagDebug.lastFrameAt=frameStart;return;}
  // FPS cap: skip rendering frames that arrive too early
  if(GS.fpsLimit>0&&frameStart-_fpsCapLastTime<1000/GS.fpsLimit)return;
  _fpsCapLastTime=frameStart;
  const rawDtMs=frameStart-lagDebug.lastFrameAt;
  lagDebug.lastFrameAt=frameStart;
  if(rawDtMs>1000){resetLagBaselines(800);return;}
  const dt=Math.min(clock.getDelta(),.05);
  const motionDt=rawDtMs>=lagDebug.schedulerWarnMs?0:Math.min(dt,.02);
  const perfPressure=chunkQueuePressure()>8||lagDebug.lastFrameMs>22||frameStart<lagDebug.startupUntil;
  const timings={};
  updateFpsCounter(dt);
  const shadowInterval=perfPressure?0.96:SHADOW_UPDATE_INTERVAL;
  if(clock.elapsedTime-lastShadowUpdate>=shadowInterval){renderer.shadowMap.needsUpdate=true;lastShadowUpdate=clock.elapsedTime;}
  let mark=performance.now();
  updateDayNight(dt);updateClouds(dt);updateRain(dt);updateTorchFlicker(clock.elapsedTime);processGenQueue();
  if(!window._freezeWater&&waterMergeMat&&waterMergeMat.userData.shader)
    waterMergeMat.userData.shader.uniforms.uWaterTime.value+=dt*1.42;
  timings.world=performance.now()-mark;
  mark=performance.now();
  updatePlayer(motionDt);streamChunks();
  timings.player=performance.now()-mark;
  mark=performance.now();
  doRaycast();doBreaking(dt);updateWater(dt);updateFurnaces(dt);
  timings.interact=performance.now()-mark;
  mark=performance.now();
  if(!perfPressure||(_frameSerial&1)===0){
    updateParticles(dt);updateDropItems(dt);updateMobs(dt);
  }else{
    updateMobs(Math.min(dt,0.012));
  }
  animatePlayerModel(motionDt);updateFPArm(motionDt);
  timings.anim=performance.now()-mark;
  mark=performance.now();
  updateCamera(motionDt);updateStats();animateChunks();flushDirty();
  timings.camera=performance.now()-mark;
  mark=performance.now();
  updateLeafDecay(dt);updateStatusBars();updateHudOverlays();updateChatLog();updateF3Screen();updateNameTags();
  if(furnaceOpen)refreshFurnaceUI();
  timings.ui=performance.now()-mark;
  mark=performance.now();
  renderer.clear();
  renderer.render(scene,camera);
  timings.render=performance.now()-mark;
  if(player.mode==="first"){
    mark=performance.now();
    renderer.clearDepth();
    renderer.render(hudScene,hudCam);
    timings.hud=performance.now()-mark;
  }
  if(invOpen){
    const imd=invPlayerModel.userData;
    const it=clock.elapsedTime;
    invPlayerModel.rotation.y=-0.3+Math.sin(it*.5)*.015;
    imd.head.rotation.order='YXZ';
    imd.head.rotation.y=_invMX;
    imd.head.rotation.x=_invMY;
    const isw=Math.sin(it*.9)*.04;
    imd.lAP.rotation.x=isw;imd.lAP.rotation.y=-0.08;imd.lAP.rotation.z=-0.08;
    imd.rAP.rotation.x=-isw;imd.rAP.rotation.y=0.08;imd.rAP.rotation.z=0.08;
    imd.lLP.rotation.x=0;imd.rLP.rotation.x=0;
    imd.bodyMesh.rotation.x=0;imd.bodyMesh.rotation.z=0;
    imd.hBlock.visible=false;
    if(imd.hTorch)imd.hTorch.visible=false;
    if(imd.hBucket)imd.hBucket.visible=false;
    if(imd.hIcon)imd.hIcon.visible=false;
    invRenderer.render(invScene,invCam);
  }
  const totalFrameMs=performance.now()-frameStart;
  lagDebug.lastFrameMs=totalFrameMs;
  adjustPerformanceBudget(totalFrameMs);
  checkLagDebug(rawDtMs,totalFrameMs,dt,timings);
}

// ═══════════════════════════════
//  CAMERA — fixed jitter & teleport
// ═══════════════════════════════
function updateCamera(dt){
  // Decay the step-up visual offset — camera glides up smoothly over ~0.12s
  if(player.stepSmoothOffset>0){
    const decay=Math.min(player.stepSmoothOffset,dt*8);
    player.stepSmoothOffset-=decay;
    if(player.stepSmoothOffset<0.001)player.stepSmoothOffset=0;
  }
  const smoothY=player.stepSmoothOffset||0;
  _eye.set(player.pos.x,player.pos.y+S.eyeH-smoothY,player.pos.z);
  const hspd=Math.hypot(player.vel.x,player.vel.z);
  const bob=player.onGround&&GS.viewBobbing?Math.sin(player.bobT)*Math.min(hspd*.0032,.014):0;

  // ── Sprint FOV zoom (Minecraft: +10° while sprinting, smoothed) ──
  const sprintFovBonus=player.sprinting&&!player.sneaking&&hspd>S.walkSpeed*0.8?10:0;
  const targetFov=GS.fov+sprintFovBonus;
  if(Math.abs(camera.fov-targetFov)>0.05){
    camera.fov=THREE.MathUtils.damp(camera.fov,targetFov,8,dt);
    camera.updateProjectionMatrix();
  }

  if(player.mode==="first"){
    camera.position.copy(_eye);
    camera.position.y+=bob;
    camera.rotation.order="YXZ";
    camera.rotation.set(player.pitch,player.yaw,0,"YXZ");
    hudCam.position.copy(camera.position);
    hudCam.quaternion.copy(camera.quaternion);
  } else {
    const sinY=Math.sin(player.yaw),cosY=Math.cos(player.yaw);
    const sinP=Math.sin(player.pitch),cosP=Math.cos(player.pitch);
    const lx=-sinY*cosP,ly=sinP,lz=-cosY*cosP;
    if(player.mode==="third"){
      _ideal.set(_eye.x-lx*S.camDist,_eye.y-ly*S.camDist,_eye.z-lz*S.camDist);
    } else {
      // Front view: camera in front of player, mirrors third-person but facing back
      _ideal.set(_eye.x+lx*S.camDist,_eye.y+ly*S.camDist,_eye.z+lz*S.camDist);
    }
    _dir.copy(_ideal).sub(_eye).normalize();
    let ad=S.camDist;
    for(let d=0.2;d<=S.camDist;d+=0.1){
      if(isSolid(getBlock(Math.floor(_eye.x+_dir.x*d),Math.floor(_eye.y+_dir.y*d),Math.floor(_eye.z+_dir.z*d)))){ad=Math.max(0.3,d-0.1);break;}
    }
    _aPos.copy(_eye).addScaledVector(_dir,ad);
    camera.position.lerp(_aPos,1-Math.exp(-dt*28));
    camera.lookAt(_eye);
  }
}

// ═══════════════════════════════
//  FP ARM ANIMATION
//  Punch: sin(sqrt(progress)*π) arc over 0.25s
//  Walk bob: sin wave tied to player.bobT
//  View bob: synced via same bobT
// ═══════════════════════════════
function getEatPose(){
  return iState.eating?Math.sin(THREE.MathUtils.clamp(iState.eatT/1.6,0,1)*Math.PI):0;
}
function updateFPArm(dt){
  const {shoulderPivot,hBlock,hTorch,hBucket,hIcon}=fpArm.userData;
  fpArm.visible=(player.mode==="first");
  const _fhs=hotbarSlots[player.selIdx];const selId=_fhs?_fhs.id:BLOCK.AIR;
  const held=heldRenderFlags(selId);
  const eatPose=getEatPose();
  const eatReach=eatPose*0.12;
  const eatLift=eatPose*0.20;
  const eatTwist=eatPose*0.72;
  const swingScale=1-eatPose*0.48;
  const holdBob=Math.sin(clock.elapsedTime*1.35)*0.004+Math.sin(player.bobT*0.42)*0.003;
  const holdRoll=Math.sin(clock.elapsedTime*0.88)*0.01;

  hBlock.visible=held.block;
  hTorch.visible=held.torch;
  hBucket.visible=held.bucket;
  hIcon.visible=held.icon;

  if(hBlock.visible){
    const m=mats[selId];
    hBlock.material=Array.isArray(m)?m:(m?[m]:[]);
  }
  if(hIcon.visible)updateHeldIconModel(hIcon,selId);

  // ── Punch animation ──
  // Loop while LMB is held (0.10s pause at idle before each retrigger)
  if(iState.lmb && iState.attackT>=0.45) iState.attackT=0;
  iState.attackT=Math.min(iState.attackT+dt,0.45);
  const attackProgress=Math.min(1,iState.attackT/0.32);
  // Smooth symmetric sine — gentle ease-in, peak, ease-out (no sqrt snap)
  const swing=Math.sin(attackProgress*Math.PI)*swingScale;
  const swingX=swing*THREE.MathUtils.degToRad(30);
  const swingY=swing*THREE.MathUtils.degToRad(8);
  const swingZ=swing*THREE.MathUtils.degToRad(7);

  // ── Place animation ──
  const ps=Math.sin(iState.placeAnim*Math.PI)*.20;
  iState.placeAnim=Math.max(0,iState.placeAnim-dt*5);

  // ── Walking arm bob (synced with view bob via player.bobT) ──
  const hs=Math.hypot(player.vel.x,player.vel.z);
  const walkScale=Math.min(hs*.18,1.0);
  const wave=Math.sin(player.bobT);
  const walkBobX=wave*THREE.MathUtils.degToRad(2)*walkScale;
  const walkBobZ=wave*THREE.MathUtils.degToRad(1)*walkScale;
  const walkBobY=Math.abs(wave)*.018*walkScale;

  // ── Idle sway ──
  const idle=Math.sin(clock.elapsedTime*1.1)*.006;

  // ── Apply ──
  shoulderPivot.position.set(
    0.72 - swing*.10 + eatReach,
    -0.78 + swing*.05 - walkBobY + eatLift,
    -0.82 - swing*.15 + eatPose*.06
  );
  shoulderPivot.rotation.set(
    Math.PI-1.00 - swingX + walkBobX + idle + ps*.28 + eatTwist,
    -0.35 - swingY + eatPose*.20,
    0.22 - swingZ + walkBobZ - eatPose*.40
  );

  hBlock.position.set(-0.08-swing*.02+eatPose*.04+holdBob,-0.76-swing*.04-eatPose*.10+holdBob*.6,-0.22-Math.abs(swing)*.02+eatPose*.08);
  hBlock.rotation.set(-0.08-swing*.18-ps*.08-eatPose*.22,0.70+eatPose*.28,0.10+swing*.08-eatPose*.12+holdRoll);

  hTorch.position.set(-0.07-swing*.03+eatPose*.04+holdBob,-0.77-swing*.05-eatPose*.10+holdBob*.6,-0.21-Math.abs(swing)*.03+eatPose*.08);
  hTorch.rotation.set(-0.30-swing*.28-ps*.06-eatPose*.22,0.75+eatPose*.26,0.02+swing*.10-eatPose*.12+holdRoll);

  hBucket.position.set(-0.08-swing*.02+eatPose*.04+holdBob,-0.74-swing*.05-eatPose*.10+holdBob*.6,-0.20-Math.abs(swing)*.03+eatPose*.08);
  hBucket.rotation.set(-0.18-swing*.24-ps*.05-eatPose*.20,0.74+eatPose*.24,0.02+swing*.08-eatPose*.10+holdRoll);

  hIcon.position.set(-0.09-swing*.02+eatPose*.05+holdBob,-0.75-swing*.04-eatPose*.12+holdBob*.6,-0.19-Math.abs(swing)*.02+eatPose*.10);
  hIcon.rotation.set(-0.22-swing*.16-ps*.03-eatPose*.26,0.86+eatPose*.22,0.04+swing*.07-eatPose*.14+holdRoll);
}

// ═══════════════════════════════
//  PLAYER MODEL ANIMATION
//  Head/body decoupled: body follows movement dir, head follows camera.
//  HEAD_MAX_YAW = 70° — beyond this the body turns to keep up.
// ═══════════════════════════════
function animatePlayerModel(dt){
  const md=playerModel.userData;
  const P=0.9/16;
  const hs=Math.hypot(player.vel.x,player.vel.z);
  const speedNorm=THREE.MathUtils.clamp(hs/Math.max(0.001,S.sprintSpeed),0,1);
  const strideAmp=THREE.MathUtils.lerp(0.08,0.56,speedNorm)*(player.sneaking?0.5:1);
  const swingPhase=player.footT*(player.sneaking?1.1:1.8);
  const swingGround=Math.sin(swingPhase)*strideAmp;
  const airBlend=THREE.MathUtils.clamp((player.airTime||0)*4,0,1);
  const swingAir=Math.sin(clock.elapsedTime*8.5)*0.1*airBlend;
  const sw=player.onGround?swingGround:(swingGround*0.55+swingAir);
  const brk=iState.lmb?Math.sin(iState.breakT*14)*.18+.10:0;
  const pl=Math.sin(iState.placeAnim*Math.PI)*.24;
  const sneak=player.sneaking;

  // ── Body yaw: follows player input direction to avoid sideways over-rotation ──
  if(player.moveInput>0.05){
    const moveYaw=Math.atan2(-player.moveDir.x,-player.moveDir.y);
    let diff=moveYaw-player.bodyYaw;
    while(diff>Math.PI)diff-=2*Math.PI;while(diff<-Math.PI)diff+=2*Math.PI;
    const turnSpeed=player.onGround?14:8;
    player.bodyYaw+=diff*Math.min(1,dt*turnSpeed);
  }else{
    // Standing still: body gradually re-aligns to camera
    let diff=player.yaw-player.bodyYaw;
    while(diff>Math.PI)diff-=2*Math.PI;while(diff<-Math.PI)diff+=2*Math.PI;
    player.bodyYaw+=diff*Math.min(1,dt*3);
  }

  // ── Head yaw relative to body, clamped ±70°; excess forces body to rotate ──
  const MAX_HEAD_YAW=THREE.MathUtils.degToRad(70);
  let headRelYaw=player.yaw-player.bodyYaw;
  while(headRelYaw>Math.PI)headRelYaw-=2*Math.PI;
  while(headRelYaw<-Math.PI)headRelYaw+=2*Math.PI;
  if(headRelYaw>MAX_HEAD_YAW){player.bodyYaw+=headRelYaw-MAX_HEAD_YAW;headRelYaw=MAX_HEAD_YAW;}
  else if(headRelYaw<-MAX_HEAD_YAW){player.bodyYaw+=headRelYaw+MAX_HEAD_YAW;headRelYaw=-MAX_HEAD_YAW;}

  // ── Transform ──
  playerModel.position.copy(player.pos);
  if(sneak)playerModel.position.y-=0.18;
  playerModel.rotation.y=player.bodyYaw+Math.PI;

  // Head: independent yaw + pitch
  md.head.rotation.order='YXZ';
  md.head.rotation.y=headRelYaw;
  md.head.rotation.x=-player.pitch*.55+(sneak?.16:0);

  // Body tilt
  md.bodyMesh.rotation.x=sneak?.26:0;
  md.bodyMesh.rotation.z=Math.sin(player.footT*.7)*Math.min(hs*.01,.03);

  // ── Arms — lAP = Steve's right arm (breaks/places), rAP = Steve's left arm ──
  // Idle breathing animation when not moving
  const idleBreath = hs < 0.3 ? Math.sin(clock.elapsedTime * 1.6) * 0.022 : 0;
  const idleSwayX = hs < 0.3 ? Math.sin(clock.elapsedTime * 0.9) * 0.012 : 0;
  const idleSwayZ = hs < 0.3 ? Math.sin(clock.elapsedTime * 1.1 + 0.5) * 0.008 : 0;
  const eatPose=getEatPose();
  const eatArm=eatPose*0.95;
  const holdBob=Math.sin(clock.elapsedTime*1.05)*0.01;
  const holdRoll=Math.sin(clock.elapsedTime*0.72)*0.02;
  md.lAP.rotation.x=sw+brk+pl+idleBreath+eatArm*.92;md.lAP.rotation.y=-0.08-pl*.06+idleSwayZ+eatArm*.24;md.lAP.rotation.z=sneak?-.22:(-.08+pl*.12+idleSwayX)-eatArm*.30;
  md.rAP.rotation.set(-sw-idleBreath,0+idleSwayZ,sneak?.22:.08-idleSwayX);

  // Legs
  md.lLP.rotation.x=-sw;md.rLP.rotation.x=sw;
  if(!player.onGround){
    const hang=THREE.MathUtils.clamp((player.airTime||0)*5,0,1);
    md.lLP.rotation.x=THREE.MathUtils.lerp(md.lLP.rotation.x,-0.20+sw*0.35,hang);
    md.rLP.rotation.x=THREE.MathUtils.lerp(md.rLP.rotation.x,0.20-sw*0.35,hang);
    md.lAP.rotation.x+=0.12*hang;
    md.rAP.rotation.x+=0.08*hang;
  }

  // Held block
  const _hs=hotbarSlots[player.selIdx];const selId=_hs?_hs.id:BLOCK.AIR;
  const held=heldRenderFlags(selId);
  const sm=held.block?mats[selId]:null;
  md.hBlock.material=Array.isArray(sm)?sm:(sm?[sm]:[]);
  md.hBlock.visible=held.block;
  if(md.hTorch)md.hTorch.visible=held.torch;
  if(md.hBucket)md.hBucket.visible=held.bucket;
  if(md.hIcon){
    md.hIcon.visible=held.icon;
    if(held.icon)updateHeldIconModel(md.hIcon,selId);
  }

  md.hBlock.position.set(0,-11*P+pl*.03,3.5*P);
  md.hBlock.position.y+=eatArm*.06+holdBob;md.hBlock.position.z+=eatArm*.10;
  md.hBlock.rotation.set(-.20-brk*.22+pl*.12-eatArm*.22,.42+eatArm*.20,.12-brk*.18-eatArm*.08+holdRoll);
  if(md.hTorch){
    md.hTorch.position.set(0,-11*P+pl*.03,3.6*P);
    md.hTorch.position.y+=eatArm*.06+holdBob;md.hTorch.position.z+=eatArm*.10;
    md.hTorch.rotation.set(-0.35-brk*.20+pl*.10-eatArm*.22,0.35+eatArm*.20,0.08-brk*.10-eatArm*.06+holdRoll);
  }
  if(md.hBucket){
    md.hBucket.position.set(0,-10.7*P+pl*.03,3.45*P);
    md.hBucket.position.y+=eatArm*.06+holdBob;md.hBucket.position.z+=eatArm*.10;
    md.hBucket.rotation.set(-0.16-brk*.16+pl*.08-eatArm*.20,0.52+eatArm*.18,0.12-brk*.07-eatArm*.05+holdRoll);
  }
  if(md.hIcon){
    md.hIcon.position.set(0,-11.2*P+pl*.03,3.7*P);
    md.hIcon.position.y+=eatArm*.08+holdBob;md.hIcon.position.z+=eatArm*.12;
    md.hIcon.rotation.set(-0.38-brk*.14+pl*.08-eatArm*.26,0.46+eatArm*.24,0.12-brk*.06-eatArm*.08+holdRoll);
  }

  playerModel.visible=(player.mode==="third"||player.mode==="front");
}

// ═══════════════════════════════
//  INPUT
// ═══════════════════════════════
function onResize(){
  camera.aspect=hudCam.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();hudCam.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
}
function safeRequestPointerLock(){
  const req=renderer.domElement.requestPointerLock?.();
  if(req&&typeof req.catch==="function"){
    req.catch(err=>{
      if(!(err&&err.name==="SecurityError"))console.warn("[PointerLock]",err);
    });
  }
}
function onPLC(){
  const wasLocked=pLocked;
  pLocked=document.pointerLockElement===renderer.domElement;
  if(pLocked)_ignoreMouseUntil=performance.now()+80;
  $title.classList.toggle("hidden",pLocked);
  $stats.classList.toggle("show",pLocked&&!invOpen&&!tableOpen&&!chestOpen&&!furnaceOpen&&!settingsOpen);
  if(!pLocked){iState.lmb=false;iState.breaking=false;iState.placeAnim=0;}
  if(wasLocked&&!pLocked&&!invOpen&&!tableOpen&&!chestOpen&&!furnaceOpen&&!chatOpen&&!settingsOpen){
    setTimeout(()=>{if(!settingsOpen&&!invOpen&&!tableOpen&&!chestOpen&&!furnaceOpen&&!chatOpen)openSettings();},0);
  }
  resetLagBaselines(220);
}
function onMM(e){
  if(!pLocked)return;
  if(performance.now()<_ignoreMouseUntil)return;
  const rawDX=Number.isFinite(e.movementX)?e.movementX:0;
  const rawDY=Number.isFinite(e.movementY)?e.movementY:0;
  if(Math.abs(rawDX)>MOUSE_SPIKE_REJECT||Math.abs(rawDY)>MOUSE_SPIKE_REJECT)return;
  const dx=THREE.MathUtils.clamp(rawDX,-MOUSE_DELTA_CLAMP,MOUSE_DELTA_CLAMP);
  const dy=THREE.MathUtils.clamp(rawDY,-MOUSE_DELTA_CLAMP,MOUSE_DELTA_CLAMP);
  const sensMul=GS.mouseSens/50; // 1.0 at default 50%
  player.yaw-=dx*.0022*sensMul;
  // Normalize yaw to [-PI, PI] to prevent float drift causing snapping
  player.yaw=((player.yaw%( Math.PI*2))+Math.PI*2)%(Math.PI*2);
  if(player.yaw>Math.PI)player.yaw-=Math.PI*2;
  player.pitch-=dy*.0018*sensMul;
  player.pitch=THREE.MathUtils.clamp(player.pitch,-Math.PI*.48,Math.PI*.48);
}
function onKD(e){
  const k=e.key.toLowerCase();
  const code=e.code;
  // ALWAYS block Ctrl/Cmd+key browser shortcuts at capture phase — no conditions.
  // This fires before Chrome's tab-close handler for Ctrl+W etc.
  if(e.ctrlKey||e.metaKey){e.preventDefault();}
  // Block F-keys from browser defaults (F3=Find, F5=Reload, F11=Fullscreen, etc)
  if(code==='F3'||code==='F5'||code==='F11'||code==='F1'){e.preventDefault();}
  // Settings overlay intercepts Escape first
  if(k==="escape"&&settingsOpen){
    e.preventDefault();
    if(settingsPanel==="options")pauseCloseOptions();
    else closeSettings();
    return;
  }
  // Chat intercepts everything while open
  if(chatOpen){
    if(k==="escape"){e.preventDefault();closeChat();return;}
    if(k==="enter"){e.preventDefault();submitChat();return;}
    if(k==="tab"){e.preventDefault();applySuggestion();return;}
    if(k==="arrowup"){e.preventDefault();moveSuggest(-1);return;}
    if(k==="arrowdown"){e.preventDefault();moveSuggest(1);return;}
    return;
  }
  if(["KeyW","KeyA","KeyS","KeyD","ShiftLeft","ShiftRight","ControlLeft","ControlRight","Space",
      "Digit1","Digit2","Digit3","Digit4","Digit5","Digit6","Digit7","Digit8","Digit9",
      "Numpad1","Numpad2","Numpad3","Numpad4","Numpad5","Numpad6","Numpad7","Numpad8","Numpad9"].includes(code)) e.preventDefault();
  if(k==="e"){e.preventDefault();
    if(tableOpen){closeCraftingTable();return;}
    if(chestOpen){closeChest();return;}
    if(furnaceOpen){closeFurnace();return;}
    toggleInventory();return;
  }
  if(k==="escape"&&(invOpen||tableOpen||chestOpen||furnaceOpen)){
    e.preventDefault();
    if(tableOpen)closeCraftingTable();
    else if(chestOpen)closeChest();
    else if(furnaceOpen)closeFurnace();
    else toggleInventory(false);
    return;
  }
  if(k==="escape"&&!invOpen&&!tableOpen&&!chestOpen&&!furnaceOpen&&!chatOpen){
    e.preventDefault();openSettings();return;
  }
  if(!invOpen&&!tableOpen&&!chestOpen&&!furnaceOpen&&(k==="t"||k==="/")){
    e.preventDefault();openChat(k==="/"?"/":"");return;
  }
  if(invOpen||tableOpen||chestOpen||furnaceOpen){
    const slotIdx=getSlotIndexFromKey(e);
    if(slotIdx!==null) selectSlot(slotIdx);
    return;
  }
  // Double-tap W to start sprinting
  if(code==="KeyW"&&!e.repeat){
    const now=performance.now();
    if(now-_lastWTap<300){
      // Cancel any pending sprint-release timer so holding W keeps sprint active
      clearTimeout(_sprintReleaseTimer);_sprintReleaseTimer=null;
      if(player.creative||player.hunger>6)player.sprinting=true;
    }
    _lastWTap=now;
  }
  keys.add(k);
  const slotIdx=getSlotIndexFromKey(e);
  if(slotIdx!==null) selectSlot(slotIdx);
  if(k==="v"||k==="f5"){player.mode=player.mode==="first"?"third":(player.mode==="third"?"front":"first");showMsg(player.mode==="first"?"First Person":(player.mode==="third"?"Third Person (Back)":"Third Person (Front)"),1000);}
  if(k==="r"){player.pos.copy(findSpawn(0,0));player.vel.set(0,0,0);showMsg("Respawned",900);}
  // ── F3 debug keys ─────────────────────────────────────────────────────────
  if(k==="f3"&&!e.repeat){
    e.preventDefault();
    // If another F3-combo key is already held, process immediately
    if(f3._pendingCombo){
      _handleF3Combo(f3._pendingCombo);
      f3._pendingCombo=null;
    } else {
      // Toggle screen; also mark F3 as "held" for combos
      f3.open=!f3.open;
      $f3Screen.classList.toggle('show',f3.open);
      if(!f3.open){$f3Left.innerHTML='';$f3Right.innerHTML='';}
      showMsg(f3.open?'Debug Screen ON':'Debug Screen OFF',700);
    }
    return;
  }
  // F3+Letter combos: detect if F3 is currently held
  if(keys.has('f3')){
    e.preventDefault();
    _handleF3Combo(k);
    return;
  }
}
function _handleF3Combo(k){
  switch(k){
    case'b':
      f3.showHitboxes=!f3.showHitboxes;
      showMsg('Hitboxes '+(f3.showHitboxes?'ON':'OFF'),900);
      break;
    case'g':
      f3.showChunkBorders=!f3.showChunkBorders;
      if(!f3.showChunkBorders&&_chunkBorderLines){scene.remove(_chunkBorderLines);_chunkBorderLines=null;}
      else if(f3.showChunkBorders)_buildChunkBorderLines();
      showMsg('Chunk Borders '+(f3.showChunkBorders?'ON':'OFF'),900);
      break;
    case'h':
      f3.reducedDebug=!f3.reducedDebug;
      // Show a persistent small badge so user knows the toggle is active even when F3 is closed
      showMsg('Advanced Tooltips '+(f3.reducedDebug?'ON — item IDs visible in hotbar':'OFF'),1400);
      selectSlot(player.selIdx);
      break;
    case'a':
      // F3+A = reload chunks (like Minecraft)
      chunkMap.forEach((_,k2)=>dirtyQ.push(k2));
      showMsg('Reloading chunks…',1000);
      break;
    case'p':
      f3.pauseOnLostFocus=!f3.pauseOnLostFocus;
      showMsg('Pause on focus loss '+(f3.pauseOnLostFocus?'ON':'OFF'),1200);
      break;
    case'q':
      // F3+Q = show key help overlay
      $f3Overlay.innerHTML=
        '<b>F3 Shortcuts</b><br>'+
        'F3 — Toggle debug screen<br>'+
        'F3+B — Toggle hitboxes<br>'+
        'F3+G — Toggle chunk borders<br>'+
        'F3+H — Toggle advanced tooltips<br>'+
        'F3+A — Reload chunks<br>'+
        'F3+P — Toggle pause on focus loss<br>'+
        'F3+Q — Show this help';
      $f3Overlay.classList.add('show');
      setTimeout(()=>$f3Overlay.classList.remove('show'),4000);
      break;
    default: break;
  }
}
function onKU(e){
  const k=e.key.toLowerCase();
  keys.delete(k);
  if(k==="control"||k==="shift")keys.delete(e.code.toLowerCase());
  // When W is released, stop sprinting after a short delay (0.2 s)
  if(e.code==="KeyW"){
    clearTimeout(_sprintReleaseTimer);
    _sprintReleaseTimer=setTimeout(()=>{
      if(!keys.has("w"))player.sprinting=false;
      _sprintReleaseTimer=null;
    },200);
  }
}
function getSlotIndexFromKey(e){
  const code=e.code;
  if(code.startsWith("Digit")){
    const n=Number(code.slice(5));
    return n>=1&&n<=9?n-1:null;
  }
  if(code.startsWith("Numpad")){
    const n=Number(code.slice(6));
    return n>=1&&n<=9?n-1:null;
  }
  const k=e.key.toLowerCase();
  return k>="1"&&k<="9"?Number(k)-1:null;
}
function onWheel(e){
  if(invOpen||!pLocked) return;
  e.preventDefault();
  const dir=Math.sign(e.deltaY);
  if(!dir) return;
  selectSlot((player.selIdx+dir+9)%9);
}
function onMD(e){
  if(invOpen||tableOpen||chestOpen||furnaceOpen)return;
  if(e.button===0){iState.lmb=true;iState.breakT=0;iState.breakKey="";iState.attackT=0;}
  if(e.button===2&&pLocked){
    iState.rmb=true;
    if(canEatHeld()){
      iState.eating=true;
      iState.eatT=0;
      return;
    }
    // Check for special RMB interactions (crafting table, chest)
    if(iState.hov){
      const{x,y,z}=iState.hov.block;
      const bt=getBlock(x,y,z);
      if(bt===BLOCK.CRAFT_TABLE){openCraftingTable();return;}
      if(bt===BLOCK.CHEST){openChest(x,y,z);return;}
      if(bt===BLOCK.FURNACE){openFurnace(x,y,z);return;}
    }
    if(tryPlace())iState.placeAnim=1;
  }
}
function onMU(e){
  if(e.button===0){iState.lmb=false;iState.breaking=false;iState.breakT=0;iState.breakKey="";}
  if(e.button===2){iState.rmb=false;iState.eating=false;iState.eatT=0;}
}

// ═══════════════════════════════
//  PHYSICS
// ═══════════════════════════════
var moveDiagCfg={
  enabled:false,
  frameJumpThreshold:6.5,
  lowSpeedSnapHoriz:0.85,
  lowSpeedExpectedHoriz:0.2,
  lowSpeedVelHoriz:1.25,
  largeAxisSnap:1.35,
  axisSnapRollback:0.38,
  axisSnapRollbackY:1.05,
  enableLowSpeedRollback:false,
  nearbyRadius:1
};
function _readMoveDiagCfg(){
  return moveDiagCfg||{
    enabled:false,
    frameJumpThreshold:6.5,
    lowSpeedSnapHoriz:0.85,
    lowSpeedExpectedHoriz:0.2,
    lowSpeedVelHoriz:1.25,
    largeAxisSnap:1.35,
    axisSnapRollback:0.38,
    axisSnapRollbackY:1.05,
    enableLowSpeedRollback:false,
    nearbyRadius:1
  };
}
function _diagNum(v,precision=4){
  return Number.isFinite(v)?Number(v.toFixed(precision)):v;
}
function _diagPos(x,y,z,precision=4){
  return {x:_diagNum(x,precision),y:_diagNum(y,precision),z:_diagNum(z,precision)};
}
function _diagVel(v,precision=4){
  return _diagPos(v.x,v.y,v.z,precision);
}
function _diagInputState(){
  return {
    w:keys.has("w"),
    a:keys.has("a"),
    s:keys.has("s"),
    d:keys.has("d"),
    jump:keys.has(" "),
    sneak:keys.has("shift"),
    sprint:!!player.sprinting,
    noclip:!!player.noclip,
    menu:!!(invOpen||tableOpen||chestOpen||furnaceOpen||chatOpen)
  };
}
function _newMoveDiagFrame(dt){
  player._moveDiagFrameId=(player._moveDiagFrameId||0)+1;
  return {
    frameId:player._moveDiagFrameId,
    timeMs:_diagNum(performance.now(),2),
    dt:_diagNum(dt,6),
    startPos:_diagPos(player.pos.x,player.pos.y,player.pos.z,5),
    startVel:_diagVel(player.vel,5),
    startOnGround:!!player.onGround,
    yaw:_diagNum(player.yaw,5),
    pitch:_diagNum(player.pitch,5),
    input:_diagInputState(),
    flags:{},
    predictedDelta:{x:0,y:0,z:0},
    events:[],
    substeps:[]
  };
}
function _diagNearbyBlocks(x,y,z,radius=1){
  const out=[];
  const cx=Math.floor(x),cy=Math.floor(y),cz=Math.floor(z);
  for(let bx=cx-radius;bx<=cx+radius;bx++)for(let by=cy-radius;by<=cy+radius;by++)for(let bz=cz-radius;bz<=cz+radius;bz++){
    const id=getBlock(bx,by,bz);
    if(id===BLOCK.AIR)continue;
    out.push({
      x:bx,y:by,z:bz,id,
      name:BLOCK_INFO[id]?.name??`Block ${id}`,
      solid:isSolid(id),
      water:id===BLOCK.WATER
    });
  }
  return out;
}
function _emitMoveDiag(reason,frame,extra={}){
  const payload={
    reason,
    frameId:frame.frameId,
    timeMs:frame.timeMs,
    dt:frame.dt,
    startPos:frame.startPos,
    startVel:frame.startVel,
    startOnGround:frame.startOnGround,
    yaw:frame.yaw,
    pitch:frame.pitch,
    input:frame.input,
    flags:frame.flags,
    predictedDelta:frame.predictedDelta,
    events:frame.events,
    substeps:frame.substeps,
    finalPos:frame.finalPos,
    finalVel:frame.finalVel,
    finalOnGround:frame.finalOnGround,
    hitHoriz:frame.hitHoriz,
    safePos:frame.safePos,
    nearbyBlocks:frame.nearbyBlocks,
    extra
  };
  console.groupCollapsed(`[MovementDiag] ${reason} frame=${payload.frameId} t=${payload.timeMs}ms`);
  console.error("[MovementDiag] Invalid movement detected",payload);
  if(payload.substeps.length){
    console.table(payload.substeps.map(s=>({
      step:s.step,
      reqX:s.request.x,
      reqY:s.request.y,
      reqZ:s.request.z,
      endX:s.end.x,
      endY:s.end.y,
      endZ:s.end.z,
      onGround:s.onGround,
      hitHoriz:s.hitHoriz
    })));
  }
  if(payload.events.length)console.table(payload.events);
  console.trace("[MovementDiag] call stack");
  console.groupEnd();
}
function updatePlayer(dt){
  const diagCfg=_readMoveDiagCfg();
  const diagFrame=diagCfg.enabled?_newMoveDiagFrame(dt):null;
  const diagAnomalies=[];
  function markDiag(reason,extra){
    if(diagFrame)diagAnomalies.push({reason,extra});
  }
  function flushDiag(){
    if(!diagFrame||!diagAnomalies.length)return;
    diagFrame.finalPos=_diagPos(player.pos.x,player.pos.y,player.pos.z,5);
    diagFrame.finalVel=_diagVel(player.vel,5);
    diagFrame.finalOnGround=!!player.onGround;
    diagFrame.hitHoriz=!!player.hitHoriz;
    diagFrame.safePos=_diagPos(player.safePos.x,player.safePos.y,player.safePos.z,5);
    diagFrame.nearbyBlocks=_diagNearbyBlocks(player.pos.x,player.pos.y+0.5,player.pos.z,diagCfg.nearbyRadius);
    for(const a of diagAnomalies)_emitMoveDiag(a.reason,diagFrame,a.extra);
  }
  if(!Number.isFinite(player.pos.x)||!Number.isFinite(player.pos.y)||!Number.isFinite(player.pos.z)||
     !Number.isFinite(player.vel.x)||!Number.isFinite(player.vel.y)||!Number.isFinite(player.vel.z)){
    if(diagFrame){
      diagFrame.events.push({
        type:"non_finite_guard",
        badPos:_diagPos(player.pos.x,player.pos.y,player.pos.z,5),
        badVel:_diagVel(player.vel,5)
      });
      markDiag("non_finite_state_reset",{action:"reset_to_safe_pos"});
    }
    player.pos.copy(player.safePos||findSpawn(0,0));
    player.vel.set(0,0,0);
    player.onGround=false;
  }
  const safeDt=Math.max(dt,1e-6);
  const wasOnGround=player.onGround;
  const prevY=player.pos.y;
  if(player.noclip){
    const inMenu=invOpen||tableOpen||chestOpen||furnaceOpen||chatOpen;
    if(!inMenu){
      const s=keys.has('control')?S.sprintSpeed:S.walkSpeed;
      const sinY=Math.sin(player.yaw),cosY=Math.cos(player.yaw);
      const sinP=Math.sin(player.pitch),cosP=Math.cos(player.pitch);
      let fx=0,fy=0,fz=0;
      if(keys.has('w')){fx+=sinY*cosP;fy+=sinP;fz+=-cosY*cosP;}
      if(keys.has('s')){fx-=sinY*cosP;fy-=sinP;fz-=-cosY*cosP;}
      if(keys.has('a')){fx+=-cosY;fz+=-sinY;}
      if(keys.has('d')){fx+=cosY;fz+=sinY;}
      if(keys.has(' '))fy+=1;
      if(keys.has('shift'))fy-=1;
      const len=Math.sqrt(fx*fx+fy*fy+fz*fz)||1;
      player.pos.x+=fx/len*s*dt;player.pos.y+=fy/len*s*dt;player.pos.z+=fz/len*s*dt;
    }
    player.vel.set(0,0,0);
    player.onGround=false;
    flushDiag();
    return;
  }
  const inMenu=invOpen||tableOpen||chestOpen||furnaceOpen||chatOpen;
  // Sneak = Shift (matches Minecraft Java Edition default)
  if(!inMenu) player.sneaking=keys.has("shift");
  $sneakInd.classList.toggle("show",player.sneaking&&pLocked&&!inMenu);
  _inp.set(0,0,0);
  if(!inMenu){
    if(keys.has("w"))_inp.z-=1;if(keys.has("s"))_inp.z+=1;
    if(keys.has("a"))_inp.x-=1;if(keys.has("d"))_inp.x+=1;
  }
  if(_inp.lengthSq()>1)_inp.normalize();
  const sinY=Math.sin(player.yaw),cosY=Math.cos(player.yaw);
  const fwdX=-sinY,fwdZ=-cosY;
  const rightX=cosY,rightZ=-sinY;
  const fwdIn=-_inp.z;
  _mv.set(rightX*_inp.x+fwdX*fwdIn,0,rightZ*_inp.x+fwdZ*fwdIn);
  const hasMoveInput=_mv.lengthSq()>0.000001;
  if(hasMoveInput){
    _mv.normalize();
    player.moveInput=Math.min(1,Math.hypot(_inp.x,_inp.z));
    player.moveDir.set(_mv.x,_mv.z);
  }else{
    player.moveInput=0;
  }
  // Sprint = double-tap W; sneaking overrides and cancels sprint
  if(player.sneaking||(!player.creative&&player.hunger<=6))player.sprinting=false;
  const spd=player.sneaking?S.sneakSpeed:(player.sprinting?S.sprintSpeed:S.walkSpeed);
  const targetVx=hasMoveInput?_mv.x*spd:0;
  const targetVz=hasMoveInput?_mv.z*spd:0;
  const immersion=getWaterImmersion();
  const feetLiquid=waterAtFeet();
  const inWater=feetLiquid||immersion>=PHYS.immersionFeet;
  const swimBlend=inWater?THREE.MathUtils.clamp((immersion-PHYS.immersionFeet)/Math.max(1e-4,PHYS.immersionSwim-PHYS.immersionFeet),0,1):0;
  const headWet=headInWater();
  player.waterEdgeHopCd=Math.max(0,(player.waterEdgeHopCd||0)-dt);
  const flow=inWater?getWaterFlow(player.pos.x,player.pos.y+0.22,player.pos.z):{x:0,z:0,fall:0,strength:0};
  const landAx=player.onGround?PHYS.groundAccel:PHYS.airAccel;
  const landFr=player.onGround?PHYS.groundFriction:PHYS.airFriction;
  const landCtl=hasMoveInput?landAx:landFr;
  const swimCtl=THREE.MathUtils.lerp(PHYS.swimDragIdle,PHYS.swimAccel,hasMoveInput?1:0);
  let tx=targetVx,tz=targetVz;
  if(inWater){
    const swimScale=player.sprinting?0.74:0.62;
    const flowAtten=0.34+0.66*swimBlend+0.14*(flow.strength??0);
    const flowPush=(1.2+flow.fall*0.87)*flowAtten;
    const wtx=(hasMoveInput?_mv.x*S.walkSpeed*swimScale:0)+flow.x*flowPush;
    const wtz=(hasMoveInput?_mv.z*S.walkSpeed*swimScale:0)+flow.z*flowPush;
    tx=THREE.MathUtils.lerp(targetVx,wtx,swimBlend);
    tz=THREE.MathUtils.lerp(targetVz,wtz,swimBlend);
  }
  const ctlHoriz=inWater?THREE.MathUtils.lerp(landCtl,swimCtl,swimBlend):landCtl;
  player.vel.x=THREE.MathUtils.damp(player.vel.x,tx,ctlHoriz,dt);
  player.vel.z=THREE.MathUtils.damp(player.vel.z,tz,ctlHoriz,dt);
  const gravMul=inWater?THREE.MathUtils.lerp(1,PHYS.gravWater,swimBlend):1;
  player.vel.y-=S.gravity*gravMul*dt;
  player.vel.y=Math.max(player.vel.y,inWater?PHYS.termVelWater:-50);
  {
    const maxHoriz=inWater?PHYS.maxHorizWater:PHYS.maxHorizLand;
    const hs=Math.hypot(player.vel.x,player.vel.z);
    if(hs>maxHoriz){
      const s=maxHoriz/Math.max(hs,1e-6);
      player.vel.x*=s;player.vel.z*=s;
    }
    player.vel.y=THREE.MathUtils.clamp(player.vel.y,-50,inWater?THREE.MathUtils.lerp(16.5,10.8,swimBlend):16.5);
  }
  const preMoveExpectedHoriz=Math.hypot(player.vel.x*dt,player.vel.z*dt);
  if(diagFrame){
    diagFrame.flags.inWater=!!inWater;
    diagFrame.flags.swimBlend=_diagNum(swimBlend,4);
    diagFrame.flags.immersion=_diagNum(immersion,4);
    diagFrame.flags.headWet=!!headWet;
    diagFrame.flags.hasMoveInput=!!hasMoveInput;
    diagFrame.flags.sneaking=!!player.sneaking;
    diagFrame.flags.sprinting=!!player.sprinting;
    diagFrame.flags.waterEdgeHopCd=_diagNum(player.waterEdgeHopCd,4);
    diagFrame.predictedDelta={
      x:_diagNum(player.vel.x*dt,5),
      y:_diagNum(player.vel.y*dt,5),
      z:_diagNum(player.vel.z*dt,5)
    };
  }
  const preMoveHorizVel=Math.hypot(player.vel.x,player.vel.z);
  // Coyote time: allow jumping briefly after walking off an edge
  if(player.onGround)player.coyoteT=0.15;else player.coyoteT=Math.max(0,(player.coyoteT||0)-dt);
  if(player.onGround)player.airTime=0;else player.airTime=(player.airTime||0)+dt;
  if(inWater){
    if(!inMenu&&keys.has(" ")){
      const riseTarget=headWet?PHYS.buoyRiseSubmerged:PHYS.buoyRiseSurface;
      const riseControl=headWet?8.35:5.35;
      const rt=THREE.MathUtils.lerp(riseTarget*0.88,riseTarget,swimBlend);
      const rc=THREE.MathUtils.lerp(riseControl*0.92,riseControl,swimBlend);
      player.vel.y=THREE.MathUtils.damp(player.vel.y,rt,rc,dt);
    }
    else if(!inMenu&&keys.has("shift"))player.vel.y=THREE.MathUtils.damp(player.vel.y,-3.55,7.55,dt);
    else{
      const sinkMag=flow.fall>0?PHYS.buoySinkWaterfall:PHYS.buoySink;
      player.vel.y=THREE.MathUtils.damp(player.vel.y,-sinkMag,3.55+0.85*swimBlend,dt);
    }
  }
  else if(!inMenu&&keys.has(" ")&&(player.onGround||player.coyoteT>0)){
    const sprintJump=player.sprinting&&!player.sneaking&&hasMoveInput;
    player.vel.y=S.jumpVel;player.onGround=false;player.coyoteT=0;
    if(sprintJump){
      player.vel.x+=_mv.x*0.95;
      player.vel.z+=_mv.z*0.95;
    }
    addExhaustion(sprintJump?0.34:0.05);
  }
  // ── Sneak edge prevention ─────────────────────────────────────────────────
  // Uses a small center-area check (not full AABB) so the player can naturally
  // hang ~50% of their body off the edge before being stopped — matching the
  // 35-75% overhang range requested. The guard _hasSneakFloor(0,0) prevents
  // freezing when the player jumps onto a block and lands near its edge.
  if(player.sneaking&&player.onGround&&!inWater){
    const CHECK_R=0.03; // 3cm center zone — allows up to ~90% AABB overhang before stopping
    const _by=Math.floor(player.pos.y)-1;
    function _hasSneakFloor(ox,oz){
      const x0=Math.floor(player.pos.x+ox-CHECK_R),x1=Math.floor(player.pos.x+ox+CHECK_R);
      const z0=Math.floor(player.pos.z+oz-CHECK_R),z1=Math.floor(player.pos.z+oz+CHECK_R);
      for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
        if(!isSolid(getBlock(x,_by,z)))return false;
      }
      return true;
    }
    // Only restrict movement if the CURRENT center is above solid ground.
    // If the player just landed on a block edge (valid physics position),
    // skip the check to prevent the freeze-on-jump bug.
    if(_hasSneakFloor(0,0)){
      const STEP=0.05;
      let mvx=player.vel.x*dt;
      let mvz=player.vel.z*dt;
      while(mvx!==0&&!_hasSneakFloor(mvx,0)){
        if(Math.abs(mvx)<=STEP){mvx=0;break;}
        mvx-=Math.sign(mvx)*STEP;
      }
      while(mvz!==0&&!_hasSneakFloor(0,mvz)){
        if(Math.abs(mvz)<=STEP){mvz=0;break;}
        mvz-=Math.sign(mvz)*STEP;
      }
      while(mvx!==0&&mvz!==0&&!_hasSneakFloor(mvx,mvz)){
        if(Math.abs(mvx)<=STEP)mvx=0;else mvx-=Math.sign(mvx)*STEP;
        if(Math.abs(mvz)<=STEP)mvz=0;else mvz-=Math.sign(mvz)*STEP;
      }
      player.vel.x=mvx/safeDt;
      player.vel.z=mvz/safeDt;
    }
  }
  player.hitHoriz=false;
  _prevPos.copy(player.pos);
  player._stepUsed=false;
  {
    const dx=player.vel.x*dt,dy=player.vel.y*dt,dz=player.vel.z*dt;
    const maxDelta=Math.max(Math.abs(dx),Math.abs(dy),Math.abs(dz));
    const steps=Math.max(1,Math.ceil(maxDelta/PHYS.substepMax));
    const sdx=dx/steps,sdy=dy/steps,sdz=dz/steps;
    for(let i=0;i<steps;i++){
      const bx=player.pos.x,by=player.pos.y,bz=player.pos.z;
      const subDiag=diagFrame?{
        step:i,
        start:_diagPos(bx,by,bz,5),
        request:{x:_diagNum(sdx,6),y:_diagNum(sdy,6),z:_diagNum(sdz,6)},
        axes:[]
      }:null;
      moveAxis("x",sdx,subDiag);moveAxis("y",sdy,subDiag);moveAxis("z",sdz,subDiag);
      if(subDiag){
        subDiag.end=_diagPos(player.pos.x,player.pos.y,player.pos.z,5);
        subDiag.onGround=!!player.onGround;
        subDiag.hitHoriz=!!player.hitHoriz;
        diagFrame.substeps.push(subDiag);
        for(const axis of subDiag.axes){
          if(axis.snapGuard?.triggered){
            if(diagFrame)diagFrame.events.push({
              type:"axis_snap_guard",
              step:i,
              axis:axis.axis,
              snapFromStart:axis.snapGuard.snapFromStart,
              limit:axis.snapGuard.limit,
              block:axis.snapGuard.block
            });
            markDiag("axis_snap_guard_triggered",{
              step:i,
              axis:axis.axis,
              snapFromStart:axis.snapGuard.snapFromStart,
              limit:axis.snapGuard.limit,
              block:axis.snapGuard.block
            });
          }
          {
            const snap=axis.snapDistance||0;
            const stepMax=Math.max(Math.abs(sdx),Math.abs(sdy),Math.abs(sdz));
            const expect=Math.max(diagCfg.largeAxisSnap,stepMax*2.4);
            if(snap>expect){
              markDiag("large_axis_snap",{
                step:i,
                axis:axis.axis,
                snapDistance:snap,
                expect,
                stepMax,
                collisions:axis.collisions.length
              });
            }
          }
        }
      }
      if(!inWater&&_playerIntersectsSolid()){
        if(diagFrame)diagFrame.events.push({
          type:"solid_overlap_after_substep",
          step:i,
          posBeforeRollback:_diagPos(player.pos.x,player.pos.y,player.pos.z,5),
          rollbackTo:_diagPos(bx,by,bz,5)
        });
        markDiag("solid_overlap_rollback",{step:i});
        player.pos.set(bx,by,bz);
        player.vel.x*=0.22;
        player.vel.z*=0.22;
        player.vel.y=Math.min(player.vel.y,0);
        player.hitHoriz=true;
        break;
      }
    }
  }
  // Minecraft-like ledge behavior: holding jump at the surface while pushing into
  // a wall triggers a short upward "water edge hop" instead of collision stepping.
  const feetStillWater=waterAtFeet();
  if(inWater&&feetStillWater&&!headInWater()&&!inMenu&&keys.has(" ")&&hasMoveInput&&player.hitHoriz&&player.waterEdgeHopCd<=0&&player.vel.y<6.5){
    player.vel.y=Math.max(player.vel.y,S.jumpVel*0.9);
    player.onGround=false;
    player.coyoteT=0;
    player.waterEdgeHopCd=0.26;
  }
  if(player.onGround)player.airTime=0;
  if(wasOnGround&&!player.onGround&&player.vel.y<=0)player.fallStartY=prevY;
  if(!wasOnGround&&player.onGround){
    const fallDist=(player.fallStartY??prevY)-player.pos.y;
    if(!player.creative&&!inWater&&fallDist>3){
      const dmg=Math.floor(fallDist-3);
      if(dmg>0)damagePlayer(dmg,"fall");
    }
    player.fallStartY=player.pos.y;
  }
  if(inWater)player.fallStartY=player.pos.y;
  updateEnvironmentalDamage(dt);
  _moveDelta.set(player.pos.x-_prevPos.x,0,player.pos.z-_prevPos.z);
  let hd=_moveDelta.length();
  let actualHoriz=Math.hypot(player.pos.x-_prevPos.x,player.pos.z-_prevPos.z);
  let frameJump=Math.hypot(player.pos.x-_prevPos.x,player.pos.y-prevY,player.pos.z-_prevPos.z);
  if(!inWater&&!player.hitHoriz&&actualHoriz>diagCfg.lowSpeedSnapHoriz&&preMoveExpectedHoriz<diagCfg.lowSpeedExpectedHoriz&&preMoveHorizVel<diagCfg.lowSpeedVelHoriz){
    const rolledBack=diagCfg.enableLowSpeedRollback!==false;
    const fromPos=_diagPos(player.pos.x,player.pos.y,player.pos.z,5);
    const rollbackTo=_diagPos(_prevPos.x,player.pos.y,_prevPos.z,5);
    markDiag("low_speed_large_horizontal_jump",{
      actualHoriz:_diagNum(actualHoriz,5),
      expectedHoriz:_diagNum(preMoveExpectedHoriz,5),
      preMoveHorizVel:_diagNum(preMoveHorizVel,5),
      hitHoriz:!!player.hitHoriz,
      rolledBack,
      fromPos,
      rollbackTo
    });
    if(rolledBack){
      player.pos.x=_prevPos.x;
      player.pos.z=_prevPos.z;
      player.vel.x=0;
      player.vel.z=0;
      player.hitHoriz=true;
      if(diagFrame)diagFrame.events.push({
        type:"low_speed_horizontal_rollback",
        from:fromPos,
        to:_diagPos(player.pos.x,player.pos.y,player.pos.z,5)
      });
      _moveDelta.set(player.pos.x-_prevPos.x,0,player.pos.z-_prevPos.z);
      hd=_moveDelta.length();
      actualHoriz=Math.hypot(player.pos.x-_prevPos.x,player.pos.z-_prevPos.z);
      frameJump=Math.hypot(player.pos.x-_prevPos.x,player.pos.y-prevY,player.pos.z-_prevPos.z);
    }
  }
  if(frameJump>diagCfg.frameJumpThreshold&&!player.hitHoriz){
    const resetPos=player.safePos&&Number.isFinite(player.safePos.x)?player.safePos:findSpawn(0,0);
    markDiag("frame_jump_guard_triggered",{
      frameJump:_diagNum(frameJump,5),
      threshold:diagCfg.frameJumpThreshold,
      preResetPos:_diagPos(player.pos.x,player.pos.y,player.pos.z,5),
      resetTo:_diagPos(resetPos.x,resetPos.y,resetPos.z,5)
    });
    player.pos.copy(resetPos);
    player.vel.set(0,0,0);
    player.onGround=false;
  }
  if(hd>0.0001){
    if(player.sprinting)addExhaustion(hd*(inWater?0.04:0.1));
    else if(hasMoveInput&&player.onGround&&!player.sneaking&&!inWater)addExhaustion(hd*0.01);
  }
  updateSurvival(dt);
  if(hd>.0001){
    if(player.onGround)player.bobT+=hd*(player.sneaking?2.8:4.2);
    const prevFoot=player.footT;
    player.footT+=hd*(player.onGround?1:0.6);
    // Play footstep every ~1.9 world units (≈0.44 s at walk speed 4.3 m/s)
    if(player.onGround&&Math.floor(player.footT/1.9)>Math.floor(prevFoot/1.9)){
      const bx=Math.floor(player.pos.x),bz=Math.floor(player.pos.z);
      const by=Math.floor(player.pos.y)-1;
      const bt=getBlock(bx,by,bz);
      sfxFootstep(bt||BLOCK.DIRT);
    }
  }
  if(Number.isFinite(player.pos.x)&&Number.isFinite(player.pos.y)&&Number.isFinite(player.pos.z)){
    player.safePos.copy(player.pos);
  }
  if(player.pos.y<-10||!Number.isFinite(player.pos.x)||!Number.isFinite(player.pos.y)||!Number.isFinite(player.pos.z)){
    markDiag("void_or_non_finite_final_guard",{
      pos:_diagPos(player.pos.x,player.pos.y,player.pos.z,5),
      vel:_diagVel(player.vel,5)
    });
    player.pos.copy(findSpawn(0,0));
    player.safePos.copy(player.pos);
    player.vel.set(0,0,0);
  }
  flushDiag();
}
function _playerIntersectsSolidAt(px,py,pz){
  const r=S.playerR;
  const eps=1e-4;
  const minX=Math.floor(px-r+eps),maxX=Math.floor(px+r-eps);
  const minY=Math.floor(py+eps),maxY=Math.floor(py+S.playerH-eps);
  const minZ=Math.floor(pz-r+eps),maxZ=Math.floor(pz+r-eps);
  const pX0=px-r,pX1=px+r,pY0=py,pY1=py+S.playerH,pZ0=pz-r,pZ1=pz+r;
  for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)for(let z=minZ;z<=maxZ;z++){
    if(!isSolid(getBlock(x,y,z)))continue;
    if(!(pX1<=x||pX0>=x+1||pY1<=y||pY0>=y+1||pZ1<=z||pZ0>=z+1))return true;
  }
  return false;
}
function _playerIntersectsSolid(){
  return _playerIntersectsSolidAt(player.pos.x,player.pos.y,player.pos.z);
}
function moveAxis(ax,amt,subDiag=null){
  if(!amt)return;
  const diagCfg=_readMoveDiagCfg();
  const axisStartPos=player.pos[ax];
  const snapGuardLimit=ax==="y"
    ?(Number.isFinite(diagCfg.axisSnapRollbackY)?diagCfg.axisSnapRollbackY:1.05)
    :(Number.isFinite(diagCfg.axisSnapRollback)?diagCfg.axisSnapRollback:0.38);
  const axisDiag=subDiag?{
    axis:ax,
    amount:_diagNum(amt,6),
    start:_diagPos(player.pos.x,player.pos.y,player.pos.z,5),
    collisions:[],
    snapDistance:0,
    pendingStep:0,
    snapGuard:null
  }:null;
  player.pos[ax]+=amt;
  const r=S.playerR;
  const mX=Math.floor(player.pos.x-r),xX=Math.floor(player.pos.x+r);
  const mY=Math.floor(player.pos.y),yX=Math.floor(player.pos.y+S.playerH);
  const mZ=Math.floor(player.pos.z-r),zX=Math.floor(player.pos.z+r);
  player.onGround=player.onGround&&ax!=="y";
  const prevY=player.pos.y-amt;
  const STEP_H=0.52;
  let col=false;
  let pendingStep=0;
  let snapGuardTriggered=false;
  if(ax==="y"){
    const overlaps=[];
    for(let x=mX;x<=xX;x++)for(let y=mY;y<=yX;y++)for(let z=mZ;z<=zX;z++){
      const bt=getBlock(x,y,z);
      if(!isSolid(bt))continue;
      const pX0=player.pos.x-r,pX1=player.pos.x+r,pY0=player.pos.y,pY1=player.pos.y+S.playerH,pZ0=player.pos.z-r,pZ1=player.pos.z+r;
      if(pX1<=x||pX0>=x+1||pY1<=y||pY0>=y+1||pZ1<=z||pZ0>=z+1)continue;
      overlaps.push({x,y,z,bt});
    }
    col=overlaps.length>0;
    if(col){
      for(const h of overlaps){
        if(axisDiag&&axisDiag.collisions.length<10){
          axisDiag.collisions.push({
            x:h.x,y:h.y,z:h.z,id:h.bt,name:BLOCK_INFO[h.bt]?.name??`Block ${h.bt}`,
            playerPos:_diagPos(player.pos.x,player.pos.y,player.pos.z,5)
          });
        }
      }
      if(amt>0){
        const uniq=new Set();
        for(const h of overlaps)uniq.add(h.y);
        const candidates=[...uniq].map(by=>by-S.playerH).sort((a,b)=>Math.abs(a-axisStartPos)-Math.abs(b-axisStartPos));
        let resolved=false;
        for(const c of candidates){
          if(_playerIntersectsSolidAt(player.pos.x,c,player.pos.z))continue;
          const before=player.pos.y;
          player.pos.y=c;
          player.vel.y=0;
          resolved=true;
          if(axisDiag)axisDiag.snapDistance=Math.max(axisDiag.snapDistance,_diagNum(Math.abs(player.pos.y-before),6));
          break;
        }
        if(!resolved){
          player.pos.y=axisStartPos;
          player.vel.y=0;
          snapGuardTriggered=true;
          const h0=overlaps[0];
          if(axisDiag)axisDiag.snapGuard={
            triggered:true,
            snapFromStart:_diagNum(Math.abs((h0.y-S.playerH)-axisStartPos),6),
            limit:_diagNum(snapGuardLimit,6),
            candidate:_diagNum(h0.y-S.playerH,6),
            block:{x:h0.x,y:h0.y,z:h0.z,id:h0.bt,name:BLOCK_INFO[h0.bt]?.name??`Block ${h0.bt}`}
          };
        }
      }else{
        for(const h of overlaps){
          if((h.y+1)>prevY+1e-3)player.vel.y=0;
        }
        const candSet=new Set();
        for(const h of overlaps){
          if((h.y+1)>prevY+1e-3)continue;
          candSet.add(h.y+1);
        }
        const candidates=[...candSet].sort((a,b)=>b-a);
        let resolved=false;
        for(const c of candidates){
          if(_playerIntersectsSolidAt(player.pos.x,c,player.pos.z))continue;
          const before=player.pos.y;
          player.pos.y=c;
          player.onGround=true;
          player.vel.y=0;
          resolved=true;
          if(axisDiag)axisDiag.snapDistance=Math.max(axisDiag.snapDistance,_diagNum(Math.abs(player.pos.y-before),6));
          break;
        }
        if(!resolved){
          player.pos.y=axisStartPos;
          player.vel.y=0;
          snapGuardTriggered=true;
          const h0=overlaps[0];
          if(axisDiag)axisDiag.snapGuard={
            triggered:true,
            snapFromStart:_diagNum(Math.abs((h0.y+1)-axisStartPos),6),
            limit:_diagNum(snapGuardLimit,6),
            candidate:_diagNum(h0.y+1,6),
            block:{x:h0.x,y:h0.y,z:h0.z,id:h0.bt,name:BLOCK_INFO[h0.bt]?.name??`Block ${h0.bt}`}
          };
        }
      }
    }
  }else{
    const overlaps=[];
    for(let x=mX;x<=xX;x++)for(let y=mY;y<=yX;y++)for(let z=mZ;z<=zX;z++){
      const bt=getBlock(x,y,z);
      if(!isSolid(bt))continue;
      const pX0=player.pos.x-r,pX1=player.pos.x+r,pY0=player.pos.y,pY1=player.pos.y+S.playerH,pZ0=player.pos.z-r,pZ1=player.pos.z+r;
      if(pX1<=x||pX0>=x+1||pY1<=y||pY0>=y+1||pZ1<=z||pZ0>=z+1)continue;
      overlaps.push({x,y,z,bt});
    }
    col=overlaps.length>0;
    if(col){
      player.hitHoriz=true;
      for(const h of overlaps){
        if(axisDiag&&axisDiag.collisions.length<10){
          axisDiag.collisions.push({
            x:h.x,y:h.y,z:h.z,id:h.bt,name:BLOCK_INFO[h.bt]?.name??`Block ${h.bt}`,
            playerPos:_diagPos(player.pos.x,player.pos.y,player.pos.z,5)
          });
        }
        const blockTop=h.y+1;
        const stepNeeded=blockTop-player.pos.y;
        if(stepNeeded>0&&stepNeeded<=STEP_H&&player.onGround&&player.vel.y<=0.35&&!player._stepUsed){
          let clearAbove=true;
          for(let tx=mX;tx<=xX&&clearAbove;tx++)
            for(let tz=mZ;tz<=zX&&clearAbove;tz++)
              for(let ty=Math.floor(blockTop);ty<=Math.floor(blockTop+S.playerH-0.001);ty++)
                if(isSolid(getBlock(tx,ty,tz))){clearAbove=false;break;}
          if(clearAbove){
            if(stepNeeded>pendingStep)pendingStep=stepNeeded;
            if(axisDiag)axisDiag.pendingStep=Math.max(axisDiag.pendingStep,_diagNum(stepNeeded,5));
          }
        }
      }
      let skipHoriz=false;
      if(pendingStep>0)skipHoriz=!_playerIntersectsSolidAt(player.pos.x,player.pos.y+pendingStep,player.pos.z);
      if(!skipHoriz){
        const uniq=new Set();
        if(ax==="x")for(const h of overlaps)uniq.add(h.x);
        else for(const h of overlaps)uniq.add(h.z);
        const candidates=[];
        if(ax==="x")for(const b of uniq){candidates.push(b-r,b+1+r);}
        else for(const b of uniq){candidates.push(b-r,b+1+r);}
        const sorted=[...new Set(candidates)].sort((a,b)=>Math.abs(a-axisStartPos)-Math.abs(b-axisStartPos));
        let resolved=false;
        if(ax==="x"){
          for(const c of sorted){
            if(_playerIntersectsSolidAt(c,player.pos.y,player.pos.z))continue;
            const before=player.pos.x;
            player.pos.x=c;
            player.vel.x=0;
            resolved=true;
            if(axisDiag)axisDiag.snapDistance=Math.max(axisDiag.snapDistance,_diagNum(Math.abs(player.pos.x-before),6));
            break;
          }
          if(!resolved){
            player.pos.x=axisStartPos;
            player.vel.x=0;
            snapGuardTriggered=true;
            const h0=overlaps[0];
            const badCand=amt>0?h0.x-r:h0.x+1+r;
            if(axisDiag)axisDiag.snapGuard={
              triggered:true,
              snapFromStart:_diagNum(Math.abs(badCand-axisStartPos),6),
              limit:_diagNum(snapGuardLimit,6),
              candidate:_diagNum(badCand,6),
              block:{x:h0.x,y:h0.y,z:h0.z,id:h0.bt,name:BLOCK_INFO[h0.bt]?.name??`Block ${h0.bt}`}
            };
          }
        }else{
          for(const c of sorted){
            if(_playerIntersectsSolidAt(player.pos.x,player.pos.y,c))continue;
            const before=player.pos.z;
            player.pos.z=c;
            player.vel.z=0;
            resolved=true;
            if(axisDiag)axisDiag.snapDistance=Math.max(axisDiag.snapDistance,_diagNum(Math.abs(player.pos.z-before),6));
            break;
          }
          if(!resolved){
            player.pos.z=axisStartPos;
            player.vel.z=0;
            snapGuardTriggered=true;
            const h0=overlaps[0];
            const badCand=amt>0?h0.z-r:h0.z+1+r;
            if(axisDiag)axisDiag.snapGuard={
              triggered:true,
              snapFromStart:_diagNum(Math.abs(badCand-axisStartPos),6),
              limit:_diagNum(snapGuardLimit,6),
              candidate:_diagNum(badCand,6),
              block:{x:h0.x,y:h0.y,z:h0.z,id:h0.bt,name:BLOCK_INFO[h0.bt]?.name??`Block ${h0.bt}`}
            };
          }
        }
      }
    }
  }
  if(pendingStep>0&&!snapGuardTriggered){
    player.pos.y+=pendingStep;
    player.onGround=true;player.vel.y=0;
    player._stepUsed=true;
    player.stepSmoothOffset=(player.stepSmoothOffset||0)+pendingStep;
  }
  if(!col&&ax==="y"&&amt<0)player.onGround=false;
  if(axisDiag){
    axisDiag.collided=col;
    axisDiag.end=_diagPos(player.pos.x,player.pos.y,player.pos.z,5);
    axisDiag.onGround=!!player.onGround;
    axisDiag.hitHoriz=!!player.hitHoriz;
    subDiag.axes.push(axisDiag);
  }
}

function damagePlayer(amount,reason="hurt"){
  if(player.creative&&reason!=="kill")return;
  player.health=Math.max(0,player.health-amount);
  if(amount>0&&reason!=="kill"&&reason!=="starve")addExhaustion(Math.min(4,amount*2));
  if(reason==="cactus")showMsg("Cactus prick",380);
  else if(reason==="fall")showMsg("Ouch!",650);
  else if(reason==="starve")showMsg("You are starving",750);
  else if(reason==="drown")showMsg("Drowning",650);
  player.lastHurtOverlayAt=performance.now();
  if(player.health<=0){
    sfxPlayerDeath();
    player.health=player.maxHealth;
    player.hunger=player.maxHunger;
    player.saturation=5;
    player.air=player.maxAir;
    player.exhaustion=0;
    player.starveTick=0;
    player.regenTick=0;
    player.pos.copy(findSpawn(0,0));
    player.vel.set(0,0,0);
    showMsg("You died",900);
  } else {
    sfxPlayerHurt();
  }
}

function updateSurvival(dt){
  const inHeadWater=headInWater();
  if(!player.creative&&inHeadWater){
    player.air=Math.max(0,player.air-dt*20);
    if(player.air<=0){
      player.drownTick+=dt;
      if(player.drownTick>=1){
        player.drownTick=0;
        damagePlayer(2,"drown");
      }
    }
  } else {
    player.drownTick=0;
    player.air=Math.min(player.maxAir,player.air+dt*30);
  }

  if(player.creative)return;
  if(player.hunger<=0){
    player.starveTick+=dt;
    if(player.starveTick>=4){
      player.starveTick=0;
      if(player.health>1)damagePlayer(1,"starve");
    }
  } else {
    player.starveTick=0;
  }

  if(player.hunger>=18&&player.health<player.maxHealth){
    player.regenTick+=dt;
    const regenDelay=player.saturation>0?2.2:4;
    if(player.regenTick>=regenDelay){
      player.regenTick=0;
      player.health=Math.min(player.maxHealth,player.health+1);
      if(player.saturation>0)player.saturation=Math.max(0,player.saturation-1);
      else player.hunger=Math.max(0,player.hunger-1);
    }
  } else {
    player.regenTick=0;
  }

  if(iState.eating){
    const slot=getHeldSlot();
    if(!iState.rmb||!slot||!isEdibleSlot(slot)||player.hunger>=player.maxHunger){
      iState.eating=false;iState.eatT=0;
    } else {
      iState.eatT+=dt;
      if(iState.eatT>=1.6){
        consumeHeldFood();
        iState.eatT=0;
        iState.eating=false;
      }
    }
  }
}

function updateEnvironmentalDamage(dt){
  const now=performance.now();
  if(now-player.cactusHurtAt<650)return;
  const minX=Math.floor(player.pos.x-S.playerR-0.08),maxX=Math.floor(player.pos.x+S.playerR+0.08);
  const minY=Math.floor(player.pos.y+.05),maxY=Math.floor(player.pos.y+S.playerH-0.05);
  const minZ=Math.floor(player.pos.z-S.playerR-0.08),maxZ=Math.floor(player.pos.z+S.playerR+0.08);
  for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)for(let z=minZ;z<=maxZ;z++){
    if(getBlock(x,y,z)!==BLOCK.CACTUS)continue;
    player.cactusHurtAt=now;
    damagePlayer(1,"cactus");
    return;
  }
}

// ═══════════════════════════════
//  RAYCAST / BREAK / PLACE
// ═══════════════════════════════
// ═══════════════════════════════
//  INVENTORY DROP
// ═══════════════════════════════
function addToInventory(id){
  if(!id||id===BLOCK.AIR)return;
  addToInventory2(mkItem(id,1));
}

function doRaycast(){
  const ox=player.pos.x,oy=player.pos.y+S.eyeH,oz=player.pos.z;
  const rdx=-Math.sin(player.yaw)*Math.cos(player.pitch);
  const rdy=Math.sin(player.pitch);
  const rdz=-Math.cos(player.yaw)*Math.cos(player.pitch);
  // ── Check mobs first — their hitbox takes priority over blocks behind them ──
  let bestMobT=S.reach;
  let bestMob=null;
  for(const mob of (mobs||[])){
    const hw=mob.hitW*0.5,hd=mob.hitD*0.5;
    const t=_rayAabbHitT(ox,oy,oz,rdx,rdy,rdz,S.reach,
      mob.pos.x-hw,mob.pos.y,mob.pos.z-hd,
      mob.pos.x+hw,mob.pos.y+mob.hitH,mob.pos.z+hd);
    if(t!==null&&t<bestMobT){bestMobT=t;bestMob=mob;}
  }
  if(bestMob){
    iState.hov=null;iState.hovMob=bestMob;
    // Position sel box on mob AABB center
    selBox.visible=true;
    const hw=bestMob.hitW*0.5,hd=bestMob.hitD*0.5,hh=bestMob.hitH*0.5;
    selBox.position.set(bestMob.pos.x,bestMob.pos.y+hh,bestMob.pos.z);
    selBox.scale.set(hw*2+0.02,hh*2+0.02,hd*2+0.02);
    return;
  }
  iState.hovMob=null;
  selBox.scale.setScalar(1);
  // Only test meshes from the 3×3 chunk neighbourhood — at most ~36 meshes vs 200+.
  // Player reach (~5 blocks) is much shorter than chunkSize (16) so this is always safe.
  const pcx=Math.floor(player.pos.x/S.chunkSize),pcz=Math.floor(player.pos.z/S.chunkSize);
  _nearHM.length=0;
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
    const c=chunkMap.get(ck(pcx+dx,pcz+dz));
    if(c)for(let j=0;j<c.meshes.length;j++)_nearHM.push(c.meshes[j]);
  }
  raycaster.setFromCamera(CENTER_NDC,camera);
  const hits=raycaster.intersectObjects(_nearHM,false);
  iState.hov=null;selBox.visible=false;
  for(const h of hits){
    if(h.distance>S.reach)continue;
    if(h.instanceId!==undefined){
      // InstancedMesh hit (water, torch, glass, cactus)
      const m=h.object.userData.i2b?.[h.instanceId];if(!m)continue;
      // Skip water — let the ray continue to solid blocks behind/below it
      if(h.object.userData.bt===BLOCK.WATER)continue;
      if(!h.face||!h.face.normal)continue;
      nmx.getNormalMatrix(h.object.matrixWorld);
      _faceN.copy(h.face.normal).applyMatrix3(nmx).round();
      iState.hov={block:m,normal:{x:_faceN.x,y:_faceN.y,z:_faceN.z},type:h.object.userData.bt};
      selBox.visible=true;selBox.position.set(m.x+.5,m.y+.5,m.z+.5);return;
    }else if(h.object.userData.type==='merged'){
      // Merged atlas mesh hit
      const fd=h.object.userData.faceData;
      if(!fd||fd.length<5)continue;
      const faceIndex=Number.isFinite(h.faceIndex)?h.faceIndex:-1;
      if(faceIndex<0)continue;
      const qi=(faceIndex/2)|0;const fo=qi*5;
      if(fo+4>=fd.length)continue;
      const lx=fd[fo],ly=fd[fo+1],lz=fd[fo+2],fi=fd[fo+3]|0;
      const parentPos=h.object.parent&&h.object.parent.position;
      if(!parentPos)continue;
      const ox=Math.round(parentPos.x);
      const oz=Math.round(parentPos.z);
      const wx=ox+lx,wy=ly,wz=oz+lz;
      const bt=getBlock(wx,wy,wz);
      // Skip water — let ray continue to solid blocks behind/below it
      if(bt===BLOCK.WATER)continue;
      const faceSet=h.object.material===waterMergeMat?WATER_CUBE_FACES:CUBE_FACES;
      const cf=faceSet[fi]||CUBE_FACES[fi];
      let nx,ny,nz;
      if(cf&&Number.isFinite(cf.dx)&&Number.isFinite(cf.dy)&&Number.isFinite(cf.dz)){
        nx=cf.dx;ny=cf.dy;nz=cf.dz;
      }else if(h.face&&h.face.normal){
        nmx.getNormalMatrix(h.object.matrixWorld);
        _faceN.copy(h.face.normal).applyMatrix3(nmx).round();
        nx=_faceN.x;ny=_faceN.y;nz=_faceN.z;
      }else continue;
      iState.hov={block:{x:wx,y:wy,z:wz},normal:{x:nx,y:ny,z:nz},type:bt};
      selBox.visible=true;selBox.position.set(wx+.5,wy+.5,wz+.5);return;
    }
  }
}
function doBreaking(dt){
  const ok=pLocked&&iState.lmb&&iState.hov&&!invOpen&&!tableOpen&&!chestOpen&&!furnaceOpen;
  if(!ok){
    iState.breaking=false;iState.breakT=0;iState.breakKey="";
    $breakBar.classList.remove("show");$breakFill.style.width="0%";breakMesh.visible=false;return;
  }
  const {x,y,z}=iState.hov.block;
  const bt=getBlock(x,y,z);
  if(bt===BLOCK.AIR||bt===BLOCK.WATER){$breakBar.classList.remove("show");breakMesh.visible=false;return;}
  const key=`${x},${y},${z}`;
  if(iState.breakKey!==key){iState.breakKey=key;iState.breakT=0;}
  iState.breaking=true;iState.breakT+=dt;
  const toolSlot=hotbarSlots[player.selIdx];
  const dur=player.creative?0.05:getBreakTime(bt,toolSlot);
  const prg=THREE.MathUtils.clamp(iState.breakT/dur,0,1);
  $breakBar.classList.add("show");$breakFill.style.width=`${prg*100}%`;
  // Stage 0–9 crack overlay (Minecraft has 10 destroy stages)
  const crackStage=Math.min(9,Math.floor(prg*10));
  breakMesh.material=_crackMats[crackStage];
  breakMesh.visible=true;breakMesh.position.set(x+.5,y+.5,z+.5);
  breakMesh.scale.setScalar(1.001);
  if(prg>=1){
    setBlock(x,y,z,BLOCK.AIR);
    sfxBlockBreak(bt);
    addExhaustion(0.005);
    // setBlock already schedules dirty chunk rebuilds; avoid synchronous rebuild stalls.
    spawnParticles(x,y,z,bt);
    // Remove torch light if torch was broken
    if(bt===BLOCK.TORCH){
      const tk=blockKey(x,y,z);
      const tl=torchLights.get(tk);if(tl){scene.remove(tl);torchLights.delete(tk);}
    }
    // Trigger leaf decay when wood is broken
    if(bt===BLOCK.WOOD) triggerNearbyLeafDecay(x,y,z);
    iState.breakT=0;iState.breakKey="";breakMesh.visible=false;
    // Deplete tool durability
    if(!player.creative&&toolSlot&&isTool(toolSlot.id)){
      const ti=TOOL_INFO[toolSlot.id];
      const ts=TOOL_SPEEDS[ti.type];
      if(ts&&ts.blocks.has(bt)){
        toolSlot.dur=(toolSlot.dur??ti.dur)-1;
        if(toolSlot.dur<=0){
          hotbarSlots[player.selIdx]=null;
          showMsg(`${ti.name} broke!`,1200);
        }
        buildHotbarUI();selectSlot(player.selIdx);
      }
    }
    const drop=getBlockDrop(bt,toolSlot);
    if(drop!=null){spawnDropItem(drop,x,y,z);}
  }
}
function tryPlace(){
  if(!iState.hov)return false;
  const hs=hotbarSlots[player.selIdx];
  const selId=hs?hs.id:BLOCK.AIR;
  if(!selId||selId===BLOCK.AIR||selId===BLOCK.WATER)return false;
  // Special: water source bucket placement
  if(selId===ITEM.WATER_SOURCE){
    const{block,normal}=iState.hov;
    const tx=block.x+normal.x,ty=block.y+normal.y,tz=block.z+normal.z;
    if(ty<1||ty>=S.worldH)return false;
    const cur=getBlock(tx,ty,tz);
    if(cur!==BLOCK.AIR&&cur!==BLOCK.WATER)return false;
    placeWaterSource(tx,ty,tz);
    if(!player.creative){
      hs.count--;if(hs.count<=0)hotbarSlots[player.selIdx]=null;
    }
    buildHotbarUI();selectSlot(player.selIdx);
    showMsg("Placed water source",700);return true;
  }
  if(isTool(selId)||isRawItem(selId))return false;
  const{block,normal}=iState.hov;
  const tx=block.x+normal.x,ty=block.y+normal.y,tz=block.z+normal.z;
  if(ty<1||ty>=S.worldH)return false;
  const cur=getBlock(tx,ty,tz);
  if(cur!==BLOCK.AIR&&cur!==BLOCK.WATER)return false;
  if(selId!==BLOCK.TORCH&&overlapsPlayer(tx,ty,tz)){showMsg("Too close",600);return false;}
  // Torch: must be placed on a solid block, not on another torch
  if(selId===BLOCK.TORCH){
    const below=getBlock(tx,ty-1,tz);
    if(!isSolid(below)||below===BLOCK.TORCH){showMsg("Need solid surface",700);return false;}
  }
  setBlock(tx,ty,tz,selId);
  sfxBlockPlace(selId);
  // Spawn torch light
  if(selId===BLOCK.TORCH&&torchLights.size<64){
    const tk=blockKey(tx,ty,tz);
    const pl=new THREE.PointLight(0xffaa44,1.9,14);
    pl.castShadow=false;
    pl.position.set(tx+0.5,ty+0.7,tz+0.5);
    scene.add(pl);torchLights.set(tk,pl);
  }
  if(!player.creative){
    hs.count--;
    if(hs.count<=0)hotbarSlots[player.selIdx]=null;
  }
  buildHotbarUI();selectSlot(player.selIdx);
  showMsg(`Placed ${BLOCK_INFO[selId]?.name??"block"}`,700);return true;
}
function overlapsPlayer(x,y,z){
  const r=S.playerR;
  return!(player.pos.x+r<=x||player.pos.x-r>=x+1||player.pos.y+S.playerH<=y||player.pos.y>=y+1||player.pos.z+r<=z||player.pos.z-r>=z+1);
}

// ═══════════════════════════════
//  WATER SIMULATION
//  Minecraft-accurate mechanics:
//  - Source blocks (level 8) spread outward and re-queue when neighbors open
//  - Water falls down with full level first (priority), then spreads horizontally
//  - Level decrements by 1 per horizontal step (8=source, 1=edge, 7 blocks max range)
//  - Flowing water evaporates when no adjacent source/higher block can feed it
//  - Player can place source blocks via ITEM.WATER_SOURCE
// ═══════════════════════════════
function schedWater(x,y,z){
  const k=blockKey(x,y,z);
  if(!waterScheduled.has(k)){waterScheduled.add(k);waterQueue.push({x,y,z});}
}
function seedChunkWater(cx,cz){
  // Seed natural chunk water as source water while respecting player overrides.
  const ox=cx*S.chunkSize,oz=cz*S.chunkSize;
  for(let lx=0;lx<S.chunkSize;lx++)for(let lz=0;lz<S.chunkSize;lz++){
    const wx=ox+lx,wz=oz+lz;
    for(let y=S.waterLevel;y>=1;y--){
      if(genBlock(wx,y,wz)!==BLOCK.WATER)break;
      const k=blockKey(wx,y,wz);
      if(overrides.has(k)&&overrides.get(k)!==BLOCK.WATER)continue;
      if(!waterSources.has(k))waterSources.add(k);
      if(!waterLevels.has(k))waterLevels.set(k,WATER_MAX_LEVEL);
      schedWater(wx,y,wz);
    }
  }
}
function updateWater(dt){
  lastWaterTick+=dt;
  if(lastWaterTick<WATER_TICK)return;
  lastWaterTick=0;
  // Adaptive batch keeps water responsive while protecting frame time.
  const batchCap=lagDebug.lastFrameMs>20?36:(lagDebug.lastFrameMs>14?62:92);
  const batchSize=Math.min(batchCap,waterQueue.length);
  for(let i=0;i<batchSize;i++){
    const b=waterQueue[i];
    waterScheduled.delete(blockKey(b.x,b.y,b.z));
    tickWater(b.x,b.y,b.z);
  }
  waterQueue.splice(0,batchSize);
}
function _waterLevelAt(x,y,z){
  if(getBlock(x,y,z)!==BLOCK.WATER)return 0;
  const k=blockKey(x,y,z);
  if(waterSources.has(k))return WATER_MAX_LEVEL;
  const cached=waterLevels.get(k);
  if(cached!==undefined)return cached;
  // Untouched terrain water should stay calm/stable like natural source water.
  if(!overrides.has(k)&&y<=S.waterLevel)return WATER_MAX_LEVEL;
  return WATER_MAX_LEVEL-1;
}
function tickWater(x,y,z){
  const bt=getBlock(x,y,z);
  if(bt!==BLOCK.WATER)return;
  const k=blockKey(x,y,z);
  let isSource=waterSources.has(k);
  let level=isSource?WATER_MAX_LEVEL:(waterLevels.get(k)??WATER_MAX_LEVEL);

  if(!isSource&&!waterLevels.has(k)&&!overrides.has(k)&&y<=S.waterLevel){
    waterSources.add(k);
    waterLevels.set(k,WATER_MAX_LEVEL);
    isSource=true;
    level=WATER_MAX_LEVEL;
  }

  // 1) Vertical priority: feed down first for stable waterfalls.
  if(y>0){
    const downBt=getBlock(x,y-1,z);
    const downLv=_waterLevelAt(x,y-1,z);
    if(downBt===BLOCK.AIR||(downBt===BLOCK.WATER&&downLv<WATER_MAX_LEVEL)){
      placeWF(x,y-1,z,WATER_MAX_LEVEL,false);
      schedWater(x,y-1,z);
      schedWater(x,y,z);
    }
  }

  // 2) Recompute flowing water level from neighbors/sources.
  if(!isSource){
    let desired=0;
    if(y+1<S.worldH&&getBlock(x,y+1,z)===BLOCK.WATER&&_waterLevelAt(x,y+1,z)>=WATER_MAX_LEVEL-1){
      desired=WATER_MAX_LEVEL;
    }else{
      let maxFeed=0;
      for(const[dx,dz]of _hDirs){
        const nx=x+dx,nz=z+dz;
        if(getBlock(nx,y,nz)!==BLOCK.WATER)continue;
        const nl=_waterLevelAt(nx,y,nz);
        if(nl>maxFeed)maxFeed=nl;
      }
      desired=maxFeed>1?maxFeed-1:0;
    }

    if(desired<=0){
      waterLevels.delete(k);
      waterSources.delete(k);
      overrides.set(k,BLOCK.AIR);
      rebuildNear(x,z);
      const n6=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,-1,0],[0,1,0]];
      for(const d of n6){
        const nx=x+d[0],ny=y+d[1],nz=z+d[2];
        if(getBlock(nx,ny,nz)===BLOCK.WATER)schedWater(nx,ny,nz);
      }
      return;
    }
    if(level!==desired){
      level=desired;
      waterLevels.set(k,level);
    }
  }else{
    waterLevels.set(k,WATER_MAX_LEVEL);
    level=WATER_MAX_LEVEL;
  }

  // 3) Horizontal spread from level gradient.
  if(y+1<S.worldH&&getBlock(x,y+1,z)===BLOCK.WATER&&!isSource)return;
  if(level>1){
    const outLevel=level-1;
    let spread=false;
    for(const[dx,dz]of _hDirs){
      const nx=x+dx,nz=z+dz;
      const nbt=getBlock(nx,y,nz);
      if(nbt===BLOCK.AIR){
        placeWF(nx,y,nz,outLevel,false);spread=true;
      }else if(nbt===BLOCK.WATER){
        const nl=_waterLevelAt(nx,y,nz);
        if(nl+0.01<outLevel){placeWF(nx,y,nz,outLevel,false);spread=true;}
      }
    }
    if(spread)schedWater(x,y,z);
  }
}
function placeWF(x,y,z,level,isSource=false){
  if(y<0||y>=S.worldH)return;
  const k=blockKey(x,y,z);
  if(isSource)waterSources.add(k);
  const sourceNow=waterSources.has(k);
  const targetLevel=sourceNow?WATER_MAX_LEVEL:Math.max(1,Math.min(WATER_MAX_LEVEL,Math.floor(level)));
  const curLevel=sourceNow?WATER_MAX_LEVEL:(waterLevels.get(k)??0);
  if(curLevel>=targetLevel&&getBlock(x,y,z)===BLOCK.WATER)return;
  waterLevels.set(k,targetLevel);
  if(getBlock(x,y,z)!==BLOCK.WATER){
    overrides.set(k,BLOCK.WATER);rebuildNear(x,z);
  }
  schedWater(x,y,z);
}
function placeWaterSource(x,y,z){
  // Place a player-controlled source block.
  placeWF(x,y,z,WATER_MAX_LEVEL,true);
  schedWater(x,y,z);
  for(const d of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,-1,0]]){
    const nx=x+d[0],ny=y+d[1],nz=z+d[2];
    if(getBlock(nx,ny,nz)===BLOCK.WATER||getBlock(nx,ny,nz)===BLOCK.AIR)schedWater(nx,ny,nz);
  }
}
function getWaterFlow(wx,wy,wz){
  const ix=Math.floor(wx),iy=Math.floor(wy),iz=Math.floor(wz);
  if(getBlock(ix,iy,iz)!==BLOCK.WATER)return{x:0,z:0,fall:0,strength:0};
  let ax=0,az=0,wsum=0;
  for(let oy=-1;oy<=1;oy++){
    const yy=iy+oy;
    if(yy<0||yy>=S.worldH)continue;
    if(getBlock(ix,yy,iz)!==BLOCK.WATER)continue;
    const layerW=oy===0?1:0.42;
    const here=_waterLevelAt(ix,yy,iz);
    for(const[dx,dz]of _hDirs){
      const nx=ix+dx,nz=iz+dz;
      const nbt=getBlock(nx,yy,nz);
      if(nbt===BLOCK.WATER){
        const nl=_waterLevelAt(nx,yy,nz);
        const diff=here-nl;
        if(diff>0){ax+=dx*diff*layerW;az+=dz*diff*layerW;}
        else if(diff<0){ax+=dx*diff*0.24*layerW;az+=dz*diff*0.24*layerW;}
      }else if(nbt===BLOCK.AIR){
        const pull=here*0.13;
        ax+=dx*pull*layerW;az+=dz*pull*layerW;
      }
    }
    wsum+=layerW;
  }
  if(wsum>1e-5){ax/=wsum;az/=wsum;}
  let fall=0;
  if(iy>0){
    const below=getBlock(ix,iy-1,iz);
    if(below===BLOCK.AIR||(below===BLOCK.WATER&&_waterLevelAt(ix,iy-1,iz)<WATER_MAX_LEVEL))fall=1;
  }
  const rawLen=Math.hypot(ax,az);
  const strength=Math.min(1.15,rawLen*0.55+fall*0.35);
  if(rawLen>1e-5){ax/=rawLen;az/=rawLen;}
  return{x:ax,z:az,fall,strength};
}

// ═══════════════════════════════
//  PARTICLES
// ═══════════════════════════════
function spawnMobDeathParticles(x,y,z,count=16){
  if(!GS.particles)return;
  const col=0xf5f7ff;
  if(!_partMatCache.has(col))_partMatCache.set(col,new THREE.MeshLambertMaterial({color:col}));
  const mat=_partMatCache.get(col);
  for(let i=0;i<count;i++){
    const p=new THREE.Mesh(partGeo,mat);
    p.position.set(x+(Math.random()-.5)*0.55,y+0.18+Math.random()*0.45,z+(Math.random()-.5)*0.55);
    p.userData.vel=new THREE.Vector3((Math.random()-.5)*1.8,1.6+Math.random()*2.6,(Math.random()-.5)*1.8);
    p.userData.life=.42+Math.random()*.34;
    p.userData.rs=new THREE.Vector3(Math.random()*8,Math.random()*8,Math.random()*8);
    scene.add(p);particles.push(p);
  }
}
function spawnParticles(x,y,z,bt){
  if(!GS.particles)return;
  const info=BLOCK_INFO[bt];
  const col=info.color;
  if(!_partMatCache.has(col))_partMatCache.set(col,new THREE.MeshLambertMaterial({color:col}));
  const mat=_partMatCache.get(col);
  for(let i=0;i<12;i++){
    const p=new THREE.Mesh(partGeo,mat);
    p.position.set(x+.5,y+.5,z+.5);
    p.userData.vel=new THREE.Vector3((Math.random()-.5)*4.5,Math.random()*4.2,(Math.random()-.5)*4.5);
    p.userData.life=.5+Math.random()*.4;
    p.userData.rs=new THREE.Vector3(Math.random()*6,Math.random()*6,Math.random()*6);
    scene.add(p);particles.push(p);
  }
}
function updateParticles(dt){
  let write=0;
  for(let i=0;i<particles.length;i++){
    const p=particles[i];p.userData.life-=dt;
    if(p.userData.life<=0){scene.remove(p);p.geometry.dispose();continue;}
    p.userData.vel.y-=16*dt;p.position.addScaledVector(p.userData.vel,dt);
    p.rotation.x+=p.userData.rs.x*dt;p.rotation.y+=p.userData.rs.y*dt;p.rotation.z+=p.userData.rs.z*dt;
    p.scale.setScalar(Math.max(.15,p.userData.life*1.1));
    particles[write++]=p;
  }
  particles.length=write;
}

// ═══════════════════════════════
//  ITEM DROP ENTITIES
// ═══════════════════════════════
const _dropGeo=new THREE.BoxGeometry(.36,.36,.36);
const _dropItemMatCache=new Map();
function getDropMaterial(id){
  const m=mats[id];
  if(m)return m;
  if(_dropItemMatCache.has(id))return _dropItemMatCache.get(id);
  const cv=document.createElement("canvas");
  cv.width=cv.height=16;
  drawItemIcon(cv.getContext("2d"),id);
  const tex=new THREE.CanvasTexture(cv);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.magFilter=tex.minFilter=THREE.NearestFilter;
  tex.generateMipmaps=false;
  tex.needsUpdate=true;
  const mat=new THREE.MeshLambertMaterial({map:tex,transparent:true,alphaTest:0.08,side:THREE.DoubleSide});
  _dropItemMatCache.set(id,mat);
  return mat;
}
function spawnDropItem(blockId,x,y,z){
  const m=getDropMaterial(blockId);if(!m)return;
  const mesh=new THREE.Mesh(_dropGeo,Array.isArray(m)?m:m);
  mesh.castShadow=false;
  const ang=Math.random()*Math.PI*2;
  const spd=0.9+Math.random()*1.4;
  mesh.position.set(x+.5+(Math.random()-.5)*.2,y+.55,z+.5+(Math.random()-.5)*.2);
  scene.add(mesh);
  dropItems.push({mesh,blockId,
    vel:new THREE.Vector3(Math.cos(ang)*spd,2.8+Math.random()*1.8,Math.sin(ang)*spd),
    age:0,baseY:0,landed:false});
}
function updateDropItems(dt){
  const px=player.pos.x,py=player.pos.y+0.8,pz=player.pos.z;
  for(let i=dropItems.length-1;i>=0;i--){
    const d=dropItems[i];
    d.age+=dt;
    if(!d.landed){
      d.vel.y-=22*dt;
      d.mesh.position.x+=d.vel.x*dt;
      d.mesh.position.y+=d.vel.y*dt;
      d.mesh.position.z+=d.vel.z*dt;
      const bx=Math.floor(d.mesh.position.x),bz=Math.floor(d.mesh.position.z);
      for(let gy=Math.floor(d.mesh.position.y);gy>=Math.max(0,Math.floor(d.mesh.position.y)-4);gy--){
        const b=getBlock(bx,gy,bz);
        if(b!==BLOCK.AIR&&b!==BLOCK.WATER){d.baseY=gy+1.18;break;}
      }
      if(d.mesh.position.y<=d.baseY){d.mesh.position.y=d.baseY;d.vel.set(0,0,0);d.landed=true;}
    }
    if(d.landed) d.mesh.position.y=d.baseY+Math.sin(d.age*3.2+i)*.06;
    d.mesh.rotation.y+=dt*2.0;
    const dx=d.mesh.position.x-px,dy=d.mesh.position.y-py,dz=d.mesh.position.z-pz;
    if(d.age>0.5&&dx*dx+dy*dy+dz*dz<2.89){
      addToInventory(d.blockId);
      sfxItemPickup();
      showMsg(`+1 ${getItemName(d.blockId)}`,800);
      scene.remove(d.mesh);
      dropItems[i]=dropItems[dropItems.length-1];
      dropItems.length--;
    }
  }
}

// ═══════════════════════════════
//  STATS
// ═══════════════════════════════
function updateStats(){
  if(!$stats.classList.contains("show"))return;
  const now=performance.now();
  if(now-uiDebug.lastStatsAt<180)return;
  uiDebug.lastStatsAt=now;
  const cx=Math.floor(player.pos.x/S.chunkSize),cz=Math.floor(player.pos.z/S.chunkSize);
  const _shs=hotbarSlots[player.selIdx];const selId=_shs?_shs.id:BLOCK.AIR;
  const nextText=
    `<b>Pos</b> ${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)}<br>`+
    `<b>Chunk</b> ${cx},${cz} &nbsp;·&nbsp; <b>Loaded</b> ${chunkMap.size}<br>`+
    `<b>View</b> ${player.mode==="first"?"First Person":(player.mode==="third"?"Third Person (Back)":"Third Person (Front)")}<br>`+
    `<b>Holding</b> ${selId&&selId!==BLOCK.AIR?(BLOCK_INFO[selId]?.name??"Empty"):"Empty"}`;
  if(nextText!==uiDebug.statsText){
    uiDebug.statsText=nextText;
    $stats.innerHTML=nextText;
  }
}

function fmtAudioTime(seconds){
  if(!Number.isFinite(seconds)||seconds<0)return "--:--.--";
  const mins=Math.floor(seconds/60);
  const secs=(seconds-mins*60).toFixed(2).padStart(5,"0");
  return `${String(mins).padStart(2,"0")}:${secs}`;
}

function audioTrackName(track){
  if(!track)return "none";
  const phase=track._phase||"?";
  const label=track._label||"unknown";
  return `${phase}/${label}`;
}

function _allTracksRawTime(phase){
  const list=ambientAudio.playlists[phase]||[];
  return list.map(t=>fmtAudioTime(t.currentTime)).join(", ")||"--:--.--";
}

function _phaseTrackCount(phase){
  return (ambientAudio.playlists[phase]||[]).length;
}

function updateAudioDebug(){
  const now=performance.now();
  if(now-uiDebug.lastAudioAt<220)return;
  uiDebug.lastAudioAt=now;
  const info=getAmbientPhaseInfo();
  const current=ambientAudio.currentTrack;
  const currentTime=current?.currentTime;
  const dur=current?.duration;
  const remaining=Number.isFinite(currentTime)&&Number.isFinite(dur)?Math.max(0,dur-currentTime):NaN;
  const nextText=
    `<b>Audio timer</b><br>`+
    `<span class="dim">phase</span> ${info.phase}<br>`+
    `<span class="dim">phase time</span> ${fmtAudioTime(info.phaseSeconds)} / ${fmtAudioTime(info.phaseLen)}<br>`+
    `<span class="dim">current track</span> ${audioTrackName(current)}<br>`+
    `<span class="dim">track time</span> ${fmtAudioTime(currentTime)} / ${fmtAudioTime(dur)}<br>`+
    `<span class="dim">remaining</span> ${fmtAudioTime(remaining)}<br>`+
    `<span class="dim">fading out</span> ${audioTrackName(ambientAudio.fadingTrack)}<br>`+
    `<span class="dim">pending</span> ${audioTrackName(ambientAudio.pendingTrack)}<br>`+
    `<span class="dim">fade mode</span> ${ambientAudio.fadeState}<br>`+
    `<span class="dim">day tracks</span> ${_phaseTrackCount("day")}<br>`+
    `<span class="dim">night tracks</span> ${_phaseTrackCount("night")}<br>`+
    `<span class="dim">day raw</span> ${_allTracksRawTime("day")}<br>`+
    `<span class="dim">night raw</span> ${_allTracksRawTime("night")}`;
  if(nextText!==uiDebug.audioText){
    uiDebug.audioText=nextText;
    $audioDebug.innerHTML=nextText;
  }
}

function updateFpsCounter(dt){
  fpsFrames++;
  fpsAccum+=dt;
  if(fpsAccum>=0.25){
    fpsValue=Math.round(fpsFrames/fpsAccum);
    fpsFrames=0;
    fpsAccum=0;
  }
  const now=performance.now();
  if(now-uiDebug.lastFpsDomAt<220)return;
  uiDebug.lastFpsDomAt=now;
  const nextText=
    `<b>FPS</b><br>`+
    `<span class="dim">frames</span> ${fpsValue||Math.round(1/Math.max(dt,0.0001))}<br>`+
    `<span class="dim">chunks</span> ${chunkMap.size}<br>`+
    `<span class="dim">queued</span> ${genQueue.length+dirtyQ.length+(activeChunkJob?1:0)}`;
  if(nextText!==uiDebug.fpsText){
    uiDebug.fpsText=nextText;
    $fpsCounter.innerHTML=nextText;
  }
}

function logLagDebug(kind,details,force=false){
  if(!lagDebug.enabled)return;
  const now=performance.now();
  const cooldowns={
    "scheduler-stall":2200,
    "frame-spike":900,
    "perf-adjust":2200,
    "chunk-build":2600,
    "camera-jump":0,
    "player-jump":0
  };
  const minGap=cooldowns[kind]??500;
  if(!force&&now-lagDebug.lastConsoleAt<250)return;
  if(!force&&now-(lagDebug.lastKindAt[kind]||0)<minGap)return;
  lagDebug.lastConsoleAt=now;
  lagDebug.lastKindAt[kind]=now;
  console.warn(`[LagDebug:${kind}]`,details);
}

function resetLagBaselines(graceMs=600){
  lagDebug.lastFrameAt=performance.now();
  lagDebug.startupUntil=lagDebug.lastFrameAt+graceMs;
  lagDebug.lastKindAt=Object.create(null);
  lagDebug.lastCameraPos.copy(camera.position);
  lagDebug.lastPlayerPos.copy(player.pos);
}

function onVisChange(){
  if(document.hidden){
    keys.clear();
    iState.lmb=false;
    iState.breaking=false;
    iState.breakT=0;
    lagDebug.lastFrameAt=performance.now();
    return;
  }
  resetLagBaselines(1000);
}

function adjustPerformanceBudget(frameMs){
  if(!ENABLE_DYNAMIC_RESOLUTION)return;
  const now=performance.now();
  if(now<perfTuning.settleUntil)return;
  if(now-perfTuning.lastAdjustAt<perfTuning.minAdjustGapMs)return;
  const fpsSample=fpsValue||60;
  const pressure=chunkQueuePressure();
  if(frameMs>24||fpsSample<48||pressure>14){
    perfTuning.lowSamples++;
  }else{
    perfTuning.lowSamples=Math.max(0,perfTuning.lowSamples-1);
  }
  if(perfTuning.lowSamples>=4&&perfTuning.pixelRatio>perfTuning.minPixelRatio){
    perfTuning.pixelRatio=Math.max(perfTuning.minPixelRatio,perfTuning.pixelRatio-0.05);
    renderer.setPixelRatio(perfTuning.pixelRatio);
    renderer.setSize(innerWidth,innerHeight,false);
    perfTuning.lastAdjustAt=now;
    perfTuning.lastDownscaleAt=now;
    perfTuning.lowSamples=0;
    logLagDebug("perf-adjust",{pixelRatio:+perfTuning.pixelRatio.toFixed(2),reason:"downscale"},false);
  }
}

function checkLagDebug(rawDtMs,frameMs,dt,timings){
  if(!lagDebug.enabled)return;
  if(performance.now()<lagDebug.startupUntil){
    lagDebug.lastCameraPos.copy(camera.position);
    lagDebug.lastPlayerPos.copy(player.pos);
    lagDebug.lastMode=player.mode;
    return;
  }
  // Suppress camera-jump false positives when switching between 1st/3rd person
  if(lagDebug.lastMode!==player.mode){
    lagDebug.lastMode=player.mode;
    lagDebug.lastCameraPos.copy(camera.position);
    lagDebug.lastPlayerPos.copy(player.pos);
    return;
  }
  const cameraStep=lagDebug.lastCameraPos.distanceTo(camera.position);
  const playerStep=lagDebug.lastPlayerPos.distanceTo(player.pos);
  // Quick early-exit: skip expensive sort/filter when nothing interesting happened
  const anyWarn=rawDtMs>=lagDebug.schedulerWarnMs||frameMs>=lagDebug.frameWarnMs||cameraStep>=lagDebug.cameraJump||playerStep>=lagDebug.playerJump;
  if(!anyWarn){lagDebug.lastCameraPos.copy(camera.position);lagDebug.lastPlayerPos.copy(player.pos);return;}
  // Compute section analysis only when needed
  let _topSections=null,_worstSections=null;
  function getTopSections(){
    if(!_topSections)_topSections=Object.entries(timings).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([name,ms])=>`${name}:${ms.toFixed(2)}ms`);
    return _topSections;
  }
  function getWorstSections(){
    if(!_worstSections)_worstSections=Object.entries(timings).filter(([,ms])=>ms>=lagDebug.sectionWarnMs).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([name,ms])=>`${name}:${ms.toFixed(2)}ms`);
    return _worstSections;
  }
  const browserStall=
    rawDtMs>=lagDebug.schedulerWarnMs&&
    frameMs<8&&
    getWorstSections().length===0&&
    cameraStep<0.2&&
    playerStep<0.2;
  const trueFrameSpike=frameMs>=lagDebug.frameWarnMs||getWorstSections().length>0;
  const mixedSpike=rawDtMs>=lagDebug.schedulerWarnMs&&frameMs>=lagDebug.mixedFrameWarnMs;

  if(browserStall){
    logLagDebug("scheduler-stall",{
      rawDtMs:+rawDtMs.toFixed(2),
      frameMs:+frameMs.toFixed(2),
      clampedDtMs:+(dt*1000).toFixed(2),
      playerStep:+playerStep.toFixed(3),
      cameraStep:+cameraStep.toFixed(3),
      queues:{gen:genQueue.length,dirty:dirtyQ.length,loaded:chunkMap.size},
      topSections:getTopSections()
    },false);
  }else if(trueFrameSpike||mixedSpike){
    const spikeKind=getWorstSections().length?"heavy-section":(mixedSpike?"mixed":"frame");
    logLagDebug("frame-spike",{
      spikeKind,
      rawDtMs:+rawDtMs.toFixed(2),
      frameMs:+frameMs.toFixed(2),
      clampedDtMs:+(dt*1000).toFixed(2),
      playerStep:+playerStep.toFixed(3),
      cameraStep:+cameraStep.toFixed(3),
      vel:{x:+player.vel.x.toFixed(2),y:+player.vel.y.toFixed(2),z:+player.vel.z.toFixed(2)},
      queues:{gen:genQueue.length,dirty:dirtyQ.length,loaded:chunkMap.size},
      mode:player.mode,
      topSections:getTopSections(),
      sections:getWorstSections()
    },trueFrameSpike);
  }

  if(cameraStep>=lagDebug.cameraJump){
    logLagDebug("camera-jump",{
      rawDtMs:+rawDtMs.toFixed(2),
      frameMs:+frameMs.toFixed(2),
      cameraStep:+cameraStep.toFixed(3),
      playerStep:+playerStep.toFixed(3),
      mode:player.mode,
      pointerLocked:pLocked,
      pos:{x:+camera.position.x.toFixed(2),y:+camera.position.y.toFixed(2),z:+camera.position.z.toFixed(2)}
    },true);
  }

  if(playerStep>=lagDebug.playerJump){
    logLagDebug("player-jump",{
      rawDtMs:+rawDtMs.toFixed(2),
      frameMs:+frameMs.toFixed(2),
      playerStep:+playerStep.toFixed(3),
      onGround:player.onGround,
      inMenu:invOpen||tableOpen||chestOpen||furnaceOpen||chatOpen,
      pos:{x:+player.pos.x.toFixed(2),y:+player.pos.y.toFixed(2),z:+player.pos.z.toFixed(2)}
    },true);
  }

  lagDebug.lastCameraPos.copy(camera.position);
  lagDebug.lastPlayerPos.copy(player.pos);
  lagDebug.lastMode=player.mode;
}

function getAmbientPhaseInfo(time=worldTime){
  const total=S.dayPhaseLen+S.nightPhaseLen;
  const cycleSec=((time%1)+1)%1*total;
  if(cycleSec<S.dayPhaseLen){
    return{phase:"day",progress:cycleSec/S.dayPhaseLen,phaseSeconds:cycleSec,phaseLen:S.dayPhaseLen};
  }
  const nSec=cycleSec-S.dayPhaseLen;
  return{phase:"night",progress:nSec/S.nightPhaseLen,phaseSeconds:nSec,phaseLen:S.nightPhaseLen};
}

function pickAmbientTrack(phase,avoidTrack=null){
  const list=ambientAudio.playlists[phase]||[];
  if(!list.length)return null;
  if(list.length===1){
    ambientAudio.lastTrackByPhase[phase]=list[0];
    return list[0];
  }
  const last=ambientAudio.lastTrackByPhase[phase];
  let pick=list[(Math.random()*list.length)|0];
  for(let i=0;i<8&&(pick===avoidTrack||pick===last);i++)pick=list[(Math.random()*list.length)|0];
  ambientAudio.lastTrackByPhase[phase]=pick;
  return pick;
}

function playAmbientTrack(track,timeSeconds=0,forceSeek=false){
  if(!track)return;
  const safeTime=Math.max(0,timeSeconds||0);
  try{
    if(forceSeek)track.pause();
    if(forceSeek||Math.abs(track.currentTime-safeTime)>0.25)track.currentTime=safeTime;
  }catch{}
  track.play().catch(()=>{});
}

function stopAmbientTrack(track){
  if(!track)return;
  track.pause();
  track.volume=0;
}

function stopAllAmbientTracks(){
  for(const track of ambientAudio.allTracks)stopAmbientTrack(track);
}

function queueAmbientTransition(nextTrack,nextPhase,startAt=0){
  if(!nextTrack)return;
  ambientAudio.pendingTrack=nextTrack;
  ambientAudio.pendingPhase=nextPhase;
  ambientAudio.pendingTime=Math.max(0,startAt||0);
  const activeTrack=ambientAudio.currentTrack;
  const needsFadeOut=activeTrack&&activeTrack!==nextTrack&&!activeTrack.paused&&activeTrack.volume>0.001;
  if(needsFadeOut){
    ambientAudio.fadingTrack=activeTrack;
    ambientAudio.fadeElapsed=0;
    ambientAudio.fadeState="out";
  }else{
    startAmbientFadeIn(nextTrack,nextPhase,ambientAudio.pendingTime);
  }
}

function onAmbientTrackEnded(track){
  if(!ambientAudio.unlocked)return;
  if(track!==ambientAudio.currentTrack)return;
  const info=getAmbientPhaseInfo();
  const next=pickAmbientTrack(info.phase,track);
  if(!next)return;
  queueAmbientTransition(next,info.phase,0);
}

function startAmbientFadeIn(track,phase,timeSeconds=0){
  if(!track)return;
  playAmbientTrack(track,timeSeconds,true);
  track.volume=0;
  ambientAudio.currentTrack=track;
  ambientAudio.currentPhase=phase;
  ambientAudio.pendingTrack=null;
  ambientAudio.pendingPhase=null;
  ambientAudio.pendingTime=0;
  ambientAudio.fadeElapsed=0;
  ambientAudio.fadeState="in";
  ambientAudio.fadingTrack=null;
}

function reserveChunkWork(){
  if(clock.elapsedTime<nextChunkWorkAt)return false;
  const hspd=Math.hypot(player.vel.x,player.vel.z);
  const frameMs=lagDebug.lastFrameMs||16;
  const pressure=chunkQueuePressure();
  let interval=hspd>6?0.15:0.085;

  if(performance.now()<lagDebug.startupUntil)interval+=0.03;
  if(frameMs>24)interval+=0.12;
  else if(frameMs>18)interval+=0.075;
  else if(frameMs<11&&pressure>0)interval-=0.018;

  nextChunkWorkAt=clock.elapsedTime+THREE.MathUtils.clamp(interval,0.05,0.26);
  return true;
}

function unlockAmbientAudio(){
  if(ambientAudio.unlocked)return;
  ambientAudio.unlocked=true;
  ambientAudio.currentPhase=null;
  ambientAudio.currentTrack=null;
  ambientAudio.fadingTrack=null;
  ambientAudio.pendingTrack=null;
  ambientAudio.pendingPhase=null;
  ambientAudio.pendingTime=0;
  ambientAudio.fadeState="idle";
  syncAmbientAudio(true);
}

function syncAmbientAudio(force=false){
  if(!ambientAudio.unlocked)return;
  const info=getAmbientPhaseInfo();
  const changingPhase=ambientAudio.currentPhase!==info.phase;

  if(force){
    stopAllAmbientTracks();
    const initial=pickAmbientTrack(info.phase,ambientAudio.currentTrack);
    if(initial)startAmbientFadeIn(initial,info.phase,0);
    return;
  }

  if(changingPhase){
    const next=pickAmbientTrack(info.phase,ambientAudio.currentTrack);
    if(next)queueAmbientTransition(next,info.phase,0);
    return;
  }

  if(!ambientAudio.currentTrack&&ambientAudio.fadeState==="idle"){
    const next=pickAmbientTrack(info.phase);
    if(next)startAmbientFadeIn(next,info.phase,0);
  }
}

function updateAmbientAudio(dt){
  updateAudioDebug();
  if(!ambientAudio.unlocked)return;
  syncAmbientAudio();
  const current=ambientAudio.currentTrack;
  if(ambientAudio.fadeState==="out"){
    ambientAudio.fadeElapsed+=dt;
    const t=THREE.MathUtils.clamp(ambientAudio.fadeElapsed/S.audioFade,0,1);
    if(ambientAudio.fadingTrack)ambientAudio.fadingTrack.volume=S.audioVolume*(1-t);
    if(t>=1){
      if(ambientAudio.fadingTrack){
        stopAmbientTrack(ambientAudio.fadingTrack);
        ambientAudio.fadingTrack=null;
      }
      if(ambientAudio.pendingTrack){
        startAmbientFadeIn(ambientAudio.pendingTrack,ambientAudio.pendingPhase,ambientAudio.pendingTime);
      }else{
        ambientAudio.currentTrack=null;
        ambientAudio.currentPhase=null;
        ambientAudio.fadeState="idle";
      }
    }
  }else if(ambientAudio.fadeState==="in"){
    if(!current)return;
    ambientAudio.fadeElapsed+=dt;
    const t=THREE.MathUtils.clamp(ambientAudio.fadeElapsed/S.audioFade,0,1);
    current.volume=S.audioVolume*t;
    if(t>=1){
      current.volume=S.audioVolume;
      ambientAudio.fadeState="idle";
    }
  }else if(current){
    current.volume=S.audioVolume;
  }
  for(const track of ambientAudio.allTracks){
    if(track!==ambientAudio.currentTrack&&track!==ambientAudio.fadingTrack&&track!==ambientAudio.pendingTrack)stopAmbientTrack(track);
  }
}

// ═══════════════════════════════
//  DAY/NIGHT
// ═══════════════════════════════
function updateDayNight(dt){
  worldTime=(worldTime+dt/S.dayLen)%1;
  updateAmbientAudio(dt);
  const phaseInfo=getAmbientPhaseInfo();
  const ang=phaseInfo.phase==="day"?phaseInfo.progress*Math.PI:Math.PI+phaseInfo.progress*Math.PI;
  const sh=Math.sin(ang);
  const ds=THREE.MathUtils.smoothstep(sh,-.18,.2);
  const tw=1-Math.min(1,Math.abs(sh)*2.4);
  _skyColor.setHSL(.63-ds*.10,.60,.045+ds*.60);
  scene.background.copy(_skyColor);scene.fog.color.copy(_skyColor);
  hemiLight.intensity=.06+tw*.08+ds*.96;
  hemiLight.color.setHSL(.6,.34,.10+ds*.58);
  hemiLight.groundColor.setHSL(.11,.18,.05+ds*.18);
  ambLight.intensity=.05+ds*.16;
  sun.position.set(Math.cos(ang)*120,sh*120,Math.sin(ang)*66);
  sun.target.position.set(player.pos.x,10,player.pos.z);sun.target.updateMatrixWorld();
  sun.intensity=.02+tw*.15+ds*1.15;sun.color.setHSL(.12,.72,.52+tw*.12);
  moon.position.copy(sun.position).multiplyScalar(-1);
  moon.target.position.set(player.pos.x,8,player.pos.z);moon.target.updateMatrixWorld();
  moon.intensity=.08+(1-ds)*.38;
  _skyN.copy(sun.position).normalize();
  _sunN.copy(_skyN);
  _moonN.copy(_skyN).negate();
  // Keep sky bodies beyond visible terrain at high render distances to avoid foreground pop-through.
  const skyBodyDist=Math.min(210,Math.max(140,scene.fog.far+12));
  const skyBodyScale=skyBodyDist/120;
  sunOrb.scale.setScalar(skyBodyScale);
  moonOrb.scale.setScalar(skyBodyScale);
  sunOrb.position.copy(player.pos).addScaledVector(_sunN,skyBodyDist);
  moonOrb.position.copy(player.pos).addScaledVector(_moonN,skyBodyDist);
  sunOrb.lookAt(camera.position);
  moonOrb.lookAt(camera.position);
  starDome.position.copy(player.pos);
  starDome.rotation.y+=dt*0.004;
  // Hide orb entirely when deeply below horizon
  sunOrb.visible=_skyN.y>-0.22;
  moonOrb.visible=_skyN.y<0.22;
  const nightFactor=THREE.MathUtils.clamp(1-ds,0,1);
  starDome.material.opacity=nightFactor*nightFactor*0.92;
}
function updateClouds(dt){
  const ch=cloudGrp.children;
  for(let i=0;i<ch.length;i++){
    const c=ch[i];
    c.position.x+=c.userData.spd*dt;
    if(c.position.x-player.pos.x>110){c.position.x=player.pos.x-110;c.position.z=player.pos.z+(Math.random()-.5)*180;}
  }
}

// ── Rain system ──────────────────────────────────────────────
var isRaining=false,_rainPhaseT=240+Math.random()*360,_rainDurT=0;
function updateRain(dt){
  _rainPhaseT-=dt;
  if(_rainPhaseT<=0){
    isRaining=!isRaining;
    _rainPhaseT=isRaining?(90+Math.random()*180):(300+Math.random()*400);
    if(isRaining){startRainSound();}else{stopRainSound();}
  }
  if(isRaining&&_rainGain){
    // Check if player is outdoors: cast upward to see sky
    const px=Math.floor(player.pos.x),pz=Math.floor(player.pos.z);
    let indoor=false;
    for(let cy=Math.floor(player.pos.y+S.playerH);cy<S.worldH;cy++){
      if(isSolid(getBlock(px,cy,pz))){indoor=true;break;}
    }
    setRainVolume(indoor?0.02:0.07);
  }
}
function updateTorchFlicker(t){
  if(!torchLights.size)return;
  for(const [k,pl] of torchLights){
    const ph=(Math.abs(k)%997)/997*6.283;
    const flick=Math.sin(t*15+ph)*0.16+Math.sin(t*27+ph*1.9)*0.09;
    pl.intensity=2.2+flick;
  }
}

// ═══════════════════════════════
//  CHUNK SYSTEM
// ═══════════════════════════════
