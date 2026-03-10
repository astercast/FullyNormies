'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Nav from '../components/Nav'
import Footer from '../components/Footer'
import { Suspense } from 'react'

// ─── Palette ──────────────────────────────────────────────────────
const PL: [number,number,number] = [0xe3,0xe5,0xe4]
const PD: [number,number,number] = [0x48,0x49,0x4b]
const plStr = `rgb(${PL})`, pdStr = `rgb(${PD})`

// Dither patterns (Bayer 4×4, threshold matrix) for mid-tone fills
const BAYER4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
]
// dither: col=true means "bias dark", density 0–15 (0=all light, 15=all dark)
function dith(c: CanvasRenderingContext2D, x:number,y:number,w:number,h:number,density:number) {
  for(let py=y;py<y+h;py++) for(let px2=x;px2<x+w;px2++) {
    const t = BAYER4[py&3][px2&3]
    c.fillStyle = (density > t) ? pdStr : plStr
    c.fillRect(px2|0,py|0,1,1)
  }
}

// ─── PRNG ─────────────────────────────────────────────────────────
function mkrng(s:number){let n=s|0;return()=>{n=(Math.imul(n,1664525)+1013904223)|0;return(n>>>0)/0x100000000}}

// ─── Primitives ───────────────────────────────────────────────────
function dk(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number){if(w<=0||h<=0)return;c.fillStyle=pdStr;c.fillRect(x|0,y|0,w|0,h|0)}
function lt(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number){if(w<=0||h<=0)return;c.fillStyle=plStr;c.fillRect(x|0,y|0,w|0,h|0)}
function px(c:CanvasRenderingContext2D,x:number,y:number,col:boolean){c.fillStyle=col?pdStr:plStr;c.fillRect(x|0,y|0,1,1)}
function hln(c:CanvasRenderingContext2D,x1:number,x2:number,y:number,col=true){for(let x=x1;x<=x2;x++)px(c,x,y,col)}
function vln(c:CanvasRenderingContext2D,x:number,y1:number,y2:number,col=true){for(let y=y1;y<=y2;y++)px(c,x,y,col)}
function obox(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number){lt(c,x+1,y+1,w-2,h-2);dk(c,x,y,w,1);dk(c,x,y+h-1,w,1);dk(c,x,y,1,h);dk(c,x+w-1,y,1,h)}
const CX=60

// ─── Types ────────────────────────────────────────────────────────
interface Trait{key:string;value:string}
type Pose='idle'|'walk'|'attack'|'crouch'
interface Arch{
  bodyType:string;slim:boolean;hasJacket:boolean;hasSuit:boolean
  hasStripe:boolean;hasTank:boolean;hasHood:boolean;accType:string|null
}

function tv(traits:Trait[],...keys:string[]):string|null{
  for(const k of keys){const f=traits.find(t=>t.key.toLowerCase().includes(k.toLowerCase()));if(f&&f.value&&!['none','n/a',''].includes(f.value.toLowerCase()))return f.value}
  return null
}

function buildArch(traits:Trait[]):Arch{
  const t=(tv(traits,'type','species','kind')||'Human').toLowerCase()
  const g=(tv(traits,'gender','sex')||'').toLowerCase()
  const sh=(tv(traits,'shirt','top','jacket','clothing','clothes','outfit','wear','hoodie')||'').toLowerCase()
  const accVal=(tv(traits,'accessory','accessories','item','hold','weapon','tool')||'').toLowerCase()
  const hatVal=(tv(traits,'hat','cap','headwear','head')||'').toLowerCase()
  let bodyType='human'
  if(t.includes('cat')||t.includes('kitty'))bodyType='cat'
  else if(t.includes('alien'))bodyType='alien'
  else if(t.includes('zombie'))bodyType='zombie'
  else if(t.includes('robot')||t.includes('android')||t.includes('agent'))bodyType='robot'
  else if(t.includes('ape')||t.includes('monkey')||t.includes('gorilla'))bodyType='ape'
  else if(t.includes('skeleton')||t.includes('skull'))bodyType='skeleton'
  let accType:string|null=null
  if(accVal&&!['none','n/a',''].includes(accVal)){
    if(accVal.match(/sword|blade|katana|dagger/))accType='sword'
    else if(accVal.match(/gun|pistol|rifle/))accType='gun'
    else if(accVal.match(/wand|staff|rod/))accType='wand'
    else if(accVal.match(/shield/))accType='shield'
    else if(accVal.match(/bottle|drink|cup/))accType='bottle'
    else if(accVal.match(/book|tome/))accType='book'
    else accType='misc'
  }
  return{bodyType,slim:g.includes('f')||g.includes('girl')||g.includes('woman'),
    hasJacket:sh.includes('jacket')||sh.includes('hoodie')||sh.includes('coat'),
    hasSuit:sh.includes('suit')||sh.includes('tux')||sh.includes('blazer'),
    hasStripe:sh.includes('stripe')||sh.includes('striped'),
    hasTank:sh.includes('tank')||sh.includes('muscle'),
    hasHood:sh.includes('hoodie')||hatVal.includes('hood'),accType}
}

// ══════════════════════════════════════════════════════════════════
//  POSE-AWARE DRAWING
//  Each pose offsets arm/leg positions differently.
//  idle   — standard upright, arms at sides
//  walk   — one arm forward, opposite leg forward (mid-stride)
//  attack — right arm raised, weapon extended, left arm back
//  crouch — knees bent ~50%, body lowered ~8px
// ══════════════════════════════════════════════════════════════════

// Layout constants (baseline = idle upright)
const NECK_Y=42,NECK_H=5,SHD_Y=47,TORSO_Y=50,TORSO_H=28
const WAIST_Y=78,LEG_TOP_Y=81,LEG_H=28,FOOT_Y=109,FOOT_H=8,GROUND_Y=117

function drawCrewNeck(c:CanvasRenderingContext2D,cx:number,y:number,w:number){
  const nw=Math.floor(w*.38),nx=cx-(nw>>1)
  dk(c,nx,y+1,nw,1);dk(c,nx-1,y+2,nw+2,1);dk(c,nx-1,y+3,2,2);dk(c,nx+nw-1,y+3,2,2)
}
function drawVNeck(c:CanvasRenderingContext2D,cx:number,y:number){
  for(let i=0;i<5;i++){px(c,cx-i,y+1+i,true);px(c,cx+i,y+1+i,true)}
}

function drawTorso(c:CanvasRenderingContext2D,a:Arch,r:()=>number,x:number,y:number,w:number,h:number){
  const cx=x+(w>>1)
  if(a.hasSuit){
    dk(c,x,y,w,h)
    // Subtle dither on suit shoulders for texture
    dith(c,x,y,4,h,6); dith(c,x+w-4,y,4,h,6)
    const shW=Math.floor(w*.32);lt(c,cx-(shW>>1),y+1,shW,h-2)
    dk(c,x+2,y+1,Math.floor(w*.22),Math.floor(h*.45));lt(c,x+3,y+2,Math.floor(w*.16),Math.floor(h*.35))
    dk(c,cx+(shW>>1)-1,y+1,Math.floor(w*.22),Math.floor(h*.45));lt(c,cx+(shW>>1),y+2,Math.floor(w*.16),Math.floor(h*.35))
    for(let i=0;i<3;i++)dk(c,cx,y+4+i*7,2,2)
    dk(c,x+4,y+3,4,4);lt(c,x+5,y+4,2,2)
  }else if(a.hasJacket||a.hasHood){
    lt(c,x+1,y+1,w-2,h-2)
    // Subtle dither on jacket sides
    dith(c,x+1,y+1,3,h-2,5); dith(c,x+w-4,y+1,3,h-2,5)
    dk(c,x,y,w,1);dk(c,x,y+h-1,w,1);dk(c,x,y,1,h);dk(c,x+w-1,y,1,h)
    vln(c,cx,y+1,y+h-2)
    if(a.hasHood){
      dk(c,cx-3,y+1,2,Math.floor(h*.4));dk(c,cx+2,y+1,2,Math.floor(h*.4))
      const pkW=Math.floor(w*.5),pkH=6;obox(c,cx-(pkW>>1),y+h-pkH-1,pkW,pkH)
    }
    dk(c,x+1,y+h-4,4,3);dk(c,x+w-5,y+h-4,4,3)
  }else if(a.hasStripe){
    lt(c,x+1,y+1,w-2,h-2)
    dk(c,x,y,w,1);dk(c,x,y+h-1,w,1);dk(c,x,y,1,h);dk(c,x+w-1,y,1,h)
    for(let sy=y+2;sy<y+h-2;sy+=5)dk(c,x+1,sy,w-2,2)
    drawVNeck(c,cx,y)
  }else if(a.hasTank){
    lt(c,x+1,y+1,w-2,h-2)
    // Dither on bare skin areas of tank top
    dith(c,x+1,y+5,3,Math.floor(h*.5),8); dith(c,x+w-4,y+5,3,Math.floor(h*.5),8)
    dk(c,x,y,w,1);dk(c,x,y+h-1,w,1);dk(c,x,y,1,h);dk(c,x+w-1,y,1,h)
    dk(c,x+3,y+1,5,4);dk(c,x+w-8,y+1,5,4)
    lt(c,x+1,y+5,3,Math.floor(h*.5));lt(c,x+w-4,y+5,3,Math.floor(h*.5))
    vln(c,cx,y+5,y+h-3)
  }else{
    lt(c,x+1,y+1,w-2,h-2)
    dk(c,x,y,w,1);dk(c,x,y+h-1,w,1);dk(c,x,y,1,h);dk(c,x+w-1,y,1,h)
    if(r()<.5)drawCrewNeck(c,cx,y,w);else drawVNeck(c,cx,y)
    hln(c,x+2,x+w-3,y+Math.floor(h*.35),false)
  }
}

function drawAccessory(c:CanvasRenderingContext2D,type:string,x:number,y:number,raised:boolean){
  const oy=raised?-10:0 // attack pose raises weapon
  switch(type){
    case 'sword':
      dk(c,x+1,y+oy,4,5);lt(c,x+2,y+oy+1,2,3)
      dk(c,x-1,y+oy+5,8,2);dk(c,x+2,y+oy+7,2,18);lt(c,x+3,y+oy+8,1,16);break
    case 'gun':
      dk(c,x,y+oy,5,8);lt(c,x+1,y+oy+1,3,6)
      dk(c,x+3,y+oy+2,11,4);lt(c,x+4,y+oy+3,9,2)
      dk(c,x+2,y+oy+7,4,3);lt(c,x+3,y+oy+8,2,1);break
    case 'wand':
      dk(c,x+2,y+oy+6,3,20);lt(c,x+3,y+oy+7,1,18)
      obox(c,x,y+oy,7,7);dk(c,x+2,y+oy+2,3,3);lt(c,x+3,y+oy+3,1,1);break
    case 'shield':
      dk(c,x+1,y+oy,8,1);dk(c,x,y+oy+1,10,8);dk(c,x+1,y+oy+9,8,1);dk(c,x+2,y+oy+10,6,1)
      dk(c,x+3,y+oy+11,4,1);dk(c,x+4,y+oy+12,2,2);lt(c,x+1,y+oy+2,8,6)
      dk(c,x+4,y+oy+3,2,4);dk(c,x+2,y+oy+4,6,2);break
    case 'bottle':
      dk(c,x+2,y+oy,3,2);obox(c,x,y+oy+2,7,12);lt(c,x+2,y+oy+4,2,7);break
    case 'book':
      obox(c,x,y+oy,9,12);dk(c,x+1,y+oy+3,1,6);dk(c,x+2,y+oy+2,6,1);dk(c,x+2,y+oy+9,6,1);break
    default:
      obox(c,x,y+oy,6,7);dk(c,x+2,y+oy+2,2,3)
  }
}

// ── Arms with pose-awareness ──────────────────────────────────────
function drawArms(c:CanvasRenderingContext2D,a:Arch,shdX:number,shdY:number,shdW:number,torsoH:number,accType:string|null,pose:Pose){
  const armW=a.bodyType==='ape'?9:a.slim?6:8
  const uArmH=Math.floor(torsoH*.55),fArmH=Math.floor(torsoH*.45)
  const fArmW=armW-1,handH=7,handW=armW+1
  const baseY=shdY+2

  // Pose offsets: [leftArmSwing, rightArmSwing, leftForeSwing, rightForeSwing]
  // positive = forward/up, negative = back/down
  let lSwing=0,rSwing=0,lElbowExtra=0,rElbowExtra=0,lRaise=0,rRaise=0
  if(pose==='walk'){lSwing=-6;rSwing=6;lElbowExtra=2;rElbowExtra=-2}
  if(pose==='attack'){rRaise=-12;rElbowExtra=-6;lSwing=-4}
  if(pose==='crouch'){lSwing=3;rSwing=3}

  // LEFT arm
  const lUX=shdX, lUY=baseY+Math.max(0,-lSwing>>1)
  const lElbY=lUY+uArmH
  const lFX=lUX-2+lSwing
  const lFY=lElbY+lElbowExtra
  const lHY=lFY+fArmH
  dk(c,lUX,lUY,armW,uArmH)
  dith(c,lUX,lUY,armW,uArmH,9) // arm shadow/dither for roundness
  lt(c,lUX+1,lElbY-1,armW-2,1)
  dk(c,lFX,lFY,fArmW,fArmH)
  lt(c,lFX+1,lHY-2,fArmW-2,1)
  obox(c,lFX-1,lHY,handW,handH)

  // RIGHT arm
  const rUX=shdX+shdW-armW, rUY=baseY+Math.max(0,-rRaise>>1)
  const rElbY=rUY+uArmH+rRaise
  const rFX=rUX+2
  const rFY=rElbY+rElbowExtra
  const rHY=rFY+fArmH
  dk(c,rUX,rUY,armW,uArmH)
  dith(c,rUX,rUY,armW,uArmH,9)
  lt(c,rUX+1,rElbY-1,armW-2,1)
  dk(c,rFX+1,rFY,fArmW,fArmH)
  lt(c,rFX+2,rHY-2,fArmW-2,1)
  obox(c,rFX+1,rHY,handW,handH)

  if(accType)drawAccessory(c,accType,rFX+handW+1,rHY,pose==='attack')
}

// ── Legs with pose-awareness ──────────────────────────────────────
function drawLegs(c:CanvasRenderingContext2D,a:Arch,legTopY:number,legH:number,footY:number,footH:number,pose:Pose){
  const legW=a.bodyType==='ape'?14:a.slim?10:12,gap=4,halfG=gap>>1
  const lLegX=CX-halfG-legW, rLegX=CX+halfG

  // Crouch compresses thigh, bends knee aggressively
  const crouchOffset=pose==='crouch'?10:0
  const thighH=Math.floor(legH*.48)-crouchOffset
  const kneeH=4
  const calfH=legH-thighH-kneeH-(crouchOffset>>1)

  // Walk: left leg forward, right leg back
  let lLegFwd=0,rLegFwd=0
  if(pose==='walk'){lLegFwd=-5;rLegFwd=4}
  if(pose==='attack'){lLegFwd=-3;rLegFwd=2}

  const lKneeY=legTopY+thighH, rKneeY=legTopY+thighH
  const lCalfY=lKneeY+kneeH, rCalfY=rKneeY+kneeH
  const lAnkleY=lCalfY+calfH, rAnkleY=rCalfY+calfH
  const lFootY=lAnkleY+2, rFootY=rAnkleY+2

  // LEFT thigh
  const lLX=lLegX+lLegFwd
  dk(c,lLX,legTopY,legW,thighH)
  dith(c,lLX+legW-2,legTopY,2,thighH,6) // inner leg shadow
  lt(c,lLX+legW-1,legTopY+2,1,thighH-4)
  dk(c,lLX-1,lKneeY,legW+2,kneeH)
  lt(c,lLX+1,lKneeY+1,legW-2,1)
  dk(c,lLX,lCalfY,legW,calfH)
  dith(c,lLX,lCalfY,2,calfH,7) // front shin dither
  lt(c,lLX+2,lCalfY+2,2,calfH-4)
  dk(c,lLX+1,lAnkleY,legW-2,2)
  // LEFT shoe (boot style for zombie/skeleton, bare prints for ape, normal for rest)
  drawShoe(c,a,lLX,lFootY,legW,footH,true)

  // RIGHT thigh
  const rLX=rLegX+rLegFwd
  dk(c,rLX,legTopY,legW,thighH)
  dith(c,rLX,legTopY,2,thighH,6)
  lt(c,rLX,legTopY+2,1,thighH-4)
  dk(c,rLX-1,rKneeY,legW+2,kneeH)
  lt(c,rLX+1,rKneeY+1,legW-2,1)
  dk(c,rLX,rCalfY,legW,calfH)
  dith(c,rLX,rCalfY,2,calfH,7)
  lt(c,rLX+2,rCalfY+2,2,calfH-4)
  dk(c,rLX+1,rAnkleY,legW-2,2)
  drawShoe(c,a,rLX,rFootY,legW,footH,false)
}

function drawShoe(c:CanvasRenderingContext2D,a:Arch,lx:number,fy:number,legW:number,footH:number,isLeft:boolean){
  if(a.bodyType==='ape'){
    // Bare foot / knuckle toes
    dk(c,lx,fy,legW,footH-2)
    dith(c,lx,fy,legW,footH-2,8)
    // Toes
    for(let t=0;t<3;t++)dk(c,lx+t*3+(isLeft?0:1),fy+footH-3,2,3)
    return
  }
  if(a.bodyType==='skeleton'){
    // Bony foot: just a thin dark shape
    dk(c,lx,fy,legW,2)
    dk(c,lx+(isLeft?0:legW-2),fy+2,2,footH-1)
    return
  }
  const shoeW=legW+6
  const sx=isLeft?lx-4:lx-1
  if(a.bodyType==='zombie'||a.bodyType==='robot'){
    // Chunky boot
    dk(c,sx,fy,shoeW,footH)
    lt(c,sx+2,fy+1,shoeW-5,2)
    dith(c,sx,fy+3,shoeW,footH-4,7)
    dk(c,sx+1,fy+footH-1,shoeW-2,1)
  }else{
    // Normal sneaker/shoe
    dk(c,sx+1,fy,shoeW-1,1)
    dk(c,sx,fy+1,shoeW,footH-2)
    dk(c,sx+1,fy+footH-1,shoeW-1,1)
    lt(c,sx+2,fy+1,shoeW-4,2)
    lt(c,sx+(isLeft?1:shoeW-3),fy+3,2,footH-5)
    dk(c,sx+1,fy+footH-2,shoeW-2,1) // sole
  }
}

function drawTypeExtras(c:CanvasRenderingContext2D,a:Arch,bodyX:number,bodyW:number,torsoY:number,torsoH:number,waistY:number,shdX:number,shdY:number,shdW:number,r:()=>number){
  if(a.bodyType==='cat'){
    const tx=bodyX+bodyW+1,ty=waistY+5
    vln(c,tx,ty,ty+10);vln(c,tx+1,ty+2,ty+10);vln(c,tx+2,ty+1,ty+6)
    hln(c,tx+2,tx+6,ty);vln(c,tx+6,ty,ty+3);hln(c,tx+5,tx+8,ty-1)
    vln(c,tx+8,ty-3,ty);hln(c,tx+6,tx+9,ty-4)
    dk(c,tx+9,ty-5,3,3);lt(c,tx+10,ty-4,1,1)
  }
  if(a.bodyType==='alien'){
    const ay=shdY+3,ah=Math.floor(torsoH*.9)
    vln(c,shdX-3,ay,ay+8);vln(c,shdX-4,ay+5,ay+ah);hln(c,shdX-7,shdX-4,ay+ah)
    vln(c,shdX+shdW+2,ay,ay+8);vln(c,shdX+shdW+3,ay+5,ay+ah);hln(c,shdX+shdW+3,shdX+shdW+6,ay+ah)
    dk(c,shdX-8,ay+ah-1,2,1);dk(c,shdX-7,ay+ah+1,2,1)
    dk(c,shdX+shdW+6,ay+ah-1,2,1);dk(c,shdX+shdW+5,ay+ah+1,2,1)
  }
  if(a.bodyType==='robot'){
    hln(c,bodyX+3,bodyX+bodyW-4,torsoY+6,false);hln(c,bodyX+3,bodyX+bodyW-4,torsoY+7)
    dk(c,bodyX+4,torsoY+2,3,3);lt(c,bodyX+5,torsoY+3,1,1)
    dk(c,bodyX+9,torsoY+2,3,3);lt(c,bodyX+10,torsoY+3,1,1)
    dk(c,bodyX+bodyW-7,torsoY+2,3,3);lt(c,bodyX+bodyW-6,torsoY+3,1,1)
    const pX=bodyX+4,pY=torsoY+9,pW=bodyW-8,pH=10
    obox(c,pX,pY,pW,pH)
    hln(c,pX+2,pX+pW-3,pY+2);hln(c,pX+2,pX+pW-3,pY+4);hln(c,pX+2,pX+Math.floor(pW/2),pY+6)
    dk(c,bodyX+1,torsoY+1,3,3);lt(c,bodyX+2,torsoY+2,1,1)
    dk(c,bodyX+bodyW-4,torsoY+1,3,3);lt(c,bodyX+bodyW-3,torsoY+2,1,1)
  }
  if(a.bodyType==='skeleton'){
    lt(c,bodyX+1,torsoY+1,bodyW-2,torsoH-2)
    dk(c,bodyX,torsoY,bodyW,1);dk(c,bodyX,torsoY+torsoH-1,bodyW,1)
    dk(c,bodyX,torsoY,1,torsoH);dk(c,bodyX+bodyW-1,torsoY,1,torsoH)
    const spX=CX;vln(c,spX,torsoY+2,torsoY+torsoH-2)
    const rsp=Math.floor((torsoH-6)/4)
    for(let i=0;i<4;i++){const ry=torsoY+3+i*rsp;hln(c,bodyX+2,spX-1,ry);hln(c,bodyX+1,spX-1,ry+1);hln(c,spX+1,bodyX+bodyW-3,ry);hln(c,spX+1,bodyX+bodyW-2,ry+1)}
  }
  if(a.bodyType==='zombie'){
    lt(c,bodyX+1,torsoY+1,bodyW-2,torsoH-2)
    dk(c,bodyX,torsoY,bodyW,1);dk(c,bodyX,torsoY+torsoH-1,bodyW,1)
    dk(c,bodyX,torsoY,1,torsoH);dk(c,bodyX+bodyW-1,torsoY,1,torsoH)
    dk(c,bodyX+3,torsoY+4,1,4);dk(c,bodyX+4,torsoY+5,1,4)
    dk(c,bodyX+bodyW-6,torsoY+8,1,5);dk(c,bodyX+bodyW-5,torsoY+9,1,4)
    for(let i=bodyX+1;i<bodyX+bodyW-1;i+=2){const drop=(r()*3)|0;dk(c,i,torsoY+torsoH-1-drop,1,drop+1);lt(c,i,torsoY+torsoH-drop,1,drop)}
  }
  if(a.bodyType==='ape'){
    lt(c,bodyX+1,torsoY+1,bodyW-2,torsoH-2)
    dk(c,bodyX,torsoY,bodyW,1);dk(c,bodyX,torsoY+torsoH-1,bodyW,1)
    dk(c,bodyX,torsoY,1,torsoH);dk(c,bodyX+bodyW-1,torsoY,1,torsoH)
    for(let fy=torsoY+3;fy<torsoY+torsoH-2;fy+=3)for(let fx=bodyX+2;fx<bodyX+bodyW-2;fx+=3)dk(c,fx,fy,2,1)
    const pW=Math.floor(bodyW*.4)
    dk(c,CX-(pW>>1),torsoY+2,pW,Math.floor(torsoH*.6))
    lt(c,CX-(pW>>1)+1,torsoY+3,pW-2,Math.floor(torsoH*.6)-2)
  }
}

// ── Full body draw for one pose, at canvas offset (offX, offY) ────
function drawBodyAtPose(c:CanvasRenderingContext2D,a:Arch,seed:number,pose:Pose,offX=0,offY=0){
  const r=mkrng(seed^(pose.charCodeAt(0)*997))
  const bodyW=a.bodyType==='ape'?52:a.bodyType==='robot'?48:a.slim?40:46
  const bodyX=CX-(bodyW>>1)+offX
  const shdOvh=a.bodyType==='ape'?8:a.slim?4:6
  const shdX=bodyX-shdOvh, shdW=bodyW+shdOvh*2
  const neckW=a.bodyType==='ape'?14:a.slim?8:10,neckX=CX-(neckW>>1)+offX

  // Crouch: shift everything down and compress
  const crouchY=pose==='crouch'?8:0
  const neckY=NECK_Y+crouchY,shdY=SHD_Y+crouchY,torsoY=TORSO_Y+crouchY
  const waistY=WAIST_Y+crouchY,legTopY=LEG_TOP_Y+crouchY

  // Translate canvas
  c.save(); c.translate(offX,offY)

  lt(c,-offX,0,120,120) // clear this frame area (within translated coords)

  // Neck
  dk(c,neckX-offX,neckY,neckW,NECK_H)
  // Shoulders
  dk(c,shdX-offX+1,shdY,shdW-2,1);dk(c,shdX-offX,shdY+1,shdW,2)
  // Torso
  drawTorso(c,a,r,bodyX-offX,torsoY,bodyW,TORSO_H)
  // Arms
  drawArms(c,a,shdX-offX,shdY,shdW,TORSO_H,a.accType,pose)
  // Waistband + belt
  dk(c,bodyX-offX-1,waistY,bodyW+2,3)
  lt(c,CX-offX-2,waistY+1,4,1);dk(c,CX-offX-1,waistY+1,2,1)
  // Legs
  drawLegs(c,a,legTopY,LEG_H,FOOT_Y+crouchY,FOOT_H,pose)
  // Ground shadow
  const swW=bodyW+8,swX=CX-offX-(swW>>1)
  dk(c,swX,GROUND_Y,swW,1);lt(c,swX,GROUND_Y,2,1);lt(c,swX+swW-2,GROUND_Y,2,1)
  // Type extras
  drawTypeExtras(c,a,bodyX-offX,bodyW,torsoY,TORSO_H,waistY,shdX-offX,shdY,shdW,r)

  c.restore()
}

function sampleFace(img:HTMLImageElement):number[][]{
  const oc=document.createElement('canvas');oc.width=oc.height=40
  const cx=oc.getContext('2d')!;cx.imageSmoothingEnabled=false
  cx.drawImage(img,0,0,40,40)
  const raw=cx.getImageData(0,0,40,40).data,g:number[][]=[]
  for(let y=0;y<40;y++){g[y]=[];for(let x=0;x<40;x++){const i=(y*40+x)*4;if(raw[i+3]<40){g[y][x]=0;continue};g[y][x]=(0.2126*raw[i]+0.7152*raw[i+1]+0.0722*raw[i+2])<140?1:0}}
  return g
}

function pasteFace(c:CanvasRenderingContext2D,g:number[][],offX=0){
  for(let y=0;y<40;y++)for(let x=0;x<40;x++)g[y][x]===1?dk(c,40+x+offX,2+y,1,1):lt(c,40+x+offX,2+y,1,1)
}

function snapPal(c:CanvasRenderingContext2D,ca:number,w=120,h=120){
  const id=c.getImageData(0,0,w,h),p=id.data,thr=127+ca*15
  for(let i=0;i<p.length;i+=4){
    if(p[i+3]<10){p[i]=PL[0];p[i+1]=PL[1];p[i+2]=PL[2];p[i+3]=255;continue}
    const lm=0.2126*p[i]+0.7152*p[i+1]+0.0722*p[i+2],col=lm>thr?PL:PD
    p[i]=col[0];p[i+1]=col[1];p[i+2]=col[2];p[i+3]=255
  }
  c.putImageData(id,0,0)
}

function cleanOutline(c:CanvasRenderingContext2D,w=120,h=120){
  const id=c.getImageData(0,0,w,h),src=new Uint8ClampedArray(id.data),dst=id.data
  const isDk=(x:number,y:number)=>(x<0||x>=w||y<0||y>=h)?true:src[(y*w+x)*4]<100
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(src[i]>180){let n=0;if(isDk(x-1,y))n++;if(isDk(x+1,y))n++;if(isDk(x,y-1))n++;if(isDk(x,y+1))n++;if(n>=3){dst[i]=PD[0];dst[i+1]=PD[1];dst[i+2]=PD[2];dst[i+3]=255}}}
  c.putImageData(id,0,0)
}

// ─── Sprite sheet: 4 poses side by side = 480×120 ─────────────────
const POSES:Pose[]=['idle','walk','attack','crouch']
const POSE_LABELS=['Idle','Walk','Attack','Crouch']

async function generateSheet(
  faceImg:HTMLImageElement,traits:Trait[],seed:number,contrast:number,
  sheetCanvas:HTMLCanvasElement,wait:(ms:number)=>Promise<void>
){
  const arch=buildArch(traits)
  sheetCanvas.width=480; sheetCanvas.height=120
  const ctx=sheetCanvas.getContext('2d')!
  ctx.imageSmoothingEnabled=false
  // Fill background
  ctx.fillStyle=plStr; ctx.fillRect(0,0,480,120)

  const face=sampleFace(faceImg)
  for(let i=0;i<4;i++){
    const pose=POSES[i]
    const offX=i*120
    // Draw body into a temp 120×120 canvas then blit
    const tmp=document.createElement('canvas');tmp.width=tmp.height=120
    const tc=tmp.getContext('2d')!;tc.imageSmoothingEnabled=false
    tc.fillStyle=plStr;tc.fillRect(0,0,120,120)
    drawBodyAtPose(tc,arch,seed,pose)
    pasteFace(tc,face)
    snapPal(tc,contrast)
    cleanOutline(tc)
    ctx.drawImage(tmp,offX,0)
    await wait(8)
  }
}

// ─── Single sprite ────────────────────────────────────────────────
async function generateSingle(
  faceImg:HTMLImageElement,traits:Trait[],seed:number,contrast:number,
  wc:HTMLCanvasElement,pose:Pose,wait:(ms:number)=>Promise<void>
){
  const arch=buildArch(traits)
  const ctx=wc.getContext('2d')!;ctx.imageSmoothingEnabled=false
  ctx.fillStyle=plStr;ctx.fillRect(0,0,120,120)
  drawBodyAtPose(ctx,arch,seed,pose)
  const face=sampleFace(faceImg)
  pasteFace(ctx,face)
  await wait(8)
  snapPal(ctx,contrast)
  cleanOutline(ctx)
}

// ─── UI Styles ────────────────────────────────────────────────────
const S={
  btn:{background:'transparent',border:'1px solid var(--line)',color:'var(--ink)',fontFamily:'inherit',fontSize:'.56rem',fontWeight:700,letterSpacing:'.11em',textTransform:'uppercase' as const,padding:'.42rem .82rem',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:'.3rem',userSelect:'none' as const,WebkitTapHighlightColor:'transparent'},
  btnFill:{background:'var(--ink)',color:'var(--bg)',borderColor:'var(--ink)'},
  frame:{width:'100%',maxWidth:200,aspectRatio:'1' as const,background:'#e3e5e4',border:'1px solid var(--line)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:'1.1rem',overflow:'hidden',position:'relative' as const},
  lbl:{fontSize:'.52rem',letterSpacing:'.15em',textTransform:'uppercase' as const,color:'var(--ink-muted)',display:'block',marginBottom:'.25rem'},
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────
function EngineInner(){
  const searchParams=useSearchParams()
  const router=useRouter()
  const wcRef=useRef<HTMLCanvasElement>(null)
  const sheetRef=useRef<HTMLCanvasElement>(null)
  const [tokenInput,setTokenInput]=useState('')
  const [loading,setLoading]=useState(false)
  const [progLabel,setProgLabel]=useState('')
  const [progPct,setProgPct]=useState(0)
  const [showProg,setShowProg]=useState(false)
  const [traits,setTraits]=useState<Trait[]>([])
  const [normName,setNormName]=useState('')
  const [faceUrl,setFaceUrl]=useState<string|null>(null)
  const [faceImg,setFaceImg]=useState<HTMLImageElement|null>(null)
  const [spriteReady,setSpriteReady]=useState(false)
  const [sheetReady,setSheetReady]=useState(false)
  const [seed,setSeed]=useState(0)
  const [contrast,setContrast]=useState(0)
  const [err,setErr]=useState('')
  const [uploading,setUploading]=useState(false)
  const [savedUrl,setSavedUrl]=useState<string|null>(null)
  const [currentId,setCurrentId]=useState<number|null>(null)
  const [activePose,setActivePose]=useState<Pose>('idle')
  const [shareOpen,setShareOpen]=useState(false)
  const displayCanvasRef=useRef<HTMLCanvasElement|null>(null)

  const wait=(ms:number):Promise<void>=>new Promise(r=>setTimeout(r,ms))
  const prog=useCallback((show:boolean,lbl:string,pct:number)=>{setShowProg(show);setProgLabel(lbl);setProgPct(pct)},[])

  useEffect(()=>{
    const id=searchParams.get('id')
    if(id){setTokenInput(id);setTimeout(()=>loadById(parseInt(id)),300)}
  },[])

  async function rf(url:string,n=3):Promise<Response>{
    for(let i=0;i<n;i++){const r=await fetch(url,{cache:'no-store'});if(r.status!==429)return r;if(i<n-1)await wait(900*(i+1))}
    return fetch(url,{cache:'no-store'})
  }

  async function loadById(id:number){
    setErr('');setLoading(true);setSpriteReady(false);setSheetReady(false);setTraits([]);setNormName('');setFaceUrl(null);setSavedUrl(null);setCurrentId(id)
    router.replace(`/engine?id=${id}`,{scroll:false})
    try{
      const mRes=await rf(`https://api.normies.art/normie/${id}/metadata`)
      if(!mRes.ok)throw new Error(mRes.status===404?`Normie #${id} not found`:`Metadata error (${mRes.status})`)
      const mData=await mRes.json()
      const parsed:Trait[]=[]
      if(Array.isArray(mData.attributes))mData.attributes.forEach((a:any)=>{if(a.trait_type&&a.value)parsed.push({key:String(a.trait_type),value:String(a.value)})})
      setTraits(parsed);setNormName(mData.name||`Normie #${id}`)
      const iRes=await rf(`https://api.normies.art/normie/${id}/image.png`)
      if(!iRes.ok)throw new Error(`Image error (${iRes.status})`)
      const blob=await iRes.blob()
      const url=URL.createObjectURL(blob);setFaceUrl(url)
      const img=await new Promise<HTMLImageElement>((res,rej)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=rej;i.src=url})
      setFaceImg(img)
    }catch(e:any){setErr(e.message||'Failed to load')}
    finally{setLoading(false)}
  }

  async function generate(newSeed=false,pose=activePose){
    if(!faceImg)return
    const s=newSeed||!seed?((Math.random()*0xFFFFFF)|0):seed
    if(newSeed||!seed)setSeed(s)
    const wc=wcRef.current;if(!wc)return
    prog(true,'Drawing body…',20);await wait(12)
    await generateSingle(faceImg,traits,s,contrast,wc,pose,wait)
    prog(true,'Building sprite sheet…',60);await wait(8)
    const sheet=sheetRef.current
    if(sheet)await generateSheet(faceImg,traits,s,contrast,sheet,wait)
    prog(false,'',100);await wait(8)
    const dc=document.createElement('canvas');dc.width=dc.height=120
    dc.getContext('2d')!.drawImage(wc,0,0)
    displayCanvasRef.current=dc
    setSpriteReady(true);setSheetReady(true)
  }

  async function switchPose(p:Pose){
    setActivePose(p)
    if(!faceImg||!seed)return
    const wc=wcRef.current;if(!wc)return
    await generateSingle(faceImg,traits,seed,contrast,wc,p,wait)
    const dc=document.createElement('canvas');dc.width=dc.height=120
    dc.getContext('2d')!.drawImage(wc,0,0)
    displayCanvasRef.current=dc
    setSpriteReady(true)
  }

  function dlSprite(size:number,transparent:boolean,sheet=false){
    if(!spriteReady)return
    const src=sheet?sheetRef.current:wcRef.current
    if(!src)return
    const W=sheet?480:size,H=size
    const out=document.createElement('canvas');out.width=W;out.height=H
    const cx=out.getContext('2d')!;cx.imageSmoothingEnabled=false
    if(!transparent){cx.fillStyle=plStr;cx.fillRect(0,0,W,H)}
    cx.drawImage(src,0,0,W,H)
    const suffix=sheet?`-sheet-${size}`:`-${activePose}-${size}${transparent?'-transparent':''}`
    const name=`normie-${currentId}${suffix}.png`
    out.toBlob(b=>{const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(b!),download:name});a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3e3)},'image/png')
  }

  async function saveToGallery(){
    if(!spriteReady)return;setUploading(true)
    try{
      const wc=wcRef.current!
      const blob:Blob=await new Promise(res=>wc.toBlob(b=>res(b!),'image/png'))
      const form=new FormData()
      form.append('file',blob,`normie-${currentId}.png`)
      form.append('meta',JSON.stringify({id:currentId,name:normName,traits}))
      const res=await fetch('/api/upload',{method:'POST',body:form})
      const data=await res.json()
      if(data.url)setSavedUrl(data.url)
      else throw new Error('Upload failed')
    }catch(e){console.error(e)}finally{setUploading(false)}
  }

  function shareTwitter(){
    const text=encodeURIComponent(`Just generated Normie #${currentId} as a full-body pixel art sprite! 🎮\n\nGenerate yours → https://fullnormies.vercel.app/engine?id=${currentId}`)
    window.open(`https://x.com/intent/tweet?text=${text}`,'_blank')
  }

  const grid2:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.3rem',marginBottom:'.45rem'}

  return(
    <div style={{display:'flex',flexDirection:'column',minHeight:'100vh'}}>
      <Nav/>
      <canvas ref={wcRef} width={120} height={120} style={{display:'none'}}/>
      <canvas ref={sheetRef} width={480} height={120} style={{display:'none'}}/>

      <main style={{flex:1}}>
        {/* ── Input bar ── */}
        <div style={{borderBottom:'1px solid var(--line)',padding:'1.3rem 0'}}>
          <div style={{maxWidth:1080,margin:'0 auto',padding:'0 1.25rem'}}>
            <div style={{display:'flex',alignItems:'flex-end',gap:'.5rem',flexWrap:'wrap'}}>
              <div>
                <span style={S.lbl}>Token ID — 0 to 9999</span>
                <input type="number" min={0} max={9999} placeholder="1337"
                  value={tokenInput} onChange={e=>setTokenInput(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&tokenInput&&loadById(parseInt(tokenInput))}
                  inputMode="numeric"
                  style={{background:'transparent',border:'1px solid var(--line)',color:'var(--ink)',fontFamily:'inherit',fontSize:'1.75rem',fontWeight:900,letterSpacing:'-.04em',width:'7.2rem',padding:'.25rem .55rem',outline:'none',appearance:'textfield'}}
                />
              </div>
              <button style={{...S.btn,...S.btnFill}} disabled={loading} onClick={()=>tokenInput&&loadById(parseInt(tokenInput))}>{loading?'Loading…':'Load'}</button>
              <button style={S.btn} onClick={()=>{const id=Math.floor(Math.random()*10000);setTokenInput(String(id));loadById(id)}}>Random</button>
            </div>
            {err&&<div style={{marginTop:'.7rem',padding:'.45rem .65rem',border:'1px solid var(--line)',fontSize:'.62rem',color:'var(--ink)'}}>⚠ {err}</div>}
          </div>
        </div>

        {/* ── Two-column layout (proper CSS grid, no class injection) ── */}
        <div style={{maxWidth:1080,margin:'0 auto',padding:'0 1.25rem'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr',borderBottom:'1px solid var(--line)'}}>

            {/* Inline responsive style — single rule, no className hacks */}
            <style>{`
              @media(min-width:700px){
                .fn-eng-grid{grid-template-columns:1fr 1fr !important}
                .fn-eng-right{border-left:1px solid var(--line) !important;border-top:none !important;padding-top:1.4rem !important;padding-left:1.6rem !important}
              }
            `}</style>

            <div className="fn-eng-grid" style={{display:'grid',gridTemplateColumns:'1fr',gap:0}}>

              {/* ── LEFT: original normie ── */}
              <div style={{padding:'1.4rem 0'}}>
                <div style={{fontSize:'.5rem',letterSpacing:'.18em',textTransform:'uppercase',color:'var(--ink-muted)',marginBottom:'1.1rem',display:'flex',alignItems:'center',gap:'.4rem'}}>
                  01 — Original Normie
                  <span style={{flex:1,height:1,background:'var(--line-soft)',display:'block',opacity:.5}}/>
                </div>
                <div style={{...S.frame,maxWidth:200}}>
                  {faceUrl
                    ?<img src={faceUrl} alt={normName} style={{width:'100%',height:'100%',imageRendering:'pixelated',objectFit:'contain',display:'block'}}/>
                    :<div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'.28rem',color:'#48494b',textAlign:'center'}}>
                      <div style={{fontSize:'1.3rem',opacity:.1}}>◻</div>
                      <div style={{fontSize:'.5rem',letterSpacing:'.1em',textTransform:'uppercase'}}>Load a Normie</div>
                      <div style={{fontSize:'.46rem',opacity:.55}}>0 – 9999</div>
                    </div>
                  }
                </div>
                {normName&&<div style={{fontSize:'1.4rem',fontWeight:900,letterSpacing:'-.05em',lineHeight:1,marginBottom:'.9rem',color:'var(--ink)'}}>{normName}</div>}
                <span style={S.lbl}>Traits</span>
                <div style={{display:'grid',gridTemplateColumns:'auto 1fr'}}>
                  {traits.length===0
                    ?<div style={{gridColumn:'span 2',fontSize:'.58rem',color:'var(--ink-muted)',padding:'.3rem 0'}}>No traits loaded.</div>
                    :traits.map((t,i)=>[
                      <div key={i+'k'} style={{padding:'.22rem .75rem .22rem 0',fontSize:'.5rem',letterSpacing:'.07em',textTransform:'uppercase',color:'var(--ink-muted)',borderBottom:'1px solid var(--line-soft)',whiteSpace:'nowrap'}}>{t.key}</div>,
                      <div key={i+'v'} style={{padding:'.22rem 0',fontSize:'.68rem',fontWeight:700,letterSpacing:'-.01em',borderBottom:'1px solid var(--line-soft)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={t.value}>{t.value}</div>
                    ])
                  }
                </div>
                {faceUrl&&<><hr style={{border:'none',borderTop:'1px solid var(--line-soft)',margin:'.9rem 0'}}/><button style={S.btn} onClick={()=>{const a=Object.assign(document.createElement('a'),{href:faceUrl!,download:`normie-${currentId}-face.png`});a.click()}}>↓ Download Face PNG</button></>}
              </div>

              {/* ── RIGHT: sprite engine ── */}
              <div className="fn-eng-right" style={{padding:'1.4rem 0',borderTop:'1px solid var(--line)'}}>
                <div style={{fontSize:'.5rem',letterSpacing:'.18em',textTransform:'uppercase',color:'var(--ink-muted)',marginBottom:'1.1rem',display:'flex',alignItems:'center',gap:'.4rem'}}>
                  02 — Full Body Sprite Engine
                  <span style={{flex:1,height:1,background:'var(--line-soft)',display:'block',opacity:.5}}/>
                </div>

                {/* Sprite preview */}
                <div style={{...S.frame,maxWidth:200}}>
                  {spriteReady&&displayCanvasRef.current
                    ?<canvas ref={el=>{if(el&&displayCanvasRef.current){el.width=el.height=120;el.getContext('2d')!.drawImage(displayCanvasRef.current,0,0)}}} width={120} height={120} style={{width:'100%',height:'100%',imageRendering:'pixelated',display:'block'}}/>
                    :<div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'.28rem',color:'#48494b',textAlign:'center'}}>
                      <div style={{fontSize:'1.3rem',opacity:.1}}>▦</div>
                      <div style={{fontSize:'.5rem',letterSpacing:'.1em',textTransform:'uppercase'}}>120×120 Sprite</div>
                      <div style={{fontSize:'.46rem',opacity:.55}}>load a normie to generate</div>
                    </div>
                  }
                </div>

                {/* Pose selector (shows after first generate) */}
                {spriteReady&&<>
                  <span style={S.lbl}>Pose</span>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'.3rem',marginBottom:'.7rem'}}>
                    {POSES.map((p,i)=>(
                      <button key={p} style={{...S.btn,...(activePose===p?S.btnFill:{})}} onClick={()=>switchPose(p)}>{POSE_LABELS[i]}</button>
                    ))}
                  </div>
                </>}

                {/* Progress */}
                {showProg&&<div style={{marginBottom:'.7rem'}}>
                  <div style={{fontSize:'.5rem',letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-muted)',marginBottom:'.28rem'}}>{progLabel}</div>
                  <div style={{height:2,background:'var(--line-soft)'}}><div style={{height:2,background:'var(--ink)',width:`${progPct}%`,transition:'width .28s ease'}}/></div>
                </div>}

                <button style={{...S.btn,...S.btnFill,width:'100%',marginBottom:'.45rem'}} disabled={!faceImg} onClick={()=>generate(false)}>▶ Generate Full Body Sprite</button>

                {spriteReady&&<div style={grid2}>
                  <button style={S.btn} onClick={()=>generate(false)}>↺ Regenerate</button>
                  <button style={S.btn} onClick={()=>generate(true)}>⚂ New Seed</button>
                  <button style={S.btn} onClick={()=>{setContrast(c=>Math.min(3,c+1));generate(false)}}>+ Contrast</button>
                  <button style={S.btn} onClick={()=>{setContrast(c=>Math.max(-3,c-1));generate(false)}}>− Contrast</button>
                </div>}

                <hr style={{border:'none',borderTop:'1px solid var(--line-soft)',margin:'.9rem 0'}}/>

                {/* Downloads */}
                <span style={S.lbl}>Download</span>
                {spriteReady
                  ?<div style={{...grid2,marginTop:'.4rem'}}>
                    <button style={S.btn} onClick={()=>dlSprite(120,false)}>↓ 120px PNG</button>
                    <button style={S.btn} onClick={()=>dlSprite(120,true)}>↓ 120px Transparent</button>
                    <button style={S.btn} onClick={()=>dlSprite(480,false)}>↓ 480px PNG</button>
                    <button style={S.btn} onClick={()=>dlSprite(960,false)}>↓ 960px PNG</button>
                    <button style={{...S.btn,gridColumn:'span 2'}} onClick={()=>dlSprite(120,false,true)}>↓ Sprite Sheet (4 poses)</button>
                    <button style={{...S.btn,...(savedUrl?{opacity:.5}:{}),gridColumn:'span 2'}} onClick={saveToGallery} disabled={uploading||!!savedUrl}>
                      {uploading?'Saving…':savedUrl?'✓ Saved to Gallery':'↑ Save to Gallery'}
                    </button>
                    {/* Share */}
                    <div style={{gridColumn:'span 2',position:'relative'}}>
                      <button style={{...S.btn,width:'100%'}} onClick={()=>setShareOpen(o=>!o)}>
                        ↗ Share
                      </button>
                      {shareOpen&&<div style={{position:'absolute',bottom:'calc(100% + 4px)',left:0,right:0,background:'var(--bg-raise)',border:'1px solid var(--line)',zIndex:10}}>
                        <button style={{...S.btn,width:'100%',borderWidth:0,borderBottom:'1px solid var(--line-soft)'}} onClick={()=>{shareTwitter();setShareOpen(false)}}>𝕏 Post on X / Twitter</button>
                        <button style={{...S.btn,width:'100%',borderWidth:0}} onClick={()=>{if(navigator.share&&spriteReady){wcRef.current?.toBlob(async b=>{if(!b)return;try{await navigator.share({title:`Normie #${currentId} Sprite`,text:`Full body sprite of Normie #${currentId}`,files:[new File([b],'sprite.png',{type:'image/png'})]})}catch{}})};setShareOpen(false)}}>↗ Share Image</button>
                      </div>}
                    </div>
                  </div>
                  :<div style={{fontSize:'.58rem',color:'var(--ink-muted)'}}>Generate a sprite to unlock downloads.</div>
                }
                {savedUrl&&<div style={{marginTop:'.5rem',fontSize:'.56rem',color:'var(--ink-muted)'}}>Saved! <a href="/gallery" style={{color:'var(--ink)',textDecoration:'underline'}}>View Gallery →</a></div>}

                {/* Sprite sheet preview */}
                {sheetReady&&<>
                  <hr style={{border:'none',borderTop:'1px solid var(--line-soft)',margin:'.9rem 0'}}/>
                  <span style={S.lbl}>Sprite Sheet Preview</span>
                  <div style={{background:'#e3e5e4',border:'1px solid var(--line)',padding:4,display:'inline-block',marginBottom:'.5rem'}}>
                    <canvas ref={el=>{if(el&&sheetRef.current){el.width=240;el.height=60;const cx=el.getContext('2d')!;cx.imageSmoothingEnabled=false;cx.drawImage(sheetRef.current,0,0,240,60)}}} width={240} height={60} style={{display:'block',imageRendering:'pixelated'}}/>
                  </div>
                  <div style={{display:'flex',gap:'.3rem',flexWrap:'wrap'}}>
                    {POSE_LABELS.map((l,i)=><span key={i} style={{fontSize:'.42rem',letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-muted)',width:60,textAlign:'center',display:'inline-block'}}>{l}</span>)}
                  </div>
                </>}
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer/>
    </div>
  )
}

export default function EnginePage(){
  return<Suspense><EngineInner/></Suspense>
}
