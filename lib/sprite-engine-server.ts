// =============================================================================
//  FULLNORMIES SPRITE ENGINE — SERVER-SIDE (Node.js, no DOM)
//  Shares core drawing logic with the browser engine via drawNormieCore.
//  Returns raw RGBA Uint8ClampedArray suitable for PNG encoding.
//
//  API Poses:
//    stand  — default, arms relaxed (= browser 'idle')
//    walk   — 4-frame stride cycle; pass frame 0-3
//    sit    — chair / desk pose (special leg geometry)
//    sleep  — lying down (horizontal body at bottom of canvas)
// =============================================================================
import { drawNormieCore, traitHash, tv, PoseCfg, TraitsData, PL, PD, SW, SH, NORMAL_LEG_H, standFeetBottomY } from './sprite-engine'

// ---------------------------------------------------------------------------
//  Public types
// ---------------------------------------------------------------------------
export type ApiPose = 'stand' | 'walk' | 'sit' | 'sleep'
export const API_POSES: ApiPose[] = ['stand', 'walk', 'sit', 'sleep']

export const WALK_FRAME_COUNT = 4
export const NATIVE_WIDTH  = SW   // 40 px
export const NATIVE_HEIGHT = SH   // 80 px

/** Bottom-center of feet in stand pose; `y` varies with torso length + leg stretch seed. */
export function normieStandAnchor(tokenId: number | null, traits: TraitsData): { x: number; y: number } {
  return { x: Math.floor(SW / 2), y: standFeetBottomY(tokenId, traits) }
}

// ---------------------------------------------------------------------------
//  Pose configs
// ---------------------------------------------------------------------------
const STAND_CFG: PoseCfg = {
  torsoSquash: 0,
  lArmDx: -2, lArmDy: 1,
  rArmDx:  2, rArmDy: 1,
  lLegDx: 0, rLegDx: 0,
  legH: NORMAL_LEG_H,
}

// 4 canonical walk frames: heel-strike R → passing R → heel-strike L → passing L
// Matches ANIM_CLIPS frames F0, F2, F4, F6 for consistency with downloadable sheets.
// Passing frames (1, 3) also get a +1 px vertical bob applied at draw time (see below).
const WALK_CFGS: PoseCfg[] = [
  // F0 - right heel strike: symmetric ±3 arm swing
  { torsoSquash:0, lArmDx:-3, lArmDy:-2, rArmDx:+3, rArmDy:+2, lLegDx:-4, rLegDx:+4, legH:NORMAL_LEG_H   },
  // F2 - right passing: legs together, slight knee bend
  { torsoSquash:0, lArmDx:-1, lArmDy: 0, rArmDx:+1, rArmDy: 0, lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H-1 },
  // F4 - left heel strike: exact mirror of F0
  { torsoSquash:0, lArmDx:+3, lArmDy:+2, rArmDx:-3, rArmDy:-2, lLegDx:+4, rLegDx:-4, legH:NORMAL_LEG_H   },
  // F6 - left passing: mirror of F2
  { torsoSquash:0, lArmDx:-1, lArmDy: 0, rArmDx:+1, rArmDy: 0, lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H-1 },
]

// Walk bob: passing frames (indices 1, 3) shift the entire sprite up 1 px
// to simulate the natural height peak mid-stride.
const WALK_BOB_PX = [0, 1, 0, 1]

// Sit: bent legs (~50% stand height)
const SIT_CFG: PoseCfg = {
  torsoSquash: 0,
  lArmDx: -2, lArmDy: 2,
  rArmDx:  2, rArmDy: 2,
  lLegDx: -1, rLegDx: 1,
  legH: Math.max(5, Math.round(NORMAL_LEG_H * 0.5)),
}

// ---------------------------------------------------------------------------
//  Pixel buffer (replaces HTMLCanvasElement + 2D context)
// ---------------------------------------------------------------------------
export interface PixelBuffer {
  data: Uint8ClampedArray
  width: number
  height: number
}

function createBuffer(w: number, h: number, transparent: boolean): PixelBuffer & { set: (x: number, y: number, dark: boolean) => void } {
  const data = new Uint8ClampedArray(w * h * 4)
  if (!transparent) {
    for (let i = 0; i < w * h; i++) {
      data[i * 4]     = PL[0]
      data[i * 4 + 1] = PL[1]
      data[i * 4 + 2] = PL[2]
      data[i * 4 + 3] = 255
    }
  }

  const set = (x: number, y: number, dark: boolean) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return
    const i = (y * w + x) * 4
    if (dark) {
      data[i] = PD[0]; data[i+1] = PD[1]; data[i+2] = PD[2]; data[i+3] = 255
    } else if (!transparent) {
      data[i] = PL[0]; data[i+1] = PL[1]; data[i+2] = PL[2]; data[i+3] = 255
    } else {
      data[i] = 0; data[i+1] = 0; data[i+2] = 0; data[i+3] = 0
    }
  }

  return { data, width: w, height: h, set }
}


// ---------------------------------------------------------------------------
//  Sleep pose — lying figure at bottom of 40×80 canvas
//  Head block on the left, body in the middle, legs to the right.
//  ZZZ particles float above.
// ---------------------------------------------------------------------------
function drawSleep(
  set: (x: number, y: number, dark: boolean) => void,
  pixels: string,
  traits: TraitsData,
  tokenId: number | null,
  _transparent: boolean
): void {
  const seed     = traitHash(tokenId, traits)
  const seed2    = Math.imul(seed, 0x9e3779b9) >>> 0
  const s0       = seed & 0xff
  const buildLvl = ((seed >> 16) & 0xff) % 5

  // Body thickness scales with build: 6-8 px
  const bodyH  = 6 + (buildLvl >= 3 ? 2 : buildLvl >= 1 ? 1 : 0)
  const bHalf  = Math.floor(bodyH / 2)

  // Vertical center of lying figure (lower third of 80px canvas)
  const midY = 62

  // ── ZZZ particles — 3 small 2×1 dots rising diagonally above the head ──
  const zzX0 = 3
  set(zzX0,     midY - 12, true); set(zzX0 + 1, midY - 12, true)
  set(zzX0 + 2, midY - 15, true); set(zzX0 + 3, midY - 15, true)
  set(zzX0 + 4, midY - 18, true); set(zzX0 + 5, midY - 18, true)

  // ── HEAD — rounded oval outline (9 wide × 11 tall) ─────────────────────
  // Positioned at left of figure with 1px left margin
  const HX = 1, HW = 9, HH = 11
  const HY = midY - Math.floor(HH / 2)

  // Top/bottom rows (inner only — cut corners for oval feel)
  for (let x = HX + 1; x < HX + HW - 1; x++) {
    set(x, HY,           true)   // top
    set(x, HY + HH - 1,  true)   // bottom
  }
  // Side columns
  for (let y = HY + 1; y < HY + HH - 1; y++) {
    set(HX,           y, true)    // left
    set(HX + HW - 1,  y, true)   // right
  }

  // Fill interior with light (PL) so eyes are legible on any background
  for (let y = HY + 1; y < HY + HH - 1; y++)
    for (let x = HX + 1; x < HX + HW - 1; x++) set(x, y, false)

  // Closed eyes — two parallel 2-px marks at 40 % from top
  const eyeY = HY + Math.floor(HH * 0.40)
  set(HX + 2, eyeY, true); set(HX + 3, eyeY, true)   // left eye
  set(HX + 5, eyeY, true); set(HX + 6, eyeY, true)   // right eye

  // Tiny smile
  set(HX + 3, HY + HH - 3, true)
  set(HX + 5, HY + HH - 3, true)

  // ── BODY — solid filled rectangle ───────────────────────────────────────
  const BX = HX + HW          // starts right of head
  // Max body width: leave room for legs (10) + shoe (2) + right margin (1) = 13
  const BW = Math.min(SW - BX - 13, 13 + (buildLvl >= 2 ? 2 : 0) + (s0 % 3))  // 13-17 px
  const BY = midY - bHalf
  for (let y = BY; y < BY + bodyH; y++)
    for (let x = BX; x < BX + BW; x++) set(x, y, true)

  // Shirt detail — one horizontal divider line through body center
  const shirtMidY = BY + bHalf
  for (let x = BX + 1; x < BX + BW - 1; x++) set(x, shirtMidY, false)

  // ── LEGS — slightly narrower than body ──────────────────────────────────
  const LX  = BX + BW
  const LW  = 10
  const LH  = bodyH - 1
  const LHalf = Math.floor(LH / 2)
  for (let y = midY - LHalf; y < midY - LHalf + LH; y++)
    for (let x = LX; x < LX + LW; x++) set(x, y, true)

  // Pants seam
  const seamX = LX + Math.floor(LW / 2)
  for (let y = midY - LHalf + 1; y < midY - LHalf + LH - 1; y++) set(seamX, y, false)

  // ── SHOE TIP — 3-px nub at far right, same height as body ───────────────
  const SX = LX + LW
  const SY = midY - bHalf
  const SH = bodyH
  if (SX + 2 < SW) {
    for (let y = SY; y < SY + SH; y++) set(SX, y, true)
    // Rounded toe
    set(SX + 1, SY + 1,      true)
    set(SX + 1, SY + SH - 2, true)
  } else if (SX < SW) {
    for (let y = SY; y < SY + SH; y++) set(SX, y, true)
  }

  // Suppress unused variable warning
  void seed2
}

// ---------------------------------------------------------------------------
//  Public entry point
// ---------------------------------------------------------------------------
/**
 * Render a Normie sprite server-side.
 *
 * @param pixels    1600-char pixel string from api.normies.art
 * @param traits    Traits JSON from api.normies.art
 * @param pose      One of: 'stand' | 'walk' | 'sit' | 'sleep'
 * @param frame     Walk frame index 0-3 (ignored for non-walk poses)
 * @param tokenId   Normie token ID (1-9999) for seeded body variation
 * @param transparent  If true, background is transparent (alpha=0)
 */
export function drawNormieServer(
  pixels: string,
  traits: TraitsData,
  pose: ApiPose,
  frame = 0,
  tokenId: number | null = null,
  transparent = true
): PixelBuffer {
  const buf = createBuffer(SW, SH, transparent)

  if (pose === 'sleep') {
    drawSleep(buf.set, pixels, traits, tokenId, transparent)
    return buf
  }

  // Resolve pose config
  let cfg: PoseCfg
  let bobPx = 0
  if (pose === 'walk') {
    const fi = Math.max(0, Math.min(WALK_FRAME_COUNT - 1, frame))
    cfg   = WALK_CFGS[fi]
    bobPx = WALK_BOB_PX[fi]
  } else if (pose === 'sit') {
    cfg = SIT_CFG
  } else {
    cfg = STAND_CFG
  }

  // Apply vertical bob offset: shift the entire sprite up by bobPx pixels.
  // This creates the natural height-peak at the passing frame mid-stride.
  const setFn = bobPx > 0
    ? (x: number, y: number, dark: boolean) => buf.set(x, y - bobPx, dark)
    : buf.set

  drawNormieCore(pixels, traits, cfg, tokenId, setFn)
  return buf
}

// ---------------------------------------------------------------------------
//  Build a 7-frame spritesheet (walk×4, stand×1, sit×1, sleep×1)
//  Returns a flat RGBA buffer + dimensions.
// ---------------------------------------------------------------------------
export interface SheetLayout {
  buf: PixelBuffer
  frameWidth: number
  frameHeight: number
  frames: Record<string, number[]>
  anchor: { x: number; y: number }
}

export function buildSpriteSheet(
  pixels: string,
  traits: TraitsData,
  tokenId: number | null
): SheetLayout {
  const FRAMES: Array<[ApiPose, number]> = [
    ['walk', 0], ['walk', 1], ['walk', 2], ['walk', 3],
    ['stand', 0],
    ['sit',   0],
    ['sleep', 0],
  ]
  const totalFrames = FRAMES.length
  const sheetW = SW * totalFrames
  const sheetH = SH
  const sheetData = new Uint8ClampedArray(sheetW * sheetH * 4)  // fully transparent

  FRAMES.forEach(([pose, frame], fi) => {
    const frameBuf = drawNormieServer(pixels, traits, pose, frame, tokenId, true)
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        const src = (y * SW + x) * 4
        const dst = (y * sheetW + fi * SW + x) * 4
        sheetData[dst]     = frameBuf.data[src]
        sheetData[dst + 1] = frameBuf.data[src + 1]
        sheetData[dst + 2] = frameBuf.data[src + 2]
        sheetData[dst + 3] = frameBuf.data[src + 3]
      }
    }
  })

  return {
    buf: { data: sheetData, width: sheetW, height: sheetH },
    frameWidth:  SW,
    frameHeight: SH,
    frames: {
      walk:  [0, 1, 2, 3],
      stand: [4],
      sit:   [5],
      sleep: [6],
    },
    anchor: normieStandAnchor(tokenId, traits),
  }
}
