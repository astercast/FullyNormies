'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Nav from '../components/Nav'
import Footer from '../components/Footer'
import { Suspense } from 'react'

// ═══════════════════════════════════════════════════════════════════
//  FULLNORMIES SPRITE ENGINE v4
//
//  Design philosophy:
//  • Match the Normies aesthetic exactly: flat, minimal, CryptoPunk-style
//  • Face is 40×40, body extends below — same pixel art grammar
//  • NO dithering (Normies don't use it), NO gradients, NO rounded shapes
//  • Very clean line art — single-pixel outlines, flat fills
//  • Body proportions: ~18-22px wide (face uses ~20-36px of 40px grid)
//  • Canvas: 120×120. Face at x=40..79, y=2..41 (centered)
//  • Body below face starting at y=42
// ═══════════════════════════════════════════════════════════════════

const PL: [number,number,number] = [0xe3,0xe5,0xe4]  // #e3e5e4 light
const PD: [number,number,number] = [0x48,0x49,0x4b]  // #48494b dark
const plStr = `rgb(${PL})`, pdStr = `rgb(${PD})`

// ─── PRNG ─────────────────────────────────────────────────────────
function mkrng(s:number){
  let n=s|0
  return():number=>{n=(Math.imul(n,1664525)+1013904223)|0;return(n>>>0)/0x100000000}
}

// ─── Pixel primitives ────────────────────────────────────────────
// All coordinates are in the 120×120 canvas space
function dk(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number){
  if(w<=0||h<=0)return; c.fillStyle=pdStr; c.fillRect(x|0,y|0,w|0,h|0)
}
function lt(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number){
  if(w<=0||h<=0)return; c.fillStyle=plStr; c.fillRect(x|0,y|0,w|0,h|0)
}
function row(c:CanvasRenderingContext2D,x:number,y:number,w:number,dark:boolean){
  if(dark)dk(c,x,y,w,1); else lt(c,x,y,w,1)
}

// Draw a filled rect with dark outline — the core primitive
function box(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,fillDark=false){
  if(w<=0||h<=0)return
  if(fillDark){ dk(c,x,y,w,h) }
  else {
    dk(c,x,y,w,1);dk(c,x,y+h-1,w,1)
    dk(c,x,y,1,h);dk(c,x+w-1,y,1,h)
    lt(c,x+1,y+1,w-2,h-2)
  }
}

// ─── Trait types ─────────────────────────────────────────────────
interface Trait{key:string;value:string}
type Pose='idle'|'walk'|'attack'|'crouch'

interface Arch {
  type: string      // human | cat | alien | agent
  gender: string    // male | female | nonbinary
  clothing: string  // suit | hoodie | jacket | stripe | tank | tshirt
  accessory: string // top_hat | bow_tie | cap | fedora | chain | etc
  hasAcc: boolean
}

function tv(traits:Trait[],...keys:string[]):string {
  for(const k of keys){
    const f=traits.find(t=>t.key.toLowerCase()===k.toLowerCase()
      ||t.key.toLowerCase().includes(k.toLowerCase()))
    if(f&&f.value&&!['none','n/a',''].includes(f.value.toLowerCase()))
      return f.value.toLowerCase()
  }
  return ''
}

function buildArch(traits:Trait[]):Arch{
  const type  = tv(traits,'type','species')
  const gender= tv(traits,'gender','sex')
  const acc   = tv(traits,'accessory')
  const shirt = tv(traits,'shirt','top','clothing','outfit','jacket','hoodie','wear')

  let normType='human'
  if(type.includes('cat'))normType='cat'
  else if(type.includes('alien'))normType='alien'
  else if(type.includes('agent')||type.includes('robot')||type.includes('android'))normType='agent'
  else if(type.includes('zombie'))normType='zombie'
  else if(type.includes('skeleton'))normType='skeleton'
  else if(type.includes('ape')||type.includes('monkey'))normType='ape'

  let clothing='tshirt'
  if(shirt.includes('suit')||shirt.includes('tux')||shirt.includes('blazer'))clothing='suit'
  else if(shirt.includes('hoodie'))clothing='hoodie'
  else if(shirt.includes('jacket')||shirt.includes('coat'))clothing='jacket'
  else if(shirt.includes('stripe'))clothing='stripe'
  else if(shirt.includes('tank'))clothing='tank'

  let accessory='none'
  if(acc.includes('bow_tie')||acc.includes('bow tie'))accessory='bow_tie'
  else if(acc.includes('chain'))accessory='chain'
  else if(acc.includes('sword')||acc.includes('blade'))accessory='sword'
  else if(acc.includes('gun')||acc.includes('pistol'))accessory='gun'
  else if(acc.includes('wand')||acc.includes('staff'))accessory='wand'
  else if(acc.includes('book')||acc.includes('tome'))accessory='book'
  else if(acc.includes('bottle'))accessory='bottle'
  else if(acc.includes('shield'))accessory='shield'
  else if(acc)accessory='misc'

  return{
    type:normType, gender,
    clothing, accessory,
    hasAcc: accessory!=='none'
  }
}

// ═══════════════════════════════════════════════════════════════════
//  THE BODY DRAWING SYSTEM
//
//  Layout in 120×120 canvas:
//  Face: x=40..79, y=2..41
//  Neck: y=42..44
//  Shoulders: y=45..46 (wider)
//  Upper torso: y=47..62
//  Lower torso: y=63..72
//  Belt: y=73..74
//  Upper legs: y=75..88
//  Lower legs: y=89..100
//  Feet: y=101..107
//  Shadow: y=109
//
//  Body center x=60. Body width ~20px (inner), shoulders ~26px
//  This gives clean proportions matching the ~20-36px face width
// ═══════════════════════════════════════════════════════════════════

const CX = 60

// Layout constants
const NECK_Y=42, NECK_H=3
const SHD_Y=45,  SHD_H=2
const TRS_Y=47,  TRS_H=26
const BELT_Y=73, BELT_H=2
const LEG_Y=75
const SHOE_Y=101, SHOE_H=7
const SHADOW_Y=109

// Body widths by type
function getWidths(a:Arch):{bW:number,sW:number,nW:number,legW:number}{
  if(a.type==='ape')    return{bW:26,sW:34,nW:10,legW:12}
  if(a.type==='agent')  return{bW:22,sW:28,nW:8, legW:10}
  if(a.gender.includes('female'))
                        return{bW:18,sW:22,nW:6, legW:8}
  return                       {bW:20,sW:26,nW:7, legW:9}
}

// ── Core body draw ────────────────────────────────────────────────
function drawBody(c:CanvasRenderingContext2D, a:Arch, seed:number, pose:Pose){
  const r=mkrng(seed^(pose.charCodeAt(0)*0x9f3))
  const{bW,sW,nW,legW}=getWidths(a)
  const bX=CX-(bW>>1)
  const sX=CX-(sW>>1)
  const nX=CX-(nW>>1)
  const gap=2  // gap between legs

  // Pose adjustments
  const crY = pose==='crouch' ? 6 : 0  // crouch shifts body down, compresses legs
  const legH = pose==='crouch' ? 16 : 26

  // Walk: legs stride left/right
  const lLegX = pose==='walk' ? CX-gap-legW-3 : CX-gap-legW
  const rLegX = pose==='walk' ? CX+gap+3      : CX+gap

  // ── NECK ──────────────────────────────────────────────────────
  dk(c, nX, NECK_Y, nW, NECK_H)

  // ── SHOULDERS (full-width dark bar connects neck to torso) ────
  dk(c, sX, SHD_Y, sW, SHD_H)
  // shoulder highlight row
  lt(c, sX+2, SHD_Y, sW-4, 1)

  // ── TORSO ─────────────────────────────────────────────────────
  const tY=TRS_Y+crY
  drawTorso(c, a, r, bX, tY, bW, TRS_H-crY)

  // ── ARMS (before belt so belt overlaps) ───────────────────────
  drawArms(c, a, r, sX, SHD_Y, sW, TRS_H-crY, pose)

  // ── BELT ──────────────────────────────────────────────────────
  const beltY=BELT_Y+crY
  dk(c, bX-1, beltY, bW+2, BELT_H)
  // buckle
  lt(c, CX-2, beltY, 4, BELT_H)
  dk(c, CX-1, beltY, 2, BELT_H)

  // ── LEGS ──────────────────────────────────────────────────────
  const legTopY=beltY+BELT_H
  // Left leg
  drawLeg(c, a, r, lLegX, legTopY, legW, legH, true, pose)
  // Right leg
  drawLeg(c, a, r, rLegX, legTopY, legW, legH, false, pose)

  // ── GROUND SHADOW ────────────────────────────────────────────
  const shadowW=sW+6
  const shadowX=CX-(shadowW>>1)
  dk(c, shadowX+2, SHADOW_Y, shadowW-4, 1)
  lt(c, shadowX, SHADOW_Y, 2, 1)
  lt(c, shadowX+shadowW-2, SHADOW_Y, 2, 1)

  // ── TYPE EXTRAS ───────────────────────────────────────────────
  drawTypeExtras(c, a, r, bX, bW, tY, TRS_H-crY, sX, sW)
}

// ── TORSO clothing ────────────────────────────────────────────────
function drawTorso(c:CanvasRenderingContext2D, a:Arch, r:()=>number,
  x:number, y:number, w:number, h:number)
{
  const cx=x+(w>>1)

  switch(a.clothing){
    case'suit':{
      // Dark filled suit
      dk(c,x,y,w,h)
      // Light shirt centre — gets narrower going down (lapels)
      const lapelTop=Math.floor(w*0.4)
      const lapelBot=Math.floor(w*0.25)
      for(let i=0;i<h;i++){
        const t=i/h
        const sw=Math.round(lapelTop*(1-t)+lapelBot*t)
        const sx=cx-(sw>>1)
        lt(c,sx,y+i,sw,1)
      }
      // Lapel lines (diagonal seams)
      for(let i=0;i<Math.floor(h*0.5);i++){
        const lapX=Math.floor(i*0.6)
        dk(c,x+2+lapX,y+i,1,1)
        dk(c,x+w-3-lapX,y+i,1,1)
      }
      // 3 buttons on tie
      for(let i=0;i<3;i++)dk(c,cx,y+3+i*5,2,2)
      // Pocket square
      lt(c,x+3,y+3,4,3); dk(c,x+3,y+3,4,1); dk(c,x+3,y+3,1,3); dk(c,x+6,y+3,1,3)
      break
    }
    case'hoodie':
    case'jacket':{
      // Light fill, dark outline
      box(c,x,y,w,h)
      // Centre zip line
      dk(c,cx,y,1,h)
      if(a.clothing==='hoodie'){
        // Drawstring cords
        dk(c,cx-3,y,1,Math.floor(h*0.35))
        dk(c,cx+2,y,1,Math.floor(h*0.35))
        // Kangaroo pocket
        const pkW=Math.floor(w*0.6),pkH=8
        const pkX=cx-(pkW>>1),pkY=y+h-pkH-1
        box(c,pkX,pkY,pkW,pkH)
      }
      // Cuff accents
      dk(c,x+1,y+h-4,3,3); dk(c,x+w-4,y+h-4,3,3)
      break
    }
    case'stripe':{
      box(c,x,y,w,h)
      for(let sy=y+2;sy<y+h-2;sy+=4)dk(c,x+1,sy,w-2,2)
      // V-neck
      for(let i=0;i<5;i++){dk(c,cx-i,y+i,1,1);dk(c,cx+i,y+i,1,1)}
      break
    }
    case'tank':{
      box(c,x,y,w,h)
      // Thick shoulder straps
      dk(c,x+2,y,4,6); dk(c,x+w-6,y,4,6)
      // Armhole cuts (erase sides)
      lt(c,x,y+7,3,Math.floor(h*0.5))
      lt(c,x+w-3,y+7,3,Math.floor(h*0.5))
      break
    }
    default:{  // tshirt
      box(c,x,y,w,h)
      // Crew neck
      const nw=Math.floor(w*0.45),nx=cx-(nw>>1)
      lt(c,nx,y,nw,3)
      dk(c,nx,y+3,nw,1)
      dk(c,nx-1,y+4,2,2); dk(c,nx+nw-1,y+4,2,2)
      // Sleeve seams at shoulder
      dk(c,x,y+3,w,1)
      break
    }
  }

  // Bow tie (worn ON the shirt)
  if(a.accessory==='bow_tie'){
    const ty=y+2,bx=cx-5
    dk(c,bx,ty,4,5);dk(c,bx+6,ty,4,5)
    lt(c,bx+1,ty+1,2,3);lt(c,bx+7,ty+1,2,3)
    dk(c,bx+4,ty+2,2,1)
  }
  if(a.accessory==='chain'){
    for(let i=0;i<w-4;i+=3)dk(c,x+2+i,y+Math.floor(h*0.2),2,2)
  }
}

// ── ARM DRAWING ───────────────────────────────────────────────────
function drawArms(c:CanvasRenderingContext2D, a:Arch, r:()=>number,
  sX:number, sY:number, sW:number, torsoH:number, pose:Pose)
{
  const armW = a.type==='ape' ? 8 : a.gender.includes('female') ? 5 : 6
  const uArmH = Math.floor(torsoH*0.55)
  const fArmH = Math.floor(torsoH*0.4)
  const handH = 6, handW = armW+1

  const armTopY = sY+1

  // Pose offsets
  let lArmX=sX, rArmX=sX+sW-armW
  let lElbXOff=-1, rElbXOff=1
  let rRaise=0

  if(pose==='walk'){ lElbXOff=-3; rElbXOff=3 }
  if(pose==='attack'){ rRaise=-9; rElbXOff=4 }
  if(pose==='crouch'){ lElbXOff=2; rElbXOff=2 }

  // LEFT upper arm
  const lElbY=armTopY+uArmH
  dk(c,lArmX,armTopY,armW,uArmH)
  lt(c,lArmX+1,armTopY,1,uArmH)  // highlight

  // LEFT forearm
  const lFX=lArmX+lElbXOff
  const lHandY=lElbY+fArmH
  dk(c,lFX,lElbY,armW,fArmH)
  lt(c,lFX+1,lElbY,1,fArmH)

  // LEFT hand
  box(c,lFX-1,lHandY,handW,handH)

  // RIGHT upper arm
  const rElbY=armTopY+uArmH+rRaise
  dk(c,rArmX,armTopY,armW,uArmH+Math.abs(rRaise))
  lt(c,rArmX+armW-2,armTopY,1,uArmH)  // highlight

  // RIGHT forearm
  const rFX=rArmX+rElbXOff
  const rHandY=rElbY+fArmH
  dk(c,rFX,rElbY,armW,fArmH)
  lt(c,rFX+armW-2,rElbY,1,fArmH)

  // RIGHT hand
  box(c,rFX,rHandY,handW,handH)

  // Held accessory in right hand
  if(a.accessory!=='none')drawHeldAcc(c,a.accessory,rFX+handW,rHandY,pose==='attack')
}

// ── HELD ACCESSORIES ──────────────────────────────────────────────
function drawHeldAcc(c:CanvasRenderingContext2D, type:string, x:number, y:number, raised:boolean){
  const oy=raised?-10:0
  if(type==='sword'||type==='wand'){
    // Blade/staff: vertical line with hilt
    dk(c,x+2,y+oy-2,3,4)  // hilt
    lt(c,x+3,y+oy-1,1,2)
    dk(c,x+3,y+oy+2,1,18) // blade
    lt(c,x+4,y+oy+3,1,16)
    if(type==='wand'){dk(c,x,y+oy,7,4);lt(c,x+2,y+oy+1,3,2)}
  }
  if(type==='gun'){
    dk(c,x,y+oy,5,7);lt(c,x+1,y+oy+1,3,5)
    dk(c,x+3,y+oy+2,10,4);lt(c,x+4,y+oy+3,8,2)
    dk(c,x+2,y+oy+6,3,3)
  }
  if(type==='shield'){
    dk(c,x,y+oy+1,1,8);dk(c,x+8,y+oy+1,1,8)
    dk(c,x+1,y+oy,8,1);dk(c,x+1,y+oy+9,8,1)
    dk(c,x+2,y+oy+10,6,1);dk(c,x+3,y+oy+11,4,1);dk(c,x+4,y+oy+12,2,1)
    lt(c,x+1,y+oy+1,7,8)
    dk(c,x+3,y+oy+3,3,1);dk(c,x+3,y+oy+3,1,4);dk(c,x+5,y+oy+3,1,4);dk(c,x+3,y+oy+6,3,1)
  }
  if(type==='bottle'){
    dk(c,x+2,y+oy,3,2);box(c,x,y+oy+2,7,11)
    lt(c,x+2,y+oy+4,2,6)
  }
  if(type==='book'){
    dk(c,x,y+oy,8,11);lt(c,x+1,y+oy+1,6,9)
    dk(c,x+1,y+oy+3,1,5);dk(c,x+2,y+oy+2,5,1);dk(c,x+2,y+oy+8,5,1)
  }
}

// ── LEG DRAWING ───────────────────────────────────────────────────
function drawLeg(c:CanvasRenderingContext2D, a:Arch, r:()=>number,
  lx:number, topY:number, w:number, h:number, isLeft:boolean, pose:Pose)
{
  // Leg is one solid column, slightly tapered
  const thighH=Math.floor(h*0.44)
  const kneeH=3
  const calfH=h-thighH-kneeH

  // Thigh
  dk(c,lx,topY,w,thighH)
  lt(c,isLeft?lx+w-1:lx,topY+1,1,thighH-2)  // highlight side

  // Knee cap (1px wider each side)
  dk(c,lx-1,topY+thighH,w+2,kneeH)
  lt(c,lx+1,topY+thighH+1,w-2,1)  // knee shine

  // Calf
  const calfY=topY+thighH+kneeH
  dk(c,lx,calfY,w,calfH)
  lt(c,isLeft?lx+w-1:lx,calfY+1,1,calfH-2)  // highlight

  // Ankle
  dk(c,lx+1,calfY+calfH,w-2,2)

  // Shoe/foot
  const shoeY=calfY+calfH+2
  drawShoe(c,a,lx,shoeY,w,SHOE_H,isLeft)
}

function drawShoe(c:CanvasRenderingContext2D, a:Arch,
  lx:number, fy:number, legW:number, fH:number, isLeft:boolean)
{
  if(a.type==='skeleton'){
    dk(c,lx,fy,legW,2)
    dk(c,isLeft?lx:lx+legW-3,fy+2,3,fH-1)
    return
  }
  if(a.type==='ape'){
    dk(c,lx-1,fy,legW+2,fH-2)
    for(let t=0;t<3;t++)dk(c,lx+t*3,fy+fH-3,2,3)
    return
  }

  const shoeW=legW+5
  const sx=isLeft?lx-3:lx-1

  // Sneaker silhouette
  dk(c,sx+1,fy,shoeW-1,1)       // top
  dk(c,sx,fy+1,shoeW,fH-2)      // main body
  dk(c,sx+1,fy+fH-1,shoeW-1,1)  // bottom
  lt(c,sx+2,fy+1,shoeW-4,2)     // tongue highlight
  dk(c,sx+1,fy+fH-2,shoeW-2,1)  // sole line

  // Toe cap (slightly rounded)
  if(!isLeft)dk(c,sx+shoeW-1,fy,1,1)
}

// ── TYPE EXTRAS ───────────────────────────────────────────────────
function drawTypeExtras(c:CanvasRenderingContext2D, a:Arch, r:()=>number,
  bX:number, bW:number, torsoY:number, torsoH:number,
  sX:number, sW:number)
{
  if(a.type==='cat'){
    // Tail curling up from hip
    const tx=bX+bW+1,ty=torsoY+torsoH-5
    dk(c,tx,ty,2,2); dk(c,tx+2,ty-2,2,2); dk(c,tx+4,ty-4,2,2)
    dk(c,tx+5,ty-6,2,4); lt(c,tx+6,ty-5,1,2)
    // Tail tip
    dk(c,tx+4,ty-8,4,3); lt(c,tx+5,ty-7,2,1)
  }
  if(a.type==='alien'){
    // Extra thin arms hanging down both sides
    const ay=torsoY+2, ah=Math.floor(torsoH*0.75)
    dk(c,sX-4,ay,2,ah); dk(c,sX-5,ay+ah,4,4)  // left
    dk(c,sX+sW+2,ay,2,ah); dk(c,sX+sW+1,ay+ah,4,4)  // right
  }
  if(a.type==='agent'){
    // Tie
    const tieY=torsoY+1,tieW=4
    const tieX=CX-(tieW>>1)
    dk(c,tieX,tieY,tieW,2)
    for(let i=0;i<torsoH-4;i++){
      const tw=Math.max(2,tieW-Math.floor(i/4))
      const tx=CX-(tw>>1)
      dk(c,tx,tieY+2+i,tw,1)
    }
    // Lapel on suit (if agent = suit style)
    dk(c,bX+1,torsoY,Math.floor(bW*0.2),Math.floor(torsoH*0.5))
    lt(c,bX+2,torsoY+1,Math.floor(bW*0.12),Math.floor(torsoH*0.35))
    dk(c,bX+bW-2,torsoY,Math.floor(bW*0.2),Math.floor(torsoH*0.5))
    lt(c,bX+bW-2-Math.floor(bW*0.12),torsoY+1,Math.floor(bW*0.12),Math.floor(torsoH*0.35))
  }
  if(a.type==='skeleton'){
    // Exposed ribcage — draw OVER the torso
    lt(c,bX+1,torsoY+1,bW-2,torsoH-2)
    dk(c,bX,torsoY,bW,1); dk(c,bX,torsoY+torsoH-1,bW,1)
    dk(c,bX,torsoY,1,torsoH); dk(c,bX+bW-1,torsoY,1,torsoH)
    // Spine
    for(let y=torsoY+2;y<torsoY+torsoH-1;y+=2) dk(c,CX,y,1,1)
    // Ribs (4 pairs)
    const rib=Math.floor((torsoH-6)/4)
    for(let i=0;i<4;i++){
      const ry=torsoY+3+i*rib
      dk(c,bX+2,ry,CX-bX-3,1); dk(c,bX+1,ry+1,CX-bX-2,1)
      dk(c,CX+1,ry,bX+bW-CX-3,1); dk(c,CX+1,ry+1,bX+bW-CX-2,1)
    }
  }
  if(a.type==='zombie'){
    // Torn shirt — ragged bottom hem
    lt(c,bX+1,torsoY+1,bW-2,torsoH-2)
    dk(c,bX,torsoY,bW,1); dk(c,bX,torsoY,1,torsoH); dk(c,bX+bW-1,torsoY,1,torsoH)
    // Tear marks
    dk(c,bX+4,torsoY+5,2,6); dk(c,bX+bW-5,torsoY+8,2,6)
    // Ragged hem
    for(let i=bX+1;i<bX+bW-1;i+=2){
      const d=(r()*4)|0; dk(c,i,torsoY+torsoH-d,1,d)
    }
  }
  if(a.type==='ape'){
    // Fur texture — scattered dark pixels over light fill
    lt(c,bX+1,torsoY+1,bW-2,torsoH-2)
    dk(c,bX,torsoY,bW,1); dk(c,bX,torsoY,1,torsoH); dk(c,bX+bW-1,torsoY,1,torsoH)
    for(let fy=torsoY+3;fy<torsoY+torsoH-2;fy+=3)
      for(let fx=bX+2;fx<bX+bW-2;fx+=3)
        dk(c,fx,fy,2,1)
    // Lighter chest patch
    const pW=Math.floor(bW*0.42)
    dk(c,CX-(pW>>1),torsoY+2,pW,Math.floor(torsoH*0.5))
    lt(c,CX-(pW>>1)+1,torsoY+3,pW-2,Math.floor(torsoH*0.5)-2)
  }
}

// ═══════════════════════════════════════════════════════════════════
//  FACE PIPELINE
//  Uses the /pixels endpoint (1600-char binary string) for PERFECT
//  reproduction of the on-chain pixel art. Falls back to image if needed.
// ═══════════════════════════════════════════════════════════════════

// Parse the 1600-char pixels string into 40×40 grid
function pixelsStringToGrid(str:string):number[][]{
  const g:number[][]=[]
  for(let y=0;y<40;y++){
    g[y]=[]
    for(let x=0;x<40;x++)
      g[y][x]=str[y*40+x]==='1'?1:0
  }
  return g
}

// Sample face from an image element (fallback)
function sampleFaceFromImg(img:HTMLImageElement):number[][]{
  const oc=document.createElement('canvas');oc.width=oc.height=40
  const cx=oc.getContext('2d')!;cx.imageSmoothingEnabled=false
  cx.drawImage(img,0,0,40,40)
  const raw=cx.getImageData(0,0,40,40).data,g:number[][]=[]
  for(let y=0;y<40;y++){
    g[y]=[]
    for(let x=0;x<40;x++){
      const i=(y*40+x)*4
      g[y][x]=(0.2126*raw[i]+0.7152*raw[i+1]+0.0722*raw[i+2])<128?1:0
    }
  }
  return g
}

// Paste the 40×40 face grid at position x=40, y=2 in the 120×120 canvas
function pasteFace(c:CanvasRenderingContext2D,g:number[][]){
  // Fill face area first (background)
  lt(c,40,2,40,40)
  for(let y=0;y<40;y++)for(let x=0;x<40;x++){
    if(g[y][x]===1)dk(c,40+x,2+y,1,1)
  }
}

// Enforce strict 2-color palette on the whole canvas
function snapPal(c:CanvasRenderingContext2D,ca:number){
  const id=c.getImageData(0,0,120,120),p=id.data
  const thr=128+ca*15
  for(let i=0;i<p.length;i+=4){
    if(p[i+3]<10){p[i]=PL[0];p[i+1]=PL[1];p[i+2]=PL[2];p[i+3]=255;continue}
    const lm=0.2126*p[i]+0.7152*p[i+1]+0.0722*p[i+2]
    const col=lm>thr?PL:PD
    p[i]=col[0];p[i+1]=col[1];p[i+2]=col[2];p[i+3]=255
  }
  c.putImageData(id,0,0)
}

// ─── Sprite sheet: 4 poses side by side = 480×120 ─────────────────
const POSES:Pose[]=['idle','walk','attack','crouch']
const POSE_LABELS=['Idle','Walk','Attack','Crouch']

async function buildSheet(
  faceGrid:number[][], traits:Trait[], seed:number, contrast:number,
  sheet:HTMLCanvasElement, wait:(ms:number)=>Promise<void>
){
  const arch=buildArch(traits)
  sheet.width=480; sheet.height=120
  const sc=sheet.getContext('2d')!; sc.imageSmoothingEnabled=false
  sc.fillStyle=plStr; sc.fillRect(0,0,480,120)
  for(let i=0;i<4;i++){
    const tmp=document.createElement('canvas');tmp.width=tmp.height=120
    const tc=tmp.getContext('2d')!; tc.imageSmoothingEnabled=false
    tc.fillStyle=plStr; tc.fillRect(0,0,120,120)
    drawBody(tc,arch,seed,POSES[i])
    pasteFace(tc,faceGrid)
    snapPal(tc,contrast)
    sc.drawImage(tmp,i*120,0)
    await wait(6)
  }
}

// ─── UI styles ────────────────────────────────────────────────────
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
  const [faceGrid,setFaceGrid]=useState<number[][]|null>(null)
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
    setTraits([]);setNormName('');setFaceUrl(null);setSavedUrl(null)
    setFaceGrid(null);setCurrentId(id)
    router.replace(`/engine?id=${id}`,{scroll:false})
    try{
      // Load metadata first (traits)
      const mRes=await rf(`https://api.normies.art/normie/${id}/metadata`)
      if(!mRes.ok)throw new Error(`Normie #${id} not found`)
      const mData=await mRes.json()
      const parsed:Trait[]=[]
      if(Array.isArray(mData.attributes))
        mData.attributes.forEach((a:any)=>{if(a.trait_type&&a.value!=null)parsed.push({key:String(a.trait_type),value:String(a.value)})})
      setTraits(parsed);setNormName(mData.name||`Normie #${id}`)

      // Load pixel grid (exact on-chain bitmap) + image simultaneously
      const [pixRes,imgRes]=await Promise.all([
        rf(`https://api.normies.art/normie/${id}/pixels`),
        rf(`https://api.normies.art/normie/${id}/image.png`)
      ])

      // Parse pixel grid
      if(pixRes.ok){
        const pixStr=await pixRes.text()
        setFaceGrid(pixelsStringToGrid(pixStr.trim()))
      }

      // Set face preview URL
      if(imgRes.ok){
        const blob=await imgRes.blob()
        setFaceUrl(URL.createObjectURL(blob))
      }

      // If no pixel grid, fall back to image
      if(!pixRes.ok&&imgRes.ok){
        const blob=await imgRes.blob()
        const url2=URL.createObjectURL(blob)
        const img=await new Promise<HTMLImageElement>((res,rej)=>{
          const i=new Image();i.crossOrigin='anonymous'
          i.onload=()=>res(i);i.onerror=rej;i.src=url2
        })
        setFaceGrid(sampleFaceFromImg(img))
      }

    }catch(e:any){setErr(e.message||'Failed to load')}
    finally{setLoading(false)}
  }

  async function generate(newSeed=false,pose=activePose){
    if(!faceGrid)return
    const s=newSeed||!seed?((Math.random()*0xFFFFFF)|0):seed
    if(newSeed||!seed)setSeed(s)
    const wc=wcRef.current;if(!wc)return
    const ctx=wc.getContext('2d')!;ctx.imageSmoothingEnabled=false

    prog(true,'Drawing body…',20);await wait(12)
    ctx.fillStyle=plStr;ctx.fillRect(0,0,120,120)
    const arch=buildArch(traits)
    drawBody(ctx,arch,s,pose)

    prog(true,'Compositing face…',55);await wait(10)
    pasteFace(ctx,faceGrid)

    prog(true,'Finalizing…',80);await wait(8)
    snapPal(ctx,contrast)

    prog(true,'Building sheet…',88);await wait(6)
    const sheet=sheetRef.current
    if(sheet)await buildSheet(faceGrid,traits,s,contrast,sheet,wait)

    prog(false,'',100);await wait(6)

    const dc=document.createElement('canvas');dc.width=dc.height=120
    dc.getContext('2d')!.drawImage(wc,0,0)
    displayRef.current=dc
    setSpriteReady(true);setSheetReady(true)
    // trigger react re-render of display canvas
    setSpriteReady(false);await wait(10);setSpriteReady(true)
  }

  async function switchPose(p:Pose){
    setActivePose(p)
    if(!faceGrid||!seed)return
    const wc=wcRef.current;if(!wc)return
    const ctx=wc.getContext('2d')!;ctx.imageSmoothingEnabled=false
    ctx.fillStyle=plStr;ctx.fillRect(0,0,120,120)
    drawBody(ctx,buildArch(traits),seed,p)
    pasteFace(ctx,faceGrid)
    snapPal(ctx,contrast)
    const dc=document.createElement('canvas');dc.width=dc.height=120
    dc.getContext('2d')!.drawImage(wc,0,0)
    displayRef.current=dc
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
    const suffix=sheet?`-sheet`:`-${activePose}-${size}${transparent?'-transparent':''}`
    out.toBlob(b=>{
      const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(b!),download:`normie-${currentId}${suffix}.png`})
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

            {/* LEFT */}
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

            {/* RIGHT */}
            <div className="fn-eng-right" style={{padding:'1.4rem 0',borderTop:'1px solid var(--line)'}}>
              <div style={{fontSize:'.5rem',letterSpacing:'.18em',textTransform:'uppercase',color:'var(--ink-muted)',marginBottom:'1.1rem',display:'flex',alignItems:'center',gap:'.4rem'}}>
                02 — Full Body Sprite Engine
                <span style={{flex:1,height:1,background:'var(--line-soft)',display:'block',opacity:.5}}/>
              </div>

              <div style={{...S.frame,maxWidth:200}}>
                {spriteReady&&displayRef.current
                  ?<canvas key={`${activePose}-${seed}`}
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

              {showProg&&<div style={{marginBottom:'.7rem'}}>
                <div style={{fontSize:'.5rem',letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-muted)',marginBottom:'.28rem'}}>{progLabel}</div>
                <div style={{height:2,background:'var(--line-soft)'}}><div style={{height:2,background:'var(--ink)',width:`${progPct}%`,transition:'width .28s ease'}}/></div>
              </div>}

              <button style={{...S.btn,...S.btnFill,width:'100%',marginBottom:'.45rem'}} disabled={!faceGrid} onClick={()=>generate(false)}>
                ▶ Generate Full Body Sprite
              </button>

              {spriteReady&&<div style={grid2}>
                <button style={S.btn} onClick={()=>generate(false)}>↺ Regenerate</button>
                <button style={S.btn} onClick={()=>generate(true)}>⚂ New Seed</button>
                <button style={S.btn} onClick={()=>{setContrast(cc=>Math.min(3,cc+1));generate(false)}}>+ Contrast</button>
                <button style={S.btn} onClick={()=>{setContrast(cc=>Math.max(-3,cc-1));generate(false)}}>− Contrast</button>
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
                  <div style={{gridColumn:'span 2',position:'relative'}}>
                    <button style={{...S.btn,width:'100%'}} onClick={()=>setShareOpen(o=>!o)}>↗ Share</button>
                    {shareOpen&&(
                      <div style={{position:'absolute',bottom:'calc(100% + 4px)',left:0,right:0,background:'var(--bg-raise)',border:'1px solid var(--line)',zIndex:10}}>
                        <button style={{...S.btn,width:'100%',borderWidth:0,borderBottom:'1px solid var(--line-soft)'}}
                          onClick={()=>{window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(`Just generated Normie #${currentId} as a full-body pixel art sprite! 🎮\nhttps://fully-normies.vercel.app/engine?id=${currentId}`)}`,'_blank');setShareOpen(false)}}>
                          𝕏 Post on X / Twitter
                        </button>
                        <button style={{...S.btn,width:'100%',borderWidth:0}} onClick={async()=>{
                          if(navigator.share&&wcRef.current){
                            wcRef.current.toBlob(async b=>{
                              if(!b)return
                              try{await navigator.share({title:`Normie #${currentId}`,files:[new File([b],'sprite.png',{type:'image/png'})]})}catch{}
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
              {savedUrl&&<div style={{marginTop:'.5rem',fontSize:'.56rem',color:'var(--ink-muted)'}}>Saved! <a href="/gallery" style={{color:'var(--ink)',textDecoration:'underline'}}>View Gallery →</a></div>}

              {sheetReady&&<>
                <hr style={{border:'none',borderTop:'1px solid var(--line-soft)',margin:'.9rem 0'}}/>
                <span style={S.lbl}>Sprite Sheet Preview</span>
                <div style={{background:'#e3e5e4',border:'1px solid var(--line)',padding:4,display:'inline-block',marginBottom:'.4rem'}}>
                  <canvas
                    ref={el=>{if(el&&sheetRef.current){el.width=240;el.height=60;const cx=el.getContext('2d')!;cx.imageSmoothingEnabled=false;cx.drawImage(sheetRef.current,0,0,240,60)}}}
                    width={240} height={60}
                    style={{display:'block',imageRendering:'pixelated'}}
                  />
                </div>
                <div style={{display:'flex'}}>
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
