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
import { drawNormieCore, traitHash, tv, PoseCfg, TraitsData, PL, PD, SW, SH, NORMAL_LEG_H } from './sprite-engine'

// ---------------------------------------------------------------------------
//  Public types
// ---------------------------------------------------------------------------
export type ApiPose = 'stand' | 'walk' | 'sit' | 'sleep'
export const API_POSES: ApiPose[] = ['stand', 'walk', 'sit', 'sleep']

export const WALK_FRAME_COUNT = 4
export const NATIVE_WIDTH  = SW   // 40 px
export const NATIVE_HEIGHT = SH   // 80 px
export const ANCHOR = { x: Math.floor(SW / 2), y: SH - 4 } // bottom-center of feet

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
  // F0 - right heel strike: max stride, left arm forward
  { torsoSquash:0, lArmDx:-4, lArmDy:-2, rArmDx:+3, rArmDy:+2, lLegDx:-4, rLegDx:+4, legH:NORMAL_LEG_H   },
  // F2 - right passing: legs together, slight knee bend (body bobs up)
  { torsoSquash:0, lArmDx:-1, lArmDy: 0, rArmDx:+1, rArmDy: 0, lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H-1 },
  // F4 - left heel strike: max stride, right arm forward (exact mirror of F0)
  { torsoSquash:0, lArmDx:-3, lArmDy:+2, rArmDx:+4, rArmDy:-2, lLegDx:+4, rLegDx:-4, legH:NORMAL_LEG_H   },
  // F6 - left passing: legs together (mirror of F2, body bobs up)
  { torsoSquash:0, lArmDx:-1, lArmDy: 0, rArmDx:+1, rArmDy: 0, lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H-1 },
]

// Walk bob: passing frames (indices 1, 3) shift the entire sprite up 1 px
// to simulate the natural height peak mid-stride.
const WALK_BOB_PX = [0, 1, 0, 1]

// Sit: arms resting at side, shorter legs spread slightly (front-view seated look)
const SIT_CFG: PoseCfg = {
  torsoSquash: 0,
  lArmDx: -2, lArmDy: 2,
  rArmDx:  2, rArmDy: 2,
  lLegDx: -1, rLegDx: 1,
  legH: 5,
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
  transparent: boolean
): void {
  const seed    = traitHash(tokenId, traits)
  const seed2   = Math.imul(seed, 0x9e3779b9) >>> 0
  const s0      = seed & 0xff             // shirt color variant
  const s1      = (seed >> 8)  & 0xff     // pants
  const s3      = (seed >> 24) & 0xff     // shoe
  const v0      = seed2 & 0xff            // torso height
  const buildLvl = ((seed >> 16) & 0xff) % 5
  const bodyH   = 7 + (buildLvl >= 3 ? 1 : 0)  // thicker body for broad builds

  const baseY = 65  // vertical center of the lying figure

  // ── Clear background for sleep area (make the lying space readable) ──────
  // (background fill was done by createBuffer; we just draw on top)

  // ── ZZZ particles ─────────────────────────────────────────────────────────
  // Three tiny 2×1 dots going up-right above the head
  const zPositions = [ [3, baseY - 11], [5, baseY - 14], [7, baseY - 17] ]
  for (const [zx, zy] of zPositions) {
    set(zx, zy, true); set(zx + 1, zy, true)
  }

  // ── HEAD block ────────────────────────────────────────────────────────────
  // Simplified: 9px wide × 11px tall rectangle with open center (face hole)
  const hx = 0, hy = baseY - 6, hw = 9, hh = 11
  for (let y = hy; y < hy + hh; y++)
    for (let x = hx; x < hx + hw; x++) set(x, y, true)
  // Face cutout
  for (let y = hy + 2; y < hy + hh - 2; y++)
    for (let x = hx + 2; x < hx + hw - 2; x++) set(x, y, false)
  // Closed eyes (horizontal line)
  const eyeY = hy + Math.floor(hh * 0.45)
  for (let x = hx + 2; x < hx + hw - 2; x++) set(x, eyeY, true)

  // ── BODY block ────────────────────────────────────────────────────────────
  const bx = hx + hw, bw = 19
  for (let y = baseY - Math.floor(bodyH / 2); y < baseY - Math.floor(bodyH / 2) + bodyH; y++)
    for (let x = bx; x < bx + bw; x++) set(x, y, true)

  // Shirt detail (mirrors the shirt style from the normal engine)
  const shirtType = [0, 1, 2, 3, 6, 7, 8, 9, 10, 11][ s0 % 10 ]
  const midBody   = baseY - Math.floor(bodyH / 2) + Math.floor(bodyH / 2)
  if (shirtType === 3 || shirtType === 4) {
    // jacket/suit center line (vertical in standing = horizontal here)
    const cx2 = bx + Math.floor(bw / 2)
    for (let x = bx; x < bx + bw; x++) set(x, midBody, s0 % 3 === 0)
    set(cx2, midBody, true)
  } else if (shirtType === 1) {
    // Stripe (horizontal in standing = vertical stripe here)
    const sx2 = bx + Math.floor(bw * 0.6)
    for (let y = baseY - Math.floor(bodyH / 2) + 1; y < baseY - Math.floor(bodyH / 2) + bodyH - 1; y++)
      set(sx2, y, false)
  }

  // ── LEGS block ────────────────────────────────────────────────────────────
  const lx = bx + bw, lw = 10, lh = bodyH - 2
  for (let y = baseY - Math.floor(lh / 2); y < baseY - Math.floor(lh / 2) + lh; y++)
    for (let x = lx; x < lx + lw; x++) set(x, y, true)

  // Pants detail
  if (s1 % 8 === 1) {
    const midLeg = lx + Math.floor(lw / 2)
    for (let y = baseY - Math.floor(lh / 2); y < baseY - Math.floor(lh / 2) + lh; y++)
      set(midLeg, y, false)
  }

  // ── SHOE (tip at far right) ────────────────────────────────────────────────
  const sx = lx + lw, sh2 = s3 % 5 === 1 ? lh : lh - 2, sy2 = baseY - Math.floor(sh2 / 2)
  for (let y = sy2; y < sy2 + sh2; y++) set(sx, y, true)
  if (s3 % 5 !== 3) set(sx + 1, sy2 + 1, true)  // shoe bump
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
    anchor: ANCHOR,
  }
}
