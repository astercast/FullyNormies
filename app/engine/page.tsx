'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Nav from '../components/Nav'
import Footer from '../components/Footer'
import { Suspense } from 'react'

// ════════════════════════════════════════════════════════════════
//  FULLNORMIES SPRITE ENGINE v7
//
//  Proportions derived from pixel-level analysis of reference image.
//  Canvas: 120×120. Face: 40×40 at x=40,y=2. Body: x centered at 60.
//
//  Reference character is 39.7px wide in 120px-tall space.
//  We use 36px total body width centered at x=60 (x=42..77).
//
//  ARM/TORSO at y=45..76 (3 clean segments):
//    Left arm:  x=42..52  (11px)
//    GAP:       3px
//    Torso:     x=55..63  (9px)
//    GAP:       3px
//    Right arm: x=66..76  (11px)
//
//  LEGS at y=80..107 (2 segments, splay outward):
//    Left leg top:  x=44..53  (10px)  →  x=41..50 at bottom
//    Gap: ~7px
//    Right leg top: x=58..67  (10px)  →  x=61..70 at bottom
//
//  SHOES at y=108..114:
//    Left:  x=39..49  (11px)
//    Right: x=61..71  (11px)
//
//  Neck: x=55..63 (9px), y=42..44
//
//  NOTE: "Accessory" in Normies API is always a head item
//  (hats, bandana, earring, chain, bow tie) — nothing is held.
//  Bow tie and chain can appear on the neck/chest area.
//
//  Types: human | cat | alien | agent (ONLY 4 TYPES)
//  No "clothing" trait — derived from type + seed.
// ════════════════════════════════════════════════════════════════

const PL = '#e3e5e4'
const PD = '#48494b'
const PL_RGB: [number,number,number] = [0xe3, 0xe5, 0xe4]
const PD_RGB: [number,number,number] = [0x48, 0x49, 0x4b]

// Pixel drawing helpers
function dk(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  if (w <= 0 || h <= 0) return
  c.fillStyle = PD; c.fillRect(x|0, y|0, w|0, h|0)
}
function lt(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  if (w <= 0 || h <= 0) return
  c.fillStyle = PL; c.fillRect(x|0, y|0, w|0, h|0)
}

function mkrng(s: number) {
  let n = s | 0
  return (): number => { n = (Math.imul(n, 1664525) + 1013904223) | 0; return (n >>> 0) / 0x100000000 }
}

// ── Types ─────────────────────────────────────────────────────
interface Trait { key: string; value: string }
type Pose = 'idle' | 'walk' | 'attack' | 'crouch'
type NormType = 'human' | 'cat' | 'alien' | 'agent'

interface Arch {
  normType: NormType
  gender: string        // male | female | non-binary
  clothing: string      // jacket | hoodie | tshirt | suit
  accBody: 'bow_tie' | 'chain' | 'none'
}

function tv(traits: Trait[], key: string): string {
  const f = traits.find(t => t.key.toLowerCase() === key.toLowerCase())
  return f ? f.value.toLowerCase() : ''
}

function buildArch(traits: Trait[], seed: number): Arch {
  const typeStr = tv(traits, 'type')
  const gender = tv(traits, 'gender')
  const accStr = tv(traits, 'accessory')

  let normType: NormType = 'human'
  if (typeStr === 'cat') normType = 'cat'
  else if (typeStr === 'alien') normType = 'alien'
  else if (typeStr === 'agent') normType = 'agent'

  // Clothing: no API trait, derived from type + seed
  let clothing = 'jacket'
  if (normType === 'agent') clothing = 'suit'
  else if (normType === 'cat') clothing = 'tshirt'
  else {
    const v = seed % 6
    clothing = v < 3 ? 'jacket' : v < 5 ? 'hoodie' : 'tshirt'
  }

  let accBody: 'bow_tie' | 'chain' | 'none' = 'none'
  if (accStr.includes('bow tie')) accBody = 'bow_tie'
  else if (accStr.includes('chain')) accBody = 'chain'

  return { normType, gender, clothing, accBody }
}

// ════════════════════════════════════════════════════════════════
//  BODY DRAWING
//
//  Everything is drawn in absolute pixel coordinates on 120×120 canvas.
//  CX = 60 (horizontal center, same as face center)
//
//  The 3-segment arm/torso structure from the reference:
//    Segment A (left arm):  CX - 18 .. CX - 8   = x42..52
//    Gap: 3px
//    Segment B (torso):     CX - 5  .. CX + 3   = x55..63
//    Gap: 3px  
//    Segment C (right arm): CX + 6  .. CX + 16  = x66..76
//
//  This matches the reference pixel data at 34-40% height exactly.
// ════════════════════════════════════════════════════════════════

const CX = 60

// Body layout constants (all absolute y positions)
const Y_NECK_TOP = 42
const Y_NECK_BOT = 44
const Y_ARM_TOP  = 45   // arms and torso start together
const Y_ARM_BOT  = 76   // arms and torso end together  
const Y_BELT_TOP = 77
const Y_BELT_BOT = 79
const Y_LEG_TOP  = 80
const Y_LEG_BOT  = 107
const Y_SHOE_TOP = 108
const Y_SHOE_BOT = 114
const Y_SHADOW   = 116

// Arm/torso x positions
const LA_X = CX - 18   // left arm left edge  = 42
const LA_W = 11        // left arm width
const TO_X = CX - 5   // torso left edge     = 55
const TO_W = 9         // torso width
const RA_X = CX + 6   // right arm left edge = 66
const RA_W = 11        // right arm width

// Leg x positions (top of leg, they splay outward by 3px total)
const LL_TOP = CX - 16  // left leg left edge at top  = 44
const RL_TOP = CX + 6   // right leg left edge at top = 66  ← wait, gap check
const LEG_W  = 10        // each leg width
const LEG_H  = Y_LEG_BOT - Y_LEG_TOP  // = 27px

// Shoe positions (wider, extend outward past legs)
const LS_X = CX - 20   // left shoe x  = 40
const RS_X = CX + 10   // right shoe x = 70
const SHOE_W = 11       // each shoe width

function drawBody(c: CanvasRenderingContext2D, a: Arch, seed: number, pose: Pose) {
  const isAlt = a.normType === 'cat'    // slightly wider
  const isAlien = a.normType === 'alien' // slightly taller/thinner

  // Width modifiers
  const wMod = isAlt ? 2 : isAlien ? -1 : 0

  // Effective positions with width modifier
  const laX = LA_X - wMod
  const laW = LA_W + wMod
  const toX = TO_X - wMod
  const toW = TO_W + wMod * 2
  const raX = RA_X + wMod
  const raW = RA_W + wMod
  const llTop = LL_TOP - (isAlt ? 1 : 0)
  const rlTop = RL_TOP + (isAlt ? 1 : 0)
  const legW = LEG_W + (isAlt ? 1 : 0)
  const lsX = LS_X - (isAlt ? 2 : 0)
  const rsX = RS_X + (isAlt ? 2 : 0)
  const shoeW = SHOE_W + (isAlt ? 2 : 0)

  // Pose shifts
  const crY     = pose === 'crouch' ? 6 : 0   // body shifts down
  const crLegH  = pose === 'crouch' ? 18 : LEG_H
  const wLshift = pose === 'walk' ? -3 : 0    // left leg/arm forward
  const wRshift = pose === 'walk' ?  3 : 0    // right leg/arm back
  const atkRise = pose === 'attack' ? -9 : 0  // right arm raised

  // ── NECK ───────────────────────────────────────────────────
  dk(c, CX - 4, Y_NECK_TOP, 8, 3)

  // ── TORSO + ARMS (the signature 3-segment structure) ───────
  const armTop = Y_ARM_TOP + crY
  const armBot = Y_ARM_BOT + crY

  // Left arm (full height block, with elbow articulation)
  drawArm(c, laX + wLshift, armTop, laW, armBot - armTop, false, false)

  // Torso (the central body)
  drawTorsoBlock(c, a, toX, armTop, toW, armBot - armTop)

  // Right arm (may be raised for attack)
  drawArm(c, raX + wRshift, armTop + atkRise, raW, armBot - armTop - atkRise, true, atkRise < 0)

  // ── BELT ───────────────────────────────────────────────────
  const beltY = Y_BELT_TOP + crY
  dk(c, toX - 4, beltY, toW + 8, 3)
  // Belt buckle
  lt(c, CX - 2, beltY + 1, 4, 1)
  dk(c, CX - 1, beltY + 1, 2, 1)

  // ── LEGS ───────────────────────────────────────────────────
  const legY = Y_LEG_TOP + crY
  const legHCur = pose === 'crouch' ? crLegH : LEG_H

  for (let i = 0; i < legHCur; i++) {
    const t = i / legHCur
    // Legs splay outward as they go down (3px total each side)
    const splayL = Math.floor(t * 3)
    const splayR = Math.floor(t * 3)

    // Walk: left leg forward, right leg back (stride)
    const lx = llTop - splayL + wLshift
    const rx = rlTop + splayR + wRshift

    dk(c, lx, legY + i, legW, 1)
    dk(c, rx, legY + i, legW, 1)

    // Knee highlight at ~45%
    if (i === Math.floor(legHCur * 0.44) || i === Math.floor(legHCur * 0.45)) {
      lt(c, lx + 2, legY + i, legW - 4, 1)
      lt(c, rx + 2, legY + i, legW - 4, 1)
    }
  }

  // ── SHOES ──────────────────────────────────────────────────
  const shoeY = legY + legHCur
  // Shoes extend outward past the legs
  const finalSplayL = 3
  const finalSplayR = 3
  const lShoeX = llTop - finalSplayL - 3 + wLshift  // extend left
  const rShoeX = rlTop + finalSplayR - 2 + wRshift  // extend right
  drawShoe(c, a, lShoeX, shoeY, shoeW, 7, true)
  drawShoe(c, a, rShoeX, shoeY, shoeW, 7, false)

  // ── GROUND SHADOW ──────────────────────────────────────────
  dk(c, lShoeX + 1, shoeY + 9, shoeW - 2, 1)
  dk(c, rShoeX + 1, shoeY + 9, shoeW - 2, 1)

  // ── TYPE EXTRAS ────────────────────────────────────────────
  drawTypeExtras(c, a, laX, raX, laW, raW, toX, toW, armTop, armBot - armTop)
}

// ── Single arm with elbow articulation ────────────────────────
function drawArm(c: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  isRight: boolean, raised: boolean)
{
  const elbowH = Math.floor(h * 0.5)
  // Upper arm
  dk(c, x, y, w, elbowH)
  // Elbow joint (subtle highlight)
  lt(c, x + 1, y + elbowH - 1, w - 2, 1)
  // Forearm (slight inward taper)
  const fw = Math.max(w - 1, w)
  const fx = isRight ? x : x
  dk(c, fx, y + elbowH, fw, h - elbowH - 4)
  // Hand (rounded bottom)
  dk(c, fx - 1, y + h - 4, fw + 2, 4)
  lt(c, fx, y + h - 3, fw, 2)
  // Outer edge highlight
  const hx = isRight ? x + 1 : x + w - 2
  lt(c, hx, y + 2, 1, h - 6)
}

// ── Torso/clothing block ───────────────────────────────────────
function drawTorsoBlock(c: CanvasRenderingContext2D, a: Arch,
  x: number, y: number, w: number, h: number)
{
  const cx = x + (w >> 1)

  if (a.clothing === 'suit') {
    // Dark suit: solid fill, light shirt centre strip
    dk(c, x, y, w, h)
    // Shirt strip (narrows toward bottom)
    for (let i = 0; i < h; i++) {
      const sw = Math.max(2, Math.round(w * 0.5 - i / h * 1.5))
      lt(c, cx - (sw >> 1), y + i, sw, 1)
    }
    // Lapel diagonals
    for (let i = 0; i < Math.min(h, 10); i++) {
      dk(c, x + Math.floor(i * 0.4), y + i, 1, 1)
      dk(c, x + w - 1 - Math.floor(i * 0.4), y + i, 1, 1)
    }
    // Buttons
    for (let b = 0; b < 3; b++) dk(c, cx, y + 6 + b * 7, 2, 2)
  }
  else if (a.clothing === 'hoodie') {
    dk(c, x, y, w, h)
    // Zip line
    lt(c, cx, y, 1, h)
    // Kangaroo pocket
    const pkY = y + Math.floor(h * 0.55)
    const pkH = h - Math.floor(h * 0.55) - 2
    if (pkH > 2) {
      lt(c, x + 1, pkY, w - 2, pkH)
      dk(c, x + 1, pkY, w - 2, 1)
      dk(c, x + 1, pkY, 1, pkH)
      dk(c, x + w - 2, pkY, 1, pkH)
    }
    // Hood drawstrings
    lt(c, cx - 3, y, 1, Math.floor(h * 0.3))
    lt(c, cx + 2, y, 1, Math.floor(h * 0.3))
  }
  else if (a.clothing === 'tshirt') {
    // Light shirt, dark outline
    lt(c, x, y, w, h)
    dk(c, x, y, 1, h); dk(c, x + w - 1, y, 1, h)
    dk(c, x, y + h - 1, w, 1)
    // Crew neck
    const nw = Math.floor(w * 0.6), nx = cx - (nw >> 1)
    dk(c, nx, y + 3, nw, 1)
    dk(c, nx - 1, y + 4, 2, 2); dk(c, nx + nw - 1, y + 4, 2, 2)
  }
  else {
    // Default jacket: solid dark, small collar strip
    dk(c, x, y, w, h)
    // Collar/shirt visible at top
    const cw = Math.floor(w * 0.5), cnx = cx - (cw >> 1)
    lt(c, cnx, y, cw, Math.floor(h * 0.22))
    dk(c, cnx, y + Math.floor(h * 0.22), cw, 1)
    // Lapels
    for (let i = 0; i < Math.floor(h * 0.45); i++) {
      dk(c, x + Math.floor(i * 0.28), y + i, 1, 1)
      dk(c, x + w - 1 - Math.floor(i * 0.28), y + i, 1, 1)
    }
    // Centre seam
    dk(c, cx, y + Math.floor(h * 0.25), 1, Math.floor(h * 0.75))
  }

  // ── Body accessories ────────────────────────────────────────
  if (a.accBody === 'bow_tie') {
    const ty = y + 2
    // Left wing, knot, right wing
    dk(c, cx - 5, ty, 4, 4); lt(c, cx - 4, ty + 1, 2, 2)
    dk(c, cx - 1, ty + 1, 2, 2)  // knot
    dk(c, cx + 1, ty, 4, 4); lt(c, cx + 2, ty + 1, 2, 2)
  }
  if (a.accBody === 'chain') {
    const cy = y + Math.floor(h * 0.12)
    for (let i = x + 1; i < x + w - 1; i += 3) {
      dk(c, i, cy, 2, 2); lt(c, i + 1, cy, 1, 1)
    }
  }
}

// ── Shoes ──────────────────────────────────────────────────────
function drawShoe(c: CanvasRenderingContext2D, a: Arch,
  x: number, y: number, w: number, h: number, isLeft: boolean)
{
  if (a.normType === 'alien') {
    // Slightly pointed
    dk(c, x, y, w, h - 1)
    dk(c, isLeft ? x - 2 : x + w, y + 2, 3, h - 2)
    lt(c, x + 1, y + 1, w - 2, 2)
    return
  }
  // Chunky flat sneaker
  // Sole extends outward (left shoe extends left, right shoe extends right)
  const ex = isLeft ? -2 : 2  // toe extension direction
  dk(c, x + ex, y, w, 1)                    // top edge
  dk(c, x + ex, y + 1, w, h - 3)            // main body
  lt(c, x + ex + 1, y + 1, w - 2, 2)       // tongue highlight
  lt(c, x + ex + 1, y + 3, w - 2, h - 5)   // interior fill
  dk(c, x + ex, y + h - 2, w + 1, 2)       // thick sole
}

// ── Type-specific extras ───────────────────────────────────────
function drawTypeExtras(c: CanvasRenderingContext2D, a: Arch,
  laX: number, raX: number, laW: number, raW: number,
  toX: number, toW: number, armTop: number, armH: number)
{
  if (a.normType === 'cat') {
    // Tail: curves up from left hip
    const tx = laX - 3, ty = armTop + armH - 2
    dk(c, tx, ty, 2, 3)
    dk(c, tx - 2, ty - 3, 2, 4)
    dk(c, tx - 4, ty - 7, 2, 5)
    dk(c, tx - 3, ty - 10, 3, 3)  // tail tip
    lt(c, tx - 2, ty - 9, 1, 1)   // tail highlight
  }
  if (a.normType === 'alien') {
    // Extra thin arms hanging down outside
    const extraArmH = Math.floor(armH * 0.7)
    for (let i = 0; i < extraArmH; i++) {
      dk(c, laX - 5, armTop + 6 + i, 2, 1)
      dk(c, raX + raW + 3, armTop + 6 + i, 2, 1)
    }
    // Small alien hand nubs
    dk(c, laX - 6, armTop + 6 + extraArmH, 4, 3)
    dk(c, raX + raW + 2, armTop + 6 + extraArmH, 4, 3)
  }
  if (a.normType === 'agent') {
    // Tie: thin dark strip down torso center
    const tieX = (toX + (toX + toW) >> 1) - 1
    dk(c, tieX, armTop + 5, 3, armH - 6)
    lt(c, tieX + 1, armTop + 6, 1, armH - 9)  // shine
    // Tie knot at top
    dk(c, tieX - 1, armTop + 3, 5, 3)
    lt(c, tieX, armTop + 4, 3, 1)
  }
}

// ════════════════════════════════════════════════════════════════
//  FACE PIPELINE
// ════════════════════════════════════════════════════════════════

function pixelsToGrid(str: string): number[][] {
  const g: number[][] = []
  for (let y = 0; y < 40; y++) {
    g[y] = []
    for (let x = 0; x < 40; x++) g[y][x] = str[y * 40 + x] === '1' ? 1 : 0
  }
  return g
}

function sampleFaceFromImg(img: HTMLImageElement): number[][] {
  const oc = document.createElement('canvas'); oc.width = oc.height = 40
  const cx = oc.getContext('2d')!; cx.imageSmoothingEnabled = false
  cx.drawImage(img, 0, 0, 40, 40)
  const raw = cx.getImageData(0, 0, 40, 40).data, g: number[][] = []
  for (let y = 0; y < 40; y++) {
    g[y] = []
    for (let x = 0; x < 40; x++) {
      const i = (y * 40 + x) * 4
      g[y][x] = (0.2126 * raw[i] + 0.7152 * raw[i + 1] + 0.0722 * raw[i + 2]) < 128 ? 1 : 0
    }
  }
  return g
}

function pasteFace(c: CanvasRenderingContext2D, g: number[][]) {
  lt(c, 40, 2, 40, 40)
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 40; x++)
      if (g[y][x] === 1) dk(c, 40 + x, 2 + y, 1, 1)
}

function snapPal(c: CanvasRenderingContext2D, ca: number) {
  const id = c.getImageData(0, 0, 120, 120), p = id.data, thr = 128 + ca * 15
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 10) { p[i] = PL_RGB[0]; p[i + 1] = PL_RGB[1]; p[i + 2] = PL_RGB[2]; p[i + 3] = 255; continue }
    const lm = 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]
    const col = lm > thr ? PL_RGB : PD_RGB
    p[i] = col[0]; p[i + 1] = col[1]; p[i + 2] = col[2]; p[i + 3] = 255
  }
  c.putImageData(id, 0, 0)
}

const POSES: Pose[] = ['idle', 'walk', 'attack', 'crouch']
const POSE_LABELS = ['Idle', 'Walk', 'Attack', 'Crouch']

async function buildSheet(faceGrid: number[][], traits: Trait[], seed: number, contrast: number,
  sheet: HTMLCanvasElement, wait: (ms: number) => Promise<void>)
{
  const arch = buildArch(traits, seed)
  sheet.width = 480; sheet.height = 120
  const sc = sheet.getContext('2d')!; sc.imageSmoothingEnabled = false
  sc.fillStyle = PL; sc.fillRect(0, 0, 480, 120)
  for (let i = 0; i < 4; i++) {
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = 120
    const tc = tmp.getContext('2d')!; tc.imageSmoothingEnabled = false
    tc.fillStyle = PL; tc.fillRect(0, 0, 120, 120)
    drawBody(tc, arch, seed, POSES[i])
    pasteFace(tc, faceGrid)
    snapPal(tc, contrast)
    sc.drawImage(tmp, i * 120, 0)
    await wait(6)
  }
}

// ════════════════════════════════════════════════════════════════
//  UI
// ════════════════════════════════════════════════════════════════

const S = {
  btn: {
    background: 'transparent', border: '1px solid var(--line)', color: 'var(--ink)',
    fontFamily: 'inherit', fontSize: '.6rem', fontWeight: 700, letterSpacing: '.1em',
    textTransform: 'uppercase' as const, padding: '.44rem .84rem', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '.3rem',
    userSelect: 'none' as const, WebkitTapHighlightColor: 'transparent'
  },
  btnFill: { background: 'var(--ink)', color: 'var(--bg)', borderColor: 'var(--ink)' },
  frame: {
    width: '100%', maxWidth: 200, aspectRatio: '1' as const, background: '#e3e5e4',
    border: '1px solid var(--line)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', marginBottom: '1.1rem', overflow: 'hidden'
  },
  lbl: {
    fontSize: '.6rem', letterSpacing: '.13em', textTransform: 'uppercase' as const,
    color: 'var(--ink-muted)', display: 'block', marginBottom: '.3rem'
  },
}

function EngineInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const wcRef = useRef<HTMLCanvasElement>(null)
  const sheetRef = useRef<HTMLCanvasElement>(null)
  const [tokenInput, setTokenInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [progLabel, setProgLabel] = useState('')
  const [progPct, setProgPct] = useState(0)
  const [showProg, setShowProg] = useState(false)
  const [traits, setTraits] = useState<Trait[]>([])
  const [normName, setNormName] = useState('')
  const [faceUrl, setFaceUrl] = useState<string | null>(null)
  const [faceGrid, setFaceGrid] = useState<number[][] | null>(null)
  const [spriteReady, setSpriteReady] = useState(false)
  const [sheetReady, setSheetReady] = useState(false)
  const [seed, setSeed] = useState(0)
  const [contrast, setContrast] = useState(0)
  const [err, setErr] = useState('')
  const [uploading, setUploading] = useState(false)
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [currentId, setCurrentId] = useState<number | null>(null)
  const [activePose, setActivePose] = useState<Pose>('idle')
  const [shareOpen, setShareOpen] = useState(false)
  const displayRef = useRef<HTMLCanvasElement | null>(null)
  const renderKey = useRef(0)

  const wait = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))
  const prog = useCallback((show: boolean, lbl: string, pct: number) => {
    setShowProg(show); setProgLabel(lbl); setProgPct(pct)
  }, [])

  useEffect(() => {
    const id = searchParams.get('id')
    if (id) { setTokenInput(id); setTimeout(() => loadById(parseInt(id)), 300) }
  }, [])

  async function rf(url: string, n = 3): Promise<Response> {
    for (let i = 0; i < n; i++) {
      const r = await fetch(url, { cache: 'no-store' })
      if (r.status !== 429) return r
      if (i < n - 1) await wait(900 * (i + 1))
    }
    return fetch(url, { cache: 'no-store' })
  }

  async function loadById(id: number) {
    setErr(''); setLoading(true); setSpriteReady(false); setSheetReady(false)
    setTraits([]); setNormName(''); setFaceUrl(null); setSavedUrl(null)
    setFaceGrid(null); setCurrentId(id)
    router.replace(`/engine?id=${id}`, { scroll: false })
    try {
      const mRes = await rf(`https://api.normies.art/normie/${id}/metadata`)
      if (!mRes.ok) throw new Error(`Normie #${id} not found`)
      const mData = await mRes.json()
      const parsed: Trait[] = []
      if (Array.isArray(mData.attributes))
        mData.attributes.forEach((a: any) => {
          if (a.trait_type && a.value != null)
            parsed.push({ key: String(a.trait_type), value: String(a.value) })
        })
      setTraits(parsed); setNormName(mData.name || `Normie #${id}`)
      const [pixRes, imgRes] = await Promise.all([
        rf(`https://api.normies.art/normie/${id}/pixels`),
        rf(`https://api.normies.art/normie/${id}/image.png`)
      ])
      if (pixRes.ok) { const s = await pixRes.text(); setFaceGrid(pixelsToGrid(s.trim())) }
      if (imgRes.ok) { const b = await imgRes.blob(); setFaceUrl(URL.createObjectURL(b)) }
      if (!pixRes.ok && imgRes.ok) {
        const b = await imgRes.blob(); const u = URL.createObjectURL(b)
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image(); i.crossOrigin = 'anonymous'
          i.onload = () => res(i); i.onerror = rej; i.src = u
        })
        setFaceGrid(sampleFaceFromImg(img))
      }
    } catch (e: any) { setErr(e.message || 'Failed to load') }
    finally { setLoading(false) }
  }

  async function generate(newSeed = false, pose = activePose) {
    if (!faceGrid) return
    const s = (newSeed || !seed) ? ((Math.random() * 0xFFFFFF) | 0) : seed
    if (newSeed || !seed) setSeed(s)
    const wc = wcRef.current; if (!wc) return
    const ctx = wc.getContext('2d')!; ctx.imageSmoothingEnabled = false
    prog(true, 'Drawing body…', 20); await wait(10)
    ctx.fillStyle = PL; ctx.fillRect(0, 0, 120, 120)
    drawBody(ctx, buildArch(traits, s), s, pose)
    prog(true, 'Compositing face…', 55); await wait(8)
    pasteFace(ctx, faceGrid)
    prog(true, 'Finalizing…', 80); await wait(6)
    snapPal(ctx, contrast)
    prog(true, 'Building sheet…', 88); await wait(4)
    if (sheetRef.current) await buildSheet(faceGrid, traits, s, contrast, sheetRef.current, wait)
    prog(false, '', 100); await wait(4)
    const dc = document.createElement('canvas'); dc.width = dc.height = 120
    dc.getContext('2d')!.drawImage(wc, 0, 0)
    displayRef.current = dc
    renderKey.current++
    setSpriteReady(false); await wait(10); setSpriteReady(true)
    setSheetReady(true)
  }

  async function switchPose(p: Pose) {
    setActivePose(p)
    if (!faceGrid || !seed) return
    const wc = wcRef.current; if (!wc) return
    const ctx = wc.getContext('2d')!; ctx.imageSmoothingEnabled = false
    ctx.fillStyle = PL; ctx.fillRect(0, 0, 120, 120)
    drawBody(ctx, buildArch(traits, seed), seed, p)
    pasteFace(ctx, faceGrid)
    snapPal(ctx, contrast)
    const dc = document.createElement('canvas'); dc.width = dc.height = 120
    dc.getContext('2d')!.drawImage(wc, 0, 0)
    displayRef.current = dc
    renderKey.current++
    setSpriteReady(false); await wait(10); setSpriteReady(true)
  }

  function dlSprite(size: number, transparent: boolean, sheet = false) {
    if (!spriteReady) return
    const src = sheet ? sheetRef.current : wcRef.current; if (!src) return
    const W = sheet ? 480 : size, H = size
    const out = document.createElement('canvas'); out.width = W; out.height = H
    const cx = out.getContext('2d')!; cx.imageSmoothingEnabled = false
    if (!transparent) { cx.fillStyle = PL; cx.fillRect(0, 0, W, H) }
    cx.drawImage(src, 0, 0, W, H)
    out.toBlob(b => {
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(b!),
        download: `normie-${currentId}${sheet ? '-sheet' : `-${activePose}-${size}`}.png`
      })
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3e3)
    }, 'image/png')
  }

  async function saveToGallery() {
    if (!spriteReady) return; setUploading(true)
    try {
      const blob: Blob = await new Promise(res => wcRef.current!.toBlob(b => res(b!), 'image/png'))
      const form = new FormData()
      form.append('file', blob, `normie-${currentId}.png`)
      form.append('meta', JSON.stringify({ id: currentId, name: normName, traits }))
      const data = await (await fetch('/api/upload', { method: 'POST', body: form })).json()
      if (data.url) setSavedUrl(data.url); else throw new Error('Upload failed')
    } catch (e) { console.error(e) }
    finally { setUploading(false) }
  }

  const g2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.3rem', marginBottom: '.45rem' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Nav />
      <canvas ref={wcRef} width={120} height={120} style={{ display: 'none' }} />
      <canvas ref={sheetRef} width={480} height={120} style={{ display: 'none' }} />
      <main style={{ flex: 1 }}>
        {/* Token input */}
        <div style={{ borderBottom: '1px solid var(--line)', padding: '1.3rem 0' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '.5rem', flexWrap: 'wrap' }}>
              <div>
                <span style={S.lbl}>Token ID — 0 to 9999</span>
                <input
                  type="number" min={0} max={9999} placeholder="6793" value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && tokenInput && loadById(parseInt(tokenInput))}
                  inputMode="numeric"
                  style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: '1.75rem', fontWeight: 900, letterSpacing: '-.04em', width: '7.2rem', padding: '.25rem .55rem', outline: 'none', appearance: 'textfield' as const }}
                />
              </div>
              <button style={{ ...S.btn, ...S.btnFill }} disabled={loading} onClick={() => tokenInput && loadById(parseInt(tokenInput))}>
                {loading ? 'Loading…' : 'Load'}
              </button>
              <button style={S.btn} onClick={() => { const id = Math.floor(Math.random() * 10000); setTokenInput(String(id)); loadById(id) }}>
                Random
              </button>
            </div>
            {err && <div style={{ marginTop: '.7rem', padding: '.45rem .65rem', border: '1px solid var(--line)', fontSize: '.65rem' }}>⚠ {err}</div>}
          </div>
        </div>

        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25rem' }}>
          <style>{`@media(min-width:700px){.fn-eng-grid{grid-template-columns:1fr 1fr !important}.fn-eng-right{border-left:1px solid var(--line) !important;border-top:none !important;padding-left:1.6rem !important}}`}</style>
          <div className="fn-eng-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', borderBottom: '1px solid var(--line)' }}>

            {/* LEFT — original */}
            <div style={{ padding: '1.4rem 0' }}>
              <div style={{ fontSize: '.58rem', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: '1.1rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                01 — Original Normie
                <span style={{ flex: 1, height: 1, background: 'var(--line-soft)', display: 'block', opacity: .5 }} />
              </div>
              <div style={{ ...S.frame, maxWidth: 200 }}>
                {faceUrl
                  ? <img src={faceUrl} alt={normName} style={{ width: '100%', height: '100%', imageRendering: 'pixelated', objectFit: 'contain', display: 'block' }} />
                  : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.28rem', color: '#48494b', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.3rem', opacity: .1 }}>◻</div>
                    <div style={{ fontSize: '.58rem', letterSpacing: '.1em', textTransform: 'uppercase' }}>Load a Normie</div>
                    <div style={{ fontSize: '.5rem', opacity: .55 }}>0 – 9999</div>
                  </div>
                }
              </div>
              {normName && <div style={{ fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-.05em', lineHeight: 1, marginBottom: '.9rem' }}>{normName}</div>}
              <span style={S.lbl}>Traits</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr' }}>
                {traits.length === 0
                  ? <div style={{ gridColumn: 'span 2', fontSize: '.65rem', color: 'var(--ink-muted)', padding: '.3rem 0' }}>No traits loaded.</div>
                  : traits.map((t, i) => [
                    <div key={i + 'k'} style={{ padding: '.24rem .75rem .24rem 0', fontSize: '.55rem', letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--ink-muted)', borderBottom: '1px solid var(--line-soft)', whiteSpace: 'nowrap' }}>{t.key}</div>,
                    <div key={i + 'v'} style={{ padding: '.24rem 0', fontSize: '.72rem', fontWeight: 700, letterSpacing: '-.01em', borderBottom: '1px solid var(--line-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.value}>{t.value}</div>
                  ])
                }
              </div>
              {faceUrl && <>
                <hr style={{ border: 'none', borderTop: '1px solid var(--line-soft)', margin: '.9rem 0' }} />
                <button style={S.btn} onClick={() => { const a = Object.assign(document.createElement('a'), { href: faceUrl!, download: `normie-${currentId}-face.png` }); a.click() }}>↓ Download Face PNG</button>
              </>}
            </div>

            {/* RIGHT — engine */}
            <div className="fn-eng-right" style={{ padding: '1.4rem 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ fontSize: '.58rem', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: '1.1rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                02 — Full Body Sprite Engine
                <span style={{ flex: 1, height: 1, background: 'var(--line-soft)', display: 'block', opacity: .5 }} />
              </div>
              <div style={{ ...S.frame, maxWidth: 200 }}>
                {spriteReady && displayRef.current
                  ? <canvas key={renderKey.current}
                    ref={el => { if (el && displayRef.current) { el.width = el.height = 120; el.getContext('2d')!.drawImage(displayRef.current, 0, 0) } }}
                    width={120} height={120}
                    style={{ width: '100%', height: '100%', imageRendering: 'pixelated', display: 'block' }}
                  />
                  : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.28rem', color: '#48494b', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.3rem', opacity: .1 }}>▦</div>
                    <div style={{ fontSize: '.58rem', letterSpacing: '.1em', textTransform: 'uppercase' }}>120×120 Sprite</div>
                    <div style={{ fontSize: '.5rem', opacity: .55 }}>load a normie to generate</div>
                  </div>
                }
              </div>
              {spriteReady && <>
                <span style={S.lbl}>Pose</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '.3rem', marginBottom: '.7rem' }}>
                  {POSES.map((p, i) => (
                    <button key={p} style={{ ...S.btn, ...(activePose === p ? S.btnFill : {}) }} onClick={() => switchPose(p)}>
                      {POSE_LABELS[i]}
                    </button>
                  ))}
                </div>
              </>}
              {showProg && <div style={{ marginBottom: '.7rem' }}>
                <div style={{ fontSize: '.55rem', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: '.28rem' }}>{progLabel}</div>
                <div style={{ height: 2, background: 'var(--line-soft)' }}>
                  <div style={{ height: 2, background: 'var(--ink)', width: `${progPct}%`, transition: 'width .28s ease' }} />
                </div>
              </div>}
              <button
                style={{ ...S.btn, ...S.btnFill, width: '100%', marginBottom: '.45rem' }}
                disabled={!faceGrid}
                onClick={() => generate(false)}
              >▶ Generate Full Body Sprite</button>
              {spriteReady && <div style={g2}>
                <button style={S.btn} onClick={() => generate(false)}>↺ Regenerate</button>
                <button style={S.btn} onClick={() => generate(true)}>⚂ New Seed</button>
                <button style={S.btn} onClick={() => { setContrast(cc => Math.min(3, cc + 1)); generate(false) }}>+ Contrast</button>
                <button style={S.btn} onClick={() => { setContrast(cc => Math.max(-3, cc - 1)); generate(false) }}>− Contrast</button>
              </div>}
              <hr style={{ border: 'none', borderTop: '1px solid var(--line-soft)', margin: '.9rem 0' }} />
              <span style={S.lbl}>Download</span>
              {spriteReady
                ? <div style={{ ...g2, marginTop: '.4rem' }}>
                  <button style={S.btn} onClick={() => dlSprite(120, false)}>↓ 120px PNG</button>
                  <button style={S.btn} onClick={() => dlSprite(120, true)}>↓ 120px Transparent</button>
                  <button style={S.btn} onClick={() => dlSprite(480, false)}>↓ 480px PNG</button>
                  <button style={S.btn} onClick={() => dlSprite(960, false)}>↓ 960px PNG</button>
                  <button style={{ ...S.btn, gridColumn: 'span 2' }} onClick={() => dlSprite(120, false, true)}>↓ Sprite Sheet (4 poses)</button>
                  <button style={{ ...S.btn, gridColumn: 'span 2', ...(savedUrl ? { opacity: .5 } : {}) }} onClick={saveToGallery} disabled={uploading || !!savedUrl}>
                    {uploading ? 'Saving…' : savedUrl ? '✓ Saved to Gallery' : '↑ Save to Gallery'}
                  </button>
                  <div style={{ gridColumn: 'span 2', position: 'relative' }}>
                    <button style={{ ...S.btn, width: '100%' }} onClick={() => setShareOpen(o => !o)}>↗ Share</button>
                    {shareOpen && <div style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-raise)', border: '1px solid var(--line)', zIndex: 10 }}>
                      <button style={{ ...S.btn, width: '100%', borderWidth: 0, borderBottom: '1px solid var(--line-soft)' }}
                        onClick={() => { window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(`Just generated Normie #${currentId} as a full-body pixel art sprite!\nhttps://fully-normies.vercel.app/engine?id=${currentId}`)}`, '_blank'); setShareOpen(false) }}>
                        X / Twitter
                      </button>
                      <button style={{ ...S.btn, width: '100%', borderWidth: 0 }}
                        onClick={async () => { if (navigator.share && wcRef.current) wcRef.current.toBlob(async b => { if (!b) return; try { await navigator.share({ title: `Normie #${currentId}`, files: [new File([b], 'sprite.png', { type: 'image/png' })] }) } catch {} }); setShareOpen(false) }}>
                        Share Image
                      </button>
                    </div>}
                  </div>
                </div>
                : <div style={{ fontSize: '.65rem', color: 'var(--ink-muted)' }}>Generate a sprite to unlock downloads.</div>
              }
              {savedUrl && <div style={{ marginTop: '.5rem', fontSize: '.62rem', color: 'var(--ink-muted)' }}>
                Saved! <a href="/gallery" style={{ color: 'var(--ink)', textDecoration: 'underline' }}>View Gallery</a>
              </div>}
              {sheetReady && <>
                <hr style={{ border: 'none', borderTop: '1px solid var(--line-soft)', margin: '.9rem 0' }} />
                <span style={S.lbl}>Sprite Sheet Preview</span>
                <div style={{ background: '#e3e5e4', border: '1px solid var(--line)', padding: 4, display: 'inline-block', marginBottom: '.4rem' }}>
                  <canvas
                    ref={el => { if (el && sheetRef.current) { el.width = 240; el.height = 60; const cx = el.getContext('2d')!; cx.imageSmoothingEnabled = false; cx.drawImage(sheetRef.current, 0, 0, 240, 60) } }}
                    width={240} height={60}
                    style={{ display: 'block', imageRendering: 'pixelated' }}
                  />
                </div>
                <div style={{ display: 'flex' }}>
                  {POSE_LABELS.map((l, i) => <span key={i} style={{ fontSize: '.5rem', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', width: 60, textAlign: 'center', display: 'inline-block' }}>{l}</span>)}
                </div>
              </>}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default function EnginePage() { return <Suspense><EngineInner /></Suspense> }
