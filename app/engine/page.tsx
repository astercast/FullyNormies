'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Nav from '../components/Nav'
import Footer from '../components/Footer'
import { Suspense } from 'react'

// ─── Strict 2-color palette ───────────────────────────────────────
const PL: [number,number,number] = [0xe3,0xe5,0xe4]  // light
const PD: [number,number,number] = [0x48,0x49,0x4b]  // dark
const plStr = `rgb(${PL})`, pdStr = `rgb(${PD})`

// ─── PRNG ─────────────────────────────────────────────────────────
function mkrng(s:number){
  let n=s|0
  return()=>{n=(Math.imul(n,1664525)+1013904223)|0;return(n>>>0)/0x100000000}
}

// ─── Low-level canvas ops ─────────────────────────────────────────
function dk(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number){
  if(w<=0||h<=0)return;c.fillStyle=pdStr;c.fillRect(x|0,y|0,w|0,h|0)
}
function lt(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number){
  if(w<=0||h<=0)return;c.fillStyle=plStr;c.fillRect(x|0,y|0,w|0,h|0)
}
function px(c:CanvasRenderingContext2D,x:number,y:number,col:boolean){
  c.fillStyle=col?pdStr:plStr;c.fillRect(x|0,y|0,1,1)
}

// Bayer 4x4 ordered dithering for mid-tone depth
const B4=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]
function dith(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,d:number){
  for(let py=y;py<y+h;py++)for(let px2=x;px2<x+w;px2++){
    c.fillStyle=(d>B4[py&3][px2&3])?pdStr:plStr
    c.fillRect(px2|0,py|0,1,1)
  }
}

// ─── Types ────────────────────────────────────────────────────────
interface Trait{key:string;value:string}
type Pose='idle'|'walk'|'attack'|'crouch'
interface Arch{
  bodyType:string;slim:boolean;clothing:string;accType:string|null
}

function tv(traits:Trait[],...keys:string[]):string|null{
  for(const k of keys){
    const f=traits.find(t=>t.key.toLowerCase().includes(k.toLowerCase()))
    if(f&&f.value&&!['none','n/a',''].includes(f.value.toLowerCase()))return f.value
  }
  return null
}

function buildArch(traits:Trait[]):Arch{
  const t=(tv(traits,'type','species','kind')||'Human').toLowerCase()
  const g=(tv(traits,'gender','sex')||'').toLowerCase()
  const sh=(tv(traits,'shirt','top','jacket','clothing','outfit','wear','hoodie')||'').toLowerCase()
  const acc=(tv(traits,'accessory','accessories','item','hold','weapon','tool')||'').toLowerCase()

  let bodyType='human'
  if(t.includes('cat'))bodyType='cat'
  else if(t.includes('alien'))bodyType='alien'
  else if(t.includes('zombie'))bodyType='zombie'
  else if(t.includes('robot')||t.includes('android'))bodyType='robot'
  else if(t.includes('ape')||t.includes('monkey'))bodyType='ape'
  else if(t.includes('skeleton'))bodyType='skeleton'

  let clothing='tshirt'
  if(sh.includes('suit')||sh.includes('tux')||sh.includes('blazer'))clothing='suit'
  else if(sh.includes('hoodie')||sh.includes('hood'))clothing='hoodie'
  else if(sh.includes('jacket')||sh.includes('coat'))clothing='jacket'
  else if(sh.includes('stripe'))clothing='stripe'
  else if(sh.includes('tank')||sh.includes('muscle'))clothing='tank'

  let accType:string|null=null
  if(acc.match(/sword|blade|katana/))accType='sword'
  else if(acc.match(/gun|pistol/))accType='gun'
  else if(acc.match(/wand|staff/))accType='wand'
  else if(acc.match(/shield/))accType='shield'
  else if(acc.match(/bottle/))accType='bottle'
  else if(acc.match(/book|tome/))accType='book'

  return{
    bodyType,
    slim:g.includes('f')||g.includes('girl'),
    clothing,accType
  }
}

// ═══════════════════════════════════════════════════════════════════
//  THE SPRITE ENGINE
//  Canvas is 120×120. Face occupies y=2..41 (40px), x=40..79.
//  Body flows DOWN from y=42 in one continuous connected silhouette.
//
//  Key insight: everything shares the same body-center X (cx=60).
//  Every section connects flush to the one above it — no gaps.
// ═══════════════════════════════════════════════════════════════════

const CX = 60  // horizontal center

// ── Measure body width by type ────────────────────────────────────
function bodyMeasure(a:Arch):{bW:number,sW:number,nW:number}{
  if(a.bodyType==='ape')   return{bW:26,sW:34,nW:8}
  if(a.bodyType==='robot') return{bW:24,sW:30,nW:8}
  if(a.slim)               return{bW:18,sW:24,nW:6}
  return{bW:22,sW:28,nW:7}
}

// ── Draw the full connected body (no face — face pasted separately) ─
function drawSprite(
  c:CanvasRenderingContext2D,
  a:Arch,
  seed:number,
  pose:Pose
){
  const r=mkrng(seed^(pose.charCodeAt(0)*0x9e3))
  const {bW,sW,nW}=bodyMeasure(a)
  const bX=CX-(bW>>1)   // body left edge
  const sX=CX-(sW>>1)   // shoulder left edge

  // ─────────────────────────────────────────────
  //  LAYOUT (y positions, everything flush-connected)
  //  y=2..41   face (drawn separately via pasteFace)
  //  y=42..44  neck — connects face to shoulders
  //  y=45..47  shoulder bar — wider than body
  //  y=48..75  torso (28px)
  //  y=76..78  waist/belt (3px)
  //  y=79..106 legs (28px each leg section)
  //  y=107..114 feet/shoes (8px)
  //  y=115     ground shadow
  // ─────────────────────────────────────────────

  const NECK_Y   = 42, NECK_H   = 3
  const SHD_Y    = 45, SHD_H    = 3
  const TORSO_Y  = 48, TORSO_H  = 28
  const BELT_Y   = 76, BELT_H   = 3
  const LEG_Y    = 79
  const LEG_H    = 28  // total leg pixel height
  const FOOT_Y   = 107
  const FOOT_H   = 8
  const SHADOW_Y = 116

  // Pose-based offsets
  // Walk: arms swing, legs stride
  // Attack: right arm raises high
  // Crouch: legs compressed, body shifts down 4px
  const isCrouch=pose==='crouch'
  const isWalk  =pose==='walk'
  const isAttack=pose==='attack'

  const bodyShift = isCrouch ? 4 : 0

  // ── NECK ──────────────────────────────────────
  // Neck connects directly under face (y=42..44)
  const nX=CX-(nW>>1)
  dk(c,nX,NECK_Y,nW,NECK_H)
  // neck highlight
  lt(c,nX+1,NECK_Y,1,NECK_H-1)

  // ── SHOULDERS ─────────────────────────────────
  // Full-width dark bar, 1px overlap to seal neck→torso seam
  dk(c,sX,SHD_Y,sW,SHD_H)
  // Shoulder top highlight line
  lt(c,sX+2,SHD_Y,sW-4,1)

  // ── TORSO ─────────────────────────────────────
  const torsoY=TORSO_Y+bodyShift
  drawTorso(c,a,r,bX,torsoY,bW,TORSO_H-bodyShift)

  // ── BELT / WAISTBAND ──────────────────────────
  const beltY=BELT_Y+bodyShift
  dk(c,bX-1,beltY,bW+2,BELT_H)
  // Belt buckle
  lt(c,CX-2,beltY+1,4,1);dk(c,CX-1,beltY+1,2,1)

  // ── ARMS ──────────────────────────────────────
  drawArms(c,a,r,sX,SHD_Y,sW,TORSO_H,a.accType,pose)

  // ── LEGS ──────────────────────────────────────
  const legY=LEG_Y+bodyShift
  drawLegs(c,a,r,legY,LEG_H-bodyShift,FOOT_Y,FOOT_H,pose)

  // ── GROUND SHADOW ─────────────────────────────
  const shadowW=sW+4,shadowX=CX-(shadowW>>1)
  dk(c,shadowX,SHADOW_Y,shadowW,1)
  lt(c,shadowX,SHADOW_Y,2,1);lt(c,shadowX+shadowW-2,SHADOW_Y,2,1)

  // ── TYPE EXTRAS ───────────────────────────────
  drawTypeExtras(c,a,r,bX,bW,torsoY,TORSO_H,beltY,sX,SHD_Y,sW)
}

// ── TORSO CLOTHING ────────────────────────────────────────────────
function drawTorso(
  c:CanvasRenderingContext2D,a:Arch,r:()=>number,
  x:number,y:number,w:number,h:number
){
  const cx=x+(w>>1)
  if(a.clothing==='suit'){
    // Dark suit body
    dk(c,x,y,w,h)
    // Light shirt/tie centre strip
    const shW=Math.max(4,Math.floor(w*0.35)),shX=cx-(shW>>1)
    lt(c,shX,y,shW,h)
    // Left lapel
    dk(c,x+1,y,Math.floor(w*0.22),Math.floor(h*0.5))
    lt(c,x+2,y+1,Math.floor(w*0.14),Math.floor(h*0.38))
    // Right lapel
    dk(c,cx+(shW>>1),y,Math.floor(w*0.22),Math.floor(h*0.5))
    lt(c,cx+(shW>>1)+1,y+1,Math.floor(w*0.14),Math.floor(h*0.38))
    // Tie / buttons
    dk(c,cx-1,y+2,3,Math.floor(h*0.55))
    for(let i=0;i<3;i++)px(c,cx,y+5+i*6,true)
    // Pocket square
    dk(c,x+3,y+3,4,4);lt(c,x+4,y+4,2,2)
    // Suit dither shadow on sides
    dith(c,x,y,3,h,9);dith(c,x+w-3,y,3,h,9)
  }
  else if(a.clothing==='hoodie'||a.clothing==='jacket'){
    lt(c,x,y,w,h)
    dk(c,x,y,1,h);dk(c,x+w-1,y,1,h)  // side seams
    dk(c,x,y+h-1,w,1)                  // bottom hem
    // Centre zip / drawstring
    dk(c,cx,y,1,h)
    // Drawstrings (hoodie only)
    if(a.clothing==='hoodie'){
      dk(c,cx-3,y,2,Math.floor(h*0.35))
      dk(c,cx+2,y,2,Math.floor(h*0.35))
      // Kangaroo pocket
      const pkW=Math.floor(w*0.55),pkH=7
      const pkX=cx-(pkW>>1),pkY=y+h-pkH-1
      dk(c,pkX,pkY,pkW,1)
      dk(c,pkX,pkY,1,pkH);dk(c,pkX+pkW-1,pkY,1,pkH)
      dk(c,pkX,pkY+pkH-1,pkW,1)
    }
    // Cuff accents at bottom
    dk(c,x+1,y+h-4,4,3);dk(c,x+w-5,y+h-4,4,3)
    // Side shadow dither
    dith(c,x+1,y,3,h,7);dith(c,x+w-4,y,3,h,7)
  }
  else if(a.clothing==='stripe'){
    lt(c,x,y,w,h)
    dk(c,x,y,1,h);dk(c,x+w-1,y,1,h);dk(c,x,y+h-1,w,1)
    // Horizontal stripes
    for(let sy=y+2;sy<y+h-2;sy+=5)dk(c,x+1,sy,w-2,2)
    // V-neck
    for(let i=0;i<4;i++){px(c,cx-i,y+i,true);px(c,cx+i,y+i,true)}
  }
  else if(a.clothing==='tank'){
    lt(c,x,y,w,h)
    // Thick straps
    dk(c,x+2,y,4,5);dk(c,x+w-6,y,4,5)
    // Side cutouts
    lt(c,x,y+6,3,Math.floor(h*0.55));lt(c,x+w-3,y+6,3,Math.floor(h*0.55))
    // Centre seam
    dk(c,cx,y+6,1,h-7)
    // Skin dither on sides
    dith(c,x,y+6,3,Math.floor(h*0.55),8)
    dith(c,x+w-3,y+6,3,Math.floor(h*0.55),8)
    dk(c,x,y,1,h);dk(c,x+w-1,y,1,h);dk(c,x,y+h-1,w,1)
  }
  else{
    // T-shirt default
    lt(c,x,y,w,h)
    dk(c,x,y,1,h);dk(c,x+w-1,y,1,h);dk(c,x,y+h-1,w,1)
    // Crew neck cutout at top
    const nw=Math.floor(w*0.42),nx=cx-(nw>>1)
    lt(c,nx,y,nw,2)  // neck opening backed by light
    dk(c,nx,y+2,nw,1);dk(c,nx-1,y+3,2,2);dk(c,nx+nw-1,y+3,2,2)
    // Chest seam
    dk(c,x+2,y+Math.floor(h*0.35),w-4,1)
    // Side shadow
    dith(c,x+1,y+3,2,h-4,8);dith(c,x+w-3,y+3,2,h-4,8)
  }
}

// ── ARM DRAWING ───────────────────────────────────────────────────
function drawArms(
  c:CanvasRenderingContext2D,a:Arch,r:()=>number,
  sX:number,sY:number,sW:number,
  torsoH:number,accType:string|null,pose:Pose
){
  const armW=a.bodyType==='ape'?9:a.slim?6:7
  const uH=Math.floor(torsoH*0.52)  // upper arm
  const fH=Math.floor(torsoH*0.45)  // forearm
  const hH=8,hW=armW+2             // hand box

  // Base positions
  const lUX=sX, rUX=sX+sW-armW
  const armTop=sY+3  // arms start at shoulder level

  // Pose-dependent offsets
  let lSwingX=0,rSwingX=0,rRaiseY=0,lFwdX=0,rFwdX=0

  if(pose==='walk'){
    lSwingX=-3;rSwingX=3
  }
  if(pose==='attack'){
    rRaiseY=-10  // right arm raised up for weapon
    lSwingX=-2
  }
  if(pose==='crouch'){
    lSwingX=2;rSwingX=2
  }

  // LEFT ARM
  const lElbY=armTop+uH
  const lFX=lUX-2+lSwingX
  const lHY=lElbY+fH
  dk(c,lUX,armTop,armW,uH)
  dith(c,lUX,armTop,2,uH,8)              // inner shadow
  lt(c,lUX+1,lElbY-1,armW-2,1)           // elbow crease
  dk(c,lFX,lElbY,armW-1,fH)
  lt(c,lFX+1,lHY-2,armW-3,1)             // wrist crease
  // Hand
  dk(c,lFX-1,lHY,hW,hH)
  lt(c,lFX,lHY+1,hW-2,hH-2)

  // RIGHT ARM (with raise for attack)
  const rElbY=armTop+uH+rRaiseY
  const rFX=rUX+2+rSwingX
  const rHY=rElbY+fH
  dk(c,rUX,armTop,armW,uH+Math.abs(rRaiseY>>1))
  dith(c,rUX+armW-2,armTop,2,uH,8)       // inner shadow
  lt(c,rUX+1,rElbY-1,armW-2,1)           // elbow crease
  dk(c,rFX,rElbY,armW-1,fH)
  lt(c,rFX+1,rHY-2,armW-3,1)             // wrist crease
  // Hand
  dk(c,rFX,rHY,hW,hH)
  lt(c,rFX+1,rHY+1,hW-2,hH-2)

  // Accessory in right hand
  if(accType)drawAcc(c,accType,rFX+hW+1,rHY,pose==='attack')
}

// ── ACCESSORY ─────────────────────────────────────────────────────
function drawAcc(c:CanvasRenderingContext2D,type:string,x:number,y:number,raised:boolean){
  const oy=raised?-12:0
  switch(type){
    case'sword':
      dk(c,x+1,y+oy,4,5);lt(c,x+2,y+oy+1,2,3)
      dk(c,x-1,y+oy+5,8,2)
      dk(c,x+2,y+oy+7,2,18);lt(c,x+3,y+oy+8,1,16)
      break
    case'gun':
      dk(c,x,y+oy,5,8);lt(c,x+1,y+oy+1,3,6)
      dk(c,x+3,y+oy+2,11,4);lt(c,x+4,y+oy+3,9,2)
      dk(c,x+2,y+oy+7,4,3)
      break
    case'wand':
      dk(c,x+2,y+oy+6,3,22);lt(c,x+3,y+oy+7,1,20)
      dk(c,x,y+oy,7,7);lt(c,x+2,y+oy+2,3,3);lt(c,x+3,y+oy+3,1,1)
      break
    case'shield':
      dk(c,x+1,y+oy,8,1);dk(c,x,y+oy+1,10,9)
      dk(c,x+1,y+oy+10,8,1);dk(c,x+2,y+oy+11,6,2)
      lt(c,x+1,y+oy+2,8,7)
      dk(c,x+4,y+oy+3,2,5);dk(c,x+2,y+oy+5,6,2)
      break
    case'bottle':
      dk(c,x+2,y+oy,3,2)
      dk(c,x,y+oy+2,7,1);lt(c,x,y+oy+3,7,10);dk(c,x,y+oy+13,7,1)
      dk(c,x,y+oy+3,1,10);dk(c,x+6,y+oy+3,1,10)
      lt(c,x+2,y+oy+5,3,6)
      break
    case'book':
      dk(c,x,y+oy,9,13)
      lt(c,x+1,y+oy+1,7,11)
      dk(c,x+1,y+oy+4,1,5);dk(c,x+2,y+oy+3,6,1);dk(c,x+2,y+oy+9,6,1)
      break
  }
}

// ── LEG DRAWING ───────────────────────────────────────────────────
function drawLegs(
  c:CanvasRenderingContext2D,a:Arch,r:()=>number,
  legY:number,legH:number,footY:number,footH:number,pose:Pose
){
  const lW=a.bodyType==='ape'?13:a.slim?10:12
  const gap=2,halfG=gap>>1
  const lLX=CX-halfG-lW, rLX=CX+halfG

  // Leg sections: thigh, knee bump, calf
  const isCrouch=pose==='crouch'
  const isWalk=pose==='walk'

  const thighH=isCrouch?Math.floor(legH*0.35):Math.floor(legH*0.46)
  const kneeH=4
  const calfH=legH-thighH-kneeH

  // Walk stride: opposite legs swing
  const lFwd=isWalk?-4:0
  const rFwd=isWalk? 4:0

  // ── LEFT LEG ──
  const lLX2=lLX+lFwd
  // thigh
  dk(c,lLX2,legY,lW,thighH)
  lt(c,lLX2+lW-1,legY+2,1,thighH-4)         // outer highlight
  dith(c,lLX2,legY,2,thighH,7)               // inner shadow
  // knee
  dk(c,lLX2-1,legY+thighH,lW+2,kneeH)
  lt(c,lLX2+1,legY+thighH+1,lW-2,1)         // knee shine
  // calf
  const lCalfY=legY+thighH+kneeH
  dk(c,lLX2,lCalfY,lW,calfH)
  dith(c,lLX2,lCalfY,2,calfH,7)
  lt(c,lLX2+2,lCalfY+2,2,calfH-5)           // shin highlight
  // ankle taper
  dk(c,lLX2+1,lCalfY+calfH,lW-2,2)
  // shoe
  drawShoe(c,a,lLX2,footY,lW,footH,true)

  // ── RIGHT LEG ──
  const rLX2=rLX+rFwd
  // thigh
  dk(c,rLX2,legY,lW,thighH)
  lt(c,rLX2,legY+2,1,thighH-4)
  dith(c,rLX2+lW-2,legY,2,thighH,7)
  // knee
  dk(c,rLX2-1,legY+thighH,lW+2,kneeH)
  lt(c,rLX2+1,legY+thighH+1,lW-2,1)
  // calf
  const rCalfY=legY+thighH+kneeH
  dk(c,rLX2,rCalfY,lW,calfH)
  dith(c,rLX2+lW-2,rCalfY,2,calfH,7)
  lt(c,rLX2+2,rCalfY+2,2,calfH-5)
  // ankle
  dk(c,rLX2+1,rCalfY+calfH,lW-2,2)
  // shoe
  drawShoe(c,a,rLX2,footY,lW,footH,false)
}

function drawShoe(
  c:CanvasRenderingContext2D,a:Arch,
  lx:number,fy:number,lW:number,fH:number,isLeft:boolean
){
  if(a.bodyType==='skeleton'){
    // Thin bony foot
    dk(c,lx,fy,lW,2)
    dk(c,isLeft?lx:lx+lW-3,fy+2,3,fH-1)
    return
  }
  if(a.bodyType==='ape'){
    // Wide bare foot with toe bumps
    dk(c,lx-1,fy,lW+2,fH-2)
    dith(c,lx-1,fy,lW+2,fH-2,9)
    for(let t=0;t<4;t++)dk(c,lx+t*3,fy+fH-3,2,3)
    return
  }

  const shW=lW+6
  const sx=isLeft?lx-4:lx-1

  if(a.bodyType==='zombie'||a.bodyType==='robot'){
    // Chunky boot
    dk(c,sx,fy,shW,fH)
    lt(c,sx+2,fy+1,shW-4,2)
    dith(c,sx,fy+3,shW,fH-4,8)
    dk(c,sx+1,fy+fH-1,shW-2,1)
  } else {
    // Sneaker
    dk(c,sx+1,fy,shW-1,1)
    dk(c,sx,fy+1,shW,fH-2)
    dk(c,sx+1,fy+fH-1,shW-1,1)
    lt(c,sx+2,fy+1,shW-4,2)                         // tongue highlight
    lt(c,isLeft?sx+1:sx+shW-3,fy+3,2,fH-5)          // side panel
    dk(c,sx+1,fy+fH-2,shW-2,1)                      // sole line
  }
}

// ── TYPE EXTRAS ───────────────────────────────────────────────────
function drawTypeExtras(
  c:CanvasRenderingContext2D,a:Arch,r:()=>number,
  bX:number,bW:number,torsoY:number,torsoH:number,
  beltY:number,sX:number,sY:number,sW:number
){
  if(a.bodyType==='cat'){
    // Curling tail from hip
    const tx=bX+bW+2,ty=beltY+2
    for(let i=0;i<8;i++){c.fillStyle=pdStr;c.fillRect(tx+i,ty-i,2,2)}
    dk(c,tx+8,ty-10,3,5);lt(c,tx+9,ty-9,1,3)
  }
  if(a.bodyType==='alien'){
    // Extra secondary arms
    const ay=sY+4,ah=Math.floor(torsoH*0.7)
    for(let i=0;i<ah;i+=2){
      dk(c,sX-4-(i>>2),ay+i,3,2)
      dk(c,sX+sW+1+(i>>2),ay+i,3,2)
    }
    // Alien hands
    dk(c,sX-8,ay+ah,5,4);dk(c,sX+sW+3,ay+ah,5,4)
  }
  if(a.bodyType==='robot'){
    // Chest panel
    const pX=bX+4,pY=torsoY+8,pW=bW-8,pH=10
    dk(c,pX,pY,pW,pH);lt(c,pX+1,pY+1,pW-2,pH-2)
    for(let row=0;row<3;row++)dk(c,pX+2,pY+2+row*3,pW-4,1)
    // Status lights
    dk(c,bX+2,torsoY+2,4,4);lt(c,bX+3,torsoY+3,2,2)
    dk(c,bX+8,torsoY+2,4,4);lt(c,bX+9,torsoY+3,2,2)
  }
  if(a.bodyType==='skeleton'){
    // Ribcage over torso
    lt(c,bX+1,torsoY+1,bW-2,torsoH-2)
    dk(c,bX,torsoY,bW,1);dk(c,bX,torsoY+torsoH-1,bW,1)
    dk(c,bX,torsoY,1,torsoH);dk(c,bX+bW-1,torsoY,1,torsoH)
    const sp=CX;for(let y=torsoY+2;y<torsoY+torsoH-1;y+=2)dk(c,sp,y,1,1)
    const rh=Math.floor((torsoH-4)/4)
    for(let i=0;i<4;i++){
      const ry=torsoY+2+i*rh
      dk(c,bX+2,ry,sp-bX-2,1);dk(c,bX+1,ry+1,sp-bX-1,1)
      dk(c,sp+1,ry,bX+bW-sp-3,1);dk(c,sp+1,ry+1,bX+bW-sp-2,1)
    }
  }
  if(a.bodyType==='zombie'){
    // Ragged torn shirt look
    lt(c,bX+1,torsoY+1,bW-2,torsoH-2)
    dk(c,bX,torsoY,bW,1);dk(c,bX,torsoY,1,torsoH);dk(c,bX+bW-1,torsoY,1,torsoH)
    // Tears/gashes
    dk(c,bX+3,torsoY+5,2,5);dk(c,bX+4,torsoY+6,2,5)
    dk(c,bX+bW-5,torsoY+8,2,5);dk(c,bX+bW-4,torsoY+9,2,5)
    // Ragged hem drips
    for(let i=bX+1;i<bX+bW-1;i+=2){
      const drop=(r()*4)|0
      dk(c,i,torsoY+torsoH-drop,1,drop)
    }
  }
  if(a.bodyType==='ape'){
    // Fur texture over torso
    lt(c,bX+1,torsoY+1,bW-2,torsoH-2)
    dk(c,bX,torsoY,bW,1);dk(c,bX,torsoY,1,torsoH);dk(c,bX+bW-1,torsoY,1,torsoH)
    // Fur dots
    for(let fy=torsoY+3;fy<torsoY+torsoH-2;fy+=3)
      for(let fx=bX+2;fx<bX+bW-2;fx+=3)dk(c,fx,fy,2,1)
    // Lighter chest patch
    const pW=Math.floor(bW*0.45)
    dk(c,CX-(pW>>1),torsoY+2,pW,Math.floor(torsoH*0.55))
    lt(c,CX-(pW>>1)+1,torsoY+3,pW-2,Math.floor(torsoH*0.55)-2)
  }
}

// ── FACE PIPELINE ─────────────────────────────────────────────────
function sampleFace(img:HTMLImageElement):number[][]{
  const oc=document.createElement('canvas');oc.width=oc.height=40
  const cx=oc.getContext('2d')!;cx.imageSmoothingEnabled=false
  cx.drawImage(img,0,0,40,40)
  const raw=cx.getImageData(0,0,40,40).data,g:number[][]=[]
  for(let y=0;y<40;y++){
    g[y]=[]
    for(let x=0;x<40;x++){
      const i=(y*40+x)*4
      if(raw[i+3]<40){g[y][x]=2;continue} // transparent → use palette bg
      g[y][x]=(0.2126*raw[i]+0.7152*raw[i+1]+0.0722*raw[i+2])<128?1:0
    }
  }
  return g
}

// Face is always pasted at x=40,y=2 (40×40px)
function pasteFace(c:CanvasRenderingContext2D,g:number[][]){
  for(let y=0;y<40;y++)for(let x=0;x<40;x++){
    if(g[y][x]===2)lt(c,40+x,2+y,1,1)
    else if(g[y][x]===1)dk(c,40+x,2+y,1,1)
    else lt(c,40+x,2+y,1,1)
  }
}

// Snap every pixel to strict 2-color palette
function snapPal(c:CanvasRenderingContext2D,ca:number){
  const id=c.getImageData(0,0,120,120),p=id.data
  const thr=127+ca*15
  for(let i=0;i<p.length;i+=4){
    if(p[i+3]<10){p[i]=PL[0];p[i+1]=PL[1];p[i+2]=PL[2];p[i+3]=255;continue}
    const lm=0.2126*p[i]+0.7152*p[i+1]+0.0722*p[i+2]
    const col=lm>thr?PL:PD
    p[i]=col[0];p[i+1]=col[1];p[i+2]=col[2];p[i+3]=255
  }
  c.putImageData(id,0,0)
}

// Clean stray isolated light pixels adjacent to 3+ dark pixels
function cleanOutline(c:CanvasRenderingContext2D){
  const id=c.getImageData(0,0,120,120)
  const src=new Uint8ClampedArray(id.data),dst=id.data
  const isDk=(x:number,y:number)=>(x<0||x>=120||y<0||y>=120)?true:src[(y*120+x)*4]<100
  for(let y=1;y<119;y++)for(let x=1;x<119;x++){
    const i=(y*120+x)*4
    if(src[i]>180){
      let n=0
      if(isDk(x-1,y))n++;if(isDk(x+1,y))n++
      if(isDk(x,y-1))n++;if(isDk(x,y+1))n++
      if(n>=3){dst[i]=PD[0];dst[i+1]=PD[1];dst[i+2]=PD[2];dst[i+3]=255}
    }
  }
  c.putImageData(id,0,0)
}

// ─── SPRITE SHEET (4 poses × 120px = 480×120) ────────────────────
const POSES:Pose[]=['idle','walk','attack','crouch']
const POSE_LABELS=['Idle','Walk','Attack','Crouch']

async function buildSheet(
  faceImg:HTMLImageElement,traits:Trait[],seed:number,contrast:number,
  sheet:HTMLCanvasElement,wait:(ms:number)=>Promise<void>
){
  const arch=buildArch(traits)
  sheet.width=480;sheet.height=120
  const sc=sheet.getContext('2d')!;sc.imageSmoothingEnabled=false
  sc.fillStyle=plStr;sc.fillRect(0,0,480,120)
  const face=sampleFace(faceImg)
  for(let i=0;i<4;i++){
    const tmp=document.createElement('canvas');tmp.width=tmp.height=120
    const tc=tmp.getContext('2d')!;tc.imageSmoothingEnabled=false
    tc.fillStyle=plStr;tc.fillRect(0,0,120,120)
    drawSprite(tc,arch,seed^(i*0x1f3),POSES[i])
    pasteFace(tc,face)
    snapPal(tc,contrast)
    cleanOutline(tc)
    sc.drawImage(tmp,i*120,0)
    await wait(6)
  }
}

// ─── UI Styles ────────────────────────────────────────────────────
const S={
  btn:{background:'transparent',border:'1px solid var(--line)',color:'var(--ink)',fontFamily:'inherit',fontSize:'.56rem',fontWeight:700,letterSpacing:'.11em',textTransform:'uppercase' as const,padding:'.42rem .82rem',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:'.3rem',userSelect:'none' as const,WebkitTapHighlightColor:'transparent'},
  btnFill:{background:'var(--ink)',color:'var(--bg)',borderColor:'var(--ink)'},
  frame:{width:'100%',maxWidth:200,aspectRatio:'1' as const,background:'#e3e5e4',border:'1px solid var(--line)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:'1.1rem',overflow:'hidden'},
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
  const displayRef=useRef<HTMLCanvasElement|null>(null)

  const wait=(ms:number):Promise<void>=>new Promise(r=>setTimeout(r,ms))
  const prog=useCallback((show:boolean,lbl:string,pct:number)=>{
    setShowProg(show);setProgLabel(lbl);setProgPct(pct)
  },[])

  useEffect(()=>{
    const id=searchParams.get('id')
    if(id){setTokenInput(id);setTimeout(()=>loadById(parseInt(id)),300)}
  },[])

  async function rf(url:string,n=3):Promise<Response>{
    for(let i=0;i<n;i++){
      const r=await fetch(url,{cache:'no-store'})
      if(r.status!==429)return r
      if(i<n-1)await wait(900*(i+1))
    }
    return fetch(url,{cache:'no-store'})
  }

  async function loadById(id:number){
    setErr('');setLoading(true);setSpriteReady(false);setSheetReady(false)
    setTraits([]);setNormName('');setFaceUrl(null);setSavedUrl(null);setCurrentId(id)
    router.replace(`/engine?id=${id}`,{scroll:false})
    try{
      const mRes=await rf(`https://api.normies.art/normie/${id}/metadata`)
      if(!mRes.ok)throw new Error(mRes.status===404?`Normie #${id} not found`:`Error ${mRes.status}`)
      const mData=await mRes.json()
      const parsed:Trait[]=[]
      if(Array.isArray(mData.attributes))
        mData.attributes.forEach((a:any)=>{if(a.trait_type&&a.value)parsed.push({key:String(a.trait_type),value:String(a.value)})})
      setTraits(parsed);setNormName(mData.name||`Normie #${id}`)
      const iRes=await rf(`https://api.normies.art/normie/${id}/image.png`)
      if(!iRes.ok)throw new Error(`Image error ${iRes.status}`)
      const blob=await iRes.blob()
      const url=URL.createObjectURL(blob);setFaceUrl(url)
      const img=await new Promise<HTMLImageElement>((res,rej)=>{
        const i=new Image();i.crossOrigin='anonymous'
        i.onload=()=>res(i);i.onerror=rej;i.src=url
      })
      setFaceImg(img)
    }catch(e:any){setErr(e.message||'Failed to load')}
    finally{setLoading(false)}
  }

  async function generate(newSeed=false,pose=activePose){
    if(!faceImg)return
    const s=newSeed||!seed?((Math.random()*0xFFFFFF)|0):seed
    if(newSeed||!seed)setSeed(s)
    const wc=wcRef.current;if(!wc)return
    const ctx=wc.getContext('2d')!;ctx.imageSmoothingEnabled=false

    prog(true,'Building body…',15);await wait(12)
    ctx.fillStyle=plStr;ctx.fillRect(0,0,120,120)
    const arch=buildArch(traits)
    drawSprite(ctx,arch,s,pose)

    prog(true,'Compositing face…',45);await wait(12)
    pasteFace(ctx,sampleFace(faceImg))

    prog(true,'Enforcing palette…',72);await wait(10)
    snapPal(ctx,contrast)
    cleanOutline(ctx)

    prog(true,'Building sprite sheet…',85);await wait(8)
    const sheet=sheetRef.current
    if(sheet)await buildSheet(faceImg,traits,s,contrast,sheet,wait)

    prog(false,'',100);await wait(6)

    const dc=document.createElement('canvas');dc.width=dc.height=120
    dc.getContext('2d')!.drawImage(wc,0,0)
    displayRef.current=dc
    setSpriteReady(true);setSheetReady(true)
  }

  async function switchPose(p:Pose){
    setActivePose(p)
    if(!faceImg||!seed)return
    const wc=wcRef.current;if(!wc)return
    const ctx=wc.getContext('2d')!;ctx.imageSmoothingEnabled=false
    ctx.fillStyle=plStr;ctx.fillRect(0,0,120,120)
    const arch=buildArch(traits)
    drawSprite(ctx,arch,seed,p)
    pasteFace(ctx,sampleFace(faceImg))
    snapPal(ctx,contrast)
    cleanOutline(ctx)
    const dc=document.createElement('canvas');dc.width=dc.height=120
    dc.getContext('2d')!.drawImage(wc,0,0)
    displayRef.current=dc
    setSpriteReady(true)
    // trigger re-render
    setSpriteReady(false);await wait(10);setSpriteReady(true)
  }

  function dlSprite(size:number,transparent:boolean,sheet=false){
    if(!spriteReady)return
    const src=sheet?sheetRef.current:wcRef.current;if(!src)return
    const W=sheet?480:size,H=size
    const out=document.createElement('canvas');out.width=W;out.height=H
    const cx=out.getContext('2d')!;cx.imageSmoothingEnabled=false
    if(!transparent){cx.fillStyle=plStr;cx.fillRect(0,0,W,H)}
    cx.drawImage(src,0,0,W,H)
    const suffix=sheet?`-sheet-${size}`:`-${activePose}-${size}${transparent?'-transparent':''}`
    const name=`normie-${currentId}${suffix}.png`
    out.toBlob(b=>{
      const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(b!),download:name})
      a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3e3)
    },'image/png')
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
    }catch(e){console.error(e)}
    finally{setUploading(false)}
  }

  const grid2:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.3rem',marginBottom:'.45rem'}

  return(
    <div style={{display:'flex',flexDirection:'column',minHeight:'100vh'}}>
      <Nav/>
      <canvas ref={wcRef} width={120} height={120} style={{display:'none'}}/>
      <canvas ref={sheetRef} width={480} height={120} style={{display:'none'}}/>

      <main style={{flex:1}}>
        {/* Input bar */}
        <div style={{borderBottom:'1px solid var(--line)',padding:'1.3rem 0'}}>
          <div style={{maxWidth:1080,margin:'0 auto',padding:'0 1.25rem'}}>
            <div style={{display:'flex',alignItems:'flex-end',gap:'.5rem',flexWrap:'wrap'}}>
              <div>
                <span style={S.lbl}>Token ID — 0 to 9999</span>
                <input type="number" min={0} max={9999} placeholder="1337"
                  value={tokenInput} onChange={e=>setTokenInput(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&tokenInput&&loadById(parseInt(tokenInput))}
                  inputMode="numeric"
                  style={{background:'transparent',border:'1px solid var(--line)',color:'var(--ink)',fontFamily:'inherit',fontSize:'1.75rem',fontWeight:900,letterSpacing:'-.04em',width:'7.2rem',padding:'.25rem .55rem',outline:'none',appearance:'textfield' as const}}
                />
              </div>
              <button style={{...S.btn,...S.btnFill}} disabled={loading} onClick={()=>tokenInput&&loadById(parseInt(tokenInput))}>
                {loading?'Loading…':'Load'}
              </button>
              <button style={S.btn} onClick={()=>{const id=Math.floor(Math.random()*10000);setTokenInput(String(id));loadById(id)}}>
                Random
              </button>
            </div>
            {err&&<div style={{marginTop:'.7rem',padding:'.45rem .65rem',border:'1px solid var(--line)',fontSize:'.62rem',color:'var(--ink)'}}>⚠ {err}</div>}
          </div>
        </div>

        {/* Two-column grid */}
        <div style={{maxWidth:1080,margin:'0 auto',padding:'0 1.25rem'}}>
          <style>{`
            @media(min-width:700px){
              .fn-eng-grid{grid-template-columns:1fr 1fr !important}
              .fn-eng-right{border-left:1px solid var(--line) !important;border-top:none !important;padding-left:1.6rem !important}
            }
          `}</style>
          <div className="fn-eng-grid" style={{display:'grid',gridTemplateColumns:'1fr',borderBottom:'1px solid var(--line)'}}>

            {/* LEFT: original normie */}
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

            {/* RIGHT: sprite engine */}
            <div className="fn-eng-right" style={{padding:'1.4rem 0',borderTop:'1px solid var(--line)'}}>
              <div style={{fontSize:'.5rem',letterSpacing:'.18em',textTransform:'uppercase',color:'var(--ink-muted)',marginBottom:'1.1rem',display:'flex',alignItems:'center',gap:'.4rem'}}>
                02 — Full Body Sprite Engine
                <span style={{flex:1,height:1,background:'var(--line-soft)',display:'block',opacity:.5}}/>
              </div>

              {/* Sprite preview */}
              <div style={{...S.frame,maxWidth:200}}>
                {spriteReady&&displayRef.current
                  ?<canvas
                      key={activePose}
                      ref={el=>{if(el&&displayRef.current){el.width=el.height=120;el.getContext('2d')!.drawImage(displayRef.current,0,0)}}}
                      width={120} height={120}
                      style={{width:'100%',height:'100%',imageRendering:'pixelated',display:'block'}}
                    />
                  :<div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'.28rem',color:'#48494b',textAlign:'center'}}>
                    <div style={{fontSize:'1.3rem',opacity:.1}}>▦</div>
                    <div style={{fontSize:'.5rem',letterSpacing:'.1em',textTransform:'uppercase'}}>120×120 Sprite</div>
                    <div style={{fontSize:'.46rem',opacity:.55}}>load a normie to generate</div>
                  </div>
                }
              </div>

              {/* Pose selector */}
              {spriteReady&&<>
                <span style={S.lbl}>Pose</span>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'.3rem',marginBottom:'.7rem'}}>
                  {POSES.map((p,i)=>(
                    <button key={p} style={{...S.btn,...(activePose===p?S.btnFill:{})}} onClick={()=>switchPose(p)}>
                      {POSE_LABELS[i]}
                    </button>
                  ))}
                </div>
              </>}

              {/* Progress bar */}
              {showProg&&<div style={{marginBottom:'.7rem'}}>
                <div style={{fontSize:'.5rem',letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-muted)',marginBottom:'.28rem'}}>{progLabel}</div>
                <div style={{height:2,background:'var(--line-soft)'}}><div style={{height:2,background:'var(--ink)',width:`${progPct}%`,transition:'width .28s ease'}}/></div>
              </div>}

              <button style={{...S.btn,...S.btnFill,width:'100%',marginBottom:'.45rem'}} disabled={!faceImg} onClick={()=>generate(false)}>
                ▶ Generate Full Body Sprite
              </button>

              {spriteReady&&<div style={grid2}>
                <button style={S.btn} onClick={()=>generate(false)}>↺ Regenerate</button>
                <button style={S.btn} onClick={()=>generate(true)}>⚂ New Seed</button>
                <button style={S.btn} onClick={()=>{setContrast(c=>Math.min(3,c+1));generate(false)}}>+ Contrast</button>
                <button style={S.btn} onClick={()=>{setContrast(c=>Math.max(-3,c-1));generate(false)}}>− Contrast</button>
              </div>}

              <hr style={{border:'none',borderTop:'1px solid var(--line-soft)',margin:'.9rem 0'}}/>
              <span style={S.lbl}>Download</span>
              {spriteReady
                ?<div style={{...grid2,marginTop:'.4rem'}}>
                  <button style={S.btn} onClick={()=>dlSprite(120,false)}>↓ 120px PNG</button>
                  <button style={S.btn} onClick={()=>dlSprite(120,true)}>↓ 120px Transparent</button>
                  <button style={S.btn} onClick={()=>dlSprite(480,false)}>↓ 480px PNG</button>
                  <button style={S.btn} onClick={()=>dlSprite(960,false)}>↓ 960px PNG</button>
                  <button style={{...S.btn,gridColumn:'span 2'}} onClick={()=>dlSprite(120,false,true)}>↓ Sprite Sheet (4 poses)</button>
                  <button style={{...S.btn,gridColumn:'span 2',...(savedUrl?{opacity:.5}:{})}} onClick={saveToGallery} disabled={uploading||!!savedUrl}>
                    {uploading?'Saving…':savedUrl?'✓ Saved to Gallery':'↑ Save to Gallery'}
                  </button>
                  {/* Share */}
                  <div style={{gridColumn:'span 2',position:'relative'}}>
                    <button style={{...S.btn,width:'100%'}} onClick={()=>setShareOpen(o=>!o)}>↗ Share</button>
                    {shareOpen&&(
                      <div style={{position:'absolute',bottom:'calc(100% + 4px)',left:0,right:0,background:'var(--bg-raise)',border:'1px solid var(--line)',zIndex:10}}>
                        <button style={{...S.btn,width:'100%',borderWidth:0,borderBottom:'1px solid var(--line-soft)'}}
                          onClick={()=>{
                            const text=encodeURIComponent(`Just generated Normie #${currentId} as a full-body pixel art sprite! 🎮\nhttps://fully-normies.vercel.app/engine?id=${currentId}`)
                            window.open(`https://x.com/intent/tweet?text=${text}`,'_blank')
                            setShareOpen(false)
                          }}>𝕏 Post on X / Twitter</button>
                        <button style={{...S.btn,width:'100%',borderWidth:0}} onClick={async()=>{
                          if(navigator.share&&wcRef.current){
                            wcRef.current.toBlob(async b=>{
                              if(!b)return
                              try{await navigator.share({title:`Normie #${currentId} Sprite`,files:[new File([b],'sprite.png',{type:'image/png'})]})}catch{}
                            })
                          }
                          setShareOpen(false)
                        }}>↗ Share Image</button>
                      </div>
                    )}
                  </div>
                </div>
                :<div style={{fontSize:'.58rem',color:'var(--ink-muted)'}}>Generate a sprite to unlock downloads.</div>
              }
              {savedUrl&&<div style={{marginTop:'.5rem',fontSize:'.56rem',color:'var(--ink-muted)'}}>
                Saved! <a href="/gallery" style={{color:'var(--ink)',textDecoration:'underline'}}>View Gallery →</a>
              </div>}

              {/* Sheet preview */}
              {sheetReady&&<>
                <hr style={{border:'none',borderTop:'1px solid var(--line-soft)',margin:'.9rem 0'}}/>
                <span style={S.lbl}>Sprite Sheet Preview</span>
                <div style={{background:'#e3e5e4',border:'1px solid var(--line)',padding:4,display:'inline-block',marginBottom:'.5rem'}}>
                  <canvas
                    ref={el=>{if(el&&sheetRef.current){el.width=240;el.height=60;const cx=el.getContext('2d')!;cx.imageSmoothingEnabled=false;cx.drawImage(sheetRef.current,0,0,240,60)}}}
                    width={240} height={60}
                    style={{display:'block',imageRendering:'pixelated'}}
                  />
                </div>
                <div style={{display:'flex',gap:0}}>
                  {POSE_LABELS.map((l,i)=>(
                    <span key={i} style={{fontSize:'.42rem',letterSpacing:'.08em',textTransform:'uppercase',color:'var(--ink-muted)',width:60,textAlign:'center',display:'inline-block'}}>{l}</span>
                  ))}
                </div>
              </>}
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
