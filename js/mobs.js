/**
 * @module mobs
 * Mob meshes, AI, combat
 * Lines 4859-6052 from game.monolith.html
 * Loaded as source text by main.js and evaluated in one shared scope.
 */

function _angDiff(a,b){
  let d=a-b;
  while(d>Math.PI)d-=Math.PI*2;
  while(d<-Math.PI)d+=Math.PI*2;
  return d;
}

function cube(w,h,d,material){
  return new THREE.Mesh(new THREE.BoxGeometry(w*PIXEL,h*PIXEL,d*PIXEL),material);
}
function cubeWithFrontFace(w,h,d,sideMat,frontMat){
  return cube(w,h,d,[sideMat,sideMat,sideMat,sideMat,frontMat,sideMat]);
}
const MOB_TEX_CACHE=new Map();
function _mobPartTexture(type,part){
  const key="r8:"+type+":"+part;
  if(MOB_TEX_CACHE.has(key))return MOB_TEX_CACHE.get(key);

  const cv=document.createElement('canvas');
  cv.width=cv.height=32;
  const c=cv.getContext('2d');
  c.imageSmoothingEnabled=false;

  const fill=(hex)=>{c.fillStyle=hex;c.fillRect(0,0,32,32);};
  const px=(x,y,w,h,hex)=>{c.fillStyle=hex;c.fillRect(x,y,w,h);};
  const dots=(count,hex)=>{for(let i=0;i<count;i++){px((Math.random()*32)|0,(Math.random()*32)|0,1+((Math.random()*2)|0),1+((Math.random()*2)|0),hex);}};
  const clear=()=>{c.clearRect(0,0,32,32);};

  if(type==="cow"){
    if(part==="body"){
      fill('#6f4d35');
      px(0,0,32,6,'#5a3d2a');
      px(3,8,10,9,'#f1eee7');
      px(18,11,10,8,'#f1eee7');
      px(11,21,12,8,'#f1eee7');
    } else if(part==="head"){
      fill('#6a4a33');
      px(0,0,32,5,'#5a3f2b');
      px(5,4,5,4,'#efe8db');
      px(22,4,5,4,'#efe8db');
    } else if(part==="face"){
      clear();
      px(13,1,6,10,'#f4f0e8');
      px(8,17,16,10,'#d8baa2');
      px(12,20,2,2,'#705449');
      px(18,20,2,2,'#705449');
    } else if(part==="snout"){
      fill('#d4b69e');
      px(0,0,32,5,'#c5a68f');
      px(4,8,24,18,'#dcc0a8');
      px(11,15,4,5,'#6f5448');
      px(17,15,4,5,'#6f5448');
      px(12,16,2,2,'#2f2520');
      px(18,16,2,2,'#2f2520');
    } else if(part==="leg"){
      fill('#4e3827');
      px(0,0,32,7,'#6b5038');
      px(0,24,32,8,'#2b2018');
      dots(5,'#3f2e22');
    } else if(part==="accent"){
      fill('#e9dfd0');
      px(0,0,32,6,'#d5cab9');
    } else {
      fill('#ffffff');
    }
  } else if(type==="pig"){
    if(part==="body"){
      fill('#efafbf');
      px(0,0,32,5,'#df99ab');
      px(5,9,22,10,'#f8c7d3');
      px(7,21,18,7,'#df93a5');
    } else if(part==="head"){
      fill('#f4b8c6');
      px(0,0,32,5,'#e7a5b5');
    } else if(part==="face"){
      clear();
      px(10,18,12,7,'#efacb9');
    } else if(part==="snout"){
      fill('#eda8b8');
      px(0,0,32,5,'#df94a7');
      px(4,9,24,16,'#f3b4c2');
      px(10,14,5,7,'#b3687e');
      px(17,14,5,7,'#b3687e');
      px(11,15,3,4,'#2b1f25');
      px(18,15,3,4,'#2b1f25');
    } else if(part==="leg"){
      fill('#df9fb0');
      px(0,0,32,6,'#ebb2c0');
      px(0,24,32,8,'#b76f83');
      dots(4,'#c58497');
    } else if(part==="accent"){
      fill('#e99fb2');
      px(0,0,32,5,'#f3bac7');
    } else {
      fill('#ffffff');
    }
  } else if(type==="chicken"){
    if(part==="body"){
      fill('#f7f6f2');
      px(0,0,32,4,'#e8e6df');
      px(6,8,20,17,'#ffffff');
      px(2,12,5,8,'#f1efe9');
      px(25,12,5,8,'#f1efe9');
    } else if(part==="head"){
      fill('#faf9f6');
      px(0,0,32,5,'#eceae3');
    } else if(part==="face"){
      clear();
      px(9,9,4,4,'#232323');
      px(19,9,4,4,'#232323');
    } else if(part==="leg"){
      fill('#d9a246');
      px(0,0,32,5,'#efbe5f');
      px(0,24,32,8,'#b67f27');
      dots(4,'#c89131');
    } else if(part==="accent"){
      fill('#e6b349');
      px(0,0,32,4,'#f3c968');
      px(0,24,32,8,'#ca8f2f');
    } else {
      fill('#ffffff');
    }
  } else if(type==="sheep"){
    if(part==="body"){
      fill('#cbc3b8');
      px(0,0,32,5,'#b8afa3');
      px(0,21,32,11,'#a79d92');
      px(5,7,22,12,'#d8d0c5');
      px(8,10,16,6,'#e5ddd2');
      px(6,24,20,6,'#968c82');
    } else if(part==="head"){
      fill('#84786f');
      px(0,0,32,5,'#6f645c');
      px(0,22,32,10,'#63584f');
      px(4,8,6,8,'#988b81');
      px(22,8,6,8,'#988b81');
      px(12,11,8,8,'#7a6f66');
    } else if(part==="face"){
      clear();
      px(5,4,22,22,'#a5998f');
      px(8,8,6,6,'#1a1715');
      px(18,8,6,6,'#1a1715');
      px(11,18,10,5,'#7a6e66');
      px(13,20,2,2,'#302923');
      px(17,20,2,2,'#302923');
    } else if(part==="snout"){
      fill('#a19388');
      px(0,0,32,5,'#8e8177');
      px(5,8,22,17,'#b3a59a');
      px(10,14,5,6,'#6b5f56');
      px(17,14,5,6,'#6b5f56');
      px(11,15,3,4,'#221e1b');
      px(18,15,3,4,'#221e1b');
    } else if(part==="leg"){
      fill('#756960');
      px(0,0,32,6,'#8a7f76');
      px(0,22,32,10,'#4b433d');
      px(4,12,24,4,'#6a5f57');
    } else if(part==="wool"){
      fill('#f7f5ee');
      px(0,0,32,4,'#ffffff');
      px(0,27,32,5,'#e8e5dc');
      for(let y=4;y<32;y+=4){
        for(let x=0;x<32;x+=4){
          const alt=((x/4)+(y/4))&1;
          px(x,y,3,3,alt?'#f1eee4':'#e7e3d9');
        }
      }
      for(let y=6;y<28;y+=8){
        for(let x=2;x<30;x+=8){
          px(x,y,2,2,'#ffffff');
        }
      }
    } else {
      fill('#ffffff');
    }
  } else {
    fill('#ffffff');
  }

  const tex=new THREE.CanvasTexture(cv);
  tex.magFilter=THREE.NearestFilter;
  tex.minFilter=THREE.NearestFilter;
  tex.generateMipmaps=false;
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.needsUpdate=true;
  MOB_TEX_CACHE.set(key,tex);
  return tex;
}
function _createMobMaterials(type,def){
  const mk=(part,extra)=>new THREE.MeshLambertMaterial(Object.assign({
    color:0xffffff,
    map:_mobPartTexture(type,part)
  },extra||{}));
  const mats={
    body:mk('body'),
    head:mk('head'),
    face:mk('face',{
      transparent:true,
      alphaTest:0.25,
      depthWrite:false,
      polygonOffset:true,
      polygonOffsetFactor:-2,
      polygonOffsetUnits:-2
    }),
    leg:mk('leg'),
    accent:mk('accent')
  };
  if(def.woolColor!==undefined)mats.wool=new THREE.MeshLambertMaterial({
    color:0xffffff,
    map:_mobPartTexture(type,'wool')
  });
  return mats;
}
function _setMobFlash(mob,on){
  for(const m of mob.materials){
    if(on) m.color.setHex(0xff3a3a);
    else m.color.setHex(m.userData.baseColor);
  }
}
function _buildMobMesh(type,opt){
  const def=MOB_DEFS[type];
  const mats=_createMobMaterials(type,def);
  const materials=[mats.body,mats.head,mats.face,mats.leg,mats.accent];
  if(mats.wool)materials.push(mats.wool);
  for(const m of materials) m.userData.baseColor=m.color.getHex();

  const root=new THREE.Group();
  const geos=[];
  function addPart(mesh,parent,x,y,z){
    mesh.position.set(x*PIXEL,y*PIXEL,z*PIXEL);
    mesh.castShadow=true;
    parent.add(mesh);
    geos.push(mesh.geometry);
  }
  function addFaceDecal(parent,w,h,x,y,z){
    const g=new THREE.PlaneGeometry(w*PIXEL,h*PIXEL);
    const m=new THREE.Mesh(g,mats.face);
    m.position.set(x*PIXEL,y*PIXEL,z*PIXEL);
    m.renderOrder=2;
    parent.add(m);
    geos.push(g);
  }
  const eyeMat=new THREE.MeshLambertMaterial({color:0x111111});
  eyeMat.userData.baseColor=eyeMat.color.getHex();
  materials.push(eyeMat);
  function addSimpleEye(parent,x,y,z,size=0.9){
    const g=new THREE.BoxGeometry(size*PIXEL,size*PIXEL,(size*0.55)*PIXEL);
    const m=new THREE.Mesh(g,eyeMat);
    m.position.set(x*PIXEL,y*PIXEL,z*PIXEL);
    parent.add(m);
    geos.push(g);
  }

  const bw=def.body[0],bh=def.body[1],bd=def.body[2];
  const hw=def.head[0],hh=def.head[1],hd=def.head[2];
  const lw=def.leg[0],lh=def.leg[1],ld=def.leg[2];
  const torsoW=bw*(def.torsoWScale||1);
  const torsoH=bh;
  const torsoD=bd*(def.torsoDScale||1);
  const legX=(torsoW-lw)/2;
  const legZ=(torsoD-ld)/2;

  const headPivot=new THREE.Group();
  headPivot.position.set(0*PIXEL,(lh+torsoH*0.68)*PIXEL,(torsoD*0.50)*PIXEL);
  root.add(headPivot);

  if(type==="sheep"){
    const woolMat=mats.wool||mats.body;
    const woolPad=def.woolPad??2.6;
    const headWoolPad=def.headWoolPad??1.7;
    const coreW=Math.max(2,torsoW-0.7);
    const coreH=Math.max(2,torsoH-0.8);
    const coreD=Math.max(2,torsoD-0.6);
    const woolW=torsoW+woolPad;
    const woolH=torsoH+woolPad*0.48;
    const woolD=torsoD+woolPad*0.52;
    const s=def.snout||[5,4,3];

    headPivot.position.y=(lh+torsoH*0.62)*PIXEL;
    headPivot.position.z=(torsoD*0.54)*PIXEL;

    addPart(cube(woolW,woolH,woolD,woolMat),root,0,lh+woolH*0.5-0.04,0);
    addPart(cube(coreW,coreH,coreD,mats.body),root,0,lh+coreH*0.5-0.24,0.04);

    addPart(cube(hw+headWoolPad,hh+headWoolPad,hd+headWoolPad*0.8,woolMat),headPivot,0,0.22,hd*0.44);
    addPart(cube(hw,hh,hd,mats.head),headPivot,0,-0.16,hd*0.56);

    const snoutSideMat=new THREE.MeshLambertMaterial({color:def.snoutColor||0xbfae9f});
    const snoutFrontMat=new THREE.MeshLambertMaterial({color:0xffffff,map:_mobPartTexture(type,'snout')});
    snoutSideMat.userData.baseColor=snoutSideMat.color.getHex();
    snoutFrontMat.userData.baseColor=snoutFrontMat.color.getHex();
    materials.push(snoutSideMat,snoutFrontMat);
    addPart(cubeWithFrontFace(s[0],s[1],s[2],snoutSideMat,snoutFrontMat),headPivot,0,-1.3,hd+s[2]*0.56);
    addFaceDecal(headPivot,hw*0.92,hh*0.86,0,0.58,hd+0.96);

    addPart(cube(2.8,1.7,1.2,woolMat),headPivot,0,hh*0.46,hd*0.91);
    addPart(cube(1.0,2.1,1.8,mats.head),headPivot,-(hw*0.56),0.66,hd*0.16);
    addPart(cube(1.0,2.1,1.8,mats.head),headPivot, (hw*0.56),0.66,hd*0.16);
    addPart(cube(1.0,1.4,1.0,woolMat),headPivot,-(hw*0.68),0.74,hd*0.28);
    addPart(cube(1.0,1.4,1.0,woolMat),headPivot, (hw*0.68),0.74,hd*0.28);
  } else {
    addPart(cube(torsoW,torsoH,torsoD,mats.body),root,0,lh+torsoH*0.5,0);
    addPart(cube(hw,hh,hd,mats.head),headPivot,0,0,hd*0.5);
  }

  if(type==="cow"){
    addFaceDecal(headPivot,hw*0.96,hh*0.90,0,0.12,hd+0.06);
    addSimpleEye(headPivot,-2.1,1.05,hd+0.35,0.95);
    addSimpleEye(headPivot, 2.1,1.05,hd+0.35,0.95);
    addPart(cube(2,2,2,mats.accent),headPivot,-2.7,hh*0.45,0.7);
    addPart(cube(2,2,2,mats.accent),headPivot, 2.7,hh*0.45,0.7);
    const snoutSideMat=new THREE.MeshLambertMaterial({color:def.snoutColor||0xd4b69e});
    const snoutFrontMat=new THREE.MeshLambertMaterial({color:0xffffff,map:_mobPartTexture(type,'snout')});
    snoutSideMat.userData.baseColor=snoutSideMat.color.getHex();
    snoutFrontMat.userData.baseColor=snoutFrontMat.color.getHex();
    materials.push(snoutSideMat,snoutFrontMat);
    addPart(cubeWithFrontFace(6,4,2,snoutSideMat,snoutFrontMat),headPivot,0,-2.2,hd+1.0);
  } else if(type==="pig"){
    addFaceDecal(headPivot,hw*0.95,hh*0.90,0,0.5,hd+0.05);
    addSimpleEye(headPivot,-1.9,1.15,hd+0.25,0.88);
    addSimpleEye(headPivot, 1.9,1.15,hd+0.25,0.88);
    const s=def.snout||[4,3,2];
    const snoutSideMat=new THREE.MeshLambertMaterial({color:def.snoutColor||0xeda8b8});
    const snoutFrontMat=new THREE.MeshLambertMaterial({color:0xffffff,map:_mobPartTexture(type,'snout')});
    snoutSideMat.userData.baseColor=snoutSideMat.color.getHex();
    snoutFrontMat.userData.baseColor=snoutFrontMat.color.getHex();
    materials.push(snoutSideMat,snoutFrontMat);
    addPart(cube(1.4,1.8,1.2,mats.accent),headPivot,-2.5,hh*0.58,hd*0.45);
    addPart(cube(1.4,1.8,1.2,mats.accent),headPivot, 2.5,hh*0.58,hd*0.45);
    addPart(cubeWithFrontFace(s[0],s[1],s[2],snoutSideMat,snoutFrontMat),headPivot,0,-1.0,hd+s[2]*0.5);
  } else if(type==="chicken"){
    addFaceDecal(headPivot,hw*0.90,hh*0.88,0,0.33,hd+0.06);
    const b=def.beak||[4,2,2];
    addPart(cube(b[0],b[1],b[2],mats.accent),headPivot,0,-0.82,hd+b[2]*0.30);
    addPart(cube(2,5,1,mats.body),root,-(torsoW*0.5+1.0),lh+torsoH*0.45,0);
    addPart(cube(2,5,1,mats.body),root, (torsoW*0.5+1.0),lh+torsoH*0.45,0);
  }

  // Leg pivots
  function makeLeg(px,pz){
    const p=new THREE.Group();
    p.position.set(px*PIXEL,lh*PIXEL,pz*PIXEL);
    root.add(p);
    addPart(cube(lw,lh,ld,mats.leg),p,0,-lh*0.5,0);
    return p;
  }
  let legFLPivot,legFRPivot,legBLPivot,legBRPivot;
  if(type==="chicken"){
    legFLPivot=makeLeg(-lw*0.9,0);
    legFRPivot=makeLeg( lw*0.9,0);
    legBLPivot=null;
    legBRPivot=null;
  } else if(type==="sheep"){
    legFLPivot=makeLeg(-legX*1.18, legZ*1.24);
    legFRPivot=makeLeg( legX*1.18, legZ*1.24);
    legBLPivot=makeLeg(-legX*1.18,-legZ*1.24);
    legBRPivot=makeLeg( legX*1.18,-legZ*1.24);
  } else {
    legFLPivot=makeLeg(-legX, legZ);
    legFRPivot=makeLeg( legX, legZ);
    legBLPivot=makeLeg(-legX,-legZ);
    legBRPivot=makeLeg( legX,-legZ);
  }

  if(type==="sheep"){
    const hoofMat=new THREE.MeshLambertMaterial({color:0x3c332d});
    hoofMat.userData.baseColor=hoofMat.color.getHex();
    materials.push(hoofMat);
    for(const pivot of [legFLPivot,legFRPivot,legBLPivot,legBRPivot]){
      if(!pivot)continue;
      addPart(cube(lw+0.55,1.2,ld+0.55,mats.wool||mats.body),pivot,0,-0.95,0);
      addPart(cube(lw+0.2,1.2,ld+0.2,hoofMat),pivot,0,-lh+0.6,0);
    }
  }

  return {mesh:root,materials,geos,headPivot,legFLPivot,legFRPivot,legBLPivot,legBRPivot};
}
function spawnMob(type,x,y,z,opts={}){
  if(!mobs||mobs.length>=MOB_MAX)return null;
  const noAI=opts.noAI===true;
  const def=MOB_DEFS[type];
  const sxz=def.scaleXZ||1;
  const sy=def.scaleY||1;
  const torsoW=def.body[0]*(def.torsoWScale||1);
  const torsoD=def.body[2]*(def.torsoDScale||1);
  const bellyW=torsoW*(def.bellyWScale||1.0);
  const bellyD=torsoD*(def.bellyDScale||1.0);
  const sheepWoolPad=type==="sheep"?(def.woolPad??3):0;
  const baseW=Math.max(torsoW,bellyW,def.head[0],type==="sheep"?torsoW+sheepWoolPad:0);
  const baseD=Math.max(torsoD,bellyD,def.head[2]+(def.snout?def.snout[2]:0)+2,type==="sheep"?torsoD+sheepWoolPad:0);
  const hb=def.hitbox||null;
  const hitW=hb?.w??(baseW*PIXEL*sxz*0.98);
  const hitD=hb?.d??(baseD*PIXEL*sxz*0.98);
  const hitH=hb?.h??(Math.max(def.leg[1]+def.body[1],def.leg[1]+def.body[1]*0.68+def.head[1])*PIXEL*sy*1.02);
  const built=_buildMobMesh(type,null);
  const mesh=built.mesh;
  mesh.scale.set(sxz,sy,sxz);
  mesh.position.set(x,y,z);
  scene.add(mesh);
  const mob={
    type,mesh,def,
    isBeast:false,
    noAI,
    scaleXZ:sxz,
    scaleY:sy,
    dying:false,
    deathT:0,
    deathDur:MOB_DEATH_DURATION,
    deathTilt:(Math.random()<0.5?-1:1)*(0.85+Math.random()*0.35),
    hitW:hitW,hitD:hitD,
    hitH:hitH,
    materials:built.materials,
    geos:built.geos,
    headPivot:built.headPivot,
    legFLPivot:built.legFLPivot,legFRPivot:built.legFRPivot,
    legBLPivot:built.legBLPivot,legBRPivot:built.legBRPivot,
    pos:new THREE.Vector3(x,y,z),
    visualY:y,
    bodyYaw:mesh.rotation.y,
    vel:new THREE.Vector3(),
    air:MOB_MAX_AIR,
    maxAir:MOB_MAX_AIR,
    drownTick:0,
    waterSeekT:0,
    waterPanicT:0,
    maxHp:def.maxHp??8,
    hp:def.maxHp??8,
    maxSafeDrop:def.maxSafeDrop??3,
    fallStartY:y,
    onGround:false,
    wanderT:0.8+Math.random()*2.2,
    wanderDir:new THREE.Vector3(Math.random()*2-1,0,Math.random()*2-1).normalize(),
    idleT:0.8+Math.random()*2.2,
    state:"idle",
    flashT:0,
    dropSpawned:false,
    jumpCd:0,
    stepCommitT:0,
    stepDir:new THREE.Vector3(),
    soundT:2+Math.random()*8,
    walkT:Math.random()*6.28,
    idleYawSeed:Math.random()*6.28,
    dirChangeCd:0,
    navTarget:new THREE.Vector3(x,y,z),
    navTargetTTL:0,
    navEvalT:MOB_NAV_EVAL_INTERVAL*Math.random(),
    navBlockedT:0,
    targetVX:0,
    targetVZ:0,
    stuckT:0,
    stuckProbeT:0.24+Math.random()*0.10,
    lastProbePos:new THREE.Vector3(x,y,z),
    recentDropT:0,
    fleeT:0,
    stareStillT:0,
    stareLockT:0,
    stareHoldT:0,
    stareCd:0,
    navTurnSign:Math.random()<0.5?-1:1
  };
  mobs.push(mob);
  return mob;
}

function _removeMob(mob){
  const idx=(mobs||[]).indexOf(mob);
  if(idx<0)return false;
  scene.remove(mob.mesh);
  for(const m of mob.materials||[])if(m&&m.dispose)m.dispose();
  for(const g of mob.geos||[])if(g&&g.dispose)g.dispose();
  const wire=_mobHitboxWires.get(mob);
  if(wire){scene.remove(wire);wire.geometry.dispose();_mobHitboxWires.delete(mob);}
  mobs.splice(idx,1);
  return true;
}

function _mobDropRange(spec){
  const min=Math.max(1,Math.floor(Number(spec?.min) || 1));
  const max=Math.max(min,Math.floor(Number(spec?.max) || min));
  return min+Math.floor(Math.random()*(max-min+1));
}

function spawnMobDrops(mob){
  if(!mob||mob.dropSpawned)return;
  const spec=mob.def?.drop;
  if(!spec?.id)return;
  const count=_mobDropRange(spec);
  const dropY=(mob.pos?.y??0)+(mob.hitH??1)*0.58;
  for(let i=0;i<count;i++){
    spawnDropItem(
      spec.id,
      (mob.pos?.x??0)+(Math.random()-.5)*0.35,
      dropY+Math.random()*0.12,
      (mob.pos?.z??0)+(Math.random()-.5)*0.35
    );
  }
  mob.dropSpawned=true;
}

function damageMob(mob,amount,cause="generic"){
  if(!mob||amount<=0||mob.dying)return false;
  mob.hp=Math.max(0,(mob.hp??mob.maxHp??8)-amount);
  if(mob.hp<=0){
    mob.hp=0;
    mob.dying=true;
    mob.deathT=0;
    mob.dropSpawned=false;
    mob.state="dead";
    mob.vel.set((mob.vel.x||0)*0.18,Math.max(mob.vel.y||0,2.4),(mob.vel.z||0)*0.18);
    mob.flashT=0;
    _setMobFlash(mob,false);
    spawnMobDeathParticles(mob.pos.x,mob.pos.y+mob.hitH*0.55,mob.pos.z,16);
    return true;
  }
  return false;
}
function _trySpawnMobs(){
  if(mobs.length>=MOB_MAX)return;
  const px=player.pos.x,pz=player.pos.z;
  for(let attempt=0;attempt<3;attempt++){
    const ang=Math.random()*Math.PI*2;
    const dist=16+Math.random()*14;
    const sx=px+Math.cos(ang)*dist;
    const sz=pz+Math.sin(ang)*dist;
    const col=getCol(Math.floor(sx),Math.floor(sz));
    if(!col)continue;
    if(col.biome==="desert"||col.biome==="river"||col.biome==="ocean"||col.biome==="badlands"||col.biome==="rocky_shore")continue;
    if(col.height<=S.waterLevel+1)continue;
    if(getBlock(Math.floor(sx),col.height+1,Math.floor(sz))!==BLOCK.AIR)continue;
    if(getBlock(Math.floor(sx),col.height+2,Math.floor(sz))!==BLOCK.AIR)continue;
    const type=MOB_TYPES[Math.floor(Math.random()*MOB_TYPES.length)];
    spawnMob(type,sx+0.5,col.height+1,sz+0.5);
    break;
  }
}
function _mobGrounded(mob){
  const hw=Math.max(0.16,mob.hitW*0.5*0.82);
  const hd=Math.max(0.16,mob.hitD*0.5*0.82);
  const y=Math.floor(mob.pos.y-0.05);
  const samples=[
    [mob.pos.x,mob.pos.z],
    [mob.pos.x-hw,mob.pos.z-hd],[mob.pos.x+hw,mob.pos.z-hd],
    [mob.pos.x-hw,mob.pos.z+hd],[mob.pos.x+hw,mob.pos.z+hd]
  ];
  for(const s of samples){
    if(isSolid(getBlock(Math.floor(s[0]),y,Math.floor(s[1]))))return mob.vel.y<=0.05;
  }
  return false;
}
function _mobHasSupportAt(mob,x,z,footY){
  const hw=Math.max(0.16,mob.hitW*0.5*0.82);
  const hd=Math.max(0.16,mob.hitD*0.5*0.82);
  const y=Math.floor(footY-0.05);
  const samples=[[x,z],[x-hw,z-hd],[x+hw,z-hd],[x-hw,z+hd],[x+hw,z+hd]];
  for(const s of samples){
    if(isSolid(getBlock(Math.floor(s[0]),y,Math.floor(s[1]))))return true;
  }
  return false;
}
function _mobCanStepJump(mob,dirX,dirZ){
  if(!mob.onGround||mob.jumpCd>0)return false;
  const dLen=Math.hypot(dirX,dirZ)||1;
  const dx=dirX/dLen,dz=dirZ/dLen;
  const probe=Math.max(0.42,Math.min(0.92,mob.def.speed*0.44));
  const tx=mob.pos.x+dx*probe,tz=mob.pos.z+dz*probe;
  const blockedNow=_mobCollidesAt(mob,tx,mob.pos.y,tz);
  if(!blockedNow)return false;
  const clearAbove1=!_mobCollidesAt(mob,tx,mob.pos.y+1.02,tz);
  const clearAbove2=!_mobCollidesAt(mob,tx,mob.pos.y+1.22,tz);
  if(!(clearAbove1&&clearAbove2))return false;
  const supportUp=_mobHasSupportAt(mob,tx,tz,mob.pos.y+1.0);
  if(supportUp)return true;
  const tx2=mob.pos.x+dx*(probe+0.28),tz2=mob.pos.z+dz*(probe+0.28);
  return _mobHasSupportAt(mob,tx2,tz2,mob.pos.y+1.0)&&!_mobCollidesAt(mob,tx2,mob.pos.y+1.0,tz2);
}
function _mobAssessForwardStep(mob,dirX,dirZ,probeMul=1){
  const dLen=Math.hypot(dirX,dirZ);
  if(dLen<1e-6)return{safe:false,drop:0,landingY:null,stepUp:false,blocked:false,waterLanding:false};
  const dx=dirX/dLen,dz=dirZ/dLen;
  const probeBase=Math.max(0.50,Math.min(0.86,mob.def.speed*0.52));
  const probe=probeBase*probeMul;
  const nx=mob.pos.x+dx*probe,nz=mob.pos.z+dz*probe;
  const blockedAtCurrent=_mobCollidesAt(mob,nx,mob.pos.y,nz);

  // Step-up path: if blocked at current level, allow a clean +1 step.
  const stepY=mob.pos.y+1;
  if(blockedAtCurrent&&!_mobCollidesAt(mob,nx,stepY,nz)&&_mobHasSupportAt(mob,nx,nz,stepY)){
    return{safe:true,drop:0,landingY:stepY,stepUp:true,blocked:false,waterLanding:false};
  }

  // Search nearest feasible standing height from +1 down to max drop.
  let landingY=null;
  const maxProbeDrop=Math.max(4,(mob.maxSafeDrop??3)+2);
  for(let rise=1;rise>=-maxProbeDrop;rise--){
    const fy=mob.pos.y+rise;
    if(_mobHasSupportAt(mob,nx,nz,fy)&&!_mobCollidesAt(mob,nx,fy,nz)){
      landingY=fy;
      break;
    }
  }
  if(landingY===null)return{safe:false,drop:maxProbeDrop+1,landingY:null,stepUp:false,blocked:blockedAtCurrent,waterLanding:false};

  const deltaY=landingY-mob.pos.y;
  const drop=Math.max(0,-deltaY);
  const rise=Math.max(0,deltaY);
  const below=getBlock(Math.floor(nx),Math.floor(landingY-1.01),Math.floor(nz));
  const waterLanding=below===BLOCK.WATER;
  const safeDrop=drop<=((mob.maxSafeDrop??3)+0.15)||waterLanding;
  const safeRise=rise<=1.05;
  return{
    safe:safeDrop&&safeRise,
    drop,
    landingY,
    stepUp:rise>0.20,
    blocked:blockedAtCurrent,
    waterLanding
  };
}
function _mobPickRoamTarget(mob){
  const minR=3.5,maxR=11.5;
  for(let i=0;i<18;i++){
    const ang=Math.random()*Math.PI*2;
    const dist=minR+Math.random()*(maxR-minR);
    const tx=mob.pos.x+Math.cos(ang)*dist;
    const tz=mob.pos.z+Math.sin(ang)*dist;
    const gx=Math.floor(tx),gz=Math.floor(tz);
    const col=getCol(gx,gz);
    if(!col)continue;
    if(col.height<=S.waterLevel)continue;
    const ty=col.height+1;
    if(Math.abs(ty-mob.pos.y)>2.6)continue;
    const footBt=getBlock(Math.floor(tx),Math.floor(ty-0.05),Math.floor(tz));
    if(footBt===BLOCK.WATER)continue;
    if(_mobCollidesAt(mob,tx,ty,tz))continue;
    if(!_mobHasSupportAt(mob,tx,tz,ty))continue;
    mob.navTarget.set(tx,ty,tz);
    mob.navTargetTTL=2.6+Math.random()*4.6;
    return true;
  }
  const ang=Math.random()*Math.PI*2;
  mob.navTarget.set(mob.pos.x+Math.cos(ang)*5,mob.pos.y,mob.pos.z+Math.sin(ang)*5);
  mob.navTargetTTL=1.4+Math.random()*2.2;
  return false;
}
function _mobPickDryTarget(mob,maxR=9.5){
  const minR=2.2;
  for(let i=0;i<24;i++){
    const ang=Math.random()*Math.PI*2;
    const dist=minR+Math.random()*(maxR-minR);
    const tx=mob.pos.x+Math.cos(ang)*dist;
    const tz=mob.pos.z+Math.sin(ang)*dist;
    const gx=Math.floor(tx),gz=Math.floor(tz);
    const col=getCol(gx,gz);
    if(!col||col.height<=S.waterLevel)continue;
    const ty=col.height+1;
    if(Math.abs(ty-mob.pos.y)>3.4)continue;
    if(getBlock(Math.floor(tx),Math.floor(ty),Math.floor(tz))===BLOCK.WATER)continue;
    if(_mobCollidesAt(mob,tx,ty,tz))continue;
    if(!_mobHasSupportAt(mob,tx,tz,ty))continue;
    mob.navTarget.set(tx,ty,tz);
    mob.navTargetTTL=2.2+Math.random()*3.1;
    return true;
  }
  return false;
}
function _mobScoreDirection(mob,dirX,dirZ,desiredX,desiredZ){
  const near=_mobAssessForwardStep(mob,dirX,dirZ,1.0);
  if(!near.safe)return{ok:false,score:-1e9,near,far:null};
  const far=_mobAssessForwardStep(mob,dirX,dirZ,1.75);
  let score=0;
  const align=dirX*desiredX+dirZ*desiredZ;
  const keepHeading=dirX*mob.wanderDir.x+dirZ*mob.wanderDir.z;
  score+=align*1.35;
  score+=keepHeading*0.24;
  score-=Math.min(3.5,near.drop)*0.24;
  if(near.waterLanding)score-=1.18;
  if(near.stepUp)score-=0.10;
  if(far.safe){
    score+=0.18;
    if(far.waterLanding)score-=0.62;
  }
  else score-=far.drop>((mob.maxSafeDrop??3)+1)?0.92:0.36;
  if(mob.stepCommitT>0&&keepHeading<0.1)score-=0.85;
  if(mob.recentDropT>0&&near.stepUp)score-=1.05;
  if(mob.recentDropT>0&&keepHeading<0)score-=0.55;
  return{ok:true,score,near,far};
}
function _mobChooseSteerDirection(mob,desiredX,desiredZ){
  const dLen=Math.hypot(desiredX,desiredZ);
  if(dLen<1e-6)return null;
  const nx=desiredX/dLen,nz=desiredZ/dLen;
  let best=null;
  for(const ang of MOB_NAV_CANDIDATE_ANGLES){
    const ca=Math.cos(ang),sa=Math.sin(ang);
    const dirX=nx*ca-nz*sa;
    const dirZ=nx*sa+nz*ca;
    const scored=_mobScoreDirection(mob,dirX,dirZ,nx,nz);
    if(!scored.ok)continue;
    if(!best||scored.score>best.score){
      best={score:scored.score,dirX,dirZ,near:scored.near,far:scored.far};
    }
  }
  if(best)return best;

  // Escape fallback: rotate current heading to break deadlocks.
  const side=mob.navTurnSign||1;
  mob.navTurnSign=-side;
  const ang=side*1.08;
  const ca=Math.cos(ang),sa=Math.sin(ang);
  const cx=mob.wanderDir.x||nx,cz=mob.wanderDir.z||nz;
  const fx=cx*ca-cz*sa,fz=cx*sa+cz*ca;
  const flen=Math.hypot(fx,fz)||1;
  const assess=_mobAssessForwardStep(mob,fx/flen,fz/flen,1.0);
  if(assess.safe)return{score:-0.2,dirX:fx/flen,dirZ:fz/flen,near:assess,far:assess};
  return null;
}
function _mobCollidesAt(mob,x,y,z){
  const hw=Math.max(0.16,mob.hitW*0.5*0.82);
  const hd=Math.max(0.16,mob.hitD*0.5*0.82);
  const minX=Math.floor(x-hw+0.001),maxX=Math.floor(x+hw-0.001);
  const minZ=Math.floor(z-hd+0.001),maxZ=Math.floor(z+hd-0.001);
  const minY=Math.floor(y+0.01),maxY=Math.floor(y+mob.hitH-0.01);
  for(let gx=minX;gx<=maxX;gx++)for(let gy=minY;gy<=maxY;gy++)for(let gz=minZ;gz<=maxZ;gz++){
    if(isSolid(getBlock(gx,gy,gz)))return true;
  }
  return false;
}
function _rayAabbHitT(ox,oy,oz,dx,dy,dz,maxDist,minX,minY,minZ,maxX,maxY,maxZ){
  let tmin=0,tmax=maxDist;
  if(Math.abs(dx)<1e-6){if(ox<minX||ox>maxX)return null;} else {
    const inv=1/dx;let t1=(minX-ox)*inv,t2=(maxX-ox)*inv;
    if(t1>t2){const tmp=t1;t1=t2;t2=tmp;}
    tmin=Math.max(tmin,t1);tmax=Math.min(tmax,t2);if(tmax<tmin)return null;
  }
  if(Math.abs(dy)<1e-6){if(oy<minY||oy>maxY)return null;} else {
    const inv=1/dy;let t1=(minY-oy)*inv,t2=(maxY-oy)*inv;
    if(t1>t2){const tmp=t1;t1=t2;t2=tmp;}
    tmin=Math.max(tmin,t1);tmax=Math.min(tmax,t2);if(tmax<tmin)return null;
  }
  if(Math.abs(dz)<1e-6){if(oz<minZ||oz>maxZ)return null;} else {
    const inv=1/dz;let t1=(minZ-oz)*inv,t2=(maxZ-oz)*inv;
    if(t1>t2){const tmp=t1;t1=t2;t2=tmp;}
    tmin=Math.max(tmin,t1);tmax=Math.min(tmax,t2);if(tmax<tmin)return null;
  }
  return tmin<=maxDist?tmin:null;
}
function _tryPunchMob(){
  const ox=player.pos.x,oy=player.pos.y+S.eyeH,oz=player.pos.z;
  const dx=-Math.sin(player.yaw)*Math.cos(player.pitch);
  const dy=Math.sin(player.pitch);
  const dz=-Math.cos(player.yaw)*Math.cos(player.pitch);
  const reach=3.4;
  let bestMob=null,bestT=1e9;
  for(const mob of mobs){
    if(mob._hitThisSwing||mob.dying)continue;
    const hw=mob.hitW*0.5+MOB_MELEE_HIT_PAD_XZ,hd=mob.hitD*0.5+MOB_MELEE_HIT_PAD_XZ;
    const minX=mob.pos.x-hw,maxX=mob.pos.x+hw;
    const minY=mob.pos.y-MOB_MELEE_HIT_PAD_Y,maxY=mob.pos.y+mob.hitH+MOB_MELEE_HIT_PAD_Y;
    const minZ=mob.pos.z-hd,maxZ=mob.pos.z+hd;
    const t=_rayAabbHitT(ox,oy,oz,dx,dy,dz,reach,minX,minY,minZ,maxX,maxY,maxZ);
    if(t!==null&&t<bestT){bestT=t;bestMob=mob;}
  }
  if(bestMob){bestMob._hitThisSwing=true;hitMob(bestMob);}
}
function hitMob(mob){
  if(!mob||!mobs.includes(mob)||mob.dying)return;
  // Knockback away from player
  const dx=mob.pos.x-player.pos.x,dz=mob.pos.z-player.pos.z;
  const len=Math.sqrt(dx*dx+dz*dz)||1;
  mob.vel.x+=dx/len*8;mob.vel.y+=4.5;mob.vel.z+=dz/len*8;
  mob.flashT=0.15;
  _setMobFlash(mob,true);
  sfxMobHurt(mob.type);
  // Enter a short flee state only when damaged by player.
  mob.fleeT=Math.max(mob.fleeT||0,2.6);
  mob.stareStillT=0;
  mob.stareLockT=0;
  mob.stareHoldT=0;
  mob.stareCd=0;
  mob.state="wander";
  mob.wanderT=Math.max(mob.wanderT||0,2.2);
  mob.idleT=0;
  damageMob(mob,2.5,"player");
}
function updateMobs(dt){
  if(!mobs) return;
  tryRestorePendingMobs();
  _mobSpawnTimer-=dt;
  if(_mobSpawnTimer<=0){_trySpawnMobs();_mobSpawnTimer=2.5+Math.random()*2.5;}
  const px=player.pos.x,pz=player.pos.z;
  const playerSpeedXY=Math.hypot(player.vel.x||0,player.vel.z||0);
  for(let i=mobs.length-1;i>=0;i--){
    const mob=mobs[i];
    if(mob.noAI){
      mob.vel.set(0,0,0);
      mob.onGround=true;
      mob.stareStillT=0;
      mob.stareLockT=0;
      mob.stareHoldT=0;
      mob.stareCd=0;
      mob.mesh.position.set(mob.pos.x,mob.pos.y,mob.pos.z);
      if(mob.legFLPivot)mob.legFLPivot.rotation.x=THREE.MathUtils.damp(mob.legFLPivot.rotation.x,0,9,dt);
      if(mob.legBRPivot)mob.legBRPivot.rotation.x=THREE.MathUtils.damp(mob.legBRPivot.rotation.x,0,9,dt);
      if(mob.legFRPivot)mob.legFRPivot.rotation.x=THREE.MathUtils.damp(mob.legFRPivot.rotation.x,0,9,dt);
      if(mob.legBLPivot)mob.legBLPivot.rotation.x=THREE.MathUtils.damp(mob.legBLPivot.rotation.x,0,9,dt);
      if(mob.headPivot)mob.headPivot.rotation.x=THREE.MathUtils.damp(mob.headPivot.rotation.x,0,8,dt);
      if(mob.headPivot)mob.headPivot.rotation.y=THREE.MathUtils.damp(mob.headPivot.rotation.y,0,8,dt);
      continue;
    }

    // I LOVE THIS CODE. It's so good. The way it handles all the different timers and states for the mob's AI is really well done. It makes the mobs feel alive and responsive to the player's actions. The use of like 500 lines of pure math to determine the mob's movement and behavior is also impressive. I totally don't hate it with all my heart. Nope, not at all. I just love it so much. It's the best code ever written. I can't get enough of it. It's just so amazing. I wish I could write code like this. It's just perfect in every way. I don't see any flaws or issues with it. It's just pure genius. I'm in awe of the person who wrote this code. They are a true master of programming. I aspire to be as good as them one day. This code is a masterpiece. I can't stop praising it. It's just that good. I LOVE CODING!!!!! 
    const wasOnGround=mob.onGround;
    mob.jumpCd=Math.max(0,(mob.jumpCd||0)-dt);
    mob.stepCommitT=Math.max(0,(mob.stepCommitT||0)-dt);
    mob.dirChangeCd=Math.max(0,(mob.dirChangeCd||0)-dt);
    mob.navTargetTTL=Math.max(0,(mob.navTargetTTL||0)-dt);
    mob.navEvalT=Math.max(0,(mob.navEvalT||0)-dt);
    mob.recentDropT=Math.max(0,(mob.recentDropT||0)-dt);
    mob.stuckProbeT=(mob.stuckProbeT??0.26)-dt;
    mob.waterSeekT=Math.max(0,(mob.waterSeekT||0)-dt);
    mob.waterPanicT=Math.max(0,(mob.waterPanicT||0)-dt);
    const dx=mob.pos.x-px,dz=mob.pos.z-pz;
    const distSq=dx*dx+dz*dz;
    const distToPlayer=Math.sqrt(distSq);
    const mobHeadInWater=getBlock(Math.floor(mob.pos.x),Math.floor(mob.pos.y+mob.hitH*0.72),Math.floor(mob.pos.z))===BLOCK.WATER;
    const mobInWaterPre=getBlock(Math.floor(mob.pos.x),Math.floor(mob.pos.y+0.2),Math.floor(mob.pos.z))===BLOCK.WATER;
    const waterFlow=mobInWaterPre?getWaterFlow(mob.pos.x,mob.pos.y+0.2,mob.pos.z):{x:0,z:0,fall:0,strength:0};
    const stareWasActive=((mob.stareHoldT||0)>0)||((mob.stareLockT||0)>0);
    mob.fleeT=Math.max(0,(mob.fleeT||0)-dt);
    mob.stareHoldT=Math.max(0,(mob.stareHoldT||0)-dt);
    mob.stareLockT=Math.max(0,(mob.stareLockT||0)-dt);
    mob.stareCd=Math.max(0,(mob.stareCd||0)-dt);
    const fleePlayer=(mob.fleeT||0)>0.01;
    const mobSpeedXY=Math.hypot(mob.vel.x||0,mob.vel.z||0);
    const closeForStare=distSq<MOB_STARE_RANGE*MOB_STARE_RANGE;
    const stareActiveNow=((mob.stareHoldT||0)>0)||((mob.stareLockT||0)>0);
    if(stareWasActive&&!stareActiveNow&&(mob.stareCd||0)<=0){
      mob.stareCd=MOB_STARE_COOLDOWN;
      mob.stareStillT=0;
    }
    const canPrimeStare=!stareActiveNow&&(mob.stareCd||0)<=0;
    const bothStill=closeForStare&&!fleePlayer&&canPrimeStare&&!mobInWaterPre&&!mobHeadInWater&&mob.state==="idle"&&playerSpeedXY<0.06&&mobSpeedXY<0.05&&Math.abs(player.vel.y||0)<0.12&&Math.abs(mob.vel.y||0)<0.12;
    if(bothStill){
      mob.stareStillT=Math.min(MOB_STARE_STILL_TIME+0.35,(mob.stareStillT||0)+dt);
      if(mob.stareStillT>=MOB_STARE_STILL_TIME&&(mob.stareHoldT||0)<=0&&(mob.stareLockT||0)<=0){
        mob.stareHoldT=MOB_STARE_MAX_HOLD;
        mob.stareLockT=MOB_STARE_LOCK_TIME;
        mob.stareStillT=0;
      }
    }else{
      mob.stareStillT=canPrimeStare?Math.max(0,(mob.stareStillT||0)-dt*2.4):0;
    }
    const starePlayer=!fleePlayer&&closeForStare&&stareActiveNow;
    // Despawn if too far
    if(distSq>MOB_DESPAWN_RADIUS*MOB_DESPAWN_RADIUS){
      _removeMob(mob);continue;
    }
    if(mob.dying){
      mob.deathT=(mob.deathT||0)+dt;
      const deathDur=mob.deathDur||MOB_DEATH_DURATION;
      const t=THREE.MathUtils.clamp(mob.deathT/deathDur,0,1);
      const ease=1-Math.pow(1-t,3);
      const inv=1-t;
      mob.vel.multiplyScalar(Math.max(0,1-dt*8));
      mob.pos.y+=mob.vel.y*dt;
      mob.vel.y-=S.gravity*0.18*dt;
      const lift=Math.sin(inv*Math.PI)*0.08;
      mob.mesh.position.set(mob.pos.x,mob.pos.y+0.02+lift-ease*0.36,mob.pos.z);
      mob.mesh.rotation.z=(mob.deathTilt||1)*ease;
      mob.mesh.rotation.x=0.16*ease;
      const sx=Math.max(0.01,(mob.scaleXZ||1)*(1-ease*0.78));
      const sy=Math.max(0.01,(mob.scaleY||1)*(1-ease*0.92));
      mob.mesh.scale.set(sx,sy,sx);
      if(t>=1){
        spawnMobDrops(mob);
        _removeMob(mob);
      }
      continue;
    }
    // Flash reset
    if(mob.flashT>0){
      mob.flashT-=dt;
      if(mob.flashT<=0)_setMobFlash(mob,false);
    }

    if(mobHeadInWater){
      mob.air=Math.max(0,(mob.air??mob.maxAir??MOB_MAX_AIR)-dt*16);
      if(mob.air<=0){
        mob.drownTick=(mob.drownTick||0)+dt;
        if(mob.drownTick>=MOB_DROWN_INTERVAL){
          mob.drownTick=0;
          if(damageMob(mob,1,"drown"))continue;
        }
      }
      mob.waterPanicT=Math.min(6.2,(mob.waterPanicT||0)+dt*1.4);
    }else{
      mob.drownTick=0;
      mob.air=Math.min(mob.maxAir??MOB_MAX_AIR,(mob.air??MOB_MAX_AIR)+dt*24);
    }

    mob.targetVX=0;mob.targetVZ=0;
    // AI state machine
    if(mob.state==="idle"){
      mob.idleT-=dt;
      if(mob.idleT<=0){
        mob.state="wander";mob.wanderT=3+Math.random()*4;
        mob.navTargetTTL=0;mob.navEvalT=0;
        _mobPickRoamTarget(mob);
        const tx=mob.navTarget.x-mob.pos.x,tz=mob.navTarget.z-mob.pos.z;
        const tLen=Math.hypot(tx,tz)||1;
        mob.wanderDir.set(tx/tLen,0,tz/tLen);
        mob.dirChangeCd=0.08;
      }
    } else { // wander
      mob.wanderT-=dt;
      if(mob.wanderT<=0){mob.state="idle";mob.idleT=1+Math.random()*3;}
      else {
        if(!mob.navTarget)mob.navTarget=new THREE.Vector3(mob.pos.x,mob.pos.y,mob.pos.z);
        const distToTarget=Math.hypot(mob.navTarget.x-mob.pos.x,mob.navTarget.z-mob.pos.z);
        const needsNewTarget=mob.navTargetTTL<=0||distToTarget<MOB_NAV_TARGET_REACH;
        if(mobInWaterPre||(mob.waterPanicT||0)>0.15){
          const navBlockedWater=getBlock(Math.floor(mob.navTarget.x),Math.floor(mob.navTarget.y-0.05),Math.floor(mob.navTarget.z))===BLOCK.WATER;
          if(needsNewTarget||mob.waterSeekT<=0||navBlockedWater){
            if(!_mobPickDryTarget(mob,10.5))_mobPickRoamTarget(mob);
            mob.waterSeekT=0.34+Math.random()*0.28;
          }
        }else if(needsNewTarget){
          _mobPickRoamTarget(mob);
        }
        const desiredX=mob.navTarget.x-mob.pos.x;
        const desiredZ=mob.navTarget.z-mob.pos.z;
        if((mob.navEvalT<=0||mob.navBlockedT>0.18||mob.dirChangeCd<=0)&&Math.hypot(desiredX,desiredZ)>0.01){
          const steer=_mobChooseSteerDirection(mob,desiredX,desiredZ);
          if(steer){
            mob.wanderDir.set(steer.dirX,0,steer.dirZ).normalize();
            if(steer.near.drop>0.45)mob.stepCommitT=Math.max(mob.stepCommitT,0.55);
            mob.dirChangeCd=mob.navBlockedT>0.18?0.05:0.12;
          }
          mob.navEvalT=MOB_NAV_EVAL_INTERVAL+Math.random()*0.05;
        }
        const panicBoost=mobInWaterPre?1.18:1.0;
        mob.targetVX=mob.wanderDir.x*mob.def.speed*panicBoost;
        mob.targetVZ=mob.wanderDir.z*mob.def.speed*panicBoost;
      }
    }
    if(mobInWaterPre&&mob.state==="idle"){
      mob.state="wander";
      mob.wanderT=Math.max(mob.wanderT,2.4);
      mob.idleT=0;
      if(!_mobPickDryTarget(mob,10.5))_mobPickRoamTarget(mob);
      mob.waterSeekT=0.28+Math.random()*0.22;
    }
    if(fleePlayer){
      mob.state="wander";
      mob.wanderT=Math.max(mob.wanderT,1.9);
      mob.idleT=0;
      if(distToPlayer>0.001){
        const awayX=dx/distToPlayer,awayZ=dz/distToPlayer;
        mob.wanderDir.set(awayX,0,awayZ);
        mob.targetVX=awayX*mob.def.speed*1.34;
        mob.targetVZ=awayZ*mob.def.speed*1.34;
        if(!mob.navTarget)mob.navTarget=new THREE.Vector3();
        mob.navTarget.set(
          mob.pos.x+awayX*(5.2+Math.random()*2.4),
          mob.pos.y,
          mob.pos.z+awayZ*(5.2+Math.random()*2.4)
        );
        mob.navTargetTTL=Math.max(mob.navTargetTTL,0.9);
        mob.navEvalT=0;
      }
    }
    if(starePlayer){
      mob.state="idle";
      mob.wanderT=0;
      mob.idleT=Math.max(mob.idleT,0.25);
      mob.targetVX=0;
      mob.targetVZ=0;
      mob.navTargetTTL=0;
      mob.navEvalT=Math.max(mob.navEvalT,0.06);
      mob.dirChangeCd=Math.max(mob.dirChangeCd,0.06);
    }

    let desiredMoveYaw=null;
    let wantsDrive=Math.abs(mob.targetVX)+Math.abs(mob.targetVZ)>0.02;
    if(wantsDrive&&!starePlayer){
      desiredMoveYaw=Math.atan2(mob.targetVX,mob.targetVZ);
      const bodyYawNow=mob.bodyYaw??mob.mesh.rotation.y;
      const yawErr=Math.abs(_angDiff(desiredMoveYaw,bodyYawNow));
      const turnScale=THREE.MathUtils.clamp(1-(yawErr/1.05),0.08,1);
      mob.targetVX*=turnScale;
      mob.targetVZ*=turnScale;
      wantsDrive=Math.abs(mob.targetVX)+Math.abs(mob.targetVZ)>0.02;
    }else if(!starePlayer&&Math.abs(mob.wanderDir.x)+Math.abs(mob.wanderDir.z)>0.001){
      desiredMoveYaw=Math.atan2(mob.wanderDir.x,mob.wanderDir.z);
    }
    if(mob.state==="wander"&&mob.onGround&&!mobInWaterPre&&mob.jumpCd<=0&&wantsDrive){
      const dirX=Math.abs(mob.targetVX)>0.01?mob.targetVX:mob.wanderDir.x;
      const dirZ=Math.abs(mob.targetVZ)>0.01?mob.targetVZ:mob.wanderDir.z;
      const nearStep=_mobAssessForwardStep(mob,dirX,dirZ,1.03);
      if(nearStep.blocked&&!nearStep.stepUp&&_mobCanStepJump(mob,dirX,dirZ)){
        mob.vel.y=Math.max(mob.vel.y,7.1);
        mob.onGround=false;
        mob.jumpCd=0.52;
        mob.stepCommitT=Math.max(mob.stepCommitT,0.24);
      }
    }
    // Idle sound — only within 20 blocks
    mob.soundT-=dt;
    if(mob.soundT<=0){mob.soundT=mob.def.soundInt+Math.random()*10;
      if(distSq<20*20)sfxMobIdle(mob.type);}
    // Gravity
    mob.vel.y-=S.gravity*(mobInWaterPre?0.24:1)*dt;
    mob.vel.y=Math.max(mob.vel.y,mobInWaterPre?-6.5:-50);
    // Horizontal movement uses desired velocity with adaptive damping.
    const wantsMove=wantsDrive;
    if(mobInWaterPre){
      const flowPush=1.0+waterFlow.fall*0.55;
      const waterTargetVX=(mob.targetVX||0)*0.56+waterFlow.x*flowPush;
      const waterTargetVZ=(mob.targetVZ||0)*0.56+waterFlow.z*flowPush;
      const waterRate=wantsMove?6.2:4.4;
      const airFrac=THREE.MathUtils.clamp((mob.air??mob.maxAir??MOB_MAX_AIR)/Math.max(1,mob.maxAir??MOB_MAX_AIR),0,1);
      mob.vel.x=THREE.MathUtils.damp(mob.vel.x,waterTargetVX,waterRate,dt);
      mob.vel.z=THREE.MathUtils.damp(mob.vel.z,waterTargetVZ,waterRate,dt);
      if(!mob.onGround){
        const buoyTarget=waterFlow.fall>0?-0.18:THREE.MathUtils.lerp(0.38,1.02,1-airFrac);
        mob.vel.y=THREE.MathUtils.damp(mob.vel.y,buoyTarget,3.2,dt);
        if((mob.waterPanicT||0)>0.45)mob.vel.y=Math.max(mob.vel.y,THREE.MathUtils.lerp(0.30,1.15,1-airFrac));
      }
    }else{
      const hRate=wantsMove?(mob.onGround?11.4:4.6):(mob.onGround?9.5:2.2);
      mob.vel.x=THREE.MathUtils.damp(mob.vel.x,mob.targetVX||0,hRate,dt);
      mob.vel.z=THREE.MathUtils.damp(mob.vel.z,mob.targetVZ||0,hRate,dt);
    }
    // Move Y first so jump arcs can clear one-block steps before horizontal collision checks
    const prevX=mob.pos.x,prevY=mob.pos.y,prevZ=mob.pos.z;
    mob.pos.y+=mob.vel.y*dt;
    if(_mobCollidesAt(mob,mob.pos.x,mob.pos.y,mob.pos.z)){
      if(mob.vel.y<=0){
        mob.pos.y=prevY;
        mob.onGround=true;
      }else mob.pos.y=prevY;
      mob.vel.y=0;
    }else{
      mob.onGround=_mobGrounded(mob);
    }
    let blockedHoriz=false;
    // Move X with AABB wall collision (+1 block step-up teleport)
    mob.pos.x+=mob.vel.x*dt;
    if(_mobCollidesAt(mob,mob.pos.x,mob.pos.y,mob.pos.z)){
      let stepped=false;
      if(mob.onGround){
        const stepY=Math.floor(prevY+0.001)+1;
        if(!_mobCollidesAt(mob,mob.pos.x,stepY,mob.pos.z)&&_mobHasSupportAt(mob,mob.pos.x,mob.pos.z,stepY)){
          mob.pos.y=stepY;mob.onGround=true;mob.vel.y=0;stepped=true;
        }
      }
      if(!stepped){
        mob.pos.x=prevX;mob.vel.x=0;
        blockedHoriz=true;
      }
    }
    // Move Z with AABB wall collision (+1 block step-up teleport)
    mob.pos.z+=mob.vel.z*dt;
    if(_mobCollidesAt(mob,mob.pos.x,mob.pos.y,mob.pos.z)){
      let stepped=false;
      if(mob.onGround){
        const stepY=Math.floor(prevY+0.001)+1;
        if(!_mobCollidesAt(mob,mob.pos.x,stepY,mob.pos.z)&&_mobHasSupportAt(mob,mob.pos.x,mob.pos.z,stepY)){
          mob.pos.y=stepY;mob.onGround=true;mob.vel.y=0;stepped=true;
        }
      }
      if(!stepped){
        mob.pos.z=prevZ;mob.vel.z=0;
        blockedHoriz=true;
      }
    }
    if(mob.state==="wander"){
      if(blockedHoriz){
        mob.navBlockedT=Math.min(1.2,(mob.navBlockedT||0)+dt*5.2);
        mob.navEvalT=0;mob.dirChangeCd=0;
        if((mob.onGround||mobInWaterPre)&&mob.jumpCd<=0&&_mobCanStepJump(mob,mob.wanderDir.x,mob.wanderDir.z)){
          mob.vel.y=mobInWaterPre?7.6:7.35;mob.onGround=false;mob.jumpCd=0.55;
        }
      }else{
        mob.navBlockedT=Math.max(0,(mob.navBlockedT||0)-dt*2.6);
      }
    }
    const mobInWater=getBlock(Math.floor(mob.pos.x),Math.floor(mob.pos.y+0.2),Math.floor(mob.pos.z))===BLOCK.WATER;
    if(wasOnGround&&!mob.onGround&&mob.vel.y<=0)mob.fallStartY=prevY;
    if(!wasOnGround&&mob.onGround){
      const fallDist=(mob.fallStartY??prevY)-mob.pos.y;
      if(fallDist>0.45&&fallDist<=1.75){
        mob.recentDropT=Math.max(mob.recentDropT,0.85);
        mob.stepCommitT=Math.max(mob.stepCommitT,0.45);
      }
      if(!mobInWater&&fallDist>3){
        const dmg=Math.floor(fallDist-3);
        if(dmg>0&&damageMob(mob,dmg,"fall"))continue;
      }
      mob.fallStartY=mob.pos.y;
    }
    if(mobInWater)mob.fallStartY=mob.pos.y;

    if(!mob.lastProbePos)mob.lastProbePos=new THREE.Vector3(mob.pos.x,mob.pos.y,mob.pos.z);
    if(mob.state==="wander"&&mob.stuckProbeT<=0){
      const moved=Math.hypot(mob.pos.x-mob.lastProbePos.x,mob.pos.z-mob.lastProbePos.z);
      const intended=Math.hypot(mob.targetVX||0,mob.targetVZ||0);
      if(mob.onGround&&intended>0.08&&moved<MOB_NAV_STUCK_MOVE_EPS){
        const blockedBoost=(mob.navBlockedT||0)>0.2?0.22:0;
        mob.stuckT=Math.min(2.6,(mob.stuckT||0)+0.34+blockedBoost);
      }else{
        mob.stuckT=Math.max(0,(mob.stuckT||0)-0.28);
      }
      mob.lastProbePos.set(mob.pos.x,mob.pos.y,mob.pos.z);
      mob.stuckProbeT=0.24+Math.random()*0.08;
    }
    if(mob.state==="wander"&&(mob.stuckT||0)>MOB_NAV_STUCK_TRIGGER){
      mob.stuckT=0.35;
      mob.navTargetTTL=0;mob.navEvalT=0;mob.dirChangeCd=0;
      const side=mob.navTurnSign||1;
      mob.navTurnSign=-side;
      const ang=side*(Math.PI*0.85);
      const ca=Math.cos(ang),sa=Math.sin(ang);
      const cx=mob.wanderDir.x||1,cz=mob.wanderDir.z||0;
      mob.wanderDir.set(cx*ca-cz*sa,0,cx*sa+cz*ca).normalize();
      mob.stepCommitT=0.15;
      if(mob.onGround&&mob.jumpCd<=0){
        mob.vel.y=6.95;mob.onGround=false;mob.jumpCd=0.55;
      }
    }

    const motionMag=Math.abs(mob.vel.x)+Math.abs(mob.vel.z);
    const hasMotion=motionMag>0.04;
    const bodyYaw=mob.bodyYaw??mob.mesh.rotation.y;
    let moveYaw=bodyYaw;
    if(hasMotion){
      const faceX=mob.vel.x;
      const faceZ=mob.vel.z;
      moveYaw=Math.atan2(faceX,faceZ);
    }else if(desiredMoveYaw!==null){
      moveYaw=desiredMoveYaw;
    }

    let lookYawWorld=moveYaw;
    if(starePlayer)lookYawWorld=Math.atan2(px-mob.pos.x,pz-mob.pos.z);

    let headYawTarget=THREE.MathUtils.clamp(_angDiff(moveYaw,bodyYaw)*0.34,-0.22,0.22);
    if(starePlayer)headYawTarget=THREE.MathUtils.clamp(_angDiff(lookYawWorld,bodyYaw),-0.88,0.88);
    else if(fleePlayer)headYawTarget=THREE.MathUtils.clamp(_angDiff(moveYaw,bodyYaw)*0.55,-0.40,0.40);
    let lookPitchTarget=0;
    if(starePlayer){
      const dyToEye=(player.pos.y+S.eyeH)-(mob.pos.y+mob.hitH*0.72);
      lookPitchTarget=THREE.MathUtils.clamp(-Math.atan2(dyToEye,Math.max(0.35,distToPlayer))+0.04,-0.56,0.56);
    }
    if(mob.headPivot)mob.headPivot.rotation.y=THREE.MathUtils.damp(mob.headPivot.rotation.y||0,headYawTarget,starePlayer?11.2:9.2,dt);

    let bodyYawTarget=moveYaw;
    if(starePlayer){
      bodyYawTarget=bodyYaw+THREE.MathUtils.clamp(_angDiff(lookYawWorld,bodyYaw),-0.22,0.22);
    }
    const bodyTurnRate=starePlayer?1.9:(fleePlayer?9.4:(hasMotion?7.1:3.0));
    mob.bodyYaw=THREE.MathUtils.damp(bodyYaw,bodyYawTarget,bodyTurnRate,dt);
    mob.mesh.rotation.y=mob.bodyYaw;

    // Sync mesh — smooth visual Y to prevent teleport-pop when stepping up blocks
    mob.visualY=mob.visualY===undefined?mob.pos.y:THREE.MathUtils.damp(mob.visualY,mob.pos.y,18,dt);
    mob.mesh.position.set(mob.pos.x,mob.visualY,mob.pos.z);
    const moving=mob.onGround&&(Math.abs(mob.vel.x)+Math.abs(mob.vel.z))>0.12&&mob.state==="wander";
    if(moving){
      mob.walkT+=dt*5;
      const walk=Math.sin(mob.walkT)*0.55;
      if(mob.legFLPivot)mob.legFLPivot.rotation.x=walk;
      if(mob.legBRPivot)mob.legBRPivot.rotation.x=walk;
      if(mob.legFRPivot)mob.legFRPivot.rotation.x=-walk;
      if(mob.legBLPivot)mob.legBLPivot.rotation.x=-walk;
      if(mob.headPivot)mob.headPivot.rotation.x=THREE.MathUtils.damp(mob.headPivot.rotation.x,lookPitchTarget+Math.sin(mob.walkT*0.5)*0.05,8.5,dt);
    } else {
      if(mob.legFLPivot)mob.legFLPivot.rotation.x=THREE.MathUtils.damp(mob.legFLPivot.rotation.x,0,9,dt);
      if(mob.legBRPivot)mob.legBRPivot.rotation.x=THREE.MathUtils.damp(mob.legBRPivot.rotation.x,0,9,dt);
      if(mob.legFRPivot)mob.legFRPivot.rotation.x=THREE.MathUtils.damp(mob.legFRPivot.rotation.x,0,9,dt);
      if(mob.legBLPivot)mob.legBLPivot.rotation.x=THREE.MathUtils.damp(mob.legBLPivot.rotation.x,0,9,dt);
      if(mob.headPivot)mob.headPivot.rotation.x=THREE.MathUtils.damp(mob.headPivot.rotation.x,lookPitchTarget,7.2,dt);
    }
  }
  // Check for player punch hitting a mob (closest ray/AABB hit)
  if(iState.attackT<0.12&&iState.lmb&&player.mode==="first")_tryPunchMob();
  // Reset per-swing hit flag when punch resets
  if(iState.attackT>0.30) for(const mob of mobs) mob._hitThisSwing=false;
}

// ═══════════════════════════════
//  MAIN LOOP
// ═══════════════════════════════
