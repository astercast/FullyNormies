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

// Reference poses
export const POSE_CFG: Record<Pose, PoseCfg> = {
  idle:   { torsoSquash:0, lArmDx:-2, lArmDy:1,  rArmDx:2, rArmDy:1,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H },
  walk:   { torsoSquash:0, lArmDx:-4, lArmDy:-2, rArmDx:3, rArmDy:2,  lLegDx:-4, rLegDx:+4, legH:NORMAL_LEG_H },
  crouch: { torsoSquash:2, lArmDx:-2, lArmDy:3,  rArmDx:2, rArmDy:3,  lLegDx: 0, rLegDx: 0, legH:4 },
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
    // F0 - right heel strike: left arm forward+up, right arm back+down; legs max spread
    { torsoSquash:0, lArmDx:-4, lArmDy:-2, rArmDx:+3, rArmDy:+2, lLegDx:-4, rLegDx:+4, legH:NORMAL_LEG_H   },
    // F1 - right loading: limbs converging toward center
    { torsoSquash:0, lArmDx:-3, lArmDy:-1, rArmDx:+2, rArmDy:+1, lLegDx:-2, rLegDx:+2, legH:NORMAL_LEG_H   },
    // F2 - right passing: legs together + slight knee bend; body at peak (bob up in API)
    { torsoSquash:0, lArmDx:-1, lArmDy: 0, rArmDx:+1, rArmDy: 0, lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H-1 },
    // F3 - right toe-off: legs spreading as left foot approaches
    { torsoSquash:0, lArmDx:-2, lArmDy:+1, rArmDx:+3, rArmDy:-1, lLegDx:+2, rLegDx:-2, legH:NORMAL_LEG_H-1 },
    // F4 - left heel strike (exact mirror of F0)
    { torsoSquash:0, lArmDx:-3, lArmDy:+2, rArmDx:+4, rArmDy:-2, lLegDx:+4, rLegDx:-4, legH:NORMAL_LEG_H   },
    // F5 - left loading (mirror of F1)
    { torsoSquash:0, lArmDx:-2, lArmDy:+1, rArmDx:+3, rArmDy:-1, lLegDx:+2, rLegDx:-2, legH:NORMAL_LEG_H   },
    // F6 - left passing (mirror of F2)
    { torsoSquash:0, lArmDx:-1, lArmDy: 0, rArmDx:+1, rArmDy: 0, lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H-1 },
    // F7 - left toe-off (mirror of F3)
    { torsoSquash:0, lArmDx:-3, lArmDy:-1, rArmDx:+2, rArmDy:+1, lLegDx:-2, rLegDx:+2, legH:NORMAL_LEG_H-1 },
  ]},

  //
  // ── CROUCH  (enter → hold × 2 → rise) ─────────────────────────────────────
  // legH scaled to NORMAL_LEG_H=9: mid≈65%→6, full≈43%→4
  { label: 'Crouch', frames: [
    { torsoSquash:0, lArmDx:-1, lArmDy: 0, rArmDx:1, rArmDy: 0, lLegDx:0, rLegDx:0, legH:NORMAL_LEG_H   }, // stand
    { torsoSquash:0, lArmDx:-1, lArmDy: 1, rArmDx:1, rArmDy: 1, lLegDx:0, rLegDx:0, legH:NORMAL_LEG_H-1 }, // begin descent
    { torsoSquash:1, lArmDx:-2, lArmDy: 2, rArmDx:2, rArmDy: 2, lLegDx:0, rLegDx:0, legH:6 },              // mid descent (~65%)
    { torsoSquash:2, lArmDx:-2, lArmDy: 3, rArmDx:2, rArmDy: 3, lLegDx:0, rLegDx:0, legH:4 },              // full crouch (~43%)
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

/** Extra torso width (both sides sum to 2× half) for row `y` — athletic / neutral silhouettes, not waist pinched. */
function torsoRowExtra(trapStyle: number, y: number, tH: number): number {
  if (trapStyle === 0) return 0
  if (trapStyle === 1) return y < 2 ? 2 : 0
  if (trapStyle === 2) return y < 3 ? 2 : 0
  const d = Math.max(tH - 1, 1)
  return Math.max(0, 2 - Math.floor((y * 3) / d))
}

/**
 * Bottom pixel Y of shoes in **stand** pose (feet together), native 40×80 space.
 * Used by the API anchor — matches `drawNormieCore` geometry for `POSE_CFG.idle` / stand.
 */
export function standFeetBottomY(tokenId: number | null, traits: TraitsData): number {
  const seed  = traitHash(tokenId, traits)
  const seed2 = Math.imul(seed, 0x9e3779b9) >>> 0
  const s2    = (seed >> 16) & 0xff
  const s3    = (seed >> 24) & 0xff
  const v0    = seed2 & 0xff
  const v3    = (seed2 >> 24) & 0xff

  const torsoVar = v0 % 5
  const tH       = [7, 8, 10, 10, 11][torsoVar]
  const hipY     = HR + 2 + tH + 1

  const legStretch = [0, 0, 0, 1, 1, 2][((v3 ^ s2) & 0xff) % 6]
  const lh         = NORMAL_LEG_H + legStretch
  const legY0      = hipY + 1
  const ankY       = legY0 + lh
  const shoeType   = s3 % 5
  const sh         = [2, 3, 2, 2, 2][shoeType]
  const sy         = shoeType === 1 ? ankY : ankY + 1
  return sy + sh - 1
}

/** Output raster: background / 1px charcoal outline / light interior fill (reference sprite look). */
export interface SpritePlot {
  bg: (x: number, y: number) => void
  edge: (x: number, y: number) => void
  fill: (x: number, y: number) => void
}

export function flushSilhouetteMask(mask: Uint8Array, plot: SpritePlot): void {
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const idx = y * SW + x
      if (!mask[idx]) {
        plot.bg(x, y)
        continue
      }
      const atEdge =
        x === 0 || x === SW - 1 || y === 0 || y === SH - 1 ||
        !mask[idx - 1] || !mask[idx + 1] || !mask[idx - SW] || !mask[idx + SW]
      if (atEdge) plot.edge(x, y)
      else plot.fill(x, y)
    }
  }
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
  const pxFill = (x: number, y: number) => {
    if (x < 0 || x >= SW || y < 0 || y >= SH) return
    const i = (y * SW + x) * 4
    imgData.data[i]=PL[0]; imgData.data[i+1]=PL[1]; imgData.data[i+2]=PL[2]; imgData.data[i+3]=255
  }
  const flush = () => ctx.putImageData(imgData, 0, 0)
  return { canvas, px, pxFill, flush }
}

// =============================================================================
//  drawNormieCore — pure drawing logic. Builds a 1-bit mask then flushes:
//  PD outline + PL interior (blocky reference-sprite look). Monochrome.
// =============================================================================
export function drawNormieCore(
  pixels: string,
  traits: TraitsData,
  cfg: PoseCfg,
  tokenId: number | null,
  plot: SpritePlot,
): void {
  const mask = new Uint8Array(SW * SH)
  const ink = (x: number, y: number, dark: boolean) => {
    if (x < 0 || x >= SW || y < 0 || y >= SH) return
    mask[y * SW + x] = dark ? 1 : 0
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SEED EXTRACTION — 3 hashed layers → huge body × outfit space
  //  16 shirts × 16 pants × 5 shoes × builds × 5 torso × 4 silhouettes
  //  × belts × 16 accessories × leg stretch × arms; coat trim layer; outline+fill raster
  // ══════════════════════════════════════════════════════════════════════════
  const seed  = traitHash(tokenId, traits)
  const seed2 = Math.imul(seed, 0x9e3779b9) >>> 0
  const seed3 = Math.imul(seed2, 0x517cc1b7) >>> 0
  const s0    = seed             & 0xff   // shirt
  const s1    = (seed >>  8)     & 0xff   // pants
  const s2    = (seed >> 16)     & 0xff   // build
  const s3    = (seed >> 24)     & 0xff   // shoe
  const v0    = seed2            & 0xff   // torso height
  const v1    = (seed2 >>  8)    & 0xff   // shoulder
  const v2    = (seed2 >> 16)    & 0xff   // arm length (7 tiers)
  const v3    = (seed2 >> 24)    & 0xff   // torso silhouette + outfit mixing
  const v4    = seed3            & 0xff   // belt
  const v5    = (seed3 >>  8)    & 0xff   // accessory
  const v6    = (seed3 >> 16)    & 0xff   // pants mix + outer shirt id
  const v7    = (seed3 >> 24)    & 0xff   // coat trim / extras

  const normType  = tv(traits, 'type')
  const age       = tv(traits, 'age')
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
  const hasBeard = facial.includes('beard') || facial.includes('mustache') || facial.includes('goatee')
  const isAngry  = expr.includes('angry') || expr.includes('serious')
  const cx       = Math.floor(SW / 2)   // 20

  // ── Build & proportions ───────────────────────────────────────────────────
  // Blocky reference proportions — wide torso (≈ head scale), short chunky legs, 2px arms.
  const buildLvl = s2 % 5
  const baseTW   = isAlien ? 9 : isYoung ? 11 : 12
  const tW       = baseTW + Math.min(buildLvl + (v7 & 1), 4)

  // Torso height: 5 levels (short → tall)
  const torsoVar = v0 % 5
  const tH       = [7, 8, 10, 10, 11][torsoVar] - cfg.torsoSquash

  // Shoulders: broader caps on bigger frames + seeded breadth (neutral / athletic read).
  const shOff = Math.min(2, (buildLvl >= 1 ? 1 : 0) + (buildLvl >= 4 ? 1 : 0) + ((v1 & 3) >= 2 ? 1 : 0))

  // Torso silhouette: 0=boxy column, 1-2=upper flare (wider chest), 3=gentle V-taper (still straight hips).
  const trapStyle = (v3 + v6) % 4

  let legW = buildLvl >= 2 ? 4 : 3
  if (buildLvl >= 4 && v1 % 2 === 0) legW = 5
  const legGap   = Math.max(2, Math.floor(tW / 4))
  const legSpan  = legW * 2 + legGap

  const armW = 2

  // Longer/shorter legs — subtle stride DNA; scaled on crouch frames.
  const legStretch = [0, 0, 0, 1, 1, 2][((v3 ^ s2) & 0xff) % 6]
  const effLegH    = (base: number) =>
    base + Math.round(legStretch * base / Math.max(NORMAL_LEG_H, 1))

  // Style selectors — mix in v3 so one seed layer decorates another (explodes outfit combos).
  const shirtPick  = (s0 + (v3 >> 2) + (v6 >> 4)) % 16
  const pantsDetail = (s1 ^ (v3 >> 4) ^ v6) & 15
  const shoeType    = (s3 ^ (v6 >> 2)) % 5
  const beltType    = v4 % 8

  // ── NECK ────────────────────────────────────────────────────────────────
  const neckW = 3 + (buildLvl >= 3 || (v1 % 4 === 0) ? 1 : 0)
  const neckX = cx - Math.floor(neckW / 2)
  for (let x = neckX; x < neckX + neckW; x++) ink(x, HR, true)

  // ── SHOULDER (match upper chest flare) ───────────────────────────────────
  const upperExtra = Math.max(torsoRowExtra(trapStyle, 0, tH), torsoRowExtra(trapStyle, 1, tH))
  const shW        = tW + shOff * 2 + upperExtra
  const shX        = cx - Math.floor(shW / 2)
  for (let x = shX; x < shX + shW; x++) ink(x, HR + 1, true)

  // ── HEAD (rows 0–27) ─────────────────────────────────────────────────────
  for (let r = 0; r < HR; r++)
    for (let c = 0; c < SW; c++)
      if (pixels[r * SW + c] === '1') ink(c, r, true)

  // ── TORSO — rows vary width from seed (wider chest / V-taper), not waist-pinched
  const tY = HR + 2
  for (let y = 0; y < tH; y++) {
    const rw = tW + torsoRowExtra(trapStyle, y, tH)
    const rx = cx - Math.floor(rw / 2)
    for (let x = rx; x < rx + rw; x++) ink(x, tY + y, true)
  }

  const rowAt = (torsoRowIdx: number) => {
    const i = Math.max(0, Math.min(tH - 1, torsoRowIdx))
    const rw = tW + torsoRowExtra(trapStyle, i, tH)
    return { rx: cx - Math.floor(rw / 2), rw }
  }

  // ── SHIRT (12 styles) ────────────────────────────────────────────────────
  const shirtMapN = [0, 1, 2, 3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0, 1]
  const shirtType = isAgent ? 4 : isZombie ? 5 : shirtMapN[shirtPick]

  if (shirtType === 0) {
    // Plain — collar notch
    ink(cx, tY, false)
  } else if (shirtType === 1) {
    // Striped — single horizontal stripe
    const sY = tY + Math.floor(tH * 0.6)
    if (sY > tY && sY < tY + tH - 1) {
      const { rx, rw } = rowAt(sY - tY)
      for (let x = rx + 1; x < rx + rw - 1; x++) ink(x, sY, false)
    }
  } else if (shirtType === 2) {
    // Hoodie — collar rectangle
    ink(cx - 1, tY, false); ink(cx, tY, false)
  } else if (shirtType === 3) {
    // Jacket — center line + buttons
    for (let y = tY; y < tY + tH - 1; y++) ink(cx, y, false)
    if (tH > 3) ink(cx, tY + 3, true)
    if (tH > 6) ink(cx, tY + 6, true)
  } else if (shirtType === 4) {
    // Agent suit — center seam + buttons
    for (let y = tY + 1; y < tY + tH - 1; y++) ink(cx, y, false)
    for (let y = tY + 2; y < tY + tH - 1; y += 3) ink(cx, y, true)
  } else if (shirtType === 5) {
    // Zombie torn — scattered holes
    ink(cx, tY, false)
    for (const hy of [3, 6]) if (hy < tH - 1) {
      const { rx, rw } = rowAt(hy)
      ink(rx + 1, tY + hy, false); ink(rx + rw - 2, tY + hy, false)
    }
  } else if (shirtType === 6) {
    // V-neck — V shaped collar
    ink(cx, tY, false); ink(cx - 1, tY, false); ink(cx + 1, tY, false)
    if (tH > 2) ink(cx, tY + 1, false)
  } else if (shirtType === 7) {
    // Tank top — exposed shoulder corners (sleeveless look)
    const tr = rowAt(0)
    ink(tr.rx, tY, false); ink(tr.rx + 1, tY, false)
    ink(tr.rx + tr.rw - 1, tY, false); ink(tr.rx + tr.rw - 2, tY, false)
    if (tH > 1) { ink(tr.rx, tY + 1, false); ink(tr.rx + tr.rw - 1, tY + 1, false) }
  } else if (shirtType === 8) {
    // Turtleneck — fully solid, no collar cut
  } else if (shirtType === 9) {
    // Cross-hatch — checkerboard texture
    for (let y = tY + 1; y < tY + tH - 1; y++) {
      const { rx, rw } = rowAt(y - tY)
      for (let x = rx + 1 + ((y - tY) & 1); x < rx + rw - 1; x += 2)
        ink(x, y, false)
    }
  } else if (shirtType === 10) {
    // Half-zip — center line upper half only
    const half = Math.floor(tH / 2)
    for (let y = tY; y < tY + half; y++) ink(cx, y, false)
  } else if (shirtType === 11) {
    // Double stripe — two horizontal stripes
    const y1 = tY + Math.floor(tH * 0.35)
    const y2 = tY + Math.floor(tH * 0.65)
    for (const sy of [y1, y2])
      if (sy > tY && sy < tY + tH - 1) {
        const { rx, rw } = rowAt(sy - tY)
        for (let x = rx + 1; x < rx + rw - 1; x++) ink(x, sy, false)
      }
  } else if (shirtType === 12) {
    // Lab coat — open center column + side panels
    for (let y = tY + 1; y < tY + tH - 1; y++) {
      ink(cx, y, false)
      const { rx, rw } = rowAt(y - tY)
      ink(rx - 1, y, true)
      ink(rx + rw, y, true)
    }
  } else if (shirtType === 13) {
    // Long robe — hem flare on bottom row
    if (tH > 1) {
      const { rx, rw } = rowAt(tH - 1)
      ink(rx - 2, tY + tH - 1, true)
      ink(rx + rw + 1, tY + tH - 1, true)
    }
  } else if (shirtType === 14) {
    // Uniform — chest pocket notches
    const pr = tY + Math.floor(tH * 0.35)
    if (pr > tY && pr < tY + tH - 1) {
      const { rx, rw } = rowAt(pr - tY)
      if (rw > 4) {
        ink(rx + 1, pr, false)
        ink(rx + rw - 2, pr, false)
      }
    }
  } else if (shirtType === 15) {
    // Graphic tee — centered chest block
    const gy = tY + Math.floor(tH * 0.42)
    const { rx, rw } = rowAt(gy - tY)
    const mx = rx + Math.floor(rw / 2) - 1
    if (mx >= rx && mx + 1 < rx + rw) {
      ink(mx, gy, false); ink(mx + 1, gy, false)
      ink(mx, gy + 1, false); ink(mx + 1, gy + 1, false)
    }
  }

  // ── Coat / lapel trim (layered over base shirt) ─────────────────────────
  if (!isAgent && shirtType !== 5 && shirtType !== 12) {
    const trim = (v7 ^ v1) % 8
    if (trim === 1) {
      const { rx, rw } = rowAt(0)
      ink(rx + 1, tY + 1, true)
      ink(rx + rw - 2, tY + 1, true)
    } else if (trim === 2 && tH > 2) {
      const { rx, rw } = rowAt(tH - 1)
      ink(rx - 1, tY + tH - 1, true)
      ink(rx + rw, tY + tH - 1, true)
    } else if (trim === 3) {
      ink(shX, HR + 1, true)
      ink(shX + shW - 1, HR + 1, true)
    }
  }
  const hasCenterLine = shirtType === 3 || shirtType === 4 || shirtType === 10
  if (isAgent) {
    // Agent always gets a tie — draws over suit seam
    for (let dy = 1; dy < Math.min(5, tH); dy++) ink(cx, tY + dy, true)
  } else {
    const accRoll = v5 % 16
    if (accRoll === 7 && !hasCenterLine) {
      // Tie
      for (let dy = 1; dy < Math.min(5, tH); dy++) ink(cx, tY + dy, true)
      if (tH > 3) ink(cx, tY + Math.min(4, tH - 1), false)
    } else if (accRoll === 8) {
      // Bowtie
      ink(cx - 1, tY, true); ink(cx, tY, false); ink(cx + 1, tY, true)
    } else if (accRoll === 9) {
      // Chain / necklace on shoulder row
      for (let x = cx - 2; x <= cx + 2; x++) ink(x, HR, false)
      ink(cx, HR, true)
    } else if (accRoll === 10) {
      // Suspenders — inner vertical straps
      const maxD = Math.min(tH - 2, 5)
      for (let dy = 2; dy <= maxD; dy++) {
        const { rx, rw } = rowAt(dy)
        ink(rx + 1, tY + dy, true)
        ink(rx + rw - 2, tY + dy, true)
      }
    } else if (accRoll === 11) {
      // ID lanyard — center strip + badge at chest
      const d0 = Math.min(4, tH - 2)
      for (let dy = 2; dy <= d0; dy++) ink(cx, tY + dy, false)
      if (tH > 4) { ink(cx - 1, tY + 3, true); ink(cx, tY + 3, true); ink(cx + 1, tY + 3, true) }
    } else if (accRoll === 12) {
      // Chest band
      const yy = tY + Math.max(2, tH - 3)
      const { rx, rw } = rowAt(yy - tY)
      for (let x = rx + 1; x < rx + rw - 1; x++) ink(x, yy, true)
    } else if (accRoll === 13) {
      // Side satchel hint — vertical strip past left hip line
      const yy = tY + Math.floor(tH * 0.55)
      const { rx } = rowAt(yy - tY)
      for (let dy = 0; dy < 3; dy++) ink(rx - 2, yy + dy, true)
    } else if (accRoll === 14) {
      // Collar pins
      ink(cx - 2, tY, true)
      ink(cx + 2, tY, true)
    } else if (accRoll === 15) {
      // Shoulder boards
      for (let dy = 1; dy <= 2; dy++) {
        ink(shX + 1, HR + 1 + dy, true)
        ink(shX + shW - 2, HR + 1 + dy, true)
      }
    }
  }

  // ── BELT (6 styles) — flush with bottom torso row ───────────────────────
  const { rx: bX, rw: bW } = rowAt(tH - 1)
  const beltY = tY + tH
  if (beltType === 0) {
    for (let x = bX; x < bX + bW; x++) ink(x, beltY, true)
    ink(cx, beltY, false)
  } else if (beltType === 1) {
    for (let x = bX; x < bX + bW; x++) ink(x, beltY, true)
  } else if (beltType === 2) {
    for (let x = bX; x < bX + bW; x++) ink(x, beltY, true)
    for (let x = bX + 1; x < bX + bW - 1; x += 2) ink(x, beltY, false)
  } else if (beltType === 3) {
    for (let x = bX; x < bX + bW; x++) ink(x, beltY, true)
    for (let x = bX + 2; x < bX + bW - 1; x += 4) ink(x, beltY, false)
  } else if (beltType === 4) {
    for (let x = bX; x < bX + bW; x++) ink(x, beltY, true)
    if (bW > 5) { ink(bX + 2, beltY, false); ink(bX + bW - 3, beltY, false) }
  } else if (beltType === 5) {
    for (let x = bX; x < bX + bW; x++) ink(x, beltY, true)
    if (bW > 4) {
      ink(bX + 1, beltY, false)
      ink(bX + bW - 2, beltY, false)
    }
  } else if (beltType === 6) {
    for (let x = bX; x < bX + bW; x++) ink(x, beltY, true)
    ink(cx - 1, beltY, false)
    ink(cx + 1, beltY, false)
  } else {
    // 7 — no belt
  }

  // ── ARMS — straight chunky columns (reference style); slight swing from pose
  const armH = [4, 4, 5, 5, 6, 6, 7][v2 % 7]
  const topR = rowAt(0)
  const lArmX = topR.rx - armW
  const rArmX = topR.rx + topR.rw
  const armY0 = HR + 1

  function fillArm(rootX: number, dx: number, dy: number) {
    for (let s = 0; s < armH; s++) {
      const ay = armY0 + s + Math.round(dy * s / Math.max(armH - 1, 1))
      const ax = rootX + Math.round(dx * s / Math.max(armH - 1, 1))
      for (let w = 0; w < armW; w++) ink(ax + w, ay, true)
    }
    const hy = armY0 + armH + Math.round(dy)
    const hx = rootX + Math.round(dx)
    for (let w = 0; w < armW; w++) ink(hx + w, hy, true)
  }

  fillArm(lArmX, cfg.lArmDx, cfg.lArmDy)
  fillArm(rArmX, cfg.rArmDx, cfg.rArmDy)

  // Tank top: clear top arm row for sleeveless look
  if (shirtType === 7) {
    for (let w = 0; w < armW; w++) { ink(lArmX + w, armY0, false); ink(rArmX + w, armY0, false) }
  }

  // ── HIP — matches belt / leg span (no hourglass pinch) ───────────────────
  const hipY  = tY + tH + 1
  const hipW  = Math.max(legSpan, bW)
  const hipX  = cx - Math.floor(hipW / 2)
  for (let x = hipX; x < hipX + hipW; x++) ink(x, hipY, true)

  // ── LEGS ─────────────────────────────────────────────────────────────────
  const lLegX = cx - Math.floor(legSpan / 2)
  const rLegX = lLegX + legW + legGap
  const legY0 = hipY + 1   // legs start immediately after hip

  // No crotch fill — the gap cleanly separates legs

  function fillLeg(baseX: number, drift: number, lh: number) {
    for (let s = 0; s < lh; s++) {
      const lx = Math.round(baseX + drift * s / Math.max(lh - 1, 1))
      for (let w = 0; w < legW; w++) ink(lx + w, legY0 + s, true)
      // 8 pants styles
      if (pantsDetail === 1) ink(lx + Math.floor(legW / 2), legY0 + s, false)                           // center seam
      if (pantsDetail === 2 && s >= 1 && s <= 3) ink(lx + legW - 1, legY0 + s, false)                   // side pocket
      if (pantsDetail === 3 && s === lh - 1) for (let x = lx; x < lx + legW + 1; x++) ink(x, legY0 + s, true) // cuffed
      if (pantsDetail === 4 && s === Math.floor(lh * 0.4)) for (let x = lx; x < lx + legW; x++) ink(x, legY0 + s, false) // shorts hem
      if (pantsDetail === 5 && s === lh - 3 && lh > 4) for (let x = lx; x < lx + legW; x++) ink(x, legY0 + s, false)     // rolled cuff
      if (pantsDetail === 6 && s > 0 && s < lh) {                                                        // pinstripe
        const trd = Math.floor(legW / 3)
        if (trd > 0) ink(lx + trd, legY0 + s, false)
        if (legW > 3) ink(lx + legW - 1 - trd, legY0 + s, false)
      }
      if (pantsDetail === 7 && (s === 2 || s === 5) && s < lh) ink(lx + 1, legY0 + s, false)            // patched
      if (pantsDetail === 8 && (s === 2 || s === lh - 2)) ink(lx, legY0 + s, false)                       // side scuff
      if (pantsDetail === 9 && s === Math.floor(lh * 0.55)) ink(lx + 1, legY0 + s, false)                // knee mark
      if (pantsDetail === 10 && s % 2 === 0 && s < lh) ink(lx + legW - 1, legY0 + s, false)               // outer stripe
      if (pantsDetail === 11 && s > 1 && s < lh - 1) ink(lx, legY0 + s, false)                           // inner fade
      if (pantsDetail === 12 && (s === 1 || s === lh - 2)) {                                            // cargo blocks
        ink(lx + 1, legY0 + s, false)
        ink(lx + 2, legY0 + s, false)
      }
      if (pantsDetail === 13 && s === lh - 1) ink(lx + Math.floor(legW / 2), legY0 + s, false)            // hem split
      if (pantsDetail === 14 && s <= 2)
        for (let xx = lx; xx < lx + legW; xx++)
          if ((xx + s) & 1) ink(xx, legY0 + s, false)
      if (pantsDetail === 15 && s === Math.floor(lh * 0.35))
        for (let xx = lx + 1; xx < lx + legW - 1; xx++)
          ink(xx, legY0 + s, false)
    }
    // Ankle
    const ankX = Math.round(baseX + drift)
    const ankY = legY0 + lh
    for (let w = 0; w < legW; w++) ink(ankX + w, ankY, true)
    // Shoe — 5 styles, proportional overhang past leg width
    const sw = [legW+2, legW+1, legW+2, legW+1, legW+3][shoeType]
    const sh = [2, 3, 2, 2, 2][shoeType]
    const sx = shoeType === 3 ? ankX : ankX - 1                // flat shoes don't extend
    const sy = shoeType === 1 ? ankY : ankY + 1                // boots start at ankle row
    for (let r = 0; r < sh; r++)
      for (let c = 0; c < sw; c++) ink(sx + c, sy + r, true)
    if (shoeType === 2) ink(sx + sw - 1, sy, false)            // sneaker detail
  }

  fillLeg(lLegX, cfg.lLegDx, effLegH(cfg.legH))
  fillLeg(rLegX, cfg.rLegDx, effLegH(cfg.legH))
  flushSilhouetteMask(mask, plot)
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
  const { canvas, px, pxFill, flush } = createSprite(transparent)
  const cfg = typeof poseOrCfg === 'string' ? POSE_CFG[poseOrCfg] : poseOrCfg
  drawNormieCore(pixels, traits, cfg, tokenId, {
    bg: (x, y) => px(x, y, false),
    edge: (x, y) => px(x, y, true),
    fill: (x, y) => pxFill(x, y),
  })
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
