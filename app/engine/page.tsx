'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Nav from '../components/Nav'
import Footer from '../components/Footer'
import { Suspense } from 'react'

// -------------------------------------------------------------------------------
//  FULLNORMIES SPRITE ENGINE v9  - Pure Canvas Edition
//
//  How it works:
//    1. Fetch 1600-char pixel string from api.normies.art/normie/:id/pixels
//    2. Extract the real Normie head (rows 0-27 of the 40x40 bitmap)
//    3. Procedurally draw a full body below:  torso → arms → hands → legs → feet
//       All body parts reference traits (type, gender, age, accessory) for shape
//    4. Compose into 40x72 canvas (head 28px tall + body 44px tall)
//    5. Generate 4 pose variants by translating/rotating limbs
//    6. Upscale to crisp display (4x = 160x288) with nearest-neighbor
//
//  Palette: PL=#e3e5e4  PD=#48494b  (exact Normies on-chain colors)
//  Zero AI, zero API keys, infinite free runs.
// -------------------------------------------------------------------------------

// -- Palette -----------------------------------------------------------------
const PL: [number,number,number] = [0xe3,0xe5,0xe4]  // light gray
const PD: [number,number,number] = [0x48,0x49,0x4b]  // dark charcoal

// Native sprite dimensions
const SW  = 40  // sprite width (matches Normie head width)
const SH  = 72  // sprite height (28 head + 44 body)
const HR  = 28  // head rows — consistent face cutoff across all Normies
const SCL = 5   // display upscale (40x72 -> 200x360)

type Pose = 'idle' | 'walk' | 'jump' | 'crouch'
const POSES: Pose[] = ['idle', 'walk', 'jump', 'crouch']
const POSE_LABEL: Record<Pose,string> = { idle:'Idle', walk:'Walk', jump:'Jump', crouch:'Crouch' }

interface TraitAttr { trait_type: string; value: string }
interface TraitsData { attributes: TraitAttr[] }

function tv(traits: TraitsData | null, key: string): string {
  if (!traits) return ''
  const attr = traits.attributes.find(a => a.trait_type.toLowerCase() === key.toLowerCase())
  return (attr?.value ?? '').toLowerCase()
}

// -- Canvas pixel helpers -----------------------------------------------------
function createSprite(): { canvas: HTMLCanvasElement; px: (x:number,y:number,d:boolean)=>void; flush:()=>void } {
  const canvas = document.createElement('canvas')
  canvas.width = SW; canvas.height = SH
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = `rgb(${PL[0]},${PL[1]},${PL[2]})`
  ctx.fillRect(0, 0, SW, SH)
  const imgData = ctx.getImageData(0, 0, SW, SH)
  const px = (x: number, y: number, dark: boolean) => {
    if (x < 0 || x >= SW || y < 0 || y >= SH) return
    const i = (y * SW + x) * 4
    const c = dark ? PD : PL
    imgData.data[i]=c[0]; imgData.data[i+1]=c[1]; imgData.data[i+2]=c[2]; imgData.data[i+3]=255
  }
  const flush = () => ctx.putImageData(imgData, 0, 0)
  return { canvas, px, flush }
}

// Fill a solid rect of pixels
function rect(set:(x:number,y:number,d:boolean)=>void, x:number,y:number,w:number,h:number,dark:boolean) {
  for (let dy=0;dy<h;dy++) for (let dx=0;dx<w;dx++) set(x+dx,y+dy,dark)
}

// =============================================================================
//  Body layout constants (all in native sprite pixels)
// =============================================================================
const TORSO_X  = 14   // left edge of 12px torso (centered in 40px)
const TORSO_W  = 12
const TORSO_Y  = HR   // 28 -- right below head
const TORSO_H  = 20   // rows 28-47 in idle
const ARM_H    = 9    // arm segment length in pixels
const LEG_W    = 4
const FOOT_W   = 6
const FOOT_H   = 3
const NORMAL_LEG_H = 14

// Pose configuration: offsets that animate the limbs
interface PoseCfg {
  torsoSquash: number   // reduce torso height (pixels)
  lArmDx: number        // left arm tip x offset
  lArmDy: number        // left arm tip y offset
  rArmDx: number
  rArmDy: number
  lLegDx: number        // left leg foot x drift
  rLegDx: number
  legH:   number
}

// Reference poses — used for the 4 display cards
const POSE_CFG: Record<Pose, PoseCfg> = {
  idle:   { torsoSquash:0, lArmDx:-1, lArmDy:2,  rArmDx:1,  rArmDy:2,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H },
  walk:   { torsoSquash:0, lArmDx:-6, lArmDy:-3, rArmDx:4,  rArmDy:-1, lLegDx:-5, rLegDx: 3, legH:NORMAL_LEG_H },
  jump:   { torsoSquash:0, lArmDx:-2, lArmDy:-8, rArmDx:2,  rArmDy:-8, lLegDx:-2, rLegDx: 2, legH:7 },
  crouch: { torsoSquash:1, lArmDx:-5, lArmDy:5,  rArmDx:5,  rArmDy:5,  lLegDx:-5, rLegDx: 5, legH:8 },
}

// Full animation clips — 4 clips × 4 keyframes = 16 frames in the downloadable sheet
// Row 0: Idle  Row 1: Walk  Row 2: Jump  Row 3: Crouch
const ANIM_CLIPS: { label: string; frames: PoseCfg[] }[] = [
  { label: 'Idle', frames: [
    { torsoSquash:0, lArmDx:-1, lArmDy:2,  rArmDx:1,  rArmDy:2,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H },
    { torsoSquash:0, lArmDx:-1, lArmDy:3,  rArmDx:1,  rArmDy:3,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H },
    { torsoSquash:0, lArmDx:-1, lArmDy:2,  rArmDx:1,  rArmDy:2,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H },
    { torsoSquash:0, lArmDx:-1, lArmDy:3,  rArmDx:1,  rArmDy:3,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H },
  ]},
  { label: 'Walk', frames: [
    { torsoSquash:0, lArmDx:-6, lArmDy:-3, rArmDx:4,  rArmDy:-1, lLegDx:-5, rLegDx: 3, legH:NORMAL_LEG_H },
    { torsoSquash:0, lArmDx:-2, lArmDy: 1, rArmDx:1,  rArmDy: 1, lLegDx:-1, rLegDx: 1, legH:NORMAL_LEG_H },
    { torsoSquash:0, lArmDx: 4, lArmDy:-1, rArmDx:-6, rArmDy:-3, lLegDx: 3, rLegDx:-5, legH:NORMAL_LEG_H },
    { torsoSquash:0, lArmDx: 1, lArmDy: 1, rArmDx:-2, rArmDy: 1, lLegDx: 1, rLegDx:-1, legH:NORMAL_LEG_H },
  ]},
  { label: 'Jump', frames: [
    { torsoSquash:1, lArmDx:-3, lArmDy: 3, rArmDx:3,  rArmDy: 3, lLegDx:-3, rLegDx: 3, legH:9  },
    { torsoSquash:0, lArmDx:-4, lArmDy:-5, rArmDx:4,  rArmDy:-5, lLegDx:-1, rLegDx: 1, legH:11 },
    { torsoSquash:0, lArmDx:-2, lArmDy:-8, rArmDx:2,  rArmDy:-8, lLegDx:-2, rLegDx: 2, legH:7  },
    { torsoSquash:1, lArmDx:-3, lArmDy: 2, rArmDx:3,  rArmDy: 2, lLegDx:-4, rLegDx: 4, legH:9  },
  ]},
  { label: 'Crouch', frames: [
    { torsoSquash:0, lArmDx:-3, lArmDy: 3, rArmDx:3,  rArmDy: 3, lLegDx:-3, rLegDx: 3, legH:10 },
    { torsoSquash:1, lArmDx:-5, lArmDy: 5, rArmDx:5,  rArmDy: 5, lLegDx:-5, rLegDx: 5, legH:8  },
    { torsoSquash:1, lArmDx:-5, lArmDy: 5, rArmDx:5,  rArmDy: 5, lLegDx:-5, rLegDx: 5, legH:8  },
    { torsoSquash:0, lArmDx:-3, lArmDy: 3, rArmDx:3,  rArmDy: 3, lLegDx:-3, rLegDx: 3, legH:10 },
  ]},
]

// Hash all trait strings together for a richer, more unique seed per normie.
// Using all 8 trait fields gives ~4x more spread than token ID alone.
function traitHash(id: number | null, traits: TraitsData): number {
  let h = (id ?? 0) * 2654435761
  for (const a of (traits?.attributes ?? [])) {
    for (let i = 0; i < a.value.length; i++) {
      h = Math.imul(h ^ a.value.charCodeAt(i), 0x9e3779b9)
      h ^= h >>> 16
    }
  }
  return Math.abs(h)
}

// =============================================================================
//  drawNormie: compose head pixels + procedural body into a SW x SH sprite
// =============================================================================
function drawNormie(pixels: string, traits: TraitsData, poseOrCfg: Pose | PoseCfg, tokenId: number | null = null): HTMLCanvasElement {
  const { canvas, px, flush } = createSprite()
  const set = px
  const cfg  = typeof poseOrCfg === 'string' ? POSE_CFG[poseOrCfg] : poseOrCfg

  // Rich seed from ALL traits: gives each normie a genuinely unique body
  const seed = traitHash(tokenId, traits)
  // Pull independent sub-seeds so clothing choices don't correlate
  const s0 = seed             & 0xff  // shirt style
  const s1 = (seed >>  8)     & 0xff  // pants style
  const s2 = (seed >> 16)     & 0xff  // build
  const s3 = (seed >> 24)     & 0xff  // shoe style
  const s4 = Math.abs(Math.imul(seed, 0x45d9f3b)) & 0xff  // collar

  const normType  = tv(traits, 'type')
  const age       = tv(traits, 'age')
  const gender    = tv(traits, 'gender')
  const facial    = tv(traits, 'facial feature')
  const hair      = tv(traits, 'hair style')
  const eyes      = tv(traits, 'eyes')
  const expr      = tv(traits, 'expression')

  const isAgent  = normType === 'agent'
  const isCat    = normType === 'cat'
  const isAlien  = normType === 'alien'
  const isZombie = normType === 'zombie'
  const isOld    = age.includes('old')
  const isYoung  = age.includes('young')
  const isFemale = gender.includes('female')
  const hasBeard = facial.includes('beard') || facial.includes('mustache') || facial.includes('goatee')
  const isSpiky  = hair.includes('spiky') || hair.includes('mohawk')
  const hasMask  = eyes.includes('sunglasses') || eyes.includes('glasses')
  const isAngry  = expr.includes('angry') || expr.includes('serious')
  const cx       = Math.floor(SW / 2)  // 20

  // ── Body proportions ───────────────────────────────────────────────────
  const buildLvl = s2 % 3  // 0=slim  1=medium  2=stocky
  // Female 8-10px, male 12-14px — clear separation so males read as broad
  const baseTW = isAlien ? 8 : isFemale ? 8 : isYoung ? 10 : isOld ? 12 : isCat ? 11 : 12
  const tW     = baseTW + buildLvl
  // Shoulder adds a flat 4px for non-female — proportionate, not padded
  const shW    = tW + (isFemale || isAlien ? 2 : 4)
  const tX     = cx - Math.floor(tW  / 2)
  const shX    = cx - Math.floor(shW / 2)

  // ── HEAD (rows 0-27) ──────────────────────────────────────────────────────
  for (let r = 0; r < HR; r++)
    for (let c = 0; c < SW; c++)
      if (pixels[r * SW + c] === '1') set(c, r, true)

  // ── SHOULDER TAPER (rows 28-30): 4-row lerp shoulder→torso ───────────────
  // Gives a natural trapezoid silhouette instead of a rectangle
  for (let si = 0; si < 4; si++) {
    const t  = si / 3
    const w  = Math.round(shW * (1 - t) + tW * t)
    const x0 = cx - Math.floor(w / 2)
    for (let x = x0; x < x0 + w; x++) set(x, HR + si, true)
  }

  // ── TORSO: waist-pinched silhouette ───────────────────────────────────────
  const tY = HR + 4
  const tH = 15 - cfg.torsoSquash

  for (let y = 0; y < tH; y++) {
    // Only females get a waist pinch — males stay rectangular (masculine silhouette)
    const inset = (isFemale && y >= 3 && y <= 7) ? 1 : 0
    for (let x = tX + inset; x < tX + tW - inset; x++) set(x, tY + y, true)
  }

  // ── CLOTHING ──────────────────────────────────────────────────────────────
  // shirt type: 0=plain-collar  1=stripes  2=hoodie  3=vest/jacket  4=agent-suit  5=torn(zombie)
  const rawShirt = isAgent ? 4 : isZombie ? 5 : isCat ? (s0 % 3) : (s0 % 4)
  const shirtType = rawShirt

  if (shirtType === 4) {
    // Agent suit — white shirt placket + tie + lapel diagonals
    for (let y = tY; y < tY + tH - 1; y++) { set(cx-1, y, false); set(cx, y, false) }
    set(cx-1, tY, true); set(cx, tY, true)                         // tie knot
    for (let y = tY+2; y < tY+tH-1; y += 2) set(cx-1, y, true)   // tie body
    // Lapels: diagonal from collar to row+3
    for (let d = 1; d <= 4; d++) {
      set(Math.max(tX, tX+d-1), tY+d, false)
      set(Math.min(tX+tW-1, tX+tW-d), tY+d, false)
    }
  } else if (shirtType === 5) {
    // Zombie torn — collar slit + ragged holes at irregular intervals
    set(cx-1, tY, false); set(cx, tY, false)
    const holes = [2, 5, 9, 12]
    for (const hy of holes) if (hy < tH - 1) {
      set(tX+1, tY+hy, false); set(tX+2, tY+hy, false)
      set(tX+tW-2, tY+hy, false)
    }
    if (isCat) for (let y = tY+1; y < tY+tH-2; y++) set(cx, y, false)
  } else if (shirtType === 2) {
    // Hoodie — wide scoop collar + kangaroo pocket outline
    for (let x = cx-3; x <= cx+2; x++) set(x, tY, false)
    set(cx-2, tY+1, false); set(cx+1, tY+1, false)
    const pY = tY + 7
    if (pY + 3 < tY + tH - 1) {
      for (let x = tX+2; x < tX+tW-2; x++) set(x, pY, false)
      for (let y = pY+1; y < pY+3; y++) { set(tX+2, y, false); set(tX+tW-3, y, false) }
    }
    if (isCat) set(cx, tY+4, false)
  } else if (shirtType === 3) {
    // Jacket — V open collar + two diagonal lapels + 2 buttons
    set(cx-1, tY, false); set(cx, tY, false)
    for (let d = 1; d <= 4; d++) {
      set(tX + d, tY + d, false)
      set(tX + tW - 1 - d, tY + d, false)
    }
    set(cx, tY + 8,  false)
    set(cx, tY + 11, false)
    if (isCat) for (let y = tY+5; y < tY+tH-2; y++) set(cx, y, false)
  } else if (shirtType === 1) {
    // Striped shirt — V collar + 2 clean stripes (tighter margin, less cluttered)
    set(cx-1, tY, false); set(cx, tY, false)
    for (let x = tX+2; x < tX+tW-2; x++) {
      if (tY+4 < tY+tH-2) set(x, tY+4, false)
      if (tY+9 < tY+tH-2) set(x, tY+9, false)
    }
    if (isCat) for (let y = tY; y < tY+tH-2; y++) set(cx, y, false)
  } else {
    // Plain shirt — V collar notch. Angry/muscular normies get a tighter V.
    const vDepth = isAngry ? 2 : 1
    for (let d = 0; d < vDepth; d++) {
      set(cx-1-d, tY+d, false); set(cx+d, tY+d, false)
    }
    // Subtle crease line at chest
    if (tH > 10) for (let x = tX+2; x < tX+tW-2; x++) set(x, tY+6, false)
    if (isCat) for (let y = tY; y < tY+tH-2; y++) set(cx, y, false)
  }

  // Belt — 1px taller than torso base, with buckle gap
  for (let x = tX-1; x <= tX+tW; x++) set(x, tY+tH-1, true)
  set(cx-1, tY+tH-1, false); set(cx, tY+tH-1, false)

  // ── ARMS ─────────────────────────────────────────────────────────────────
  // Upper arm = armW px, forearm tapers to armW-1 px for natural silhouette.
  // Old normies are slightly stockier; young are slimmer.
  const armW  = isYoung ? 2 : isOld ? 3 : buildLvl === 2 ? 4 : 3
  const armH  = isYoung ? 10 : isOld ? 11 : 12
  const handW = armW + 1   // hand slightly wider than arm
  const handH = 3
  // Attach at outermost shoulder pixel
  const lArmX = shX
  const rArmX = shX + shW - armW
  const armY0 = HR   // arms start at the widest row of the shoulder taper

  function fillArm(rootX: number, dx: number, dy: number) {
    for (let s = 0; s < armH; s++) {
      const t  = s / (armH - 1)
      const ax = rootX + Math.round(dx * t)
      const ay = armY0 + s + Math.round(dy * t)
      // Taper forearm: lower half loses 1px width
      const aw = (armW >= 3 && s >= Math.floor(armH * 0.55)) ? armW - 1 : armW
      for (let w = 0; w < aw; w++) set(ax + w, ay, true)
    }
    // Hand block
    const hx = rootX + Math.round(dx)
    const hy = armY0 + armH + Math.round(dy)
    for (let hy2 = 0; hy2 < handH; hy2++)
      for (let hx2 = 0; hx2 < handW; hx2++) set(hx + hx2, hy + hy2, true)
  }

  fillArm(lArmX, cfg.lArmDx, cfg.lArmDy)
  fillArm(rArmX, cfg.rArmDx, cfg.rArmDy)

  // ── HIP LINE ──────────────────────────────────────────────────────────────
  const hipY = tY + tH
  for (let x = tX-1; x <= tX+tW; x++) set(x, hipY, true)

  // ── LEGS ─────────────────────────────────────────────────────────────────
  // 3 pants styles: 0=straight(4px), 1=slim(3px), 2=wide(5px)
  // Centered with 2px gap between legs — prevents merge at the crotch
  const pStyle = s1 % 3
  const legW   = [4, 3, 5][pStyle]
  const legGap = 2
  const lLegX  = cx - Math.floor((legW * 2 + legGap) / 2)
  const rLegX  = lLegX + legW + legGap
  const legY0  = hipY + 1

  // Pants detail: seam (1=light center line) or cargo (2=side pocket row)
  const pantsDetail = s1 % 4  // 0=plain 1=center-seam 2=side-pocket 3=cuffed

  function fillLeg(baseX: number, drift: number, lh: number) {
    for (let s = 0; s < lh; s++) {
      const lx = Math.round(baseX + drift * s / Math.max(lh - 1, 1))
      // Thigh full width → shin -1px taper at row 6+
      const lw = (legW >= 4 && s >= 6) ? legW - 1 : legW
      for (let w = 0; w < lw; w++) set(lx + w, legY0 + s, true)
      if (pantsDetail === 1 && lw >= 3) set(lx + Math.floor(lw/2), legY0+s, false)
      if (pantsDetail === 2 && s >= 1 && s <= 4)  set(lx + lw - 1, legY0+s, false)
      if (pantsDetail === 3 && s === lh - 1) for (let x = lx; x < lx+lw+1; x++) set(x, legY0+s, true)
    }
    // Ankle: 3px nub
    const ankX = Math.round(baseX + drift)
    const ankY = legY0 + lh
    set(ankX, ankY, true); set(ankX+1, ankY, true); set(ankX+2, ankY, true)
    // Shoe: 6px wide × 3px tall, toe corner cut
    // s3 gives subtle shoe variation: 0=rounded 1=pointed toe 2=chunky
    const shoeW = s3 % 3 === 2 ? 7 : 6
    const sX = ankX - 1; const sY = ankY + 1
    for (let r = 0; r < 3; r++) for (let c = 0; c < shoeW; c++) set(sX+c, sY+r, true)
    // Toe highlight: rounded look
    set(sX+1, sY, false); set(sX+2, sY, false)
    // Pointed toe: restore extra pixel on far end
    if (s3 % 3 === 1) { set(sX+shoeW-1, sY, false); set(sX+shoeW-1, sY+1, false) }
    // Heel notch for natural profile
    set(sX, sY, false)
  }

  fillLeg(lLegX, cfg.lLegDx, cfg.legH)
  fillLeg(rLegX, cfg.rLegDx, cfg.legH)

  flush()
  return canvas
}

// -- Upscale a native sprite canvas to display size -------------------------
function upscale(src: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width  = src.width  * scale
  out.height = src.height * scale
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(src, 0, 0, out.width, out.height)
  return out
}

// -- Build full 16-frame animation sheet — 4 clips × 4 keyframes ───────────────
// Row 0: Idle  Row 1: Walk  Row 2: Jump  Row 3: Crouch
function makeAnimSheet(pix: string, traits: TraitsData, tokenId: number | null, scale = 1): HTMLCanvasElement {
  const cols = 4, rows = ANIM_CLIPS.length
  const fw = SW * scale, fh = SH * scale, gap = scale
  const sheet = document.createElement('canvas')
  sheet.width  = fw * cols + gap * (cols - 1)
  sheet.height = fh * rows + gap * (rows - 1)
  const ctx = sheet.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ANIM_CLIPS.forEach((clip, row) => {
    clip.frames.forEach((cfg, col) => {
      ctx.drawImage(upscale(drawNormie(pix, traits, cfg, tokenId), scale), col * (fw + gap), row * (fh + gap))
    })
  })
  return sheet
}

// -- Download a canvas as PNG ------------------------------------------------
function dlCanvas(src: HTMLCanvasElement, filename: string, scale = 1) {
  const out = document.createElement('canvas')
  out.width  = src.width  * scale
  out.height = src.height * scale
  const ctx  = out.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(src, 0, 0, out.width, out.height)
  out.toBlob(b => {
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(b!), download: filename,
    })
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000)
  }, 'image/png')
}

// -- Style tokens ------------------------------------------------------------
const S = {
  btn: {
    background:'transparent', border:'1px solid var(--line)', color:'var(--ink)',
    fontFamily:'inherit', fontSize:'.6rem', fontWeight:700, letterSpacing:'.1em',
    textTransform:'uppercase' as const, padding:'.44rem .84rem', cursor:'pointer',
    display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'.3rem',
    userSelect:'none' as const, WebkitTapHighlightColor:'transparent',
  } as React.CSSProperties,
  fill: { background:'var(--ink)', color:'var(--bg)', borderColor:'var(--ink)' } as React.CSSProperties,
  dis:  { opacity:0.38, cursor:'not-allowed' as const, pointerEvents:'none' as const } as React.CSSProperties,
  lbl:  {
    fontSize:'.6rem', letterSpacing:'.13em', textTransform:'uppercase' as const,
    color:'var(--ink-muted)', display:'block', marginBottom:'.3rem',
  } as React.CSSProperties,
}

// -- Pose card ----------------------------------------------------------------
function PoseCard({ pose, canvas, active, onClick }: {
  pose: Pose; canvas: HTMLCanvasElement | null; active: boolean; onClick: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !canvas) return
    el.width  = canvas.width
    el.height = canvas.height
    const ctx = el.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(canvas, 0, 0)
  }, [canvas])

  const w = SW * SCL
  const h = SH * SCL

  return (
    <button
      onClick={onClick}
      style={{
        ...S.btn,
        flexDirection:'column', padding:0, overflow:'hidden',
        border: active ? '2px solid var(--ink)' : '1px solid var(--line)',
        background: active ? 'var(--ink)' : 'transparent',
      }}
    >
      <div style={{ width:'100%', background:'#e3e5e4', aspectRatio: `${w}/${h}` }}>
        {canvas ? (
          <canvas
            ref={ref}
            width={w} height={h}
            style={{ width:'100%', height:'100%', imageRendering:'pixelated', display:'block' }}
          />
        ) : (
          <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', opacity:.18 }}>
            <span style={{ fontSize:'1.5rem' }}>?</span>
          </div>
        )}
      </div>
      <span style={{
        fontSize:'.48rem', letterSpacing:'.1em', padding:'.28rem', display:'block',
        width:'100%', textAlign:'center', color: active ? 'var(--bg)' : 'var(--ink)',
      }}>
        {POSE_LABEL[pose]}
      </span>
    </button>
  )
}

// ----------------------------------------------------------------------------
//  MAIN PAGE
// ----------------------------------------------------------------------------
function EngineInner() {
  const params = useSearchParams()
  const router = useRouter()

  const [tokenInput, setTokenInput] = useState('')
  const [loadState,  setLoadState]  = useState<'idle'|'loading'|'done'|'error'>('idle')
  const [loadErr,    setLoadErr]    = useState('')
  const [currentId,  setCurrentId]  = useState<number|null>(null)
  const [normName,   setNormName]   = useState('')
  const [normTraits, setNormTraits] = useState<TraitsData|null>(null)

  // Raw pixel string (1600 chars) from API
  const [pixels,    setPixels]   = useState<string|null>(null)

  // Generated canvases per pose (already upscaled)
  const [frames,    setFrames]   = useState<Record<Pose, HTMLCanvasElement|null>>({
    idle:null, walk:null, jump:null, crouch:null,
  })
  const [sheet,     setSheet]    = useState<HTMLCanvasElement|null>(null)
  const [activePose, setActivePose] = useState<Pose>('idle')

  const [uploading, setUploading] = useState(false)
  const [savedUrl,  setSavedUrl]  = useState<string|null>(null)
  const [dlOpen,    setDlOpen]    = useState(false)

  const hasFrames = POSES.some(p => frames[p])

  // Auto-load from URL
  useEffect(() => {
    const id = params.get('id')
    if (id) { setTokenInput(id); setTimeout(() => loadById(parseInt(id)), 100) }
  }, [])

  // -- Load a Normie ---------------------------------------------------------
  async function loadById(id: number) {
    if (isNaN(id) || id < 0 || id > 9999) return
    setLoadState('loading'); setLoadErr('')
    setNormName(''); setNormTraits(null); setPixels(null)
    setSavedUrl(null); setCurrentId(id)
    setFrames({ idle:null, walk:null, jump:null, crouch:null }); setSheet(null)
    router.replace(`/engine?id=${id}`, { scroll:false })

    try {
      const res  = await fetch('/api/generate', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ normieId: id }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to load')

      const td: TraitsData = data.traits
      setNormTraits(td)
      setNormName(`Normie #${id}`)
      setPixels(data.pixels)
      setLoadState('done')

      // Auto-generate all poses once loaded
      generateAll(data.pixels, td, id)
    } catch(e) {
      setLoadErr(e instanceof Error ? e.message : 'Failed to load')
      setLoadState('error')
    }
  }

  // -- Generate 4 reference pose cards + full 16-frame animation sheet -------
  const generateAll = useCallback((pix: string, td: TraitsData, id: number | null) => {
    const newFrames: Record<Pose, HTMLCanvasElement|null> = {
      idle:null, walk:null, jump:null, crouch:null,
    }
    POSES.forEach(pose => {
      const native = drawNormie(pix, td, pose, id)
      newFrames[pose] = upscale(native, SCL)
    })
    setFrames({ ...newFrames })
    setSheet(makeAnimSheet(pix, td, id, SCL))
  }, [])

  // -- Download helpers ------------------------------------------------------
  // dlFrame downloads the active pose at chosen scale/format
  function dlFrame(pose: Pose, scale: number, transparent = false, fmt: 'png'|'gif' = 'png') {
    const c = frames[pose]; if (!c) return
    // c is at SCL (5x). scale=1 means native (40x72), scale=2 means 80x144, etc.
    const native = upscale(c, 1 / SCL)  // can't downscale canvas easily, re-draw
    const out = document.createElement('canvas')
    out.width  = SW * scale
    out.height = SH * scale
    const ctx  = out.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    if (!transparent) { ctx.fillStyle = `rgb(${PL[0]},${PL[1]},${PL[2]})`; ctx.fillRect(0,0,out.width,out.height) }
    ctx.drawImage(c, 0, 0, out.width, out.height)
    out.toBlob(b => {
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(b!),
        download: `normie-${currentId}-${pose}${transparent?'-transparent':''}-${out.width}x${out.height}.png`,
      })
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000)
    }, 'image/png')
  }

  // dlSheet — 16-frame animation sheet (4 clips × 4 keyframes), generated on-the-fly
  function dlSheet(scale: number, transparent = false) {
    if (!pixels || !normTraits) return
    const cols = 4, rows = ANIM_CLIPS.length
    const fw = SW * scale, fh = SH * scale, gap = Math.max(1, scale)
    const out = document.createElement('canvas')
    out.width  = fw * cols + gap * (cols - 1)
    out.height = fh * rows + gap * (rows - 1)
    const ctx  = out.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    if (!transparent) { ctx.fillStyle = `rgb(${PL[0]},${PL[1]},${PL[2]})`; ctx.fillRect(0,0,out.width,out.height) }
    ANIM_CLIPS.forEach((clip, row) => {
      clip.frames.forEach((cfg, col) => {
        ctx.drawImage(upscale(drawNormie(pixels, normTraits!, cfg, currentId), scale), col*(fw+gap), row*(fh+gap))
      })
    })
    out.toBlob(b => {
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(b!),
        download: `normie-${currentId}-anim-${fw}x${fh}-16f${transparent?'-t':''}.png`,
      })
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000)
    }, 'image/png')
  }

  async function saveToGallery() {
    const c = frames[activePose]; if (!c || uploading) return
    setUploading(true)
    try {
      const blob: Blob = await new Promise(res => c.toBlob(b => res(b!), 'image/png'))
      const traitList = normTraits?.attributes.map(a => ({ key:a.trait_type, value:a.value })) ?? []
      const form = new FormData()
      form.append('file', blob, `normie-${currentId}-${activePose}.png`)
      form.append('meta', JSON.stringify({ id:currentId, name:normName, traits:traitList, pose:activePose }))
      const data = await (await fetch('/api/upload', { method:'POST', body:form })).json()
      if (data.url) setSavedUrl(data.url); else throw new Error()
    } catch { /* silent */ } finally { setUploading(false) }
  }

  function shareSprite() {
    const url  = `https://fully-normies.vercel.app/engine?id=${currentId}`
    const text = currentId != null
      ? `Just generated Normie #${currentId} as a full body pixel art sprite with 8 animation frames! 🕹️\n`
      : `Check out FullNormies — pixel art sprite generator for Normies NFTs! 🕹️\n`
    window.open(
      `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      '_blank', 'noopener,noreferrer'
    )
  }

  const traitList = normTraits?.attributes.filter(a => !['Level','Pixel Count','Action Points','Customized'].includes(a.trait_type)) ?? []

  // Download dropdown options
  const dlOptions = hasFrames ? [
    { label: `Frame: ${SW}×${SH}px native`,             action: () => dlFrame(activePose, 1) },
    { label: `Frame: ${SW*2}×${SH*2}px`,                action: () => dlFrame(activePose, 2) },
    { label: `Frame: ${SW*4}×${SH*4}px`,                action: () => dlFrame(activePose, 4) },
    { label: `Frame: ${SW*4}×${SH*4}px transparent`,    action: () => dlFrame(activePose, 4, true) },
    { label: `Sheet: ${SW}px · 4×4 · 16 frames · native`, action: () => dlSheet(1) },
    { label: `Sheet: ${SW*2}px · 4×4 · 16 frames`,       action: () => dlSheet(2) },
    { label: `Sheet: ${SW*4}px · 4×4 · 16 frames`,       action: () => dlSheet(4) },
    { label: `Sheet: ${SW*4}px · transparent`,           action: () => dlSheet(4, true) },
  ] : []

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh' }}>
      <Nav />
      <main style={{
        flex:1,
        // Zoom the engine out 25% so more content is visible at once
        // Text sizes are bumped below to compensate
        transformOrigin:'top center',
        zoom: '0.78',
      }}>

        {/* -- Token input ----------------------------------------------------- */}
        <div style={{ borderBottom:'1px solid var(--line)', padding:'1.3rem 0' }}>
          <div style={{ maxWidth:1080, margin:'0 auto', padding:'0 1.25rem' }}>
            <div style={{ display:'flex', alignItems:'flex-end', gap:'.5rem', flexWrap:'wrap' }}>
              <div>
                <span style={S.lbl}>Token ID - 0 to 9999</span>
                <input
                  type="number" min={0} max={9999} placeholder="0"
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  onKeyDown={e => e.key==='Enter' && tokenInput && loadById(parseInt(tokenInput))}
                  inputMode="numeric"
                  style={{
                    background:'transparent', border:'1px solid var(--line)',
                    color:'var(--ink)', fontFamily:'inherit', fontSize:'2.2rem',
                    fontWeight:900, letterSpacing:'-.04em', width:'8rem',
                    padding:'.25rem .55rem', outline:'none', appearance:'textfield' as const,
                  }}
                />
              </div>
              <button
                style={{ ...S.btn, ...S.fill, ...(loadState==='loading'?S.dis:{}) }}
                disabled={loadState==='loading'}
                onClick={() => tokenInput && loadById(parseInt(tokenInput))}
              >{loadState==='loading'?'Loading-':'Load'}</button>
              <button style={S.btn} onClick={() => {
                const id = Math.floor(Math.random()*10000)
                setTokenInput(String(id)); loadById(id)
              }}>Random</button>
            </div>
            {loadErr && (
              <div style={{ marginTop:'.7rem', padding:'.45rem .65rem', border:'1px solid var(--line)', fontSize:'.65rem' }}>
                ? {loadErr}
              </div>
            )}
          </div>
        </div>

        {/* -- Main layout ----------------------------------------------------- */}
        <div style={{ maxWidth:1080, margin:'0 auto', padding:'0 1.25rem' }}>
          <style>{`
            @media(min-width:700px){
              .fn-grid{ grid-template-columns:300px 1fr !important }
              .fn-right{ border-left:1px solid var(--line) !important; border-top:none !important; padding-left:1.6rem !important }
            }
          `}</style>
          <div className="fn-grid" style={{ display:'grid', gridTemplateColumns:'1fr', borderBottom:'1px solid var(--line)' }}>

            {/* -- LEFT: Normie info ------------------------------------------ */}
            <div style={{ padding:'1.4rem 0' }}>
              <div style={{
                fontSize:'.56rem', letterSpacing:'.16em', textTransform:'uppercase',
                color:'var(--ink-muted)', marginBottom:'1.1rem',
                display:'flex', alignItems:'center', gap:'.4rem',
              }}>
                01 - Original Normie
                <span style={{ flex:1, height:1, background:'var(--line-soft)', display:'block', opacity:.5 }} />
              </div>

              {/* Face preview: use the PNG from the public API */}
              <div style={{
                width:'100%', maxWidth:180, aspectRatio:'1',
                background:'#e3e5e4', border:'1px solid var(--line)',
                display:'flex', alignItems:'center', justifyContent:'center',
                marginBottom:'1.1rem', overflow:'hidden',
              }}>
                {currentId != null && loadState !== 'idle' ? (
                  <img
                    src={`https://api.normies.art/normie/${currentId}/image.png`}
                    alt={normName}
                    crossOrigin="anonymous"
                    style={{ width:'100%', height:'100%', imageRendering:'pixelated', objectFit:'contain', display:'block' }}
                  />
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'.28rem', color:'#48494b', textAlign:'center' }}>
                    <div style={{ fontSize:'1.5rem', opacity:.1 }}>?</div>
                    <div style={{ fontSize:'.58rem', letterSpacing:'.1em', textTransform:'uppercase' }}>Load a Normie</div>
                    <div style={{ fontSize:'.5rem', opacity:.55 }}>0 - 9999</div>
                  </div>
                )}
              </div>

              {normName && <div style={{ fontSize:'1.6rem', fontWeight:900, letterSpacing:'-.05em', lineHeight:1, marginBottom:'.9rem' }}>{normName}</div>}

              <span style={S.lbl}>Traits</span>
              <div style={{ display:'grid', gridTemplateColumns:'auto 1fr' }}>
                {traitList.length === 0 ? (
                  <div style={{ gridColumn:'span 2', fontSize:'.65rem', color:'var(--ink-muted)', padding:'.3rem 0' }}>No traits loaded.</div>
                ) : traitList.map((t,i) => [
                  <div key={i+'k'} style={{ padding:'.24rem .6rem .24rem 0', fontSize:'.7rem', letterSpacing:'.07em', textTransform:'uppercase', color:'var(--ink-muted)', borderBottom:'1px solid var(--line-soft)', whiteSpace:'nowrap' }}>{t.trait_type}</div>,
                  <div key={i+'v'} style={{ padding:'.24rem 0', fontSize:'.88rem', fontWeight:700, letterSpacing:'-.01em', borderBottom:'1px solid var(--line-soft)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={t.value}>{t.value}</div>,
                ])}
              </div>

              {loadState === 'done' && (
                <div style={{ marginTop:'.8rem', fontSize:'.56rem', color:'var(--ink-muted)', lineHeight:1.8 }}>
                  <strong style={{ color:'var(--ink)', fontSize:'.6rem' }}>Canvas engine active</strong><br/>
                  Real Normie head pixels - procedural full body<br/>
                  Instant - free - no AI required
                </div>
              )}
            </div>

            {/* -- RIGHT: Sprite engine --------------------------------------- */}
            <div className="fn-right" style={{ padding:'1.4rem 0', borderTop:'1px solid var(--line)' }}>
              <div style={{
                fontSize:'.56rem', letterSpacing:'.16em', textTransform:'uppercase',
                color:'var(--ink-muted)', marginBottom:'1.1rem',
                display:'flex', alignItems:'center', gap:'.4rem',
              }}>
                02 - Full Body Sprite Engine
                <span style={{ flex:1, height:1, background:'var(--line-soft)', display:'block', opacity:.5 }} />
                <span style={{ fontSize:'.44rem', opacity:.5, letterSpacing:'.04em', textTransform:'none' as const }}>Canvas - Instant</span>
              </div>

              {/* 4 pose cards — single row */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'.35rem', marginBottom:'1rem' }}>
                {POSES.map(pose => (
                  <PoseCard
                    key={pose} pose={pose}
                    canvas={frames[pose]}
                    active={activePose===pose}
                    onClick={() => setActivePose(pose)}
                  />
                ))}
              </div>

              {/* Action row */}
              {hasFrames && (
                <div style={{ display:'flex', gap:'.3rem', marginBottom:'.7rem', flexWrap:'wrap' }}>
                  <button
                    style={{ ...S.btn, flex:1, fontSize:'.82rem', padding:'.65rem' }}
                    onClick={shareSprite}
                  >𝕏 Tweet</button>
                  <button
                    style={{ ...S.btn, ...(savedUrl ? S.dis : {}), flex:1, fontSize:'.82rem', padding:'.65rem' }}
                    onClick={saveToGallery} disabled={uploading||!!savedUrl}
                  >{uploading ? 'Saving…' : savedUrl ? '✓ Saved' : '+ Gallery'}</button>
                </div>
              )}
              {!hasFrames && (
                <div style={{ fontSize:'.62rem', color:'var(--ink-muted)', marginBottom:'.7rem', lineHeight:1.9 }}>
                  {loadState === 'loading' ? 'Generating 8 poses…' : 'Load a Normie above to generate its full body sprites.'}
                </div>
              )}
              {savedUrl && (
                <div style={{ fontSize:'.6rem', color:'var(--ink-muted)', marginBottom:'.5rem' }}>
                  Saved! <a href="/gallery" style={{ color:'var(--ink)', textDecoration:'underline' }}>View Gallery →</a>
                </div>
              )}

              {/* Download dropdown */}
              {hasFrames && (
                <div style={{ position:'relative', marginBottom:'.7rem' }}>
                  <button
                    style={{ ...S.btn, width:'100%', justifyContent:'space-between', fontSize:'.82rem', padding:'.65rem .84rem' }}
                    onClick={() => setDlOpen(o => !o)}
                  >
                    <span>↓ Download</span>
                    <span style={{ opacity:.5 }}>{activePose.toUpperCase()} ▾</span>
                  </button>
                  {dlOpen && (
                    <div style={{
                      position:'absolute', top:'calc(100% + 2px)', left:0, right:0, zIndex:20,
                      background:'var(--bg)', border:'1px solid var(--line)', boxShadow:'0 4px 16px rgba(0,0,0,.12)',
                    }}>
                      <div style={{ padding:'.28rem .6rem', fontSize:'.48rem', letterSpacing:'.1em', textTransform:'uppercase', color:'var(--ink-muted)', borderBottom:'1px solid var(--line-soft)' }}>Frame — {POSE_LABEL[activePose]}</div>
                      {dlOptions.slice(0,4).map((o,i) => (
                        <button key={i} style={{ ...S.btn, width:'100%', borderWidth:0, borderBottom:'1px solid var(--line-soft)', justifyContent:'flex-start', fontSize:'.6rem', padding:'.4rem .8rem' }}
                          onClick={() => { o.action(); setDlOpen(false) }}>{o.label}</button>
                      ))}
                      <div style={{ padding:'.28rem .6rem', fontSize:'.48rem', letterSpacing:'.1em', textTransform:'uppercase', color:'var(--ink-muted)', borderBottom:'1px solid var(--line-soft)', borderTop:'1px solid var(--line-soft)', marginTop:'.1rem' }}>Animation Sheet — 16 frames (4×4)</div>
                      {dlOptions.slice(4).map((o,i) => (
                        <button key={i+4} style={{ ...S.btn, width:'100%', borderWidth:0, borderBottom:'1px solid var(--line-soft)', justifyContent:'flex-start', fontSize:'.6rem', padding:'.4rem .8rem' }}
                          onClick={() => { o.action(); setDlOpen(false) }}>{o.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Sprite sheet preview */}
              {sheet && (<>
                <hr style={{ border:'none', borderTop:'1px solid var(--line-soft)', margin:'.9rem 0' }} />
                <span style={S.lbl}>Sprite Sheet Preview</span>
                <div style={{ fontSize:'.55rem', color:'var(--ink-muted)', marginBottom:'.5rem', lineHeight:1.7 }}>
                  16 frames · 4 clips × 4 keyframes · {SW}×{SH}px · Idle/Walk/Jump/Crouch · Unity&nbsp;/&nbsp;Godot
                </div>
                <div style={{ background:'#e3e5e4', border:'1px solid var(--line)', padding:4, display:'inline-block', maxWidth:'100%', overflow:'hidden' }}>
                  <canvas
                    ref={el => {
                      if (el && sheet) {
                        el.width=sheet.width; el.height=sheet.height
                        const ctx=el.getContext('2d')!
                        ctx.imageSmoothingEnabled=false
                        ctx.drawImage(sheet,0,0)
                      }
                    }}
                    width={sheet?.width ?? SW*SCL*4} height={sheet?.height ?? SH*SCL}
                    style={{ display:'block', imageRendering:'pixelated', maxWidth:'100%', height:'auto' }}
                  />
                </div>
                {/* Clip row labels: name + F2/F3/F4 for each row */}
                {ANIM_CLIPS.map((clip, row) => (
                  <div key={row} style={{ display:'flex', marginTop:'.1rem', maxWidth:'100%' }}>
                    <span style={{ width:'25%', fontSize:'.44rem', letterSpacing:'.06em', textTransform:'uppercase',
                      color:'var(--ink)', fontWeight:700, textAlign:'center', display:'inline-block' }}>{clip.label}</span>
                    {[2,3,4].map(n => (
                      <span key={n} style={{ width:'25%', fontSize:'.42rem', color:'var(--ink-muted)',
                        textAlign:'center', display:'inline-block' }}>F{n}</span>
                    ))}
                  </div>
                ))}
              </>)}
            </div>

          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default function EnginePage() { return <Suspense><EngineInner /></Suspense> }
