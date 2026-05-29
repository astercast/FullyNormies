// =============================================================================
//  FULLNORMIES SPRITE ENGINE  —  shared pure-canvas drawing library
//  No React, no hooks. Safe to import in any client component.
// =============================================================================

// -- Palette ------------------------------------------------------------------
export const PL: [number,number,number] = [0xe3,0xe5,0xe4]  // light gray
export const PD: [number,number,number] = [0x48,0x49,0x4b]  // dark charcoal

// -- Native sprite dimensions -------------------------------------------------
export const SW  = 40   // sprite width  (matches Normie head width)
export const SH  = 80   // sprite height (28 head + body)
export const HR  = 28   // head rows (captures face, chin, most beard content)
export const SCL = 5    // display upscale  (40×80 → 200×400)
export const NORMAL_LEG_H = 9

/** Bump when body rules or meta schema change — surfaced in full-meta.json. */
export const ENGINE_VERSION = 'fullnormies-engine-v2'

const BUILD_LABELS = ['slim', 'lean', 'regular', 'medium', 'athletic', 'broad', 'stocky'] as const
const SILHOUETTE_LABELS = [
  'column', 'shelf', 'v-taper', 'broad', 'pear', 'compact', 'tall', 'statue',
] as const

/** Lightweight body fingerprint for game clients (from full-meta.json). */
export interface BodyProfileSummary {
  build: number
  buildLabel: string
  silhouette: number
  silhouetteLabel: string
  torsoRows: number
  chestPx: number
  waistPx: number
  hipPx: number
  armWidthPx: number
  armLengthPx: number
  legWidthPx: number
  legLengthPx: number
}

export function summarizeBodyProfile(
  tokenId: number | null,
  traits: TraitsData,
  pixels?: string | null,
): BodyProfileSummary {
  const head = pixels ? analyzeHead(pixels) : null
  const geo  = computeBodyGeometry(tokenId, traits, head, 0)
  return {
    build:           geo.buildLvl,
    buildLabel:      BUILD_LABELS[geo.buildLvl] ?? 'regular',
    silhouette:      geo.trapStyle,
    silhouetteLabel: SILHOUETTE_LABELS[geo.trapStyle] ?? 'column',
    torsoRows:       geo.tH,
    chestPx:         geo.chestW,
    waistPx:         geo.waistW,
    hipPx:           geo.hipW,
    armWidthPx:      geo.armW,
    armLengthPx:     geo.armH,
    legWidthPx:      geo.legW,
    legLengthPx:     geo.effLegH(NORMAL_LEG_H),
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/** Portrait scan — ties shoulder width to the actual on-chain face silhouette. */
export interface HeadMetrics {
  minX: number
  maxX: number
  width: number
  centerX: number
  chinY: number
}

export function analyzeHead(pixels: string): HeadMetrics | null {
  let minX = SW, maxX = -1, maxY = -1, count = 0
  for (let r = 0; r < HR; r++) {
    for (let c = 0; c < SW; c++) {
      if (pixels[r * SW + c] !== '1') continue
      minX = Math.min(minX, c)
      maxX = Math.max(maxX, c)
      maxY = Math.max(maxY, r)
      count++
    }
  }
  if (count === 0) return null
  return {
    minX,
    maxX,
    width: maxX - minX + 1,
    centerX: Math.floor((minX + maxX) / 2),
    chinY: maxY,
  }
}

/** Resolved proportions for one Normie — shared by draw + stand anchor. */
export interface BodyGeometry {
  cx: number
  buildLvl: number
  tH: number
  tY: number
  neckW: number
  shOff: number
  trapStyle: number
  chestW: number
  waistW: number
  hipW: number
  armW: number
  armH: number
  legW: number
  legGap: number
  legSpan: number
  legStretch: number
  effLegH: (base: number) => number
  torsoWidthAt: (row: number) => number
  rowAt: (row: number) => { rx: number; rw: number }
}

export function computeBodyGeometry(
  tokenId: number | null,
  traits: TraitsData,
  head: HeadMetrics | null,
  torsoSquash: number,
): BodyGeometry {
  const seed  = traitHash(tokenId, traits)
  const seed2 = Math.imul(seed, 0x9e3779b9) >>> 0
  const seed3 = Math.imul(seed2, 0x517cc1b7) >>> 0
  const s2    = (seed >> 16) & 0xff
  const v0    = seed2 & 0xff
  const v1    = (seed2 >> 8) & 0xff
  const v2    = (seed2 >> 16) & 0xff
  const v3    = (seed2 >> 24) & 0xff
  const v4    = seed3 & 0xff
  const v5    = (seed3 >> 8) & 0xff

  const normType = tv(traits, 'type')
  const age      = tv(traits, 'age')
  const gender   = tv(traits, 'gender')
  const facial   = tv(traits, 'facial feature')
  const expr     = tv(traits, 'expression')
  const hair     = tv(traits, 'hair style')

  const isAgent  = normType === 'agent'
  const isAlien  = normType === 'alien'
  const isCat    = normType === 'cat'
  const isZombie = normType === 'zombie'
  const isYoung  = age.includes('young')
  const isOld    = age.includes('old')
  const isMale   = gender.includes('male') && !gender.includes('female')
  const hasBeard = facial.includes('beard') || facial.includes('mustache') || facial.includes('goatee')

  const exprMix = expr.length > 0 ? expr.charCodeAt(0) : 0
  const hairMix = hair.length > 0 ? (hair.charCodeAt(0) ^ hair.length) : 0

  const cx = Math.floor(SW / 2)

  // 7 build tiers + trait nudges — wider spread, still thinner absolute widths
  let buildLvl = (s2 + (v4 & 3)) % 7
  if (isAgent || isOld) buildLvl = clamp(buildLvl + 1, 0, 6)
  if (isYoung || isAlien) buildLvl = clamp(buildLvl - 1, 0, 6)

  const headW = head?.width ?? 18
  const headNudge = clamp(Math.floor((headW - 18) / 3), -1, 2)

  let baseW = clamp(6 + Math.floor(buildLvl * 0.75) + headNudge, 6, 11)
  if (isAlien) baseW = clamp(baseW - 1, 5, 8)
  if (isCat) baseW = clamp(baseW - 1, 6, 10)
  if (isYoung) baseW = clamp(baseW - 1, 5, 10)
  if (isAgent) baseW = clamp(baseW + 1, 7, 12)

  // 7 torso heights — expression/hair mix extra variety
  const torsoVar = (v0 + (hairMix & 3) + (exprMix & 1)) % 7
  let tH = [7, 8, 9, 10, 10, 11, 12][torsoVar]
  if (isAgent) tH = clamp(tH + 1, 7, 13)
  if (isZombie || isOld) tH = clamp(tH - 1, 6, 12)
  if (isCat) tH = clamp(tH - 1, 6, 11)
  tH -= torsoSquash

  // 8 silhouette styles — gender/type + secondary seed
  let trapStyle = (v3 + (v5 & 7) + (exprMix & 3)) % 8
  if (isMale || isAgent) trapStyle = (trapStyle + 2) % 8
  if (!isMale && gender.includes('female')) trapStyle = (trapStyle + 5) % 8
  if (isAlien) trapStyle = 0
  if (isZombie) trapStyle = (trapStyle + 1) % 8

  const shOff = clamp(
    (buildLvl >= 5 ? 1 : 0) + (isMale && buildLvl >= 3 ? 1 : 0) + ((v1 & 15) === 15 ? 1 : 0),
    0, 1,
  )

  let chestW = baseW + shOff
  let waistW = clamp(chestW - 1 - (trapStyle % 4 === 0 ? 0 : 1), 5, chestW)
  let hipW = baseW
  if (trapStyle === 2 || trapStyle === 6) { waistW = clamp(chestW - 2, 5, chestW); hipW = clamp(baseW - 1, 5, baseW) }
  if (trapStyle === 3) { chestW = baseW + 1; waistW = clamp(baseW - 1, 5, chestW); hipW = baseW }
  if (trapStyle === 4) { waistW = clamp(baseW - 1, 5, baseW); hipW = baseW + 1 }
  if (trapStyle === 5) { chestW = clamp(baseW - 1, 5, baseW); waistW = chestW; hipW = chestW }
  if (trapStyle === 7) { chestW = baseW + 1; hipW = baseW }
  if (isZombie) hipW = Math.max(hipW, waistW)

  const torsoWidthAt = (row: number) => {
    const t = row / Math.max(tH - 1, 1)
    if (t < 0.30) return chestW + (trapStyle === 1 && t < 0.12 ? 1 : 0)
    if (t < 0.65) {
      const u = (t - 0.30) / 0.35
      return Math.round(chestW + (waistW - chestW) * u)
    }
    const u = (t - 0.65) / 0.35
    return Math.round(waistW + (hipW - waistW) * u)
  }

  const rowAt = (row: number) => {
    const i = clamp(row, 0, Math.max(tH - 1, 0))
    const rw = torsoWidthAt(i)
    return { rx: cx - Math.floor(rw / 2), rw }
  }

  // Thinner limbs — 2px default, 3px only on largest builds / agent
  let legW = buildLvl >= 4 ? 3 : 2
  if (isAlien || isYoung) legW = 2
  if (isAgent && buildLvl >= 3) legW = 3

  const legGap = Math.max(2, Math.floor((hipW + 2) / 4))
  const legSpan = legW * 2 + legGap

  let armW = buildLvl >= 5 ? 3 : 2
  if (isAgent && buildLvl >= 2) armW = 3
  if (isAlien || isYoung) armW = 2

  let armH = [4, 4, 5, 5, 6, 6, 7, 7, 8][(v2 + (v4 >> 2) + (hairMix & 1)) % 9]
  if (isOld || isCat) armH = clamp(armH - 1, 4, 8)
  if (isAgent) armH = clamp(armH + 1, 4, 8)

  let legStretch = [0, 0, 0, 0, 0, 1, 1][((v3 ^ s2 ^ v5) & 0xff) % 7]
  if (isOld || isCat) legStretch = Math.max(0, legStretch - 1)
  if (isAlien) legStretch = Math.min(legStretch + 1, 1)

  const effLegH = (base: number) => base + legStretch

  let neckW = 2 + (buildLvl >= 4 ? 1 : 0)
  if (hasBeard) neckW = clamp(neckW + 1, 2, 4)
  if (isAlien) neckW = 2

  return {
    cx,
    buildLvl,
    tH,
    tY: HR + 2,
    neckW,
    shOff,
    trapStyle,
    chestW,
    waistW,
    hipW,
    armW,
    armH,
    legW,
    legGap,
    legSpan,
    legStretch,
    effLegH,
    torsoWidthAt,
    rowAt,
  }
}

// -- Types --------------------------------------------------------------------
export interface TraitAttr { trait_type: string; value: string }
export interface TraitsData { attributes: TraitAttr[] }
export type Pose = 'idle' | 'walk' | 'crouch'

export interface PoseCfg {
  torsoSquash: number
  lArmDx: number; lArmDy: number
  rArmDx: number; rArmDy: number
  lLegDx: number; rLegDx: number
  legH: number
}

// -- Pose data ----------------------------------------------------------------
export const POSES: Pose[] = ['idle', 'walk', 'crouch']
export const POSE_LABEL: Record<Pose,string> = { idle:'Idle', walk:'Walk', crouch:'Crouch' }

// Reference poses — arm swings are always symmetric (equal magnitude, opposite sign)
// so the silhouette reads the same facing in every frame.
export const POSE_CFG: Record<Pose, PoseCfg> = {
  idle:   { torsoSquash:0, lArmDx:-2, lArmDy:1,  rArmDx: 2, rArmDy:1,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H },
  walk:   { torsoSquash:0, lArmDx:-3, lArmDy:-2, rArmDx: 3, rArmDy:2,  lLegDx:-4, rLegDx:+4, legH:NORMAL_LEG_H },
  crouch: { torsoSquash:2, lArmDx:-2, lArmDy:3,  rArmDx: 2, rArmDy:3,  lLegDx: 0, rLegDx: 0, legH:4 },
}

// =============================================================================
//  ANIMATION CLIPS  —  3 clips × 8 keyframes = 24-frame downloadable sheet
//
//  Walk biomechanics: opposite arm & leg swing together.
//  Character walks RIGHT. Positive leg-drift = foot goes right (forward).
//  Full 8-frame stride: contact → loading → passing → toe-off × 2 sides.
// =============================================================================
export const ANIM_CLIPS: { label: string; frames: PoseCfg[] }[] = [
  //
  // ── IDLE  (gentle breathing sway) ─────────────────────────────────────────
  { label: 'Idle', frames: [
    { torsoSquash:0, lArmDx:-2, lArmDy: 0, rArmDx:2, rArmDy: 0, lLegDx:0, rLegDx:0, legH:NORMAL_LEG_H }, // neutral
    { torsoSquash:0, lArmDx:-2, lArmDy: 0, rArmDx:2, rArmDy: 0, lLegDx:0, rLegDx:0, legH:NORMAL_LEG_H }, // hold
    { torsoSquash:0, lArmDx:-2, lArmDy: 1, rArmDx:2, rArmDy: 1, lLegDx:0, rLegDx:0, legH:NORMAL_LEG_H }, // exhale - arms drop
    { torsoSquash:0, lArmDx:-2, lArmDy: 1, rArmDx:2, rArmDy: 1, lLegDx:0, rLegDx:0, legH:NORMAL_LEG_H }, // exhale hold
    { torsoSquash:0, lArmDx:-2, lArmDy: 0, rArmDx:2, rArmDy: 0, lLegDx:0, rLegDx:0, legH:NORMAL_LEG_H }, // inhale start
    { torsoSquash:0, lArmDx:-2, lArmDy:-1, rArmDx:2, rArmDy:-1, lLegDx:0, rLegDx:0, legH:NORMAL_LEG_H }, // inhale - arms rise
    { torsoSquash:0, lArmDx:-2, lArmDy:-1, rArmDx:2, rArmDy:-1, lLegDx:0, rLegDx:0, legH:NORMAL_LEG_H }, // inhale hold
    { torsoSquash:0, lArmDx:-2, lArmDy: 0, rArmDx:2, rArmDy: 0, lLegDx:0, rLegDx:0, legH:NORMAL_LEG_H }, // return neutral
  ]},

  //
  // ── WALK  (4-frame stride cycle) ──────────────────────────────────────────
  //  Arms swing laterally (Dx) away from the body on the forward swing and
  //  pull back in on the back-swing. Opposite arm↔leg pairing.
  //  Passing frames keep arms at a moderate outward position so they’re always
  //  visible — never flush against the torso.
  //  Legs: ±5 drift for a clear stride.
  { label: 'Walk', frames: [
    // F0 - right heel strike: left arm forward, right arm back — symmetric ±3
    { torsoSquash:0, lArmDx:-3, lArmDy:-2, rArmDx:+3, rArmDy:+2, lLegDx:-4, rLegDx:+4, legH:NORMAL_LEG_H   },
    // F1 - loading: converging
    { torsoSquash:0, lArmDx:-2, lArmDy:-1, rArmDx:+2, rArmDy:+1, lLegDx:-2, rLegDx:+2, legH:NORMAL_LEG_H   },
    // F2 - right passing: legs together, slight knee bend
    { torsoSquash:0, lArmDx:-1, lArmDy: 0, rArmDx:+1, rArmDy: 0, lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H-1 },
    // F3 - toe-off
    { torsoSquash:0, lArmDx:+2, lArmDy:+1, rArmDx:-2, rArmDy:-1, lLegDx:+2, rLegDx:-2, legH:NORMAL_LEG_H-1 },
    // F4 - left heel strike (exact mirror of F0)
    { torsoSquash:0, lArmDx:+3, lArmDy:+2, rArmDx:-3, rArmDy:-2, lLegDx:+4, rLegDx:-4, legH:NORMAL_LEG_H   },
    // F5 - loading (mirror of F1)
    { torsoSquash:0, lArmDx:+2, lArmDy:+1, rArmDx:-2, rArmDy:-1, lLegDx:+2, rLegDx:-2, legH:NORMAL_LEG_H   },
    // F6 - left passing (mirror of F2)
    { torsoSquash:0, lArmDx:-1, lArmDy: 0, rArmDx:+1, rArmDy: 0, lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H-1 },
    // F7 - toe-off (mirror of F3)
    { torsoSquash:0, lArmDx:-2, lArmDy:-1, rArmDx:+2, rArmDy:+1, lLegDx:-2, rLegDx:+2, legH:NORMAL_LEG_H-1 },
  ]},

  //
  // ── CROUCH  (enter → hold × 2 → rise) ─────────────────────────────────────
  // legH scaled to NORMAL_LEG_H=9: mid≈67%→6, full≈44%→4
  { label: 'Crouch', frames: [
    { torsoSquash:0, lArmDx:-1, lArmDy: 0, rArmDx:1, rArmDy: 0, lLegDx:0, rLegDx:0, legH:NORMAL_LEG_H   }, // stand
    { torsoSquash:0, lArmDx:-1, lArmDy: 1, rArmDx:1, rArmDy: 1, lLegDx:0, rLegDx:0, legH:NORMAL_LEG_H-1 }, // begin descent
    { torsoSquash:1, lArmDx:-2, lArmDy: 2, rArmDx:2, rArmDy: 2, lLegDx:0, rLegDx:0, legH:6 },              // mid descent
    { torsoSquash:2, lArmDx:-2, lArmDy: 3, rArmDx:2, rArmDy: 3, lLegDx:0, rLegDx:0, legH:4 },              // full crouch
    { torsoSquash:2, lArmDx:-2, lArmDy: 3, rArmDx:2, rArmDy: 3, lLegDx:0, rLegDx:0, legH:4 },              // hold
    { torsoSquash:2, lArmDx:-2, lArmDy: 3, rArmDx:2, rArmDy: 3, lLegDx:0, rLegDx:0, legH:4 },              // hold
    { torsoSquash:1, lArmDx:-2, lArmDy: 2, rArmDx:2, rArmDy: 2, lLegDx:0, rLegDx:0, legH:6 },              // mid rise
    { torsoSquash:0, lArmDx:-1, lArmDy: 1, rArmDx:1, rArmDy: 1, lLegDx:0, rLegDx:0, legH:NORMAL_LEG_H-1 }, // nearly up
  ]},
]

// -- Helpers ------------------------------------------------------------------
export function tv(traits: TraitsData | null, key: string): string {
  if (!traits) return ''
  const attr = traits.attributes.find(a => a.trait_type.toLowerCase() === key.toLowerCase())
  return (attr?.value ?? '').toLowerCase()
}

export function traitHash(id: number | null, traits: TraitsData): number {
  let h = (id ?? 0) * 2654435761
  for (const a of (traits?.attributes ?? [])) {
    for (let i = 0; i < a.value.length; i++) {
      h = Math.imul(h ^ a.value.charCodeAt(i), 0x9e3779b9)
      h ^= h >>> 16
    }
  }
  return Math.abs(h)
}

/**
 * Bottom pixel Y of shoes in **stand** pose (feet together), native 40×80 space.
 * Matches `computeBodyGeometry` + stand leg/shoe layout.
 */
export function standFeetBottomY(tokenId: number | null, traits: TraitsData): number {
  const geo = computeBodyGeometry(tokenId, traits, null, 0)
  const hipY = geo.tY + geo.tH + 1
  const lh = geo.effLegH(NORMAL_LEG_H)
  const ankY = hipY + 1 + lh
  const shoeRows = 2
  return ankY + shoeRows
}

// -- Canvas sprite factory ----------------------------------------------------
function createSprite(transparent = false) {
  const canvas = document.createElement('canvas')
  canvas.width = SW; canvas.height = SH
  const ctx = canvas.getContext('2d')!
  if (!transparent) {
    ctx.fillStyle = `rgb(${PL[0]},${PL[1]},${PL[2]})`
    ctx.fillRect(0, 0, SW, SH)
  }
  const imgData = ctx.getImageData(0, 0, SW, SH)
  const px = (x: number, y: number, dark: boolean) => {
    if (x < 0 || x >= SW || y < 0 || y >= SH) return
    const i = (y * SW + x) * 4
    const c = dark ? PD : (transparent ? null : PL)
    if (c) { imgData.data[i]=c[0]; imgData.data[i+1]=c[1]; imgData.data[i+2]=c[2]; imgData.data[i+3]=255 }
    else   { imgData.data[i]=0; imgData.data[i+1]=0; imgData.data[i+2]=0; imgData.data[i+3]=0 }
  }
  const flush = () => ctx.putImageData(imgData, 0, 0)
  return { canvas, px, flush }
}

// =============================================================================
//  drawNormieCore — trait + portrait-aware blocky bodies (solid silhouettes).
// =============================================================================
export function drawNormieCore(
  pixels: string,
  traits: TraitsData,
  cfg: PoseCfg,
  tokenId: number | null,
  set: (x: number, y: number, dark: boolean) => void
): void {
  const head = analyzeHead(pixels)
  const geo  = computeBodyGeometry(tokenId, traits, head, cfg.torsoSquash)
  const { cx, tH, tY, neckW, armW, armH, legW, legSpan, effLegH, rowAt } = geo

  // ── NECK ─────────────────────────────────────────────────────────────────
  const neckX = cx - Math.floor(neckW / 2)
  for (let x = neckX; x < neckX + neckW; x++) set(x, HR, true)

  // ── SHOULDERS (deltoid cap from chest width + seed offset) ─────────────
  const topR = rowAt(0)
  const shW = topR.rw + geo.shOff * 2
  const shX = cx - Math.floor(shW / 2)
  for (let x = shX; x < shX + shW; x++) set(x, HR + 1, true)

  // ── HEAD ─────────────────────────────────────────────────────────────────
  let anyFace = false
  for (let r = 0; r < HR; r++)
    for (let c = 0; c < SW; c++)
      if (pixels[r * SW + c] === '1') { set(c, r, true); anyFace = true }

  if (!anyFace) {
    const hw = 16, hh = 14
    const hx = Math.floor((SW - hw) / 2), hy = 8
    for (let y = hy; y < hy + hh; y++) {
      const corner = (y === hy || y === hy + hh - 1) ? 2 : (y === hy + 1 || y === hy + hh - 2) ? 1 : 0
      for (let x = hx + corner; x < hx + hw - corner; x++) set(x, y, true)
    }
    const ey = hy + 4
    set(hx+2,ey,false); set(hx+3,ey,false); set(hx+2,ey+1,false); set(hx+3,ey+1,false)
    set(hx+10,ey,false); set(hx+11,ey,false); set(hx+10,ey+1,false); set(hx+11,ey+1,false)
    const my = hy + 10
    set(hx+3,my,false); set(hx+4,my,false); set(hx+9,my,false); set(hx+10,my,false)
    set(hx+5,my+1,false); set(hx+6,my+1,false); set(hx+7,my+1,false); set(hx+8,my+1,false)
  }

  // ── TORSO (chest → waist → hip zones) ───────────────────────────────────
  for (let y = 0; y < tH; y++) {
    const rw = geo.torsoWidthAt(y)
    const rx = cx - Math.floor(rw / 2)
    for (let x = rx; x < rx + rw; x++) set(x, tY + y, true)
  }

  // ── ARMS — rigid columns; pose translates the whole limb ─────────────────
  const lArmX = topR.rx - armW
  const rArmX = topR.rx + topR.rw
  const armY0 = HR + 1

  function fillArm(rootX: number, dx: number, dy: number) {
    for (let s = 0; s < armH; s++) {
      const t  = s / Math.max(armH - 1, 1)
      const ax = rootX + Math.round(dx * t)
      const ay = armY0 + s + Math.round(dy * t)
      for (let w = 0; w < armW; w++) set(ax + w, ay, true)
    }
    const hx = rootX + Math.round(dx)
    const hy = armY0 + armH + Math.round(dy)
    for (let w = 0; w < armW; w++) set(hx + w, hy, true)
  }

  fillArm(lArmX, cfg.lArmDx, cfg.lArmDy)
  fillArm(rArmX, cfg.rArmDx, cfg.rArmDy)

  // ── HIP BRIDGE ─────────────────────────────────────────────────────────
  const hipY = tY + tH + 1
  const hipX = cx - Math.floor(legSpan / 2)
  for (let x = hipX; x < hipX + legSpan; x++) set(x, hipY, true)

  // ── LEGS — rigid columns + simple shoe block ───────────────────────────
  const lLegX = hipX
  const rLegX = hipX + legW + geo.legGap
  const legY0 = hipY + 1
  const lh = effLegH(cfg.legH)

  function fillLeg(baseX: number, drift: number) {
    for (let s = 0; s < lh; s++) {
      const lx = Math.round(baseX + drift * s / Math.max(lh - 1, 1))
      for (let w = 0; w < legW; w++) set(lx + w, legY0 + s, true)
    }
    const ankX = Math.round(baseX + drift)
    const ankY = legY0 + lh
    for (let w = 0; w < legW; w++) set(ankX + w, ankY, true)
    const sw = legW + 2
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < sw; c++) set(ankX - 1 + c, ankY + 1 + r, true)
  }

  fillLeg(lLegX, cfg.lLegDx)
  fillLeg(rLegX, cfg.rLegDx)
}

// =============================================================================
//  drawNormie — browser wrapper (creates DOM canvas, calls drawNormieCore)
// =============================================================================
export function drawNormie(
  pixels: string,
  traits: TraitsData,
  poseOrCfg: Pose | PoseCfg,
  tokenId: number | null = null,
  transparent = false
): HTMLCanvasElement {
  const { canvas, px, flush } = createSprite(transparent)
  const cfg = typeof poseOrCfg === 'string' ? POSE_CFG[poseOrCfg] : poseOrCfg
  drawNormieCore(pixels, traits, cfg, tokenId, px)
  flush()
  return canvas
}

// -- Upscale ------------------------------------------------------------------
export function upscale(src: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width  = src.width  * scale
  out.height = src.height * scale
  const ctx  = out.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(src, 0, 0, out.width, out.height)
  return out
}

// -- Animation sheet ----------------------------------------------------------
// 24-frame sheet: 3 clips × 8 keyframes, each row = one animation.
export function makeAnimSheet(
  pix: string,
  traits: TraitsData,
  tokenId: number | null,
  scale = 1
): HTMLCanvasElement {
  const cols = 8, rows = ANIM_CLIPS.length
  const fw = SW * scale, fh = SH * scale
  const sheet = document.createElement('canvas')
  sheet.width  = fw * cols
  sheet.height = fh * rows
  const ctx = sheet.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ANIM_CLIPS.forEach((clip, row) => {
    clip.frames.forEach((cfg, col) => {
      ctx.drawImage(
        upscale(drawNormie(pix, traits, cfg, tokenId), scale),
        col * fw, row * fh
      )
    })
  })
  return sheet
}
