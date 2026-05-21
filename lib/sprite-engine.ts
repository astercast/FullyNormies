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
export const NORMAL_LEG_H = 11

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
  crouch: { torsoSquash:2, lArmDx:-2, lArmDy:3,  rArmDx: 2, rArmDy:3,  lLegDx: 0, rLegDx: 0, legH:6 },
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
  // legH values scaled proportionally to NORMAL_LEG_H=12: mid≈65%→8, full≈43%→5
  { label: 'Crouch', frames: [
    { torsoSquash:0, lArmDx:-1, lArmDy: 0, rArmDx:1, rArmDy: 0, lLegDx:0, rLegDx:0, legH:NORMAL_LEG_H   }, // stand
    { torsoSquash:0, lArmDx:-1, lArmDy: 1, rArmDx:1, rArmDy: 1, lLegDx:0, rLegDx:0, legH:NORMAL_LEG_H-1 }, // begin descent
    { torsoSquash:1, lArmDx:-2, lArmDy: 2, rArmDx:2, rArmDy: 2, lLegDx:0, rLegDx:0, legH:8 },              // mid descent (~65%)
    { torsoSquash:2, lArmDx:-2, lArmDy: 3, rArmDx:2, rArmDy: 3, lLegDx:0, rLegDx:0, legH:6 },              // full crouch (~46%)
    { torsoSquash:2, lArmDx:-2, lArmDy: 3, rArmDx:2, rArmDy: 3, lLegDx:0, rLegDx:0, legH:6 },              // hold
    { torsoSquash:2, lArmDx:-2, lArmDy: 3, rArmDx:2, rArmDy: 3, lLegDx:0, rLegDx:0, legH:6 },              // hold
    { torsoSquash:1, lArmDx:-2, lArmDy: 2, rArmDx:2, rArmDy: 2, lLegDx:0, rLegDx:0, legH:8 },              // mid rise
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
 * Extra torso width (total, not per-side) for row `y`.
 * Four styles: straight column, subtle chest shelf, athletic V-taper, broad chest.
 * All tapers are gradual so the body reads as natural, not blocky.
 */
function torsoRowExtra(trapStyle: number, y: number, tH: number): number {
  if (trapStyle === 0) return 0
  const t = y / Math.max(tH - 1, 1)           // 0.0 = top row, 1.0 = bottom row
  if (trapStyle === 1) return t < 0.4 ? 1 : 0  // subtle chest shelf — 1px wider at top 40%
  if (trapStyle === 2) return Math.max(0, 2 - Math.round(t * 2.5))  // athletic V — 2→1→0
  // style 3: broad chest with mid-torso taper
  if (t < 0.25) return 2
  if (t < 0.6)  return 1
  return 0
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
  const tH       = [8, 9, 10, 11, 12][torsoVar]
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
//  drawNormieCore — pure drawing logic, no DOM. Shared with server engine.
//  `set(x, y, dark)`:  dark=true → PD pixel, dark=false → background/clear
//
//  Bodies are clean solid silhouettes — all variation is structural (proportions,
//  shape, limb sizes). No patterns or designs carved into the body.
// =============================================================================
export function drawNormieCore(
  pixels: string,
  traits: TraitsData,
  cfg: PoseCfg,
  tokenId: number | null,
  set: (x: number, y: number, dark: boolean) => void
): void {

  // ── Seed extraction — structural variation only ──────────────────────────
  const seed  = traitHash(tokenId, traits)
  const seed2 = Math.imul(seed, 0x9e3779b9) >>> 0
  const s2    = (seed >> 16) & 0xff   // build
  const v0    = seed2         & 0xff   // torso height
  const v1    = (seed2 >>  8) & 0xff   // shoulder / neck
  const v2    = (seed2 >> 16) & 0xff   // arm length
  const v3    = (seed2 >> 24) & 0xff   // silhouette + leg stretch

  const normType = tv(traits, 'type')
  const age      = tv(traits, 'age')
  const isAlien  = normType === 'alien'
  const isYoung  = age.includes('young')
  const cx       = Math.floor(SW / 2)

  // ── Build & proportions (5 levels: slim → stocky) ────────────────────────
  const buildLvl = s2 % 5
  const tW = isAlien ? 7 : isYoung
    ? [7, 8, 9, 10, 11][buildLvl]
    : [8, 9, 10, 11, 12][buildLvl]

  // Torso height: 5 distinct levels
  const torsoVar = v0 % 5
  const tH       = [8, 9, 10, 11, 12][torsoVar] - cfg.torsoSquash

  // Shoulder cap: only broader builds get it
  const shOff = buildLvl >= 3 ? 1 : ((v1 & 7) === 7 ? 1 : 0)

  // Torso silhouette: straight / chest shelf / V-taper / broad chest
  const trapStyle = v3 % 4

  // Legs: 3px slim/lean, 4px regular+
  const legW  = buildLvl >= 2 ? 4 : 3
  const legGap = Math.max(3, Math.floor(tW / 3))
  const legSpan = legW * 2 + legGap

  // Arms: 2px slim builds, 3px medium+
  const armW = buildLvl >= 2 ? 3 : 2

  // Leg length variation (±0–2 px)
  const legStretch = [0, 0, 0, 1, 1, 2][((v3 ^ s2) & 0xff) % 6]
  const effLegH    = (base: number) =>
    base + Math.round(legStretch * base / Math.max(NORMAL_LEG_H, 1))

  // ── NECK ─────────────────────────────────────────────────────────────────
  const neckW = 3 + (buildLvl >= 3 || (v1 % 4 === 0) ? 1 : 0)
  const neckX = cx - Math.floor(neckW / 2)
  for (let x = neckX; x < neckX + neckW; x++) set(x, HR, true)

  // ── SHOULDER ROW ─────────────────────────────────────────────────────────
  const upperExtra = Math.max(torsoRowExtra(trapStyle, 0, tH), torsoRowExtra(trapStyle, 1, tH))
  const shW = tW + shOff * 2 + upperExtra
  const shX = cx - Math.floor(shW / 2)
  for (let x = shX; x < shX + shW; x++) set(x, HR + 1, true)

  // ── HEAD (rows 0–27) ─────────────────────────────────────────────────────
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

  // ── TORSO — clean solid fill, silhouette shape only ───────────────────────
  const tY = HR + 2
  for (let y = 0; y < tH; y++) {
    const rw = tW + torsoRowExtra(trapStyle, y, tH)
    const rx = cx - Math.floor(rw / 2)
    for (let x = rx; x < rx + rw; x++) set(x, tY + y, true)
  }

  const rowAt = (torsoRowIdx: number) => {
    const i = Math.max(0, Math.min(tH - 1, torsoRowIdx))
    const rw = tW + torsoRowExtra(trapStyle, i, tH)
    return { rx: cx - Math.floor(rw / 2), rw }
  }

  // ── ARMS ─────────────────────────────────────────────────────────────────
  const armH  = [5, 5, 6, 6, 7, 7, 8][v2 % 7]
  const topR  = rowAt(0)
  const lArmX = topR.rx - armW
  const rArmX = topR.rx + topR.rw
  const armY0 = HR + 1

  function fillArm(rootX: number, dx: number, dy: number) {
    const split  = Math.floor(armH * 0.55)
    const lShift = Math.min(Math.max(Math.round(dx * 0.5), -(armW - 1)), armW - 1)
    const lRoot  = rootX + lShift
    for (let s = 0; s < armH; s++) {
      const ax = s < split ? rootX : lRoot
      const ay = armY0 + s + Math.round(dy * s / Math.max(armH - 1, 1))
      for (let w = 0; w < armW; w++) set(ax + w, ay, true)
    }
    const hx = rootX + Math.round(dx) - (armW > 1 ? 1 : 0)
    const hy = armY0 + armH + Math.round(dy)
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < armW + 1; c++) set(hx + c, hy + r, true)
  }

  fillArm(lArmX, cfg.lArmDx, cfg.lArmDy)
  fillArm(rArmX, cfg.rArmDx, cfg.rArmDy)

  // ── HIP ──────────────────────────────────────────────────────────────────
  const hipY = tY + tH + 1
  const hipX = cx - Math.floor(legSpan / 2)
  for (let x = hipX; x < hipX + legSpan; x++) set(x, hipY, true)

  // ── LEGS + SHOES (clean, no pants patterns) ───────────────────────────────
  const lLegX = cx - Math.floor(legSpan / 2)
  const rLegX = lLegX + legW + legGap
  const legY0 = hipY + 1

  function fillLeg(baseX: number, drift: number, lh: number) {
    for (let s = 0; s < lh; s++) {
      const lx = Math.round(baseX + drift * s / Math.max(lh - 1, 1))
      for (let w = 0; w < legW; w++) set(lx + w, legY0 + s, true)
    }
    // Ankle
    const ankX = Math.round(baseX + drift)
    const ankY = legY0 + lh
    for (let w = 0; w < legW; w++) set(ankX + w, ankY, true)
    // Shoe — consistent block, always same direction
    const sw = legW + 2
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < sw; c++) set(ankX - 1 + c, ankY + 1 + r, true)
  }

  fillLeg(lLegX, cfg.lLegDx, effLegH(cfg.legH))
  fillLeg(rLegX, cfg.rLegDx, effLegH(cfg.legH))
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
