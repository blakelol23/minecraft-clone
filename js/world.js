/**
 * @module world
 * Chunks, terrain gen, materials, block access
 * Lines 8455-10221 from game.monolith.html
 * Loaded as source text by main.js and evaluated in one shared scope.
 */

function chunkInRange(cx,cz,ox,oz,r){
  return Math.abs(cx-ox)<=r&&Math.abs(cz-oz)<=r;
}
function seedChunks(){
  const ox=Math.floor(player.pos.x/S.chunkSize),oz=Math.floor(player.pos.z/S.chunkSize);
  const radius=effectiveStreamRadius();
  lagDebug.chunkReason="seed-priority";
  queueMissingChunksNear(ox,oz,Math.max(8,desiredStreamTopupCap()),radius);

  if(!activeChunkJob){
    const centerK=ck(ox,oz);
    if(!chunkMap.has(centerK)&&!genSet.has(centerK)){
      activeChunkJob=createChunkJob(ox,oz,"seed-priority");
      if(advanceChunkJob(activeChunkJob,Math.max(0.6,getChunkBudgetMs(true))))activeChunkJob=null;
    }else if(genQueue.length){
      if(!canStartChunkBuild(false))return;
      const px=player.pos.x/S.chunkSize,pz=player.pos.z/S.chunkSize;
      let bestI=0,bestD=Infinity;
      for(let i=0;i<genQueue.length;i++){
        const q=genQueue[i];
        const d=Math.hypot(q.cx-px,q.cz-pz);
        if(d<bestD){bestD=d;bestI=i;}
      }
      const nxt=genQueue[bestI];
      genQueue[bestI]=genQueue[genQueue.length-1];
      genQueue.length--;
      genSet.delete(ck(nxt.cx,nxt.cz));
      activeChunkJob=createChunkJob(nxt.cx,nxt.cz,"seed-priority");
      if(advanceChunkJob(activeChunkJob,Math.max(0.6,getChunkBudgetMs(true))))activeChunkJob=null;
    }
  }

  lastStreamOx=ox;lastStreamOz=oz;
}
function streamChunks(){
  const ox=Math.floor(player.pos.x/S.chunkSize),oz=Math.floor(player.pos.z/S.chunkSize);
  const radius=effectiveStreamRadius();
  const pressure=chunkQueuePressure();
  const ud=radius+((radius<=5&&pressure<=desiredGenQueueCap()*0.7)?1:0);
  const toUnload=[];
  for(const[k,c]of chunkMap){
    if(!chunkInRange(c.cx,c.cz,ox,oz,ud))toUnload.push(k);
  }
  for(let i=0;i<toUnload.length;i++)unloadChunk(toUnload[i]);
  compactGenQueueToRange(ox,oz,ud);
  trimGenQueueToCap(ox,oz);
  compactDirtyQueueToLoaded();
  trimDirtyQueueToCap(ox,oz);

  if(ox===lastStreamOx&&oz===lastStreamOz){
    if(genQueue.length<Math.max(8,Math.floor(desiredGenQueueCap()*0.32))){
      queueMissingChunksNear(ox,oz,desiredStreamTopupCap(),radius);
    }
    return;
  }

  lastStreamOx=ox;lastStreamOz=oz;

  // Queue missing chunks in bounded batches near the player.
  queueMissingChunksNear(ox,oz,Math.max(desiredStreamTopupCap(),Math.floor(desiredGenQueueCap()*0.6)),radius);
}
function queueChunk(cx,cz,force=false){
  const k=ck(cx,cz);if(chunkMap.has(k)||genSet.has(k))return false;
  if(!force&&genQueue.length>=desiredGenQueueCap())return false;
  genQueue.push({cx,cz});genSet.add(k);
  return true;
}
function processGenQueue(){
  const pox=Math.floor(player.pos.x/S.chunkSize),poz=Math.floor(player.pos.z/S.chunkSize);

  if(activeChunkJob){
    // Continue current job to avoid churn/GC spikes from cancel-and-restart loops.
    const budgetMs=getChunkBudgetMs(true);
    if(advanceChunkJob(activeChunkJob,budgetMs))activeChunkJob=null;
    return;
  }

  if(genQueue.length<Math.max(8,Math.floor(desiredGenQueueCap()*0.25))){
    queueMissingChunksNear(pox,poz,desiredStreamTopupCap(),effectiveStreamRadius());
  }
  trimGenQueueToCap(pox,poz);
  trimDirtyQueueToCap(pox,poz);

  if(!genQueue.length||lagDebug.lastFrameMs>20||!reserveChunkWork())return;
  if(!canStartChunkBuild(false))return;
  const px=player.pos.x/S.chunkSize,pz=player.pos.z/S.chunkSize;
  const cox=Math.floor(px),coz=Math.floor(pz);
  const keepRange=effectiveStreamRadius()+(chunkQueuePressure()>desiredGenQueueCap()*0.7?0:1);
  // Find closest in-range chunk; compact out-of-range entries
  let bi=-1,bd=Infinity,gw2=0;
  for(let i=0;i<genQueue.length;i++){
    const c=genQueue[i];
    if(!chunkInRange(c.cx,c.cz,cox,coz,keepRange)){
      genSet.delete(ck(c.cx,c.cz));continue;
    }
    genQueue[gw2]=c;
    const d=Math.hypot(c.cx-px,c.cz-pz);
    if(d<bd){bd=d;bi=gw2;}
    gw2++;
  }
  genQueue.length=gw2;
  if(bi<0)return;
  const nxt=genQueue[bi];
  genQueue[bi]=genQueue[gw2-1];genQueue.length=gw2-1;
  genSet.delete(ck(nxt.cx,nxt.cz));
  activeChunkJob=createChunkJob(nxt.cx,nxt.cz,"stream");
  if(advanceChunkJob(activeChunkJob,getChunkBudgetMs(false)))activeChunkJob=null;
}
function createChunkJob(cx,cz,reason){
  const k=ck(cx,cz);
  const ox=cx*S.chunkSize,oz=cz*S.chunkSize;
  const ex=chunkMap.get(k);const st=ex?ex.st:clock.elapsedTime;
  return {
    k,cx,cz,ox,oz,reason,ex,st,
    startedAt:performance.now(),cpuMs:0,
    topY:Math.max(2,S.waterLevel+2),
    decorateStage:0,
    stage:"terrain",column:0,columnTotal:S.chunkSize*S.chunkSize,
    data:acquireChunkData(),
    oFaces:acquireChunkFaceArray(),aFaces:acquireChunkFaceArray(),wFaces:acquireChunkFaceArray(),vis:acquireChunkVisMap(),meshTypes:[],meshIndex:0,
    mergeStage:0,pendingMesh:null,pendingMeshCursor:0,
    grp:null,meshes:[]
  };
}
function finishChunkJob(job){
  if(job.ex){
    disposeChunkMeshes(job.ex.meshes);
    worldRoot.remove(job.ex.grp);
    if(job.ex.data)releaseChunkData(job.ex.data);
  }
  worldRoot.add(job.grp);chunkMap.set(job.k,{k:job.k,cx:job.cx,cz:job.cz,grp:job.grp,meshes:job.meshes,data:job.data,st:job.st,topY:job.topY});
  job.data=null;
  releaseChunkJobScratch(job,false);
  seedChunkWater(job.cx,job.cz);
  if(job.cpuMs>=lagDebug.chunkWarnMs){
    logLagDebug("chunk-build",{
      reason:job.reason,
      chunk:`${job.cx},${job.cz}`,
      chunkMs:+job.cpuMs.toFixed(2),
      meshes:job.meshes.length,
      genQueue:genQueue.length,
      dirtyQueue:dirtyQ.length,
      loaded:chunkMap.size
    },false);
  }
}
function advanceChunkJob(job,budgetMs){
  const deadline=performance.now()+budgetMs;
  const maxColumnSteps=budgetMs>=2.2?4:(budgetMs>=1.2?2:1);
  while(performance.now()<deadline){
    const sliceStart=performance.now();
    if((job.stage==="decorate"||job.stage==="buildMerged"||job.stage==="mesh")&&(deadline-sliceStart)<0.28)break;
    if(job.stage==="terrain"){
      let steps=0;
      while(job.column<job.columnTotal&&steps<maxColumnSteps&&performance.now()<deadline){
        const idx=job.column++,lx=idx%S.chunkSize,lz=(idx/S.chunkSize)|0;
        const col=getCol(job.ox+lx,job.oz+lz);
        if(col.height>job.topY)job.topY=col.height;
        for(let y=0;y<S.worldH;y++)job.data[ci(lx,y,lz)]=genBlock(job.ox+lx,y,job.oz+lz);
        steps++;
      }
      if(job.column>=job.columnTotal){
        job.stage="decorate";
        job.decorateStage=0;
      }
    }else if(job.stage==="decorate"){
      if(job.decorateStage===0){
        applyTrees(job.cx,job.cz,job.data);
        job.decorateStage=1;
      }else if(job.decorateStage===1){
        applyVillages(job.cx,job.cz,job.data);
        job.decorateStage=2;
      }else{
        applyOverrides(job.cx,job.cz,job.data);
        job.stage="visible";
        job.column=0;
      }
    }else if(job.stage==="visible"){
      let steps=0;
      while(job.column<job.columnTotal&&steps<maxColumnSteps&&performance.now()<deadline){
        const idx=job.column++,lx=idx%S.chunkSize,lz=(idx/S.chunkSize)|0;
        const wx=job.ox+lx,wz=job.oz+lz;
        for(let y=0;y<S.worldH;y++){
          const t=job.data[ci(lx,y,lz)];if(t===BLOCK.AIR)continue;
          if(OPAQUE_MERGE.has(t)||ALPHA_MERGE.has(t)||WATER_MERGE.has(t)){
            // Per-face collection for merged geometry
            const isWater=WATER_MERGE.has(t);
            const fa=OPAQUE_MERGE.has(t)?job.oFaces:(isWater?job.wFaces:job.aFaces);
            const faceSet=isWater?WATER_CUBE_FACES:CUBE_FACES;
            for(let fi=0;fi<6;fi++){
              const fd=faceSet[fi];
              if(showFace(t,cawBlock(wx+fd.dx,y+fd.dy,wz+fd.dz,job.data,job.ox,job.oz))){
                fa.push(lx,y,lz,fi,t);
              }
            }
          }else{
            // InstancedMesh path: WATER, TORCH, GLASS, CACTUS
            if(!isVisible(t,wx,y,wz,job.data,job.ox,job.oz))continue;
            if(!job.vis.has(t))job.vis.set(t,[]);
            job.vis.get(t).push({lx,y,lz,wx,wz});
          }
        }
        steps++;
      }
      if(job.column>=job.columnTotal){
        job.stage="buildMerged";
        job.mergeStage=0;
      }
    }else if(job.stage==="buildMerged"){
      if(!job.grp){
        job.grp=new THREE.Group();
        job.grp.position.set(job.ox,0,job.oz);
      }
      if(job.mergeStage===0){
        if(job.oFaces.length){
          const om=buildAtlasMesh(job.oFaces,atlasMat);
          if(om){om.castShadow=false;om.receiveShadow=true;job.grp.add(om);job.meshes.push(om);}
        }
        job.mergeStage=1;
      }else if(job.mergeStage===1){
        if(job.aFaces.length){
          const am=buildAtlasMesh(job.aFaces,atlasAlphaMat);
          if(am){am.castShadow=false;am.receiveShadow=false;job.grp.add(am);job.meshes.push(am);}
        }
        job.mergeStage=2;
      }else if(job.mergeStage===2){
        if(job.wFaces.length){
          const wm=buildAtlasMesh(job.wFaces,waterMergeMat,WATER_CUBE_FACES);
          if(wm){wm.castShadow=false;wm.receiveShadow=false;job.grp.add(wm);job.meshes.push(wm);}
        }
        job.mergeStage=3;
      }else{
        job.meshTypes=Array.from(job.vis.keys());
        job.meshIndex=0;
        job.pendingMesh=null;
        job.pendingMeshCursor=0;
        job.stage="mesh";
      }
    }else if(job.stage==="mesh"){
      if(!job.pendingMesh){
        if(job.meshIndex>=job.meshTypes.length){
          finishChunkJob(job);
          job.cpuMs+=performance.now()-sliceStart;
          return true;
        }
        const t=job.meshTypes[job.meshIndex++];
        const entries=job.vis.get(t)||[];
        if(!entries.length)continue;
        const geo=t===BLOCK.TORCH?torchGeo:(t===BLOCK.WATER?waterGeo:(t===BLOCK.CACTUS?cactusGeo:cubeGeo));
        const m=new THREE.InstancedMesh(geo,mats[t],entries.length);
        m.castShadow=(t!==BLOCK.WATER&&t!==BLOCK.TORCH);m.receiveShadow=(t!==BLOCK.TORCH);
        m.frustumCulled=true;
        m.instanceMatrix.setUsage(THREE.StaticDrawUsage);m.userData.bt=t;m.userData.i2b=[];
        job.pendingMesh={mesh:m,entries,type:t};
        job.pendingMeshCursor=0;
      }
      const pm=job.pendingMesh;
      const t=pm.type;
      const entries=pm.entries;
      const instanceBudget=budgetMs>=2.2?220:(budgetMs>=1.4?120:72);
      let step=0;
      while(job.pendingMeshCursor<entries.length&&step<instanceBudget&&performance.now()<deadline){
        const e=entries[job.pendingMeshCursor];
        if(t===BLOCK.TORCH)tObj.position.set(e.lx+.5,e.y,e.lz+.5);
        else tObj.position.set(e.lx+.5,e.y+.5,e.lz+.5);
        tObj.rotation.set(0,0,0);tObj.scale.setScalar(1);tObj.updateMatrix();
        pm.mesh.setMatrixAt(job.pendingMeshCursor,tObj.matrix);
        pm.mesh.userData.i2b.push({x:e.wx,y:e.y,z:e.wz});
        job.pendingMeshCursor++;
        step++;
      }
      if(job.pendingMeshCursor>=entries.length){
        pm.mesh.instanceMatrix.needsUpdate=true;
        pm.mesh.computeBoundingSphere();
        pm.mesh.computeBoundingBox();
        job.grp.add(pm.mesh);job.meshes.push(pm.mesh);
        job.pendingMesh=null;
        job.pendingMeshCursor=0;
      }
    }
    job.cpuMs+=performance.now()-sliceStart;
  }
  return false;
}
function buildChunkImmediate(cx,cz,reason="immediate"){
  if(activeChunkJob){queueChunk(cx,cz);return false;}
  const job=createChunkJob(cx,cz,reason);
  const started=performance.now();
  while(!advanceChunkJob(job,3.8)){
    if(performance.now()-started>24){
      activeChunkJob=job;
      return false;
    }
  }
  return true;
}
function disposeChunkMeshes(meshes){
  for(let i=0;i<meshes.length;i++){
    const m=meshes[i];
    if(m.isInstancedMesh){
      if(m.dispose)m.dispose();
      continue;
    }
    if(!m.geometry)continue;
    // Instanced chunk meshes reuse global geometries (cubeGeo/waterGeo/cactusGeo/torchGeo).
    // Only dispose unique merged chunk geometries.
    if(m.geometry!==cubeGeo&&m.geometry!==waterGeo&&m.geometry!==cactusGeo&&m.geometry!==torchGeo){
      m.geometry.dispose();
    }
  }
}
function unloadChunk(k){
  const c=chunkMap.get(k);
  if(!c)return;
  if(c.data&&torchLights.size){
    const ox=c.cx*S.chunkSize,oz=c.cz*S.chunkSize;
    for(let lx=0;lx<S.chunkSize;lx++)for(let lz=0;lz<S.chunkSize;lz++)for(let y=0;y<S.worldH;y++){
      if(c.data[ci(lx,y,lz)]!==BLOCK.TORCH)continue;
      const tk=blockKey(ox+lx,y,oz+lz);
      const tl=torchLights.get(tk);
      if(tl){scene.remove(tl);torchLights.delete(tk);}
    }
  }
  disposeChunkMeshes(c.meshes);
  worldRoot.remove(c.grp);
  if(c.data)releaseChunkData(c.data);
  chunkMap.delete(k);
}
function rmHitMeshes(){/* no longer needed — meshes stored per-chunk */}
// ═══════════════════════════════
//  VILLAGE GENERATION
// ═══════════════════════════════
var _villageCache;
function _vst(data,cx,cz,wx,wy,wz,bt){
  if(wy<0||wy>=S.worldH)return;
  const lx=wx-cx*S.chunkSize,lz=wz-cz*S.chunkSize;
  if(lx>=0&&lx<S.chunkSize&&lz>=0&&lz<S.chunkSize)data[ci(lx,wy,lz)]=bt;
  const k=blockKey(wx,wy,wz);if(!overrides.has(k))overrides.set(k,bt);
}
function _vSh(wx,wz){return getCol(wx,wz).height;}
function _vRoad(blocks,x0,z0,x1,z1,lockY=null){
  const steps=Math.max(Math.abs(x1-x0),Math.abs(z1-z0))+1;
  for(let t=0;t<steps;t++){
    const wx=Math.round(x0+(x1-x0)*t/(steps-1||1));
    const wz=Math.round(z0+(z1-z0)*t/(steps-1||1));
    blocks.push({wx,wy:lockY===null?_vSh(wx,wz):lockY,wz,bt:BLOCK.COBBLESTONE});
  }
}
function getVillagePlan(rx,rz){
  if(!_villageCache)_villageCache=new Map();
  const k=(rx+32768)+(rz+32768)*65536;
  if(_villageCache.has(k))return _villageCache.get(k);
  const roll=h2d(rx*7+3,rz*11+5,S.seed+500);
  if(roll<0.84){_villageCache.set(k,null);return null;}
  const ox=rx*128+Math.floor(h2d(rx,rz,S.seed+501)*84+22);
  const oz=rz*128+Math.floor(h2d(rx,rz,S.seed+502)*84+22);
  const col=getCol(ox,oz);
  if(col.biome!=="plains"&&col.biome!=="forest"&&col.biome!=="savanna"&&col.biome!=="meadow"){
    _villageCache.set(k,null);return null;
  }
  if(col.height<=S.waterLevel+1){_villageCache.set(k,null);return null;}

  // Reject steep candidate areas to avoid giant detached walls and floating structures.
  let minH=Infinity,maxH=-Infinity,sumH=0,samples=0;
  for(let sx=-14;sx<=18;sx+=2)for(let sz=-14;sz<=18;sz+=2){
    const h=_vSh(ox+sx,oz+sz);
    if(h<minH)minH=h;
    if(h>maxH)maxH=h;
    sumH+=h;samples++;
  }
  if(maxH-minH>6){_villageCache.set(k,null);return null;}

  const baseY=Math.min(maxH,Math.round(sumH/samples)+1);
  const blocks=[];
  function sb(wx,wy,wz,bt){blocks.push({wx,wy,wz,bt});}
  function foundation(wx,wz,topY,fill=BLOCK.DIRT){
    const gy=_vSh(wx,wz);
    for(let y=gy;y<topY;y++)sb(wx,y,wz,fill);
  }
  // Well (3×3)
  const wy=baseY;
  for(let dx=0;dx<3;dx++)for(let dz=0;dz<3;dz++){
    foundation(ox+dx,oz+dz,wy+1,BLOCK.COBBLESTONE);
    if(dx===1&&dz===1){sb(ox+1,wy,oz+1,BLOCK.WATER);}
    else{sb(ox+dx,wy+1,oz+dz,BLOCK.COBBLESTONE);sb(ox+dx,wy+2,oz+dz,BLOCK.COBBLESTONE);}
  }
  // House (+10, -3 from well)
  const hx=ox+10,hz=oz-3;
  const hy=baseY;
  for(let dx=0;dx<5;dx++)for(let dz=0;dz<5;dz++){
    foundation(hx+dx,hz+dz,hy,BLOCK.DIRT);
    sb(hx+dx,hy,hz+dz,BLOCK.PLANKS);
    const wall=(dx===0||dx===4||dz===0||dz===4);
    if(wall){sb(hx+dx,hy+1,hz+dz,BLOCK.COBBLESTONE);sb(hx+dx,hy+2,hz+dz,BLOCK.COBBLESTONE);}
    sb(hx+dx,hy+3,hz+dz,BLOCK.WOOD);
  }
  const doorY=hy;
  sb(hx+2,doorY+1,hz+4,BLOCK.AIR);sb(hx+2,doorY+2,hz+4,BLOCK.AIR);
  // Farm (0, +10 from well)
  const fx=ox,fz=oz+10;
  const fy=baseY;
  for(let dx=0;dx<5;dx++)for(let dz=0;dz<5;dz++){
    foundation(fx+dx,fz+dz,fy,BLOCK.DIRT);
    sb(fx+dx,fy,fz+dz,BLOCK.DIRT);
  }
  sb(fx+2,fy,fz+2,BLOCK.WATER);
  // Roads
  _vRoad(blocks,ox+1,oz,hx,hz+2,baseY);
  _vRoad(blocks,ox+1,oz,fx+2,fz,baseY);
  const plan={cx:ox,cz:oz,blocks};
  _villageCache.set(k,plan);
  return plan;
}
function applyVillages(cx,cz,data){
  const ox=cx*S.chunkSize,oz=cz*S.chunkSize;
  const rxMin=Math.floor((ox-34)/128),rxMax=Math.floor((ox+S.chunkSize+34)/128);
  const rzMin=Math.floor((oz-34)/128),rzMax=Math.floor((oz+S.chunkSize+34)/128);
  for(let rx=rxMin;rx<=rxMax;rx++)for(let rz=rzMin;rz<=rzMax;rz++){
    const plan=getVillagePlan(rx,rz);
    if(!plan)continue;
    for(const b of plan.blocks)_vst(data,cx,cz,b.wx,b.wy,b.wz,b.bt);
  }
}

function applyOverrides(cx,cz,data){
  const mx=cx*S.chunkSize,mz=cz*S.chunkSize;
  for(let lx=0;lx<S.chunkSize;lx++)for(let lz=0;lz<S.chunkSize;lz++){
    const wx=mx+lx,wz=mz+lz;
    for(let y=0;y<S.worldH;y++){
      const ov=overrides.get(blockKey(wx,y,wz));
      if(ov!==undefined)data[ci(lx,y,lz)]=ov;
    }
  }
}
function applyTrees(cx,cz,data){
  const ox=cx*S.chunkSize,oz=cz*S.chunkSize,mg=3;
  for(let wx=ox-mg;wx<ox+S.chunkSize+mg;wx++)for(let wz=oz-mg;wz<oz+S.chunkSize+mg;wz++){
    const col=getCol(wx,wz);if(!col.hasTree)continue;
    plantTree(data,cx,cz,wx,col.height,wz,col.treeType,h2d(wx*17,wz*29,S.seed+12));
  }
}
function plantTree(data,cx,cz,wx,baseY,wz,type,rng){
  // All tree blocks are also stored in overrides so they can be broken/detected by getBlock
  function wvo(ldata,lcx,lcz,lwx,ly,lwz,t,over){
    // Leaves must never be placed at or below trunk base (prevents ground-touching leaves)
    if(t===BLOCK.LEAVES&&ly<=lbaseY+1)return;
    wv(ldata,lcx,lcz,lwx,ly,lwz,t,over);
    const llx=lwx-lcx*S.chunkSize,llz=lwz-lcz*S.chunkSize;
    if(llx>=0&&llx<S.chunkSize&&llz>=0&&llz<S.chunkSize&&ly>=0&&ly<S.worldH){
      const k=blockKey(lwx,ly,lwz);
      // CRITICAL: Never overwrite an existing override — if a player broke a block (AIR override),
      // we must not re-stamp it as a tree block on chunk rebuild. No exception for over=true.
      if(!overrides.has(k))overrides.set(k,t);
    }
  }
  const lbaseY=baseY; // capture for closure
  if(type==="oak"||type==="acacia"){
    const h=3+Math.floor(rng*2); // 3-4 blocks tall (was 3-4 but felt huge)
    for(let dy=1;dy<=h;dy++)wvo(data,cx,cz,wx,baseY+dy,wz,BLOCK.WOOD,true);
    const cy=baseY+h;
    // Compact leaf canopy radius 1-2
    for(let dy=-1;dy<=1;dy++){const r=(dy===-1||dy===1)?1:2;
      for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){
        if(Math.abs(dx)===r&&Math.abs(dz)===r)continue;
        wvo(data,cx,cz,wx+dx,cy+dy,wz+dz,BLOCK.LEAVES,false);}}
  } else if(type==="birch"){
    const h=4+Math.floor(rng*2); // 4-5 (was 5-7)
    for(let dy=1;dy<=h;dy++)wvo(data,cx,cz,wx,baseY+dy,wz,BLOCK.WOOD,true);
    const cy=baseY+h-1;
    for(let dy=-1;dy<=1;dy++){const r=dy<=0?2:1;
      for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){
        if(r===2&&Math.abs(dx)===2&&Math.abs(dz)===2)continue;
        wvo(data,cx,cz,wx+dx,cy+dy,wz+dz,BLOCK.LEAVES,false);}}
    wvo(data,cx,cz,wx,cy+2,wz,BLOCK.LEAVES,false);
  } else if(type==="pine"){
    const h=5+Math.floor(rng*3); // 5-7 (was 6-10)
    for(let dy=1;dy<=h;dy++)wvo(data,cx,cz,wx,baseY+dy,wz,BLOCK.WOOD,true);
    for(let layer=0;layer<4;layer++){const ly=baseY+h-layer*2,r=layer+1;
      for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){
        if(Math.abs(dx)===r&&Math.abs(dz)===r&&r>1)continue;
        wvo(data,cx,cz,wx+dx,ly,wz+dz,BLOCK.LEAVES,false);}}
    wvo(data,cx,cz,wx,baseY+h+1,wz,BLOCK.LEAVES,false);
  } else if(type==="cactus"){
    // Height 1-5, weighted toward 1-2 (rare to be >3). Uses squared rng for weighting.
    const h=1+Math.floor(rng*rng*4.8); // rng²*4.8: ~60% h=1, ~25% h=2, ~10% h=3, ~5% h=4-5
    const clamped=Math.min(h,5);
    for(let dy=1;dy<=clamped;dy++)wvo(data,cx,cz,wx,baseY+dy,wz,BLOCK.CACTUS,true);
  } else if(type==="jungle"){
    const h=7+Math.floor(rng*4); // 7-10 blocks tall
    for(let dy=1;dy<=h;dy++)wvo(data,cx,cz,wx,baseY+dy,wz,BLOCK.WOOD,true);
    const cy=baseY+h;
    // Wide layered canopy
    for(let dy=-2;dy<=1;dy++){const r=dy<=-2||dy>=1?1:(dy===-1?3:2);
      for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){
        if(Math.abs(dx)===r&&Math.abs(dz)===r)continue;
        wvo(data,cx,cz,wx+dx,cy+dy,wz+dz,BLOCK.LEAVES,false);}}
  }
}
function wv(data,cx,cz,wx,y,wz,t,over){
  if(y<0||y>=S.worldH)return;
  const lx=wx-cx*S.chunkSize,lz=wz-cz*S.chunkSize;
  if(lx<0||lx>=S.chunkSize||lz<0||lz>=S.chunkSize)return;
  const i=ci(lx,y,lz),ex=data[i];
  if(over||ex===BLOCK.AIR||ex===BLOCK.WATER||ex===BLOCK.LEAVES)data[i]=t;
}
const _visDirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
function isVisible(t,wx,y,wz,data,ox,oz){
  for(const[dx,dy,dz]of _visDirs)if(showFace(t,cawBlock(wx+dx,y+dy,wz+dz,data,ox,oz)))return true;
  return false;
}
function cawBlock(wx,y,wz,data,ox,oz){
  const lx=wx-ox,lz=wz-oz;
  if(y>=0&&y<S.worldH&&lx>=0&&lx<S.chunkSize&&lz>=0&&lz<S.chunkSize)return data[ci(lx,y,lz)];
  return getBlock(wx,y,wz);
}
function showFace(t,n){
  if(n===BLOCK.AIR)return true;
  if(t===BLOCK.WATER)return n!==BLOCK.WATER&&!SOLID.has(n);
  if(t===BLOCK.LEAVES)return n===BLOCK.AIR||n===BLOCK.WATER;
  if(t===BLOCK.GLASS)return n!==BLOCK.GLASS;
  return TRANSPARENT.has(n);
}
const _waterDirs=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,-1,0],[0,1,0]];
function setBlock(x,y,z,t){
  if(y<0||y>=S.worldH)return;
  const prev=getBlock(x,y,z);
  if(prev===BLOCK.WATER&&t!==BLOCK.WATER){
    const k=blockKey(x,y,z);
    waterLevels.delete(k);
    waterSources.delete(k);
    for(let i=0;i<6;i++){
      const d=_waterDirs[i];
      if(getBlock(x+d[0],y+d[1],z+d[2])===BLOCK.WATER)schedWater(x+d[0],y+d[1],z+d[2]);
    }
  }
  overrides.set(blockKey(x,y,z),t);rebuildNear(x,z);
  if(t===BLOCK.AIR){
    // Schedule adjacent water blocks to flow into the newly opened space
    for(let i=0;i<6;i++){const d=_waterDirs[i];const nx=x+d[0],ny=y+d[1],nz=z+d[2];if(getBlock(nx,ny,nz)===BLOCK.WATER)schedWater(nx,ny,nz);}
    const above=getBlock(x,y+1,z);
    if(above===BLOCK.TORCH){
      const tk=blockKey(x,y+1,z);
      const tl=torchLights.get(tk);if(tl){scene.remove(tl);torchLights.delete(tk);}
      overrides.set(tk,BLOCK.AIR);rebuildNear(x,z);
    }
  }
}
function rebuildNear(x,z){
  const cx=Math.floor(x/S.chunkSize),cz=Math.floor(z/S.chunkSize);
  const lx=((x%S.chunkSize)+S.chunkSize)%S.chunkSize,lz=((z%S.chunkSize)+S.chunkSize)%S.chunkSize;
  const set=new Set([ck(cx,cz)]);
  if(lx===0)set.add(ck(cx-1,cz));if(lx===S.chunkSize-1)set.add(ck(cx+1,cz));
  if(lz===0)set.add(ck(cx,cz-1));if(lz===S.chunkSize-1)set.add(ck(cx,cz+1));
  set.forEach(queueDirtyChunk);
}
function flushDirty(){
  compactDirtyQueueToLoaded();
  if(activeChunkJob||!dirtyQ.length||genQueue.length||lagDebug.lastFrameMs>16||!reserveChunkWork())return;
  if(!canStartChunkBuild(true))return;
  const k=dirtyQ[0];dirtyQ[0]=dirtyQ[dirtyQ.length-1];dirtyQ.length--;dirtySet.delete(k);
  if(!chunkMap.has(k))return;
  const c=chunkMap.get(k);
  activeChunkJob=createChunkJob(c.cx,c.cz,"dirty");
  const dirtyBudget=Math.max(0.4,getChunkBudgetMs(true)-0.2);
  if(advanceChunkJob(activeChunkJob,dirtyBudget))activeChunkJob=null;
}

function chunkVisibilityDistanceWorld(){
  const frameMs=lagDebug.lastFrameMs||16;
  const base=(S.renderDist+1)*S.chunkSize;
  let scale=1;
  if(frameMs>36)scale=0.95;
  else if(frameMs>28)scale=0.97;
  return Math.max(S.chunkSize*2.8,base*scale);
}

function isChunkInFrustumRange(c){
  // Use tight AABB frustum test — avoids the old sphere+dot-product bug where
  // chunks vanished when looking straight down from underground or high up.
  const ox=c.cx*S.chunkSize,oz=c.cz*S.chunkSize;
  const topY=Math.min(S.worldH,(Number.isFinite(c.topY)?c.topY:S.worldH)+4);
  _chunkBox.min.set(ox,0,oz);
  _chunkBox.max.set(ox+S.chunkSize,topY,oz+S.chunkSize);
  if(!_frustum.intersectsBox(_chunkBox))return false;
  // Distance cull (XZ only, Y irrelevant for chunks that span full world height)
  const px=camera.position.x,pz=camera.position.z;
  const cx2=ox+S.chunkSize*0.5,cz2=oz+S.chunkSize*0.5;
  const dSq=(cx2-px)*(cx2-px)+(cz2-pz)*(cz2-pz);
  const md=chunkVisibilityDistanceWorld();
  return dSq<=md*md;
}

function _chunkAzimuth01(dx,dz){
  return ((Math.atan2(dz,dx)/(Math.PI*2))+1)%1;
}

function _chunkOcclusionEnabled(){
  if(!ENABLE_CHUNK_OCCLUSION)return false;
  if(performance.now()<lagDebug.startupUntil+1400)return false;
  if(chunkQueuePressure()>Math.floor(desiredGenQueueCap()*0.45))return false;
  if(Math.hypot(player.vel.x,player.vel.z)>S.walkSpeed*1.2)return false;
  if(headInWater())return false;
  if(camera.position.y<=S.waterLevel+2)return false;
  camera.getWorldDirection(_chunkVec);
  if(Math.abs(_chunkVec.y)>0.65)return false;
  return true;
}

function updateChunkOcclusion(nowMs){
  if(nowMs-_chunkOcclusionLastUpdate<CHUNK_OCCLUSION_UPDATE_MS)return;
  _chunkOcclusionLastUpdate=nowMs;
  _chunkOcclusionVisible.clear();

  if(!_chunkOcclusionEnabled())return;

  for(let i=0;i<CHUNK_OCCLUSION_BINS;i++)_chunkOcclusionBins[i]=-Infinity;

  const camX=camera.position.x;
  const camY=camera.position.y;
  const camZ=camera.position.z;
  const nearMul=chunkQueuePressure()>desiredGenQueueCap()*0.75?1.08:1.35;
  const nearAlwaysVisible=(S.chunkSize*CHUNK_OCCLUSION_NEAR_DIST_CHUNKS)*nearMul;
  const candidates=[];

  for(const c of chunkMap.values()){
    if(!c.grp)continue;
    if(!isChunkInFrustumRange(c)){
      _chunkOcclusionVisible.set(c.k,false);
      continue;
    }
    const cx=c.cx*S.chunkSize+S.chunkSize*0.5;
    const cz=c.cz*S.chunkSize+S.chunkSize*0.5;
    const dx=cx-camX;
    const dz=cz-camZ;
    const dist=Math.hypot(dx,dz);
    const topY=(Number.isFinite(c.topY)?c.topY:S.waterLevel+4)+1.2;
    candidates.push({chunk:c,cx,cz,dist,topY});
  }

  candidates.sort((a,b)=>a.dist-b.dist);
  let visibleCount=0;

  for(let i=0;i<candidates.length;i++){
    const it=candidates[i];
    const c=it.chunk;
    const cornerHalf=S.chunkSize*0.5;
    const corners=[
      [it.cx-cornerHalf,it.topY,it.cz-cornerHalf],
      [it.cx+cornerHalf,it.topY,it.cz-cornerHalf],
      [it.cx-cornerHalf,it.topY,it.cz+cornerHalf],
      [it.cx+cornerHalf,it.topY,it.cz+cornerHalf],
      [it.cx,it.topY,it.cz]
    ];

    let visible=it.dist<=nearAlwaysVisible;
    const sampleBins=[];

    for(let j=0;j<corners.length;j++){
      const sp=corners[j];
      const sdx=sp[0]-camX;
      const sdz=sp[2]-camZ;
      const sDist=Math.max(0.0001,Math.hypot(sdx,sdz));
      const az=_chunkAzimuth01(sdx,sdz);
      const bin=Math.min(CHUNK_OCCLUSION_BINS-1,Math.max(0,Math.floor(az*CHUNK_OCCLUSION_BINS)));
      const slope=(sp[1]-camY)/sDist;
      sampleBins.push([bin,slope]);
      if(!visible&&slope>=_chunkOcclusionBins[bin]-CHUNK_OCCLUSION_VISIBILITY_BIAS)visible=true;
    }

    if(!visible&&camY<=it.topY+4.5)visible=true;
    _chunkOcclusionVisible.set(c.k,visible);
    if(visible)visibleCount++;

    for(let j=0;j<sampleBins.length;j++){
      const bin=sampleBins[j][0];
      const nextH=sampleBins[j][1]+CHUNK_OCCLUSION_HORIZON_GROWTH;
      if(nextH>_chunkOcclusionBins[bin])_chunkOcclusionBins[bin]=nextH;
    }
  }

  if(candidates.length&&visibleCount<Math.max(4,Math.floor(candidates.length*0.12))){
    _chunkOcclusionVisible.clear();
  }
}

function isChunkVisible(c){
  if(!isChunkInFrustumRange(c))return false;
  if(!_chunkOcclusionVisible.size)return true;
  return _chunkOcclusionVisible.get(c.k)!==false;
}

function chunkLodTierForDistance(dist){
  const near=S.chunkSize*CHUNK_LOD_NEAR_DIST_CHUNKS;
  const far=S.chunkSize*CHUNK_LOD_FAR_DIST_CHUNKS;
  if(dist<=near)return 0;
  if(dist<=far)return 1;
  return 2;
}

function applyChunkLod(c,tier){
  if(c.lodTier===tier)return;
  c.lodTier=tier;
  for(let i=0;i<c.meshes.length;i++){
    const m=c.meshes[i];
    let visible=true;
    if(m.material===atlasAlphaMat){
      visible=tier===0;
    }else if(m.material===waterMergeMat){
      visible=tier<=1;
    }else if(m.isInstancedMesh){
      const bt=m.userData?.bt;
      if(bt===BLOCK.TORCH)visible=tier===0;
      else if(bt===BLOCK.WATER)visible=tier<=1;
      else if(bt===BLOCK.LEAVES||bt===BLOCK.GLASS)visible=tier===0;
    }
    m.visible=visible;
  }
}

function animateChunks(){
  if(!f3.frustumCaptured){
    _frustumMat.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_frustumMat);
    updateChunkOcclusion(performance.now());
  }
  for(const c of chunkMap.values()){
    if(!c.grp)continue;
    if(!c.animDone){
      const t=THREE.MathUtils.clamp((clock.elapsedTime-c.st)*3,0,1);
      const e=1-Math.pow(1-t,3);
      c.grp.position.y=-(1-e)*2.8;c.grp.scale.setScalar(.94+e*.06);
      if(t>=1)c.animDone=true;
    }
    c.grp.visible=isChunkVisible(c);
    if(c.grp.visible&&ENABLE_CHUNK_LOD){
      const cx=c.cx*S.chunkSize+S.chunkSize*0.5;
      const cz=c.cz*S.chunkSize+S.chunkSize*0.5;
      const dist=Math.hypot(cx-camera.position.x,cz-camera.position.z);
      applyChunkLod(c,chunkLodTierForDistance(dist));
    }else if(c.grp.visible&&c.lodTier!==0){
      applyChunkLod(c,0);
    }
  }
}

// ═══════════════════════════════
//  TERRAIN — fixed rivers (smooth, no chunk seams)
// ═══════════════════════════════
function getBlock(x,y,z){
  if(y<0)return BLOCK.STONE;if(y>=S.worldH)return BLOCK.AIR;
  const ov=overrides.get(blockKey(x,y,z));if(ov!==undefined)return ov;
  return genBlock(x,y,z);
}
function pickStoneOre(x,y,z){
  if(y<2||y>=S.worldH-1)return BLOCK.STONE;
  const r=h2d(x*37+y*17,z*31-y*11,S.seed+730);
  const coalN=fbm3((x+19)*.084,(y-9)*.110,(z-27)*.084,2,.55,2.0,S.seed+731);
  const ironN=fbm3((x-41)*.096,(y+17)*.126,(z+33)*.096,2,.55,2.0,S.seed+732);
  const goldN=fbm3((x+53)*.112,(y+11)*.142,(z-59)*.112,2,.55,2.0,S.seed+733);
  const diamondN=fbm3((x-73)*.130,(y+37)*.178,(z+67)*.130,2,.55,2.0,S.seed+734);

  if(y<=15&&diamondN>0.79&&r>0.58)return BLOCK.DIAMOND_ORE;
  if(y<=29&&goldN>0.77&&r>0.52)return BLOCK.GOLD_ORE;
  if(y<=47&&ironN>0.73&&r>0.44)return BLOCK.IRON_ORE;
  if(y<=58&&coalN>0.69&&r>0.34)return BLOCK.COAL_ORE;
  return BLOCK.STONE;
}
function genBlock(x,y,z){
  const col=getCol(x,z);
  if(y>col.height){if(y<=S.waterLevel&&col.height<S.waterLevel)return BLOCK.WATER;return BLOCK.AIR;}
  if(y===0)return BLOCK.STONE;
  const depth=col.height-y;
  const isUnderwaterCol=col.height<S.waterLevel;
  const waterDepth=Math.max(0,S.waterLevel-col.height);

  // Cave carving uses a surface buffer so terrain tops stay intact and less "holey".
  const roofBuffer=4+(col.height<=S.waterLevel+4?2:0);
  if(y>=2&&y<col.height-roofBuffer&&col.height>S.waterLevel+1){
    const caveA=fbm3((x+19)*.046,(y-7)*.074,(z-31)*.046,3,.52,2.0,S.seed+300);
    const caveB=rn3((x-53)*.052,(y+13)*.082,(z+41)*.052,S.seed+301);
    const caveN=caveA*0.72+caveB*0.28;
    const depthNorm=THREE.MathUtils.clamp((col.height-y)/(S.worldH*0.42),0,1);
    const caveThreshold=0.17+depthNorm*0.13+(y<11?0.03:0);
    if(caveN<caveThreshold)return BLOCK.AIR;
  }

  // Underwater sediment is intentionally tiny and sparse to avoid seabed carpets.
  if(isUnderwaterCol&&depth<=4){
    const clayMacro=fbm2((x+91)*.18,(z-37)*.18,2,.5,2.0,S.seed+611);
    const clayPatch=fbm2((x-13)*.43,(z+27)*.43,1,.5,2.0,S.seed+614);
    const clayMask=clayMacro*0.58+clayPatch*0.42;

    const gravelMacro=fbm2((x-41)*.18,(z+83)*.18,2,.5,2.0,S.seed+612);
    const gravelPatch=fbm2((x+17)*.41,(z-61)*.41,1,.5,2.0,S.seed+613);
    const gravelMask=gravelMacro*0.60+gravelPatch*0.40;

    const sandMask=fbm2((x+63)*.22,(z-29)*.22,2,.5,2.0,S.seed+622);
    const pocketA=h2d(x*23+7,z*19-11,S.seed+618);
    const pocketB=h2d(x*29-5,z*27+13,S.seed+619);
    const pocketC=h2d(x*31+9,z*33-3,S.seed+623);
    const sandyBiome=col.biome==="desert"||col.biome==="badlands";

    if(depth<=3&&clayMask>.90&&pocketA>.93)return BLOCK.CLAY;
    if(depth<=3&&gravelMask>.91&&pocketB>.93)return BLOCK.GRAVEL;
    if(depth<=2&&sandyBiome&&sandMask>.90&&pocketC>.90)return col.biome==="badlands"?BLOCK.RED_SAND:BLOCK.SAND;
    if((col.biome==="swamp"||col.biome==="mangrove")&&depth<=3&&clayMask<.24&&pocketB>.94)return BLOCK.MUD;
  }

  if(y===col.height) return col.surface;
  if(depth<=2) return col.filler;
  if(depth<=5&&col.subFiller!==undefined) return col.subFiller;

  // Secondary bank sediment variation is also sparse.
  if((col.biome==="river"||col.biome==="swamp"||col.biome==="mangrove")&&y<=S.waterLevel+1&&depth<=3){
    const clayCluster=fbm2((x+91)*.055,(z-37)*.055,3,.56,2.0,S.seed+611);
    const clayDetail=fbm2((x-13)*.19,(z+27)*.19,2,.5,2.0,S.seed+614);
    const clayMask=clayCluster*0.78+clayDetail*0.22;
    if(clayMask>.92&&h2d(x*29+3,z*31-9,S.seed+620)>.94)return BLOCK.CLAY;
    if(col.biome!=="river"){
      const mudMask=fbm2((x+44)*.067,(z-18)*.067,2,.54,2.0,S.seed+615);
      if(clayMask<.22&&mudMask>.74&&h2d(x*27-14,z*19+22,S.seed+621)>.92)return BLOCK.MUD;
    }
  }

  // Ores generate in deeper stone layers after surface/filler logic.
  if(depth>=4&&y>=2){
    const ore=pickStoneOre(x,y,z);
    if(ore!==BLOCK.STONE)return ore;
  }

  // Keep rocky gravel transitions mostly above water to avoid giant seabed wads.
  const gravelCluster=fbm2((x-41)*.052,(z+83)*.052,3,.57,2.0,S.seed+612);
  const gravelDetail=fbm2((x+17)*.17,(z-61)*.17,2,.5,2.0,S.seed+613);
  const gravelMask=gravelCluster*0.80+gravelDetail*0.20;
  if(!isUnderwaterCol&&(col.biome==="rocky_shore"||col.biome==="stony_peaks")&&depth<=5&&gravelMask>.76)return BLOCK.GRAVEL;
  if(!isUnderwaterCol&&col.biome==="badlands"&&depth<=6&&gravelMask>.82)return BLOCK.GRAVEL;
  return BLOCK.STONE;
}
function _noise01(v,fallback=.5){
  if(!Number.isFinite(v))return fallback;
  return THREE.MathUtils.clamp(v,0,1);
}
function _finite(v,fallback=0){
  return Number.isFinite(v)?v:fallback;
}
function trimColCache(){
  if(colCache.size<=COL_CACHE_MAX)return;
  const dropCount=Math.max(1,colCache.size-COL_CACHE_TRIM_TO);
  let dropped=0;
  for(const k of colCache.keys()){
    colCache.delete(k);
    dropped++;
    if(dropped>=dropCount)break;
  }
}
function sampleTerrainPoint(x,z,p,includeClimate=true){
  const warpA=_noise01(fbm2(x*p.warpFreq,z*p.warpFreq,2,.5,2.0,S.seed+901))-.5;
  const warpB=_noise01(fbm2((x+337)*p.warpFreq,(z-211)*p.warpFreq,2,.5,2.0,S.seed+902))-.5;
  const sx=x+warpA*p.warpAmp;
  const sz=z+warpB*p.warpAmp;

  const continentalFine=_noise01(fbm2(sx*p.contFreq,sz*p.contFreq,5,.5,2.03,S.seed+10));
  const continentalMacro=_noise01(fbm2((sx+431)*p.contFreq*0.46,(sz-317)*p.contFreq*0.46,3,.53,2.0,S.seed+11));
  const continental=_noise01(continentalFine*0.68+continentalMacro*0.32);
  const hills=_noise01(fbm2(sx*p.hillFreq,sz*p.hillFreq,4,.5,2.05,S.seed+20));
  const ridge=_noise01(rn2(sx*p.ridgeFreq,sz*p.ridgeFreq,S.seed+30));
  const erosion=_noise01(fbm2(sx*p.erosionFreq,sz*p.erosionFreq,4,.52,2.0,S.seed+80));
  const detail=_noise01(fbm2(sx*p.detailFreq,sz*p.detailFreq,3,.54,2.2,S.seed+40));

  const landBase=THREE.MathUtils.smoothstep(continental,p.landStart,p.landEnd);
  const land=_noise01(landBase+(p.landBias??0));
  const coastShelf=THREE.MathUtils.clamp(1-Math.abs(land-0.30)/0.30,0,1);
  const mountainBase=Math.max(0,ridge-0.18);
  const mountain=Math.pow(mountainBase,1.54)*(0.43+(1-erosion)*0.78);

  let bh=p.base+
    land*p.landLift+
    (hills-0.5)*(p.hillLift*1.65)+
    (detail-0.5)*(p.detailLift*1.05)+
    mountain*p.mountainLift;
  bh+=coastShelf*(p.coastShelfLift??0);

  const oceanMask=Math.max(0,1-land);
  if(oceanMask>0){
    const trench=_noise01(rn2(sx*p.trenchFreq,sz*p.trenchFreq,S.seed+205));
    const trenchMask=Math.max(0,(trench-.86)/.14);
    bh-=oceanMask*oceanMask*p.oceanDepth;
    bh-=trenchMask*oceanMask*p.trenchDepth;
  }

  const riverBase=_noise01(fbm2(sx*p.riverFreq,sz*p.riverFreq,4,.5,2.0,S.seed+200));
  const riverRidge=1-Math.abs(riverBase*2-1);
  const riverCore=Math.pow(
    Math.max(0,(riverRidge-p.riverThreshold)/(Math.max(0.0001,1-p.riverThreshold))),
    1.22
  );
  const riverMountainPenalty=Math.max(0,1-mountain*0.74);
  const riverStrength=(land>0.16&&riverMountainPenalty>0)?riverCore*riverMountainPenalty:0;
  if(riverStrength>0){
    const riverCarveStrength=riverStrength*(0.58+0.42*(1-erosion));
    const riverTarget=S.waterLevel-(p.riverDepthMin+riverStrength*p.riverDepthRange);
    bh=THREE.MathUtils.lerp(bh,riverTarget,Math.min(1,riverCarveStrength*p.riverCarve));
  }

  let moisture=.5,temperature=.5;
  if(includeClimate){
    const moistLocal=_noise01(fbm2(sx*p.moistFreq,sz*p.moistFreq,4,.55,2.0,S.seed+50));
    const moistMacro=_noise01(fbm2((sx-270)*p.moistFreq*0.42,(sz+190)*p.moistFreq*0.42,3,.52,2.0,S.seed+51));
    const tempLocal=_noise01(fbm2(sx*p.tempFreq+90,sz*p.tempFreq-45,4,.55,2.0,S.seed+60));
    const tempMacro=_noise01(fbm2((sx+170)*p.tempFreq*0.40,(sz-140)*p.tempFreq*0.40,3,.52,2.0,S.seed+62));
    const latitude=_noise01(fbm2((sx+320)*.0012,(sz-180)*.0012,2,.5,2.0,S.seed+61));
    const altitudeCooling=Math.max(0,bh-(S.waterLevel+8))*0.011;
    moisture=THREE.MathUtils.clamp(
      moistLocal*0.68+moistMacro*0.32+riverStrength*0.10-Math.max(0,mountain-0.35)*0.18,
      0,1
    );
    temperature=THREE.MathUtils.clamp(
      tempLocal*0.60+tempMacro*0.28+latitude*0.12+(land-0.5)*0.06-altitudeCooling,
      0,1
    );
  }

  bh=_finite(bh,p.base);
  return {heightRaw:bh,land,mountain,erosion,moisture,temperature,riverStrength,continental};
}
function getCol(x,z){
  x=Math.floor(_finite(x,0));
  z=Math.floor(_finite(z,0));
  const k=colKey(x,z);
  if(colCache.has(k))return colCache.get(k);

  const p=currentWorldPreset();
  const center=sampleTerrainPoint(x,z,p,true);
  const nE=sampleTerrainPoint(x+1,z,p,false).heightRaw;
  const nW=sampleTerrainPoint(x-1,z,p,false).heightRaw;
  const nN=sampleTerrainPoint(x,z-1,p,false).heightRaw;
  const nS=sampleTerrainPoint(x,z+1,p,false).heightRaw;

  const ring=(center.heightRaw*4+nE+nW+nN+nS)/8;
  let bh=THREE.MathUtils.lerp(center.heightRaw,ring,p.smoothing);
  bh+=(h2d(x*53+7,z*47-9,S.seed+451)-0.5)*p.microRelief;

  const slope=Math.max(Math.abs(nE-nW),Math.abs(nS-nN));
  const cliffMask=THREE.MathUtils.clamp(
    Math.max(0,(center.mountain-.58)*1.8)*Math.max(0,.60-center.erosion)*p.cliffStrength,
    0,1
  );
  if(cliffMask>0){
    const cliffN=(fbm2(x*.031,z*.031,2,.5,2.0,S.seed+90)-0.5);
    bh+=cliffN*cliffMask*2.3;
  }

  let height=Math.floor(THREE.MathUtils.clamp(_finite(bh,p.base),2,S.worldH-4));
  const biomeShift=(fbm2((x+143)*.010,(z-217)*.010,2,.5,2.0,S.seed+76)-0.5);
  const temperature=_noise01(center.temperature+biomeShift*0.07,.5);
  const moisture=_noise01(center.moisture-biomeShift*0.06,.5);
  const riverStrength=_noise01(center.riverStrength,0);
  const land=_noise01(center.land,.5);

  // The raw noise carve above often only dips terrain 1 block under the
  // waterline — that reads as a puddle, not a river, and sometimes doesn't
  // dip below the waterline at all, breaking the channel into gaps.
  // Guarantee an actual channel depth anywhere the river band is active.
  if(riverStrength>0.05){
    const minDepth=2+Math.round(riverStrength*4); // ~2 blocks at the edges, up to ~6 at the core
    height=Math.min(height,S.waterLevel-minDepth);
  }
  // Same story for inland ponds/depressions that aren't part of a river:
  // a lone 1-block-deep dip is barely water. Give it real depth instead —
  // gated on land>0.35 so this doesn't touch ocean coastline/beach shelves,
  // which are supposed to shallow out gradually.
  if(height===S.waterLevel-1&&land>0.35){
    height=S.waterLevel-2;
  }

  const beach=height<=S.waterLevel+2&&height>=S.waterLevel-2;
  const under=height<S.waterLevel-1;
  const deepOcean=height<S.waterLevel-6;
  const alpine=center.mountain>.74&&height>S.waterLevel+16;
  const stonyHigh=height>S.waterLevel+13&&center.mountain>.59&&center.erosion<.52;
  const roughCliff=(cliffMask>.15||slope>2.8)&&land>.24&&land<.88;
  const isRiver=riverStrength>0.34&&height<=S.waterLevel+2&&!deepOcean;

  let biome="plains";
  if(deepOcean){
    biome="ocean";
  }else if(isRiver){
    biome="river";
  }else if(stonyHigh){
    biome="stony_peaks";
  }else if(alpine){
    biome="mountain";
  }else if(temperature<.23){
    if(moisture>.56)biome="taiga";
    else biome=height>S.waterLevel+5?"snow":"tundra";
  }else if(temperature<.44){
    if(moisture<.26)biome="plains";
    else if(moisture<.62)biome=land>.62?"forest":"meadow";
    else biome=height<=S.waterLevel+4?"swamp":"forest";
  }else if(temperature<.69){
    if(moisture<.23)biome="savanna";
    else if(moisture<.47)biome=land>.66?"meadow":"plains";
    else if(moisture<.74)biome="forest";
    else biome=height<=S.waterLevel+3?"swamp":"jungle";
  }else{
    if(moisture<.18&&center.erosion<.55)biome="badlands";
    else if(moisture<.36)biome="desert";
    else if(moisture<.62)biome="savanna";
    else if(moisture<.82)biome="jungle";
    else biome=height<=S.waterLevel+4?"mangrove":"jungle";
  }

  let surface=BLOCK.GRASS,filler=BLOCK.DIRT,subFiller=BLOCK.DIRT,treeType="oak";
  switch(biome){
    case "ocean":
      if(temperature<.25){surface=BLOCK.CLAY;filler=BLOCK.CLAY;subFiller=BLOCK.STONE;}
      else if(temperature>.68&&moisture<.42){surface=BLOCK.RED_SAND;filler=BLOCK.SAND;subFiller=BLOCK.SAND;}
      else{surface=BLOCK.SAND;filler=BLOCK.SAND;subFiller=BLOCK.CLAY;}
      treeType="none";
      break;
    case "river":{
      const rm=h2d(x*9+31,z*7+17,S.seed+74);
      if(rm>.78){surface=BLOCK.GRAVEL;filler=BLOCK.GRAVEL;subFiller=BLOCK.CLAY;}
      else if(rm<.20){surface=BLOCK.CLAY;filler=BLOCK.CLAY;subFiller=BLOCK.CLAY;}
      else{surface=BLOCK.SAND;filler=BLOCK.SAND;subFiller=BLOCK.CLAY;}
      treeType="none";
      break;
    }
    case "stony_peaks":
      surface=BLOCK.STONE;filler=BLOCK.STONE;subFiller=BLOCK.STONE;treeType="none";
      break;
    case "mountain":
      surface=BLOCK.SNOW;filler=BLOCK.STONE;subFiller=BLOCK.STONE;treeType="pine";
      break;
    case "snow":
      surface=BLOCK.SNOW;filler=BLOCK.DIRT;subFiller=BLOCK.STONE;treeType="pine";
      break;
    case "taiga":
      surface=BLOCK.GRASS;filler=BLOCK.DIRT;subFiller=BLOCK.STONE;treeType="pine";
      break;
    case "tundra":
      surface=BLOCK.SNOW;filler=BLOCK.DIRT;subFiller=BLOCK.STONE;treeType="none";
      break;
    case "badlands":
      surface=BLOCK.RED_SAND;filler=BLOCK.RED_SAND;subFiller=BLOCK.GRAVEL;treeType="cactus";
      break;
    case "desert":
      surface=BLOCK.SAND;filler=BLOCK.SAND;subFiller=BLOCK.SAND;treeType="cactus";
      break;
    case "jungle":
      surface=BLOCK.GRASS;filler=BLOCK.DIRT;subFiller=BLOCK.DIRT;treeType="jungle";
      break;
    case "savanna":
      surface=BLOCK.GRASS;filler=BLOCK.DIRT;subFiller=BLOCK.DIRT;treeType="acacia";
      break;
    case "mangrove":
      surface=BLOCK.MUD;filler=BLOCK.MUD;subFiller=BLOCK.CLAY;treeType="jungle";
      break;
    case "swamp":
      surface=BLOCK.MUD;filler=BLOCK.MUD;subFiller=BLOCK.CLAY;treeType="oak";
      break;
    case "meadow":
      surface=BLOCK.GRASS;filler=BLOCK.DIRT;subFiller=BLOCK.DIRT;treeType="none";
      break;
    case "forest":
      surface=BLOCK.GRASS;filler=BLOCK.DIRT;subFiller=BLOCK.DIRT;treeType=moisture>.72?"birch":"oak";
      break;
    default:
      surface=BLOCK.GRASS;filler=BLOCK.DIRT;subFiller=BLOCK.DIRT;
      treeType=h2d(x*5,z*7,S.seed+72)<.30?"oak":"none";
      break;
  }

  if(beach&&biome!=="snow"&&biome!=="tundra"&&biome!=="river"&&biome!=="ocean"&&biome!=="mountain"&&biome!=="stony_peaks"){
    const shoreN=h2d(x*9+31,z*7+17,S.seed+73);
    if(roughCliff&&shoreN>.36){
      biome="rocky_shore";
      surface=BLOCK.GRAVEL;filler=BLOCK.GRAVEL;subFiller=BLOCK.STONE;
    }else{
      const warmBeach=temperature>.66&&moisture<.42;
      surface=warmBeach?BLOCK.RED_SAND:BLOCK.SAND;
      filler=surface;
      subFiller=(moisture>.74||biome==="mangrove")?BLOCK.CLAY:surface;
    }
    treeType="none";
  }

  if(under&&biome!=="river"){
    if(deepOcean){
      biome="ocean";
      if(temperature<.25){surface=BLOCK.CLAY;filler=BLOCK.CLAY;subFiller=BLOCK.STONE;}
      else if(temperature>.68&&moisture<.42){surface=BLOCK.RED_SAND;filler=BLOCK.SAND;subFiller=BLOCK.SAND;}
      else{surface=BLOCK.SAND;filler=BLOCK.SAND;subFiller=BLOCK.CLAY;}
    }else if(biome==="swamp"||biome==="mangrove"){
      surface=BLOCK.MUD;filler=BLOCK.MUD;subFiller=BLOCK.CLAY;
    }else if(roughCliff||biome==="mountain"||biome==="stony_peaks"||biome==="rocky_shore"){
      surface=BLOCK.STONE;filler=BLOCK.STONE;subFiller=BLOCK.STONE;
    }else{
      surface=temperature>.66?BLOCK.SAND:BLOCK.DIRT;
      filler=surface;
      subFiller=BLOCK.STONE;
    }
    treeType="none";
  }

  if((biome==="mountain"||biome==="stony_peaks")&&height>S.waterLevel+22)treeType="pine";

  const dens={
    snow:.002,taiga:.040,tundra:0,desert:.004,savanna:.014,forest:.056,plains:.020,
    river:0,mountain:.012,jungle:.102,swamp:.033,badlands:.001,meadow:.008,mangrove:.030,
    rocky_shore:0,stony_peaks:0,ocean:0
  };
  const slopeTreePenalty=THREE.MathUtils.clamp(1-slope*0.20,0,1);
  const moistureTreeBoost=THREE.MathUtils.clamp(0.72+moisture*0.45,0.55,1.22);
  const tch=(biome!=="snow"||alpine)&&!beach&&!under&&!isRiver?(dens[biome]??0.018)*slopeTreePenalty*moistureTreeBoost:0;
  const tn=h2d(x*13,z*17,S.seed+70);
  const hasTree=treeType!=="none"&&tch>0&&tn>1-tch&&h2d(Math.floor(x/2),Math.floor(z/2),S.seed+71)>.74;

  const col={height,biome,surface,filler,subFiller,hasTree,treeType};
  colCache.set(k,col);
  trimColCache();
  return col;
}

// ═══════════════════════════════
//  MATERIALS
// ═══════════════════════════════
function initMaterials(){
  // ── Minecraft-accurate pixel art textures (16x16) ─────────────────────
  // DIRT: warm brown base with scattered darker/lighter pixels
  const D=tex(([x,y])=>{
    const v=h2d(x*7+3,y*11+5,1001);
    const v2=h2d(x*13+y,y*7+x,1002);
    if(v2>.88)return rgb(0x7a4f2c);
    if(v2<.12)return rgb(0x9e6b3e);
    return jit(0x8c5a30,.22,v);
  });
  // GRASS TOP: vivid green with subtle variation, few dark patches
  const GT=tex(([x,y])=>{
    const macro=fbm2(x*.12,y*.12,3,.55,2.0,1003);
    const blades=fbm2((x+4)*.38,(y-3)*.38,2,.5,2.0,1004);
    const shade=THREE.MathUtils.clamp(.72+macro*.32,0,1);
    const base=new THREE.Color(0x5ca63d).lerp(new THREE.Color(0x79bf54),shade);
    if(blades>.68) base.lerp(new THREE.Color(0x8acb62),0.28);
    if(blades<.28) base.lerp(new THREE.Color(0x4a8c31),0.22);
    return [Math.round(base.r*255),Math.round(base.g*255),Math.round(base.b*255),255];
  });
  // GRASS SIDE: green top strip blending into dirt
  const GS=tex(([x,y])=>{
    const grassBand=fbm2(x*.18,y*.22,2,.55,2.0,1005);
    const dirtNoise=h2d(x*5,y*9,1007);
    if(y<4){
      const top=new THREE.Color(0x5fa840).lerp(new THREE.Color(0x79bf54),grassBand*.7);
      return [Math.round(top.r*255),Math.round(top.g*255),Math.round(top.b*255),255];
    }
    if(y<7){
      const mix=(y-4)/3;
      const grass=new THREE.Color(0x557e33).lerp(new THREE.Color(0x6aa044),grassBand*.55);
      const dirt=new THREE.Color(...jit(0x8c5a30,.14,dirtNoise).slice(0,3).map(v=>v/255));
      grass.lerp(dirt,mix*.72);
      return [Math.round(grass.r*255),Math.round(grass.g*255),Math.round(grass.b*255),255];
    }
    return jit(0x8c5a30,.14,dirtNoise);
  });
  // STONE: layered mineral grain with fractures and bright flecks.
  const ST=tex(([x,y])=>{
    const n1=fbm2(x*.31,y*.31,3,.56,2.0,1008);
    const n2=h2d(x*17+y*7,y*13+x*11,1009);
    const fiss=fbm2((x+2)*.58,(y-1)*.58,2,.5,2.0,1010);
    const c=new THREE.Color(0x7f848a).lerp(new THREE.Color(0xa7adb5),THREE.MathUtils.clamp(.22+n1*.72,0,1));
    if(fiss<.16&&((x+y)&1)===0)c.lerp(new THREE.Color(0x666b71),0.55);
    if(n2>.93)c.lerp(new THREE.Color(0xc2c7ce),0.42);
    if(n2<.08)c.lerp(new THREE.Color(0x5c6066),0.50);
    return [Math.round(c.r*255),Math.round(c.g*255),Math.round(c.b*255),255];
  });
  // SAND: brighter warm tan (without washing out) with coarse grain and speckles
  const SA=tex(([x,y])=>{
    const grain=h2d(x*11+y*5,y*9+x*7,1031);
    const macro=fbm2((x+2)*.22,(y-1)*.22,2,.58,2.0,1032);
    const dither=((x+y)&1)?0.03:-0.015;
    const mixV=THREE.MathUtils.clamp(0.42+macro*0.40+dither,0,1);
    const base=new THREE.Color(0xe0ca86).lerp(new THREE.Color(0xf1e1ad),mixV);
    if(grain>.92) base.lerp(new THREE.Color(0xfff3cf),0.50);
    else if(grain<.08) base.lerp(new THREE.Color(0xc9ad66),0.48);
    const speck=h2d(x*37+y*19,y*31+x*13,1033);
    if(speck>.95) base.lerp(new THREE.Color(0xaa8b48),0.44);
    if(speck<.05) base.lerp(new THREE.Color(0xfff8de),0.28);
    return [Math.round(base.r*255),Math.round(base.g*255),Math.round(base.b*255),255];
  });
  // WOOD SIDE: bark outer edges, inner grain streaks
  const WS=tex(([x,y])=>{
    const grain=h2d(x*127,y*.5,1014); // strong vertical grain
    const v=h2d(x*3,y*5,1015);
    const edgeDark=x<2||x>13;
    const knot=Math.hypot(x-4,y-9)<1.4||Math.hypot(x-11,y-5)<1.1;
    if(knot)return jit(0x3a2008,.08,v);
    if(edgeDark)return jit(0x4a2e12,.10,v); // dark bark on edges
    if(grain>.78)return jit(0x9a6e3a,.10,v);
    if(grain<.22)return jit(0x6a4822,.12,v);
    return jit(0x7a5426,.14,v);
  });
  // WOOD TOP: cross-section rings with dark outer bark ring
  const WT=tex(([x,y])=>{
    const cx2=x-7.5,cy2=y-7.5;
    const r=Math.sqrt(cx2*cx2+cy2*cy2);
    const v=h2d(x*5,y*7,1016);
    if(r>6.4)return jit(0x3a2008,.10,v); // outer bark
    if(r>5.8)return jit(0x4e2e10,.08,v);
    const ring=Math.sin(r*1.3)*.5+.5;
    if(ring>.72)return jit(0x7a4e22,.12,v);
    if(ring>.45)return jit(0x9e6630,.10,v);
    return jit(0xb88040,.12,v); // lighter heartwood center
  });
  // LEAVES (unchanged – keep existing)
  const LV=tex(([x,y])=>{
    const v=h2d(x*7,y*11,25);
    const e=x<2||y<2||x>13||y>13;
    if(e&&v>.68)return[0,0,0,0];
    return(x+y)%4===0?jit(0x63b16d,.12,v):jit(0x3b8747,.18,v);
  });
  // WATER: deeper low-light tones with reduced opacity for murkier depth.
  const WA=tex(([x,y])=>{
    const w1=Math.sin(x*0.42+y*0.26)*0.5+0.5;
    const w2=Math.sin(x*0.19-y*0.35+2.1)*0.5+0.5;
    const w3=Math.sin((x+y)*0.33+1.4)*0.5+0.5;
    const wave=w1*0.42+w2*0.36+w3*0.22;
    if(wave>0.86)return[30,84,132,122];
    if(wave>0.67)return[15,62,108,118];
    if(wave<0.20)return[5,26,62,112];
    return[8,44,84,116];
  });
  // SNOW: crisp white with very subtle blue-grey tint in shadow areas
  const SN=tex(([x,y])=>{
    const v=h2d(x*9,y*7,1018);
    const v2=h2d(x*17+y,y*13+x,1019);
    const shadow=v2>.76&&y>2;
    const sparkle=h2d(x*37,y*29,1020)>.94;
    if(sparkle)return[255,255,255,255];
    if(y<2)return[248,252,255,255]; // bright top edge
    if(shadow)return jit(0xcedaf0,.10,v);
    return jit(0xe8f0fa,.08,v);
  });
  // SNOW SIDE: white on top, dirty snow blending to stone/dirt underneath
  const SS=tex(([x,y])=>{
    const v=h2d(x*7,y*5,1021);
    if(y<3)return jit(0xe8f0fa,.08,h2d(x*9,y,1022)); // snow top
    if(y<6)return jit(0xc0cce0,.12,v); // grey blend
    return jit(0x8c5a30,.18,h2d(x*5,y*9,1023)); // dirt/stone
  });
  // GLASS: frosted pane — border frame visible, inner has subtle tint, all pixels pass alphaTest
  const GL=tex(([x,y])=>{
    const border=x===0||y===0||x===15||y===15;
    const inner=x===1||y===1||x===14||y===14;
    if(border)return[215,242,252,210];
    if(inner)return[200,232,248,160];
    const diag=h2d(x*3+y,y*3+x,1024)>.88;
    if(diag)return[210,238,252,118];
    return[188,228,248,100];  // alpha 100 = 39.2% > alphaTest threshold 35%
  });
  // CACTUS SIDE: green with lighter ridges and darker grooves
  const CS=tex(([x,y])=>{
    const v=h2d(x*11,y*7,1025);
    const ridge=(x===2||x===7||x===12);
    const groove=(x===4||x===10);
    const thorn=((x===1||x===6||x===11||x===14)&&[2,5,8,11,14].includes(y))||((x===3||x===9||x===13)&&[3,7,12].includes(y));
    if(thorn)return[221,248,170,255];
    if(ridge)return jit(0x79ca51,.10,v);
    if(groove)return jit(0x245c16,.12,v);
    return jit(0x4c9a31,.14,v);
  });
  // CACTUS TOP: darker green circle
  const CT=tex(([x,y])=>{
    const cx2=x-7.5,cy2=y-7.5;
    const r=Math.sqrt(cx2*cx2+cy2*cy2);
    const v=h2d(x*5,y*9,1026);
    const thornRing=(r>5.3&&r<6.6&&((x+y)%3===0));
    if(thornRing)return[220,246,176,255];
    if(r>6.5)return jit(0x285f16,.10,v);
    if(r>4)return jit(0x408628,.12,v);
    return jit(0x57a93a,.14,v);
  });
  // GRAVEL: denser mixed pebbles with stronger contrast.
  const GV=tex(([x,y])=>{
    const bed=fbm2(x*.27,y*.27,2,.58,2.0,2060);
    const pebA=h2d(x*29+y*17,y*31+x*11,2061);
    const pebB=h2d(x*13+y*5,y*7+x*19,2062);
    const c=new THREE.Color(0x7d7a75).lerp(new THREE.Color(0xa29f99),THREE.MathUtils.clamp(.24+bed*.74,0,1));
    if(pebA>.90)c.lerp(new THREE.Color(0xc0bcb4),0.45);
    if(pebA<.10)c.lerp(new THREE.Color(0x5c5955),0.45);
    if(((x+y)&3)===0&&pebB>.56)c.lerp(new THREE.Color(0x8b8782),0.34);
    if(pebB>.96)c.lerp(new THREE.Color(0xd2cdc4),0.32);
    return [Math.round(c.r*255),Math.round(c.g*255),Math.round(c.b*255),255];
  });
  // RED SAND: warm orange dune-like granules
  const RS=tex(([x,y])=>{
    const macro=fbm2(x*.20,y*.20,2,.55,2.0,2063);
    const grain=h2d(x*9+y*3,y*7+x*5,2064);
    const c=new THREE.Color(0xc97843).lerp(new THREE.Color(0xde9a63),THREE.MathUtils.clamp(.35+macro*.5,0,1));
    if(grain>.92)c.lerp(new THREE.Color(0xeead73),0.42);
    if(grain<.08)c.lerp(new THREE.Color(0xa95e2f),0.38);
    return [Math.round(c.r*255),Math.round(c.g*255),Math.round(c.b*255),255];
  });
  // CLAY: muted bluish-gray smooth packed sediment
  const CY=tex(([x,y])=>{
    const n=fbm2(x*.24,y*.24,2,.55,2.0,2065);
    const speck=h2d(x*17+y*7,y*13+x*19,2066);
    const c=new THREE.Color(0x95a4b6).lerp(new THREE.Color(0xb1bdca),THREE.MathUtils.clamp(.28+n*.52,0,1));
    if(speck>.95)c.lerp(new THREE.Color(0xc3ccd8),0.35);
    if(speck<.05)c.lerp(new THREE.Color(0x7c8a9a),0.35);
    return [Math.round(c.r*255),Math.round(c.g*255),Math.round(c.b*255),255];
  });
  // MUD: richer wet soil with glossy patches and deep pockets.
  const MD=tex(([x,y])=>{
    const n=fbm2(x*.21,y*.21,3,.56,2.0,2067);
    const wet=fbm2((x+9)*.46,(y-6)*.46,2,.5,2.0,2068);
    const grit=h2d(x*23+y*11,y*17+x*13,2069);
    const c=new THREE.Color(0x433225).lerp(new THREE.Color(0x6d5742),THREE.MathUtils.clamp(.20+n*.72,0,1));
    if(wet>.76)c.lerp(new THREE.Color(0x7b644b),0.24);
    if(wet<.22)c.lerp(new THREE.Color(0x35271d),0.34);
    if(grit>.95)c.lerp(new THREE.Color(0x8a7358),0.28);
    if(grit<.08)c.lerp(new THREE.Color(0x2b2118),0.30);
    return [Math.round(c.r*255),Math.round(c.g*255),Math.round(c.b*255),255];
  });
  function oreTex(baseHex,veinHex,seedA,seedB){
    return tex(([x,y])=>{
      const n=fbm2((x+seedA)*.31,(y-seedA)*.31,2,.56,2.0,seedA);
      const fleck=h2d(x*17+y*9+seedB,y*13+x*5-seedB,seedB);
      const c=new THREE.Color(baseHex).lerp(new THREE.Color(0xb0b5bd),THREE.MathUtils.clamp(.18+n*.72,0,1));
      if(fleck>.82)c.lerp(new THREE.Color(veinHex),0.84);
      if(fleck<.08)c.lerp(new THREE.Color(0x5d6168),0.35);
      return [Math.round(c.r*255),Math.round(c.g*255),Math.round(c.b*255),255];
    });
  }
  const OCO=oreTex(0x7f848a,0x2a2a2a,2070,2071);
  const OIR=oreTex(0x81868d,0xc08a63,2072,2073);
  const OGO=oreTex(0x81868d,0xe0ba3f,2074,2075);
  const ODI=oreTex(0x81868d,0x55d6e7,2076,2077);
  const sets={
    [BLOCK.GRASS]:[GS,GS,GT,D,GS,GS],[BLOCK.DIRT]:[D,D,D,D,D,D],
    [BLOCK.STONE]:[ST,ST,ST,ST,ST,ST],[BLOCK.SAND]:[SA,SA,SA,SA,SA,SA],
    [BLOCK.WOOD]:[WS,WS,WT,WT,WS,WS],[BLOCK.LEAVES]:[LV,LV,LV,LV,LV,LV],
    [BLOCK.WATER]:[WA,WA,WA,WA,WA,WA],[BLOCK.SNOW]:[SS,SS,SN,D,SS,SS],[BLOCK.GLASS]:[GL,GL,GL,GL,GL,GL],
    [BLOCK.CACTUS]:[CS,CS,CT,CT,CS,CS],
    [BLOCK.GRAVEL]:[GV,GV,GV,GV,GV,GV],[BLOCK.RED_SAND]:[RS,RS,RS,RS,RS,RS],
    [BLOCK.CLAY]:[CY,CY,CY,CY,CY,CY],[BLOCK.MUD]:[MD,MD,MD,MD,MD,MD],
  };
  // ── Extra block textures (inline) ───────────────────────────────────────
  // PLANKS: horizontal grain, warm tan
  const PL=tex(([x,y])=>{
    const grain=h2d(y*127,x*.5,2010);const v=h2d(x*5,y*3,2011);
    const knot=Math.hypot(x-6,y-5)<1.2||Math.hypot(x-11,y-11)<0.9;
    if(knot)return jit(0x7a4e20,.08,v);
    if(grain>.60)return jit(0xc8a966,.12,v);
    return jit(0xb89246,.16,v);
  });
  // COBBLESTONE: irregular grey stones with dark mortar lines
  const CB=tex(([x,y])=>{
    const v=h2d(x*11,y*13,2020);const v2=h2d(x*17+y*3,y*19+x,2021);
    const mortar=(x===4||x===5||x===12||x===13)&&y>8||
                 (y===5||y===6||y===12||y===13)&&x<8||
                 (y===3||y===4||y===10||y===11)&&x>=8;
    if(mortar)return rgb(0x4a4a4a);
    if(v2>.80)return rgb(0xa0a0a0);
    if(v2<.20)return rgb(0x606060);
    return jit(0x797979,.18,v);
  });
  // TORCH: a thin stick (cx 6-9) with coal head and flame — faithful Minecraft
  const TH=tex(([x,y])=>{
    const cx=x-7.5,absX=Math.abs(cx);
    // Flame layers at very top (y 0-3)
    if(y<=1&&absX<3){
      const fl=h2d(x*13,y*7,2030);
      if(y===0)return[255,Math.round(220+fl*30),50,255];
      return[255,Math.round(180+fl*40),10,255];
    }
    // Coal/torch head (y 2-4, slightly wider)
    if(y>=2&&y<=4&&absX<3){
      const fl=h2d(x*11,y*9,2031);
      if(y===2)return[Math.round(80+fl*30),Math.round(50+fl*20),20,255];
      return[Math.round(60+fl*20),Math.round(40+fl*15),15,255];
    }
    // Stick body (y 5-14, narrow center)
    if(y>=5&&y<=14&&absX<2){
      const v=h2d(x*7,y*3,2032);
      if(cx<0)return jit(0xb08040,.12,v);
      return jit(0x8a6020,.14,v);
    }
    return[0,0,0,0];
  });
  // CRAFTING TABLE TOP: faithful Minecraft crafting table top
  // 4 quadrants of planks with dark cross dividers
  const CTT=tex(([x,y])=>{
    const v=h2d(x*7+3,y*9+1,2040);
    // Dark border/frame
    if(x===0||x===15||y===0||y===15)return rgb(0x3a2008);
    // Cross divider
    if(x===7||x===8||y===7||y===8)return rgb(0x3a2008);
    // Quadrant plank colors
    const qx=x<7,qy=y<7;
    if(qx&&qy)return jit(0xc8a050,.18,v);
    if(!qx&&qy)return jit(0xb89040,.18,v);
    if(qx&&!qy)return jit(0xb89040,.18,v);
    return jit(0xa87830,.18,v);
  });
  // CRAFTING TABLE FRONT: planks with saw marks and tool rack
  const CTF=tex(([x,y])=>{
    const v=h2d(x*9+1,y*7+3,2041);
    // Plank base
    let base=jit(0xc8a050,.18,v);
    // Horizontal plank seam
    if(y===5||y===6)base=rgb(0x3a2008);
    // Vertical plank seam
    if(x===7||x===8)base=jit(0x9a7830,.10,v);
    // Tool rack marks (two small marks per panel)
    if((x===3||x===4)&&y>=8&&y<=12)base=rgb(0x7a5020);
    if((x===11||x===12)&&y>=8&&y<=12)base=rgb(0x7a5020);
    // Border
    if(x===0||x===15||y===0||y===15)base=rgb(0x3a2008);
    return base;
  });
  // CRAFTING TABLE SIDE: planks, simpler than front
  const CTS=tex(([x,y])=>{
    const v=h2d(x*7+2,y*5+4,2042);
    if(x===0||x===15||y===0||y===15)return rgb(0x3a2008);
    if(y===5||y===6)return rgb(0x3a2008);
    if(x===7||x===8)return jit(0x9a7830,.10,v);
    return jit(0xc8a050,.16,v);
  });
  // CHEST TOP: Minecraft oak chest top — plain oak planks with trim
  const CHT=tex(([x,y])=>{
    const v=h2d(x*7+1,y*9+2,2050);
    if(x===0||x===15||y===0||y===15)return rgb(0x5a3010);
    // Wood grain
    if(y===5||y===6)return rgb(0x5a3010);
    return jit(0xa87030,.20,v);
  });
  // CHEST FRONT: has the lock latch — Minecraft accurate
  const CHF=tex(([x,y])=>{
    const v=h2d(x*5+3,y*7+1,2051);
    if(x===0||x===15||y===0||y===15)return rgb(0x5a3010);
    // Lid seam at y=5
    if(y===4||y===5)return rgb(0x5a3010);
    // Latch plate (dark iron)
    if(x>=6&&x<=9&&y>=6&&y<=10){
      if(x===6||x===9||y===6||y===10)return rgb(0x3a2808);
      // Lock hole
      if(x>=7&&x<=8&&y>=7&&y<=9)return(y===8)?rgb(0x101010):rgb(0xc09030);
      return rgb(0xb08828);
    }
    // Plank wood behind latch
    return jit(0xa06030,.18,v);
  });
  // CHEST SIDE: plain oak side
  const CHS=tex(([x,y])=>{
    const v=h2d(x*5+2,y*7+3,2052);
    if(x===0||x===15||y===0||y===15)return rgb(0x5a3010);
    if(y===4||y===5)return rgb(0x5a3010); // lid line
    return jit(0xa06030,.18,v);
  });
  // FURNACE textures
  const FUS=tex(([x,y])=>{
    const n=h2d(x*13+y*7,y*11+x*5,2080);
    if(x===0||x===15||y===0||y===15)return rgb(0x53575d);
    if(y===7||y===8)return rgb(0x60666d);
    return jit(0x7a8088,.16,n);
  });
  const FUT=tex(([x,y])=>{
    const n=h2d(x*9+y*3,y*7+x*5,2081);
    if(x===0||x===15||y===0||y===15)return rgb(0x4d5258);
    if((x===4||x===11)&&(y>2&&y<13))return rgb(0x5d636a);
    if((y===4||y===11)&&(x>2&&x<13))return rgb(0x5d636a);
    return jit(0x858c95,.14,n);
  });
  const FUF=tex(([x,y])=>{
    const n=h2d(x*7+y*11,y*5+x*3,2082);
    if(x===0||x===15||y===0||y===15)return rgb(0x4b4f55);
    if(y<5)return jit(0x858c95,.12,n);
    if(x>=4&&x<=11&&y>=6&&y<=13){
      if(x===4||x===11||y===6||y===13)return rgb(0x3a2f24);
      return rgb(0x141312);
    }
    return jit(0x747a83,.14,n);
  });
  sets[BLOCK.PLANKS]     =[PL,PL,PL,PL,PL,PL];
  sets[BLOCK.COBBLESTONE]=[CB,CB,CB,CB,CB,CB];
  sets[BLOCK.TORCH]      =[TH,TH,TH,TH,TH,TH];
  sets[BLOCK.CRAFT_TABLE]=[CTF,CTS,CTT,PL,CTF,CTS];
  sets[BLOCK.CHEST]      =[CHF,CHS,CHT,PL,CHF,CHS];
  sets[BLOCK.FURNACE]    =[FUS,FUS,FUT,FUT,FUF,FUS];
  sets[BLOCK.COAL_ORE]   =[OCO,OCO,OCO,OCO,OCO,OCO];
  sets[BLOCK.IRON_ORE]   =[OIR,OIR,OIR,OIR,OIR,OIR];
  sets[BLOCK.GOLD_ORE]   =[OGO,OGO,OGO,OGO,OGO,OGO];
  sets[BLOCK.DIAMOND_ORE]=[ODI,ODI,ODI,ODI,ODI,ODI];

  // Resource-pack face overrides (fallback to procedural textures per-face).
  const rpOr=(name,fallback)=>rpBlockTexture(name)||fallback;
  const rpGrassSide=rpOr("grass_block_side",GS);
  const rpGrassTop=rpBlockTextureTinted("grass_block_top",0x67b646,GT);
  const rpDirt=rpOr("dirt",D);
  const rpStone=rpOr("stone",ST);
  const rpSand=rpOr("sand",SA);
  const rpLog=rpOr("oak_log",WS);
  const rpLogTop=rpOr("oak_log_top",WT);
  const rpLeaves=rpBlockTextureTinted("oak_leaves",0x63b74f,LV,0.18);
  const rpWater=rpOr("water_still",WA);
  const rpSnow=rpOr("snow",SN);
  const rpGlass=rpOr("glass",GL);
  const rpCactusSide=rpOr("cactus_side",CS);
  const rpCactusTop=rpOr("cactus_top",CT);
  const rpCactusBottom=rpOr("cactus_bottom",CT);
  const rpPlanks=rpOr("oak_planks",PL);
  const rpCobble=rpOr("cobblestone",CB);
  const rpGravel=rpOr("gravel",GV);
  const rpRedSand=rpOr("red_sand",RS);
  const rpClay=rpOr("clay",CY);
  const rpMud=rpOr("mud",MD);
  const rpTorch=rpOr("torch",TH);
  const rpCraftTop=rpOr("crafting_table_top",CTT);
  const rpCraftFront=rpOr("crafting_table_front",CTF);
  const rpCraftSide=rpOr("crafting_table_side",CTS);
  const rpFurnaceSide=rpOr("furnace_side",FUS);
  const rpFurnaceTop=rpOr("furnace_top",FUT);
  const rpFurnaceFront=rpOr("furnace_front",FUF);
  const rpCoalOre=rpOr("coal_ore",OCO);
  const rpIronOre=rpOr("iron_ore",OIR);
  const rpGoldOre=rpOr("gold_ore",OGO);
  const rpDiamondOre=rpOr("diamond_ore",ODI);

  sets[BLOCK.GRASS]=[rpGrassSide,rpGrassSide,rpGrassTop,rpDirt,rpGrassSide,rpGrassSide];
  sets[BLOCK.DIRT]=[rpDirt,rpDirt,rpDirt,rpDirt,rpDirt,rpDirt];
  sets[BLOCK.STONE]=[rpStone,rpStone,rpStone,rpStone,rpStone,rpStone];
  sets[BLOCK.SAND]=[rpSand,rpSand,rpSand,rpSand,rpSand,rpSand];
  sets[BLOCK.WOOD]=[rpLog,rpLog,rpLogTop,rpLogTop,rpLog,rpLog];
  sets[BLOCK.LEAVES]=[rpLeaves,rpLeaves,rpLeaves,rpLeaves,rpLeaves,rpLeaves];
  sets[BLOCK.WATER]=[rpWater,rpWater,rpWater,rpWater,rpWater,rpWater];
  sets[BLOCK.SNOW]=[rpSnow,rpSnow,rpSnow,rpDirt,rpSnow,rpSnow];
  sets[BLOCK.GLASS]=[rpGlass,rpGlass,rpGlass,rpGlass,rpGlass,rpGlass];
  sets[BLOCK.CACTUS]=[rpCactusSide,rpCactusSide,rpCactusTop,rpCactusBottom,rpCactusSide,rpCactusSide];
  sets[BLOCK.PLANKS]=[rpPlanks,rpPlanks,rpPlanks,rpPlanks,rpPlanks,rpPlanks];
  sets[BLOCK.COBBLESTONE]=[rpCobble,rpCobble,rpCobble,rpCobble,rpCobble,rpCobble];
  sets[BLOCK.TORCH]=[rpTorch,rpTorch,rpTorch,rpTorch,rpTorch,rpTorch];
  sets[BLOCK.CRAFT_TABLE]=[rpCraftFront,rpCraftSide,rpCraftTop,rpPlanks,rpCraftFront,rpCraftSide];
  sets[BLOCK.FURNACE]=[rpFurnaceSide,rpFurnaceSide,rpFurnaceTop,rpFurnaceTop,rpFurnaceFront,rpFurnaceSide];
  sets[BLOCK.COAL_ORE]=[rpCoalOre,rpCoalOre,rpCoalOre,rpCoalOre,rpCoalOre,rpCoalOre];
  sets[BLOCK.IRON_ORE]=[rpIronOre,rpIronOre,rpIronOre,rpIronOre,rpIronOre,rpIronOre];
  sets[BLOCK.GOLD_ORE]=[rpGoldOre,rpGoldOre,rpGoldOre,rpGoldOre,rpGoldOre,rpGoldOre];
  sets[BLOCK.DIAMOND_ORE]=[rpDiamondOre,rpDiamondOre,rpDiamondOre,rpDiamondOre,rpDiamondOre,rpDiamondOre];
  sets[BLOCK.GRAVEL]=[rpGravel,rpGravel,rpGravel,rpGravel,rpGravel,rpGravel];
  sets[BLOCK.RED_SAND]=[rpRedSand,rpRedSand,rpRedSand,rpRedSand,rpRedSand,rpRedSand];
  sets[BLOCK.CLAY]=[rpClay,rpClay,rpClay,rpClay,rpClay,rpClay];
  sets[BLOCK.MUD]=[rpMud,rpMud,rpMud,rpMud,rpMud,rpMud];

  for(const[ids,info]of Object.entries(BLOCK_INFO)){
    const id=+ids;
    if(!sets[id])continue; // skip blocks without geometry (tools handled separately)
    mats[id]=sets[id].map(t=>{
      const m=new THREE.MeshStandardMaterial({
        map:t,color:0xffffff,transparent:Boolean(info.transparent),opacity:info.opacity??1,
        alphaTest:(id===BLOCK.LEAVES?.38:(id===BLOCK.TORCH?.01:0)),
        depthWrite:id!==BLOCK.GLASS&&id!==BLOCK.TORCH,
        roughness:id===BLOCK.GLASS?0.08:id===BLOCK.WATER?0.04:0.92,
        metalness:id===BLOCK.GLASS?0.04:0,toneMapped:false
      });
      if(id===BLOCK.WATER){
        const wi=BLOCK_INFO[BLOCK.WATER]||info;
        m.color.setHex(wi.color??0x1f4f8c);
        m.emissive=new THREE.Color(0x021226);
        m.emissiveIntensity=.10;
        m.opacity=THREE.MathUtils.clamp(wi.opacity??info.opacity??1,0.005,0.98);
        m.side=THREE.DoubleSide;
      }
      if(id===BLOCK.TORCH){m.emissive=new THREE.Color(0xff8800);m.emissiveIntensity=1.2;m.side=THREE.DoubleSide;}
      return m;
    });
  }
}
// rgb() helper for texture drawing
function rgb(hex){const c=new THREE.Color(hex);return[Math.round(c.r*255),Math.round(c.g*255),Math.round(c.b*255),255];}
function tex(draw){
  const cv=document.createElement("canvas");cv.width=cv.height=16;
  const ctx=cv.getContext("2d");const img=ctx.createImageData(16,16);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    const c=draw([x,y]);const i=(x+y*16)*4;
    img.data[i]=c[0];img.data[i+1]=c[1];img.data[i+2]=c[2];img.data[i+3]=c[3]??255;
  }
  ctx.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(cv);
  t.colorSpace=THREE.SRGBColorSpace;t.magFilter=t.minFilter=THREE.NearestFilter;
  t.generateMipmaps=false;t.needsUpdate=true;return t;
}
function jit(hex,amt,salt){
  _jitC.set(hex);_jitC.getHSL(_jitHSL);const v=(salt-.5)*amt;
  _jitA.setHSL(_jitHSL.h,THREE.MathUtils.clamp(_jitHSL.s+v*.2,0,1),THREE.MathUtils.clamp(_jitHSL.l+v,0,1));
  return[Math.round(_jitA.r*255),Math.round(_jitA.g*255),Math.round(_jitA.b*255),255];
}

// ═══════════════════════════════
//  BLOCK ATLAS (merged geometry)
// ═══════════════════════════════
// Builds a single texture atlas from all per-face CanvasTextures produced by
// initMaterials(), then creates the two shared atlas materials (opaque and
// alpha-tested) and fills blockFaceUVs[blockId][faceIdx]=[u0,v0,u1,v1].
function buildBlockAtlas(){
  const TILE=16,COLS=8,PAD=2,CELL=TILE+PAD*2;
  const texSet=new Map();let slotCount=0;
  for(const faceArr of Object.values(mats)){
    for(const mat of faceArr){if(mat.map&&!texSet.has(mat.map))texSet.set(mat.map,slotCount++);}
  }
  const ROWS=Math.ceil(slotCount/COLS);
  const W=COLS*CELL,H=ROWS*CELL;
  const canv=document.createElement('canvas');canv.width=W;canv.height=H;
  const ctx=canv.getContext('2d');
  ctx.imageSmoothingEnabled=false;
  const blit=(src,dx,dy)=>{
    ctx.drawImage(src,0,0,TILE,TILE,dx+PAD,dy+PAD,TILE,TILE);
    ctx.drawImage(src,0,0,TILE,1,dx+PAD,dy,TILE,PAD);
    ctx.drawImage(src,0,TILE-1,TILE,1,dx+PAD,dy+PAD+TILE,TILE,PAD);
    ctx.drawImage(src,0,0,1,TILE,dx,dy+PAD,PAD,TILE);
    ctx.drawImage(src,TILE-1,0,1,TILE,dx+PAD+TILE,dy+PAD,PAD,TILE);
    ctx.drawImage(src,0,0,1,1,dx,dy,PAD,PAD);
    ctx.drawImage(src,TILE-1,0,1,1,dx+PAD+TILE,dy,PAD,PAD);
    ctx.drawImage(src,0,TILE-1,1,1,dx,dy+PAD+TILE,PAD,PAD);
    ctx.drawImage(src,TILE-1,TILE-1,1,1,dx+PAD+TILE,dy+PAD+TILE,PAD,PAD);
  };
  for(const[t,i]of texSet){const col=i%COLS,row=(i/COLS)|0;blit(t.image,col*CELL,row*CELL);}
  const atlasT=new THREE.CanvasTexture(canv);
  atlasT.colorSpace=THREE.SRGBColorSpace;
  atlasT.magFilter=THREE.NearestFilter;
  atlasT.minFilter=THREE.LinearMipmapLinearFilter;
  atlasT.generateMipmaps=true;
  try{atlasT.anisotropy=Math.min(4,renderer.capabilities?.getMaxAnisotropy?.()||1);}catch(e){}
  atlasMat=new THREE.MeshStandardMaterial({map:atlasT,color:0xffffff,roughness:0.92,metalness:0,toneMapped:false});
  // Face-direction brightness: top faces 100%, sides 78%, bottom 62%
  // This gives the classic Minecraft 3D blocky look — makes terrain cohesive, not a grid of flat tiles
  atlasMat.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('void main() {','varying float vFB;\nvoid main() {');
    shader.vertexShader=shader.vertexShader.replace('#include <fog_vertex>','#include <fog_vertex>\nvFB=normal.y>0.5?1.0:(normal.y<-0.5?0.62:0.78);');
    shader.fragmentShader='varying float vFB;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb*=vFB;');
  };
  atlasMat.customProgramCacheKey=()=>'atlas-fb-v1';
  // Alpha-cutout material for leaves + glass — NO transparent:true so these batches render
  // in the fast opaque pass rather than the per-frame depth-sorted transparent pass
  atlasAlphaMat=new THREE.MeshStandardMaterial({map:atlasT,color:0xffffff,roughness:0.92,metalness:0,
    alphaTest:0.35,toneMapped:false,side:THREE.DoubleSide});
  const waterInfo=BLOCK_INFO[BLOCK.WATER]||{};
  const waterOpacity=THREE.MathUtils.clamp(waterInfo.opacity??0.48,0.005,0.98);
  const waterBase=new THREE.Color(waterInfo.color??0x2f6ea9);
  const waterDeep=waterBase.clone().lerp(new THREE.Color(0x081a31),0.36);
  const waterMid=waterBase.clone().lerp(new THREE.Color(0x1a446f),0.22);
  const waterCrest=waterBase.clone().lerp(new THREE.Color(0x93c9ed),0.24);
  const waterFoamTint=waterBase.clone().lerp(new THREE.Color(0xc8e9ff),0.58);
  const _v3=(c)=>`vec3(${c.r.toFixed(3)},${c.g.toFixed(3)},${c.b.toFixed(3)})`;
  const waterDeepGLSL=_v3(waterDeep);
  const waterMidGLSL=_v3(waterMid);
  const waterCrestGLSL=_v3(waterCrest);
  const waterFoamGLSL=_v3(waterFoamTint);
  waterMergeMat=new THREE.MeshStandardMaterial({
    color:waterInfo.color??0x1f4f8c,roughness:0.12,metalness:0.0,
    transparent:true,opacity:waterOpacity,depthWrite:false,
    side:THREE.DoubleSide,toneMapped:false
  });
  // GPU-side procedural wave animation — zero texture overhead.
  // Single uWaterTime float uniform updated once per frame drives all water in all chunks.
  waterMergeMat.onBeforeCompile=shader=>{
    shader.uniforms.uWaterTime={value:0};
    waterMergeMat.userData.shader=shader;
    // Declare a varying for chunk-local XZ so the wave is continuous inside a chunk
    shader.vertexShader=shader.vertexShader.replace(
      'void main() {',
      'varying vec2 vWaterUV;\nvoid main() {'
    );
    shader.vertexShader=shader.vertexShader.replace(
      '#include <fog_vertex>',
      '#include <fog_vertex>\nvec4 _worldPos=modelMatrix*vec4(position,1.0);vWaterUV=vec2(_worldPos.x,_worldPos.z);'
    );
    shader.fragmentShader='uniform float uWaterTime;\nvarying vec2 vWaterUV;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace(
      '#include <map_fragment>',
      `float _w1=sin(vWaterUV.x*0.62+uWaterTime*0.52)*0.5+0.5;
       float _w2=sin(vWaterUV.y*0.56-uWaterTime*0.43+1.31)*0.5+0.5;
       float _w3=sin((vWaterUV.x+vWaterUV.y)*0.39+uWaterTime*0.31)*0.5+0.5;
       float _wave=(_w1*0.43+_w2*0.34+_w3*0.23);
       float _crest=smoothstep(0.74,0.97,_wave);
       float _foam=smoothstep(0.86,1.0,_w3)*(0.22+0.18*_crest);
        vec3 _cD=${waterDeepGLSL};
        vec3 _cM=${waterMidGLSL};
        vec3 _cC=${waterCrestGLSL};
        vec3 _foamTint=${waterFoamGLSL};
       vec3 _wc=_wave>0.60?mix(_cM,_cC,(_wave-0.60)/0.40):mix(_cD,_cM,_wave/0.60);
        _wc=mix(_wc,_foamTint,_crest*0.15);
        _wc+=_foamTint*_foam*0.16;
        float _alphaMask=clamp(0.78+_crest*0.09+_foam*0.06,0.74,0.95);
       diffuseColor=vec4(_wc,_alphaMask*opacity);`
    );
  };
      waterMergeMat.customProgramCacheKey=()=>'water-v6';
  const invW=1/W,invH=1/H;
  const atlasInsetPx=1;
  const innerMin=PAD+atlasInsetPx;
  const innerMax=PAD+TILE-atlasInsetPx;
  for(const[ids,faceArr]of Object.entries(mats)){
    const id=+ids;
    blockFaceUVs[id]=faceArr.map(mat=>{
      if(!mat.map||!texSet.has(mat.map)){
        const u0=(innerMin)*invW,u1=(innerMax)*invW;
        const v0=1-(innerMax)*invH,v1=1-(innerMin)*invH;
        return[u0,v0,u1,v1];
      }
      const i=texSet.get(mat.map);const col=i%COLS,row=(i/COLS)|0;
      const baseX=col*CELL,baseY=row*CELL;
      const u0=(baseX+innerMin)*invW,u1=(baseX+innerMax)*invW;
      const v0=1-(baseY+innerMax)*invH,v1=1-(baseY+innerMin)*invH;
      return[u0,v0,u1,v1];
    });
  }
}
// Builds a THREE.Mesh from a packed face array [lx,y,lz,faceIdx,blockType, ...].
// Stores faceData in userData for raycasting.
function buildAtlasMesh(faces,material,cubeFaces=CUBE_FACES){
  const nFaces=(faces.length/5)|0;
  if(!nFaces)return null;
  const pos=new Float32Array(nFaces*12);
  const nor=new Float32Array(nFaces*12);
  const uv =new Float32Array(nFaces*8);
  const idx=new Uint32Array(nFaces*6);
  let pi=0,ni=0,vi=0,ii=0,base=0;
  for(let f=0;f<faces.length;f+=5){
    const lx=faces[f],y=faces[f+1],lz=faces[f+2],fi=faces[f+3],type=faces[f+4];
    const fd=cubeFaces[fi];
    const uvr=blockFaceUVs[type]?.[fi]??[0,0,0.125,0.125];
    const u0=uvr[0],v0=uvr[1],u1=uvr[2],v1=uvr[3];
    for(let j=0;j<4;j++){
      const vt=fd.verts[j];
      pos[pi++]=lx+vt[0];pos[pi++]=y+vt[1];pos[pi++]=lz+vt[2];
      nor[ni++]=fd.dx;nor[ni++]=fd.dy;nor[ni++]=fd.dz;
    }
    uv[vi++]=u0;uv[vi++]=v0;uv[vi++]=u1;uv[vi++]=v0;
    uv[vi++]=u1;uv[vi++]=v1;uv[vi++]=u0;uv[vi++]=v1;
    idx[ii++]=base;idx[ii++]=base+1;idx[ii++]=base+2;
    idx[ii++]=base;idx[ii++]=base+2;idx[ii++]=base+3;
    base+=4;
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  geo.setIndex(new THREE.BufferAttribute(idx,1));
  const mesh=new THREE.Mesh(geo,material);
  mesh.frustumCulled=false;
  mesh.userData.type='merged';
  // Keep a stable snapshot for raycast decoding; chunk build pools can reuse source arrays.
  mesh.userData.faceData=new Int32Array(faces);
  return mesh;
}

// ═══════════════════════════════
//  NOISE
// ═══════════════════════════════
function h2d(x,z,seed){const v=Math.sin(x*127.1+z*311.7+seed*.013)*43758.5453123;return v-Math.floor(v);}
function h3d(x,y,z,seed){const v=Math.sin(x*157.3+y*113.5+z*271.9+seed*.017)*43758.5453123;return v-Math.floor(v);}
function sm(t){return t*t*(3-2*t);}
function vn2(x,z,seed){
  const x0=Math.floor(x),z0=Math.floor(z),tx=sm(x-x0),tz=sm(z-z0);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h2d(x0,z0,seed),h2d(x0+1,z0,seed),tx),THREE.MathUtils.lerp(h2d(x0,z0+1,seed),h2d(x0+1,z0+1,seed),tx),tz);
}
function vn3(x,y,z,seed){
  const x0=Math.floor(x),y0=Math.floor(y),z0=Math.floor(z);
  const tx=sm(x-x0),ty=sm(y-y0),tz=sm(z-z0);
  const c000=h3d(x0,y0,z0,seed),c100=h3d(x0+1,y0,z0,seed),c010=h3d(x0,y0+1,z0,seed),c110=h3d(x0+1,y0+1,z0,seed);
  const c001=h3d(x0,y0,z0+1,seed),c101=h3d(x0+1,y0,z0+1,seed),c011=h3d(x0,y0+1,z0+1,seed),c111=h3d(x0+1,y0+1,z0+1,seed);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(THREE.MathUtils.lerp(c000,c100,tx),THREE.MathUtils.lerp(c010,c110,tx),ty),THREE.MathUtils.lerp(THREE.MathUtils.lerp(c001,c101,tx),THREE.MathUtils.lerp(c011,c111,tx),ty),tz);
}
function fbm2(x,z,oct,gain,lac,seed){let a=.5,f=1,s=0,tot=0;for(let o=0;o<oct;o++){s+=vn2(x*f,z*f,seed+o*31)*a;tot+=a;a*=gain;f*=lac;}return s/tot;}
function fbm3(x,y,z,oct,gain,lac,seed){let a=.5,f=1,s=0,tot=0;for(let o=0;o<oct;o++){s+=vn3(x*f,y*f,z*f,seed+o*41)*a;tot+=a;a*=gain;f*=lac;}return s/tot;}
function rn2(x,z,seed){return 1-Math.abs(fbm2(x,z,4,.5,2.0,seed)*2-1);}
function rn3(x,y,z,seed){return 1-Math.abs(fbm3(x,y,z,3,.5,2.0,seed)*2-1);}

// ═══════════════════════════════
//  HELPERS
// ═══════════════════════════════
function ck(cx,cz){return cx+cz*65536;}
function ci(x,y,z){return x+z*S.chunkSize+y*S.chunkSize*S.chunkSize;}
function blockKey(x,y,z){return (x+524288)+(y+512)*1048577+(z+524288)*1048577*1024;}
function colKey(x,z){return (x+524288)+(z+524288)*1048577;}