'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Nav from '../components/Nav'
import Footer from '../components/Footer'
import { Suspense } from 'react'

// ═══════════════════════════════════════════════════════════════
//  FULLNORMIES SPRITE ENGINE v6
//
//  Normies NFT has exactly 4 types: Human, Cat, Alien, Agent
//  Accessories are ALL head/neck items (hats, chains, earrings)
//  There is NO clothing trait — derived from type + seed
//
//  Body matches reference: chunky, wide stance, arms away,
//  legs splayed, solid dark jacket silhouette
//
//  Canvas 120x120. Face 40x40 at x=40,y=2. Body below y=42.
// ═══════════════════════════════════════════════════════════════

const PL_R=0xe3,PL_G=0xe5,PL_B=0xe4  // #e3e5e4 light
const PD_R=0x48,PD_G=0x49,PD_B=0x4b  // #48494b dark
const plStr='#e3e5e4', pdStr='#48494b'
const CX=60  // canvas horizontal center

function mkrng(s:number){
  let n=s|0
  return():number=>{n=(Math.imul(n,1664525)+1013904223)|0;return(n>>>0)/0x100000000}
}
function dk(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number){
  if(w<=0||h<=0)return; c.fillStyle=pdStr; c.fillRect(x|0,y|0,w|0,h|0)
}
function lt(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number){
  if(w<=0||h<=0)return; c.fillStyle=plStr; c.fillRect(x|0,y|0,w|0,h|0)
}

// ── Types ───────────────────────────────────────────────────────
interface Trait{key:string;value:string}
type Pose='idle'|'walk'|'attack'|'crouch'

// The 4 Normies types
type NormType='human'|'cat'|'alien'|'agent'

interface Arch{
  normType: NormType
  gender: string
  // Clothing from type+seed (no clothing trait in API)
  // agent=suit, cat=tshirt, human/alien=jacket|hoodie|tshirt
  clothing: string
  // Only 2 accessories show on body: bow_tie, chain
  accBody: 'bow_tie'|'chain'|'none'
  // Wider proportions
  wide: boolean
}

function tv(traits:Trait[], key:string):string{
  const f=traits.find(t=>t.key.toLowerCase()===key.toLowerCase())
  return f?f.value.toLowerCase():''
}

function buildArch(traits:Trait[], seed:number):Arch{
  const typeStr=tv(traits,'type')
  const gender=tv(traits,'gender')
  const accStr=tv(traits,'accessory')

  let normType:NormType='human'
  if(typeStr==='cat')normType='cat'
  else if(typeStr==='alien')normType='alien'
  else if(typeStr==='agent')normType='agent'

  // Clothing: agents always get suits, cats get tshirt,
  // humans/aliens get seed-based variety
  let clothing='jacket'
  if(normType==='agent') clothing='suit'
  else if(normType==='cat') clothing='tshirt'
  else{
    // 3 options weighted toward jacket (matches the dark silhouette look)
    const v=seed%6
    clothing=v<3?'jacket':v<5?'hoodie':'tshirt'
  }

  // Bow tie and chains are the only accessories visible on the body
  let accBody:'bow_tie'|'chain'|'none'='none'
  if(accStr.includes('bow tie'))accBody='bow_tie'
  else if(accStr.includes('chain'))accBody='chain'

  // Wider proportions: cat (stocky), agent male (broad suit), alien (tall slim)
  const wide=normType==='cat'||(normType==='agent'&&gender.includes('male'))

  return{normType,gender,clothing,accBody,wide}
}

// ═══════════════════════════════════════════════════════════════
//  BODY DRAWING
//  Proportions from reference image analysis (120px height):
//
//  y=42-44  neck (7-8px wide)
//  y=45-47  shoulders (32-36px wide) — connects neck to torso
//  y=48-79  torso/jacket (26-30px wide) — solid dark mass
//  y=80-82  belt (32px wide)
//  y=83-106 legs (splayed — each leg 11-12px, splay outward)
//  y=107-114 shoes (16px wide, low profile)
//  y=116    ground shadow
//
//  Arms: 9px wide, positioned OUTSIDE shoulders with 1px gap
//  Left arm at x=sX-armW-1, Right arm at x=sX+sW+1
// ═══════════════════════════════════════════════════════════════

function drawBody(c:CanvasRenderingContext2D, a:Arch, seed:number, pose:Pose){
  const r=mkrng(seed^(pose.charCodeAt(0)*0x9e37))

  // Proportions by type
  const alien=a.normType==='alien'
  const wide=a.wide
  const female=a.gender.includes('female')

  const nW=wide?10:female?6:8          // neck width
  const sW=wide?36:female?26:32        // shoulder span
  const bW=wide?28:female?20:24        // torso/jacket width
  const armW=wide?11:female?8:9        // arm width
  const legW=wide?13:female?10:11      // leg width
  const shoeW=wide?19:female?14:16     // shoe width

  const bX=CX-(bW>>1)
  const sX=CX-(sW>>1)
  const nX=CX-(nW>>1)

  // Pose shifts
  const crY=pose==='crouch'?5:0
  const walkL=pose==='walk'?-3:0
  const walkR=pose==='walk'?3:0
  const atkRaise=pose==='attack'?-9:0

  // Y positions
  const NECK_Y=42
  const SHD_Y =45
  const TRS_Y =48
  const TRS_H =32-crY
  const BELT_Y=TRS_Y+TRS_H
  const LEG_Y =BELT_Y+3
  const LEG_H =wide?20:23-crY
  const SHOE_Y=LEG_Y+LEG_H
  const SHOE_H=7

  // ── NECK ──────────────────────────────────────────────────
  dk(c, nX, NECK_Y, nW, 3)

  // ── SHOULDERS ─────────────────────────────────────────────
  // Full-width dark bar sealing neck→torso junction
  dk(c, sX, SHD_Y, sW, 3)
  lt(c, sX+2, SHD_Y, sW-4, 1)  // top highlight

  // ── TORSO ─────────────────────────────────────────────────
  drawTorso(c, a, bX, TRS_Y, bW, TRS_H)

  // ── ARMS (outside shoulders, gap between arm and body) ────
  const lAX=sX-armW-1   // left arm x
  const rAX=sX+sW+1     // right arm x
  const armTop=SHD_Y+1
  const uH=Math.floor((BELT_Y-armTop)*0.52)
  const fH=BELT_Y-armTop-uH

  // LEFT upper arm
  dk(c, lAX+walkL, armTop, armW, uH)
  lt(c, lAX+walkL+armW-2, armTop+1, 1, uH-2)
  // LEFT forearm
  const lFX=lAX+walkL-1
  dk(c, lFX, armTop+uH, armW, fH)
  lt(c, lFX+armW-2, armTop+uH+1, 1, fH-2)
  // LEFT elbow crease
  lt(c, lAX+walkL+1, armTop+uH-1, armW-2, 1)
  // LEFT hand
  dk(c, lFX-1, armTop+uH+fH, armW+2, 6)
  lt(c, lFX,   armTop+uH+fH+1, armW, 4)

  // RIGHT upper arm (possibly raised for attack)
  dk(c, rAX+walkR, armTop+atkRaise, armW, uH+Math.abs(atkRaise>>1))
  lt(c, rAX+walkR+1, armTop+atkRaise+1, 1, uH-2)
  // RIGHT forearm
  const rFX=rAX+walkR+1
  dk(c, rFX, armTop+uH+atkRaise, armW, fH)
  lt(c, rFX+1, armTop+uH+atkRaise+1, 1, fH-2)
  lt(c, rAX+walkR+1, armTop+uH+atkRaise-1, armW-2, 1)
  // RIGHT hand
  dk(c, rFX-1, armTop+uH+fH+atkRaise, armW+2, 6)
  lt(c, rFX,   armTop+uH+fH+atkRaise+1, armW, 4)

  // ── BELT ──────────────────────────────────────────────────
  dk(c, bX-2, BELT_Y, bW+4, 3)
  lt(c, CX-3, BELT_Y+1, 6, 1)
  dk(c, CX-2, BELT_Y+1, 4, 1)

  // ── LEGS (splayed outward stance) ─────────────────────────
  // Legs diverge as they go down — each leg shifts outward by ~4px total
  for(let i=0;i<LEG_H;i++){
    const t=i/LEG_H
    const lx=Math.round(CX-(bW>>1)*0.08-legW-t*3+walkL)
    const rx=Math.round(CX+(bW>>1)*0.08+t*3+walkR)
    dk(c,lx,LEG_Y+i,legW,1)
    dk(c,rx,LEG_Y+i,legW,1)
    // Knee highlight at ~45%
    if(Math.abs(i-Math.floor(LEG_H*0.45))<2){
      lt(c,lx+2,LEG_Y+i,legW-4,1)
      lt(c,rx+2,LEG_Y+i,legW-4,1)
    }
    // Inner leg highlight edge
    if(i%5===0){
      lt(c,lx+legW-2,LEG_Y+i,1,1)
      lt(c,rx+1,LEG_Y+i,1,1)
    }
  }

  // ── SHOES ─────────────────────────────────────────────────
  const lLegFinalX=Math.round(CX-(bW>>1)*0.08-legW-3+walkL)
  const rLegFinalX=Math.round(CX+(bW>>1)*0.08+3+walkR)
  drawShoe(c, a, lLegFinalX, SHOE_Y, shoeW, SHOE_H, true)
  drawShoe(c, a, rLegFinalX, SHOE_Y, shoeW, SHOE_H, false)

  // ── GROUND SHADOW ─────────────────────────────────────────
  const shadowLeft=lLegFinalX-3
  const shadowRight=rLegFinalX+shoeW+3
  dk(c, shadowLeft+2, SHOE_Y+SHOE_H+2, shadowRight-shadowLeft-4, 1)
  lt(c, shadowLeft, SHOE_Y+SHOE_H+2, 2, 1)
  lt(c, shadowRight-2, SHOE_Y+SHOE_H+2, 2, 1)

  // ── TYPE-SPECIFIC EXTRAS ──────────────────────────────────
  drawTypeExtras(c, a, r, bX, bW, TRS_Y, TRS_H, sX, sW)
}

// ── Torso clothing ─────────────────────────────────────────────
function drawTorso(c:CanvasRenderingContext2D, a:Arch,
  x:number, y:number, w:number, h:number)
{
  const cx=x+(w>>1)

  if(a.clothing==='suit'){
    // Solid dark suit — the Agent look
    dk(c,x,y,w,h)
    // Light shirt strip, narrowing slightly
    for(let i=0;i<h;i++){
      const sw=Math.max(2,7-Math.floor(i/h*4))
      lt(c,cx-(sw>>1),y+i,sw,1)
    }
    // Lapel diagonals
    for(let i=0;i<Math.min(h,13);i++){
      dk(c,x+1+Math.floor(i*0.35),y+i,1,1)
      dk(c,x+w-2-Math.floor(i*0.35),y+i,1,1)
    }
    // Buttons x3
    dk(c,cx,y+5,2,2); dk(c,cx,y+11,2,2); dk(c,cx,y+17,2,2)
    // Pocket square top-left
    lt(c,x+3,y+4,4,3); dk(c,x+3,y+4,4,1); dk(c,x+3,y+4,1,3)
  }
  else if(a.clothing==='hoodie'){
    // Solid dark hoodie
    dk(c,x,y,w,h)
    lt(c,cx-1,y,2,h)     // centre zip
    dk(c,cx-1,y,2,1); dk(c,cx-1,y+h-1,2,1)
    lt(c,cx-4,y,1,Math.floor(h*0.38))   // drawstring L
    lt(c,cx+3,y,1,Math.floor(h*0.38))   // drawstring R
    // Kangaroo pocket
    const pkW=Math.floor(w*0.62),pkH=8,pkX=cx-(pkW>>1),pkY=y+h-pkH-1
    lt(c,pkX,pkY,pkW,pkH)
    dk(c,pkX,pkY,pkW,1); dk(c,pkX,pkY,1,pkH); dk(c,pkX+pkW-1,pkY,1,pkH); dk(c,pkX,pkY+pkH-1,pkW,1)
  }
  else if(a.clothing==='tshirt'){
    // Light tshirt — good for cats (skin/fur visible)
    lt(c,x,y,w,h)
    dk(c,x,y,1,h); dk(c,x+w-1,y,1,h); dk(c,x,y+h-1,w,1)
    // Crew neck opening
    const nw=Math.floor(w*0.5),nx=cx-(nw>>1)
    lt(c,nx,y,nw,3); dk(c,nx,y+3,nw,1)
    dk(c,nx-1,y+4,2,2); dk(c,nx+nw-1,y+4,2,2)
    dk(c,x,y+3,w,1)  // shoulder seam
  }
  else{
    // Default jacket — solid dark with small collar/shirt strip at top
    dk(c,x,y,w,h)
    const colW=Math.floor(w*0.36),colX=cx-(colW>>1)
    lt(c,colX,y,colW,Math.floor(h*0.2))
    dk(c,colX,y+Math.floor(h*0.2),colW,1)
    // Lapels
    for(let i=0;i<Math.floor(h*0.48);i++){
      dk(c,x+1+Math.floor(i*0.32),y+i,1,1)
      dk(c,x+w-2-Math.floor(i*0.32),y+i,1,1)
    }
    // Centre seam
    dk(c,cx,y+Math.floor(h*0.22),1,Math.floor(h*0.78))
    // Side pockets
    lt(c,x+3,y+Math.floor(h*0.58),5,6)
    dk(c,x+3,y+Math.floor(h*0.58),5,1); dk(c,x+3,y+Math.floor(h*0.58),1,6)
    lt(c,x+w-8,y+Math.floor(h*0.58),5,6)
    dk(c,x+w-8,y+Math.floor(h*0.58),5,1); dk(c,x+w-4,y+Math.floor(h*0.58),1,6)
  }

  // Body-visible accessories
  if(a.accBody==='bow_tie'){
    // Bow tie at neck base
    const ty=y+2,bx=cx-6
    dk(c,bx,ty+1,5,4); dk(c,bx+7,ty+1,5,4)
    lt(c,bx+1,ty+2,3,2); lt(c,bx+8,ty+2,3,2)
    dk(c,bx+5,ty+2,2,2)
  }
  if(a.accBody==='chain'){
    // Chain draping across upper chest
    const cy2=y+Math.floor(h*0.15)
    for(let i=x+2;i<x+w-2;i+=4){
      dk(c,i,cy2,3,2); lt(c,i+1,cy2,1,1)
    }
  }
}

// ── Shoes ───────────────────────────────────────────────────────
function drawShoe(c:CanvasRenderingContext2D, a:Arch,
  lx:number, fy:number, sw:number, sh:number, isLeft:boolean)
{
  // Aliens get slightly pointed shoes
  if(a.normType==='alien'){
    dk(c,lx,fy,sw,sh-1)
    dk(c,isLeft?lx-2:lx+sw,fy+2,3,sh-2)  // pointed toe
    lt(c,lx+2,fy+1,sw-4,2)
    return
  }
  // Everyone else: chunky flat sneaker
  const ox=isLeft?-2:1  // slight outward splay
  dk(c,lx+ox,fy,sw,1)
  dk(c,lx+ox,fy+1,sw,sh-2)
  dk(c,lx+ox+1,fy+sh-1,sw-1,1)
  lt(c,lx+ox+2,fy+1,sw-4,2)   // tongue highlight
  lt(c,lx+ox+1,fy+3,sw-3,sh-5) // shoe body fill
  dk(c,lx+ox+1,fy+sh-2,sw-2,1) // sole stripe
}

// ── Type-specific extras ────────────────────────────────────────
function drawTypeExtras(c:CanvasRenderingContext2D, a:Arch, r:()=>number,
  bX:number,bW:number,torsoY:number,torsoH:number,sX:number,sW:number)
{
  if(a.normType==='cat'){
    // Cat tail curling up from hip
    const tx=bX+bW+2, ty=torsoY+torsoH-4
    dk(c,tx,ty,2,3); dk(c,tx+2,ty-2,2,3); dk(c,tx+4,ty-5,2,4)
    dk(c,tx+4,ty-8,4,3); lt(c,tx+5,ty-7,2,1)
    // Cat: light underbelly/chest visible through tshirt (already handled in tshirt)
  }
  if(a.normType==='alien'){
    // Extra thin secondary arms
    const ay=torsoY+6, ah=Math.floor(torsoH*0.65)
    for(let i=0;i<ah;i++){
      // Thin single-pixel lines for extra arms
      if(i%2===0){dk(c,sX-6-Math.floor(i*0.2),ay+i,2,1)}
      if(i%2===0){dk(c,sX+sW+4+Math.floor(i*0.2),ay+i,2,1)}
    }
    // Alien hand blobs
    dk(c,sX-8-Math.floor(ah*0.2),ay+ah,5,4)
    dk(c,sX+sW+4+Math.floor(ah*0.2),ay+ah,5,4)
  }
  if(a.normType==='agent'){
    // The suit already shows lapels/tie from drawTorso
    // Add shoulder padding bulk
    dk(c,sX,45,3,5); dk(c,sX+sW-3,45,3,5)
  }
}

// ═══════════════════════════════════════════════════════════════
//  FACE PIPELINE — /pixels gives exact on-chain 40x40 bitmap
// ═══════════════════════════════════════════════════════════════

function pixelsToGrid(str:string):number[][]{
  const g:number[][]=[]
  for(let y=0;y<40;y++){g[y]=[];for(let x=0;x<40;x++)g[y][x]=str[y*40+x]==='1'?1:0}
  return g
}

function sampleFaceFromImg(img:HTMLImageElement):number[][]{
  const oc=document.createElement('canvas');oc.width=oc.height=40
  const cx=oc.getContext('2d')!;cx.imageSmoothingEnabled=false
  cx.drawImage(img,0,0,40,40)
  const raw=cx.getImageData(0,0,40,40).data,g:number[][]=[]
  for(let y=0;y<40;y++){g[y]=[];for(let x=0;x<40;x++){
    const i=(y*40+x)*4;g[y][x]=(0.2126*raw[i]+0.7152*raw[i+1]+0.0722*raw[i+2])<128?1:0
  }}
  return g
}

function pasteFace(c:CanvasRenderingContext2D, g:number[][]){
  lt(c,40,2,40,40)
  for(let y=0;y<40;y++)for(let x=0;x<40;x++)if(g[y][x]===1)dk(c,40+x,2+y,1,1)
}

function snapPal(c:CanvasRenderingContext2D, ca:number){
  const id=c.getImageData(0,0,120,120),p=id.data,thr=128+ca*15
  for(let i=0;i<p.length;i+=4){
    if(p[i+3]<10){p[i]=PL_R;p[i+1]=PL_G;p[i+2]=PL_B;p[i+3]=255;continue}
    const lm=0.2126*p[i]+0.7152*p[i+1]+0.0722*p[i+2]
    if(lm>thr){p[i]=PL_R;p[i+1]=PL_G;p[i+2]=PL_B}else{p[i]=PD_R;p[i+1]=PD_G;p[i+2]=PD_B}
    p[i+3]=255
  }
  c.putImageData(id,0,0)
}

const POSES:Pose[]=['idle','walk','attack','crouch']
const POSE_LABELS=['Idle','Walk','Attack','Crouch']

async function buildSheet(faceGrid:number[][], traits:Trait[], seed:number, contrast:number,
  sheet:HTMLCanvasElement, wait:(ms:number)=>Promise<void>)
{
  const arch=buildArch(traits,seed)
  sheet.width=480;sheet.height=120
  const sc=sheet.getContext('2d')!;sc.imageSmoothingEnabled=false
  sc.fillStyle=plStr;sc.fillRect(0,0,480,120)
  for(let i=0;i<4;i++){
    const tmp=document.createElement('canvas');tmp.width=tmp.height=120
    const tc=tmp.getContext('2d')!;tc.imageSmoothingEnabled=false
    tc.fillStyle=plStr;tc.fillRect(0,0,120,120)
    drawBody(tc,arch,seed,POSES[i])
    pasteFace(tc,faceGrid)
    snapPal(tc,contrast)
    sc.drawImage(tmp,i*120,0)
    await wait(6)
  }
}

// ── UI styles ──────────────────────────────────────────────────
const S={
  btn:{background:'transparent',border:'1px solid var(--line)',color:'var(--ink)',fontFamily:'inherit',fontSize:'.6rem',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase' as const,padding:'.44rem .84rem',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:'.3rem',userSelect:'none' as const,WebkitTapHighlightColor:'transparent'},
  btnFill:{background:'var(--ink)',color:'var(--bg)',borderColor:'var(--ink)'},
  frame:{width:'100%',maxWidth:200,aspectRatio:'1' as const,background:'#e3e5e4',border:'1px solid var(--line)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:'1.1rem',overflow:'hidden'},
  lbl:{fontSize:'.6rem',letterSpacing:'.13em',textTransform:'uppercase' as const,color:'var(--ink-muted)',display:'block',marginBottom:'.3rem'},
}

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
  const renderKey=useRef(0)

  const wait=(ms:number):Promise<void>=>new Promise(r=>setTimeout(r,ms))
  const prog=useCallback((show:boolean,lbl:string,pct:number)=>{setShowProg(show);setProgLabel(lbl);setProgPct(pct)},[])

  useEffect(()=>{const id=searchParams.get('id');if(id){setTokenInput(id);setTimeout(()=>loadById(parseInt(id)),300)}},[])

  async function rf(url:string,n=3):Promise<Response>{
    for(let i=0;i<n;i++){const r=await fetch(url,{cache:'no-store'});if(r.status!==429)return r;if(i<n-1)await wait(900*(i+1))}
    return fetch(url,{cache:'no-store'})
  }

  async function loadById(id:number){
    setErr('');setLoading(true);setSpriteReady(false);setSheetReady(false)
    setTraits([]);setNormName('');setFaceUrl(null);setSavedUrl(null);setFaceGrid(null);setCurrentId(id)
    router.replace(`/engine?id=${id}`,{scroll:false})
    try{
      const mRes=await rf(`https://api.normies.art/normie/${id}/metadata`)
      if(!mRes.ok)throw new Error(`Normie #${id} not found`)
      const mData=await mRes.json()
      const parsed:Trait[]=[]
      if(Array.isArray(mData.attributes))mData.attributes.forEach((a:any)=>{if(a.trait_type&&a.value!=null)parsed.push({key:String(a.trait_type),value:String(a.value)})})
      setTraits(parsed);setNormName(mData.name||`Normie #${id}`)
      const[pixRes,imgRes]=await Promise.all([
        rf(`https://api.normies.art/normie/${id}/pixels`),
        rf(`https://api.normies.art/normie/${id}/image.png`)
      ])
      if(pixRes.ok){const s=await pixRes.text();setFaceGrid(pixelsToGrid(s.trim()))}
      if(imgRes.ok){const b=await imgRes.blob();setFaceUrl(URL.createObjectURL(b))}
      if(!pixRes.ok&&imgRes.ok){
        const b=await imgRes.blob();const u=URL.createObjectURL(b)
        const img=await new Promise<HTMLImageElement>((res,rej)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=rej;i.src=u})
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
    prog(true,'Drawing body…',20);await wait(10)
    ctx.fillStyle=plStr;ctx.fillRect(0,0,120,120)
    drawBody(ctx,buildArch(traits,s),s,pose)
    prog(true,'Compositing face…',55);await wait(8)
    pasteFace(ctx,faceGrid)
    prog(true,'Finalizing…',80);await wait(6)
    snapPal(ctx,contrast)
    prog(true,'Building sheet…',88);await wait(4)
    if(sheetRef.current)await buildSheet(faceGrid,traits,s,contrast,sheetRef.current,wait)
    prog(false,'',100);await wait(4)
    const dc=document.createElement('canvas');dc.width=dc.height=120
    dc.getContext('2d')!.drawImage(wc,0,0)
    displayRef.current=dc
    renderKey.current++
    setSpriteReady(false);await wait(10);setSpriteReady(true)
    setSheetReady(true)
  }

  async function switchPose(p:Pose){
    setActivePose(p)
    if(!faceGrid||!seed)return
    const wc=wcRef.current;if(!wc)return
    const ctx=wc.getContext('2d')!;ctx.imageSmoothingEnabled=false
    ctx.fillStyle=plStr;ctx.fillRect(0,0,120,120)
    drawBody(ctx,buildArch(traits,seed),seed,p)
    pasteFace(ctx,faceGrid)
    snapPal(ctx,contrast)
    const dc=document.createElement('canvas');dc.width=dc.height=120
    dc.getContext('2d')!.drawImage(wc,0,0)
    displayRef.current=dc
    renderKey.current++
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
    out.toBlob(b=>{const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(b!),download:`normie-${currentId}${sheet?'-sheet':`-${activePose}-${size}`}.png`});a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3e3)},'image/png')
  }

  async function saveToGallery(){
    if(!spriteReady)return;setUploading(true)
    try{
      const blob:Blob=await new Promise(res=>wcRef.current!.toBlob(b=>res(b!),'image/png'))
      const form=new FormData()
      form.append('file',blob,`normie-${currentId}.png`)
      form.append('meta',JSON.stringify({id:currentId,name:normName,traits}))
      const data=await(await fetch('/api/upload',{method:'POST',body:form})).json()
      if(data.url)setSavedUrl(data.url);else throw new Error('Upload failed')
    }catch(e){console.error(e)}
    finally{setUploading(false)}
  }

  const g2:React.CSSProperties={display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.3rem',marginBottom:'.45rem'}

  return(
    <div style={{display:'flex',flexDirection:'column',minHeight:'100vh'}}>
      <Nav/>
      <canvas ref={wcRef} width={120} height={120} style={{display:'none'}}/>
      <canvas ref={sheetRef} width={480} height={120} style={{display:'none'}}/>
      <main style={{flex:1}}>
        <div style={{borderBottom:'1px solid var(--line)',padding:'1.3rem 0'}}>
          <div style={{maxWidth:1080,margin:'0 auto',padding:'0 1.25rem'}}>
            <div style={{display:'flex',alignItems:'flex-end',gap:'.5rem',flexWrap:'wrap'}}>
              <div>
                <span style={S.lbl}>Token ID — 0 to 9999</span>
                <input type="number" min={0} max={9999} placeholder="6793" value={tokenInput}
                  onChange={e=>setTokenInput(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&tokenInput&&loadById(parseInt(tokenInput))}
                  inputMode="numeric"
                  style={{background:'transparent',border:'1px solid var(--line)',color:'var(--ink)',fontFamily:'inherit',fontSize:'1.75rem',fontWeight:900,letterSpacing:'-.04em',width:'7.2rem',padding:'.25rem .55rem',outline:'none',appearance:'textfield' as const}}
                />
              </div>
              <button style={{...S.btn,...S.btnFill}} disabled={loading} onClick={()=>tokenInput&&loadById(parseInt(tokenInput))}>{loading?'Loading…':'Load'}</button>
              <button style={S.btn} onClick={()=>{const id=Math.floor(Math.random()*10000);setTokenInput(String(id));loadById(id)}}>Random</button>
            </div>
            {err&&<div style={{marginTop:'.7rem',padding:'.45rem .65rem',border:'1px solid var(--line)',fontSize:'.65rem'}}>⚠ {err}</div>}
          </div>
        </div>

        <div style={{maxWidth:1080,margin:'0 auto',padding:'0 1.25rem'}}>
          <style>{`@media(min-width:700px){.fn-eng-grid{grid-template-columns:1fr 1fr !important}.fn-eng-right{border-left:1px solid var(--line) !important;border-top:none !important;padding-left:1.6rem !important}}`}</style>
          <div className="fn-eng-grid" style={{display:'grid',gridTemplateColumns:'1fr',borderBottom:'1px solid var(--line)'}}>
            <div style={{padding:'1.4rem 0'}}>
              <div style={{fontSize:'.58rem',letterSpacing:'.16em',textTransform:'uppercase',color:'var(--ink-muted)',marginBottom:'1.1rem',display:'flex',alignItems:'center',gap:'.4rem'}}>
                01 — Original Normie<span style={{flex:1,height:1,background:'var(--line-soft)',display:'block',opacity:.5}}/>
              </div>
              <div style={{...S.frame,maxWidth:200}}>
                {faceUrl
                  ?<img src={faceUrl} alt={normName} style={{width:'100%',height:'100%',imageRendering:'pixelated',objectFit:'contain',display:'block'}}/>
                  :<div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'.28rem',color:'#48494b',textAlign:'center'}}>
                    <div style={{fontSize:'1.3rem',opacity:.1}}>◻</div>
                    <div style={{fontSize:'.58rem',letterSpacing:'.1em',textTransform:'uppercase'}}>Load a Normie</div>
                    <div style={{fontSize:'.5rem',opacity:.55}}>0 – 9999</div>
                  </div>
                }
              </div>
              {normName&&<div style={{fontSize:'1.4rem',fontWeight:900,letterSpacing:'-.05em',lineHeight:1,marginBottom:'.9rem'}}>{normName}</div>}
              <span style={S.lbl}>Traits</span>
              <div style={{display:'grid',gridTemplateColumns:'auto 1fr'}}>
                {traits.length===0
                  ?<div style={{gridColumn:'span 2',fontSize:'.65rem',color:'var(--ink-muted)',padding:'.3rem 0'}}>No traits loaded.</div>
                  :traits.map((t,i)=>[
                    <div key={i+'k'} style={{padding:'.24rem .75rem .24rem 0',fontSize:'.55rem',letterSpacing:'.07em',textTransform:'uppercase',color:'var(--ink-muted)',borderBottom:'1px solid var(--line-soft)',whiteSpace:'nowrap'}}>{t.key}</div>,
                    <div key={i+'v'} style={{padding:'.24rem 0',fontSize:'.72rem',fontWeight:700,letterSpacing:'-.01em',borderBottom:'1px solid var(--line-soft)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={t.value}>{t.value}</div>
                  ])
                }
              </div>
              {faceUrl&&<><hr style={{border:'none',borderTop:'1px solid var(--line-soft)',margin:'.9rem 0'}}/><button style={S.btn} onClick={()=>{const a=Object.assign(document.createElement('a'),{href:faceUrl!,download:`normie-${currentId}-face.png`});a.click()}}>↓ Download Face PNG</button></>}
            </div>

            <div className="fn-eng-right" style={{padding:'1.4rem 0',borderTop:'1px solid var(--line)'}}>
              <div style={{fontSize:'.58rem',letterSpacing:'.16em',textTransform:'uppercase',color:'var(--ink-muted)',marginBottom:'1.1rem',display:'flex',alignItems:'center',gap:'.4rem'}}>
                02 — Full Body Sprite Engine<span style={{flex:1,height:1,background:'var(--line-soft)',display:'block',opacity:.5}}/>
              </div>
              <div style={{...S.frame,maxWidth:200}}>
                {spriteReady&&displayRef.current
                  ?<canvas key={renderKey.current}
                      ref={el=>{if(el&&displayRef.current){el.width=el.height=120;el.getContext('2d')!.drawImage(displayRef.current,0,0)}}}
                      width={120} height={120} style={{width:'100%',height:'100%',imageRendering:'pixelated',display:'block'}}
                    />
                  :<div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'.28rem',color:'#48494b',textAlign:'center'}}>
                    <div style={{fontSize:'1.3rem',opacity:.1}}>▦</div>
                    <div style={{fontSize:'.58rem',letterSpacing:'.1em',textTransform:'uppercase'}}>120×120 Sprite</div>
                    <div style={{fontSize:'.5rem',opacity:.55}}>load a normie to generate</div>
                  </div>
                }
              </div>
              {spriteReady&&<>
                <span style={S.lbl}>Pose</span>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'.3rem',marginBottom:'.7rem'}}>
                  {POSES.map((p,i)=>(<button key={p} style={{...S.btn,...(activePose===p?S.btnFill:{})}} onClick={()=>switchPose(p)}>{POSE_LABELS[i]}</button>))}
                </div>
              </>}
              {showProg&&<div style={{marginBottom:'.7rem'}}>
                <div style={{fontSize:'.55rem',letterSpacing:'.1em',textTransform:'uppercase',color:'var(--ink-muted)',marginBottom:'.28rem'}}>{progLabel}</div>
                <div style={{height:2,background:'var(--line-soft)'}}><div style={{height:2,background:'var(--ink)',width:`${progPct}%`,transition:'width .28s ease'}}/></div>
              </div>}
              <button style={{...S.btn,...S.btnFill,width:'100%',marginBottom:'.45rem'}} disabled={!faceGrid} onClick={()=>generate(false)}>▶ Generate Full Body Sprite</button>
              {spriteReady&&<div style={g2}>
                <button style={S.btn} onClick={()=>generate(false)}>↺ Regenerate</button>
                <button style={S.btn} onClick={()=>generate(true)}>⚂ New Seed</button>
                <button style={S.btn} onClick={()=>{setContrast(cc=>Math.min(3,cc+1));generate(false)}}>+ Contrast</button>
                <button style={S.btn} onClick={()=>{setContrast(cc=>Math.max(-3,cc-1));generate(false)}}>− Contrast</button>
              </div>}
              <hr style={{border:'none',borderTop:'1px solid var(--line-soft)',margin:'.9rem 0'}}/>
              <span style={S.lbl}>Download</span>
              {spriteReady
                ?<div style={{...g2,marginTop:'.4rem'}}>
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
                    {shareOpen&&<div style={{position:'absolute',bottom:'calc(100% + 4px)',left:0,right:0,background:'var(--bg-raise)',border:'1px solid var(--line)',zIndex:10}}>
                      <button style={{...S.btn,width:'100%',borderWidth:0,borderBottom:'1px solid var(--line-soft)'}} onClick={()=>{window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(`Just generated Normie #${currentId} as a full-body pixel art sprite!\nhttps://fully-normies.vercel.app/engine?id=${currentId}`)}`,'_blank');setShareOpen(false)}}>
                        X / Twitter
                      </button>
                      <button style={{...S.btn,width:'100%',borderWidth:0}} onClick={async()=>{if(navigator.share&&wcRef.current)wcRef.current.toBlob(async b=>{if(!b)return;try{await navigator.share({title:`Normie #${currentId}`,files:[new File([b],'sprite.png',{type:'image/png'})]})}catch{}});setShareOpen(false)}}>
                        Share Image
                      </button>
                    </div>}
                  </div>
                </div>
                :<div style={{fontSize:'.65rem',color:'var(--ink-muted)'}}>Generate a sprite to unlock downloads.</div>
              }
              {savedUrl&&<div style={{marginTop:'.5rem',fontSize:'.62rem',color:'var(--ink-muted)'}}>Saved! <a href="/gallery" style={{color:'var(--ink)',textDecoration:'underline'}}>View Gallery</a></div>}
              {sheetReady&&<>
                <hr style={{border:'none',borderTop:'1px solid var(--line-soft)',margin:'.9rem 0'}}/>
                <span style={S.lbl}>Sprite Sheet Preview</span>
                <div style={{background:'#e3e5e4',border:'1px solid var(--line)',padding:4,display:'inline-block',marginBottom:'.4rem'}}>
                  <canvas ref={el=>{if(el&&sheetRef.current){el.width=240;el.height=60;const cx=el.getContext('2d')!;cx.imageSmoothingEnabled=false;cx.drawImage(sheetRef.current,0,0,240,60)}}} width={240} height={60} style={{display:'block',imageRendering:'pixelated'}}/>
                </div>
                <div style={{display:'flex'}}>{POSE_LABELS.map((l,i)=><span key={i} style={{fontSize:'.5rem',letterSpacing:'.08em',textTransform:'uppercase',color:'var(--ink-muted)',width:60,textAlign:'center',display:'inline-block'}}>{l}</span>)}</div>
              </>}
            </div>
          </div>
        </div>
      </main>
      <Footer/>
    </div>
  )
}

export default function EnginePage(){return<Suspense><EngineInner/></Suspense>}
