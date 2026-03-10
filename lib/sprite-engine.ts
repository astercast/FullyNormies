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
export const NORMAL_LEG_H = 12

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

// Reference poses — used for the 3 display cards
export const POSE_CFG: Record<Pose, PoseCfg> = {
  idle:   { torsoSquash:0, lArmDx:-1, lArmDy:1,  rArmDx:1,  rArmDy:1,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H },
  walk:   { torsoSquash:0, lArmDx:-4, lArmDy:-2, rArmDx:3,  rArmDy:2,  lLegDx:-4, rLegDx:+4, legH:NORMAL_LEG_H },
  crouch: { torsoSquash:2, lArmDx:-2, lArmDy:3,  rArmDx:2,  rArmDy:3,  lLegDx: 0, rLegDx: 0, legH:6 },
}

// =============================================================================
//  ANIMATION CLIPS  —  3 clips × 4 keyframes = 12-frame downloadable sheet
//
//  Walk biomechanics: opposite arm & leg swing together.
//  Character walks RIGHT. Positive leg-drift = foot goes right (forward).
//  "Contact" frames: feet fully spread (large drift). "Down" frames: feet
//  under body (small drift), legH–2 to suggest bent knees on weight-acceptance.
// =============================================================================
export const ANIM_CLIPS: { label: string; frames: PoseCfg[] }[] = [
  //
  // ── IDLE  (gentle breathing sway) ─────────────────────────────────────────
  { label: 'Idle', frames: [
    { torsoSquash:0, lArmDx:-1, lArmDy:0,  rArmDx:1,  rArmDy:0,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H },
    { torsoSquash:0, lArmDx:-1, lArmDy:1,  rArmDx:1,  rArmDy:1,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H },
    { torsoSquash:0, lArmDx:-1, lArmDy:0,  rArmDx:1,  rArmDy:0,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H },
    { torsoSquash:0, lArmDx:-1, lArmDy:1,  rArmDx:1,  rArmDy:1,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H },
  ]},

  //
  // ── WALK  (4-frame stride cycle) ──────────────────────────────────────────
  //  Arms swing laterally (Dx) away from the body on the forward swing and
  //  pull back in on the back-swing. Opposite arm↔leg pairing.
  //  Passing frames keep arms at a moderate outward position so they’re always
  //  visible — never flush against the torso.
  //  Legs: ±5 drift for a clear stride.
  { label: 'Walk', frames: [
    // F1 — right contact: L arm forward, R arm back
    { torsoSquash:0, lArmDx:-5, lArmDy:-3, rArmDx:3, rArmDy:2,  lLegDx:-4, rLegDx:+4, legH:NORMAL_LEG_H   },
    // F2 — passing: arms at sides, legs together, slight knee bend
    { torsoSquash:0, lArmDx:-2, lArmDy: 0, rArmDx:2, rArmDy:0,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H-1 },
    // F3 — left contact: R arm forward, L arm back
    { torsoSquash:0, lArmDx:-3, lArmDy: 2, rArmDx:5, rArmDy:-3, lLegDx:+4, rLegDx:-4, legH:NORMAL_LEG_H   },
    // F4 — passing (mirror of F2)
    { torsoSquash:0, lArmDx:-2, lArmDy: 0, rArmDx:2, rArmDy:0,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H-1 },
  ]},

  //
  // ── CROUCH  (enter → hold × 2 → rise) ─────────────────────────────────────
  { label: 'Crouch', frames: [
    { torsoSquash:1, lArmDx:-1, lArmDy: 2, rArmDx: 1, rArmDy: 2, lLegDx: 0, rLegDx: 0, legH:8 },
    { torsoSquash:2, lArmDx:-2, lArmDy: 3, rArmDx: 2, rArmDy: 3, lLegDx: 0, rLegDx: 0, legH:6 },
    { torsoSquash:2, lArmDx:-2, lArmDy: 4, rArmDx: 2, rArmDy: 4, lLegDx: 0, rLegDx: 0, legH:6 },
    { torsoSquash:1, lArmDx:-1, lArmDy: 2, rArmDx: 1, rArmDy: 2, lLegDx: 0, rLegDx: 0, legH:8 },
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
//  drawNormie — main sprite compositor
// =============================================================================
export function drawNormie(
  pixels: string,
  traits: TraitsData,
  poseOrCfg: Pose | PoseCfg,
  tokenId: number | null = null,
  transparent = false
): HTMLCanvasElement {
  const { canvas, px, flush } = createSprite(transparent)
  const set = px
  const cfg = typeof poseOrCfg === 'string' ? POSE_CFG[poseOrCfg] : poseOrCfg

  // ══════════════════════════════════════════════════════════════════════════
  //  SEED EXTRACTION — 3 hashed layers for 3M+ unique body combinations
  //  12 shirts × 8 pants × 5 shoes × 5 builds × 3 torso heights
  //  × 3 shoulders × 3 leg widths × 4 belts × 4 accessories
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
  const v2    = (seed2 >> 16)    & 0xff   // leg width
  const v3    = (seed2 >> 24)    & 0xff   // (reserved)
  const v4    = seed3            & 0xff   // belt
  const v5    = (seed3 >>  8)    & 0xff   // accessory

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
  const buildLvl  = s2 % 5   // 0=slim  1=lean  2=medium  3=broad  4=stocky
  const baseTW    = isAlien ? 7 : isYoung ? 8 : isCat ? 9 : isZombie ? 9 : isOld ? 10 : 10
  const tW        = baseTW + buildLvl     // 7–14 px
  const tX        = cx - Math.floor(tW / 2)

  // Torso height: 3 levels
  const torsoVar  = v0 % 3               // 0=short  1=normal  2=tall
  const tH        = [8, 10, 12][torsoVar] - cfg.torsoSquash

  // Shoulder overhang: 3 widths
  const shOff     = [0, 2, 4][v1 % 3]    // narrow / normal / broad

  // Leg width: 3 thicknesses
  const legW      = [3, 4, 5][v2 % 3]    // thin / normal / thick
  const legGap    = 2
  const legSpan   = legW * 2 + legGap

  // Style selectors
  const shoeType    = s3 % 5              // 5 shoe styles
  const pantsDetail = s1 % 8              // 8 pants styles
  const beltType    = v4 % 4              // 4 belt styles

  // ── HEAD (rows 0–27) ─ head sits directly on body, no explicit neck ───────
  for (let r = 0; r < HR; r++)
    for (let c = 0; c < SW; c++)
      if (pixels[r * SW + c] === '1') set(c, r, true)

  // ── SHOULDER ──────────────────────────────────────────────────────────────
  const shW  = tW + shOff
  const shX  = cx - Math.floor(shW / 2)
  for (let x = shX; x < shX + shW; x++) set(x, HR, true)

  // ── TORSO ─────────────────────────────────────────────────────────────────
  const tY = HR + 1
  for (let y = 0; y < tH; y++)
    for (let x = tX; x < tX + tW; x++) set(x, tY + y, true)

  // ── SHIRT (12 styles) ────────────────────────────────────────────────────
  const shirtMap  = [0,1,2,3,6,7,8,9,10,11]          // 10 normal options
  const shirtType = isAgent ? 4 : isZombie ? 5 : shirtMap[s0 % 10]

  if (shirtType === 0) {
    // Plain — collar notch
    set(cx, tY, false)
  } else if (shirtType === 1) {
    // Striped — single horizontal stripe
    const sY = tY + Math.floor(tH * 0.6)
    if (sY > tY && sY < tY + tH - 1)
      for (let x = tX + 1; x < tX + tW - 1; x++) set(x, sY, false)
  } else if (shirtType === 2) {
    // Hoodie — collar rectangle
    set(cx - 1, tY, false); set(cx, tY, false)
  } else if (shirtType === 3) {
    // Jacket — center line + buttons
    for (let y = tY; y < tY + tH - 1; y++) set(cx, y, false)
    if (tH > 3) set(cx, tY + 3, true)
    if (tH > 6) set(cx, tY + 6, true)
  } else if (shirtType === 4) {
    // Agent suit — center seam + buttons
    for (let y = tY + 1; y < tY + tH - 1; y++) set(cx, y, false)
    for (let y = tY + 2; y < tY + tH - 1; y += 3) set(cx, y, true)
  } else if (shirtType === 5) {
    // Zombie torn — scattered holes
    set(cx, tY, false)
    for (const hy of [3, 6]) if (hy < tH - 1) {
      set(tX + 1, tY + hy, false); set(tX + tW - 2, tY + hy, false)
    }
  } else if (shirtType === 6) {
    // V-neck — V shaped collar
    set(cx, tY, false); set(cx - 1, tY, false); set(cx + 1, tY, false)
    if (tH > 2) set(cx, tY + 1, false)
  } else if (shirtType === 7) {
    // Tank top — exposed shoulder corners (sleeveless look)
    set(tX, tY, false); set(tX + 1, tY, false)
    set(tX + tW - 1, tY, false); set(tX + tW - 2, tY, false)
    if (tH > 1) { set(tX, tY + 1, false); set(tX + tW - 1, tY + 1, false) }
  } else if (shirtType === 8) {
    // Turtleneck — fully solid, no collar cut
  } else if (shirtType === 9) {
    // Cross-hatch — checkerboard texture
    for (let y = tY + 1; y < tY + tH - 1; y++)
      for (let x = tX + 1 + ((y - tY) & 1); x < tX + tW - 1; x += 2)
        set(x, y, false)
  } else if (shirtType === 10) {
    // Half-zip — center line upper half only
    const half = Math.floor(tH / 2)
    for (let y = tY; y < tY + half; y++) set(cx, y, false)
  } else if (shirtType === 11) {
    // Double stripe — two horizontal stripes
    const y1 = tY + Math.floor(tH * 0.35)
    const y2 = tY + Math.floor(tH * 0.65)
    for (const sy of [y1, y2])
      if (sy > tY && sy < tY + tH - 1)
        for (let x = tX + 1; x < tX + tW - 1; x++) set(x, sy, false)
  }

  // ── ACCESSORY (tie / bowtie / chain) ──────────────────────────────────────
  const hasCenterLine = shirtType === 3 || shirtType === 4 || shirtType === 10
  if (isAgent) {
    // Agent always gets a tie — draws over suit seam
    for (let dy = 1; dy < Math.min(5, tH); dy++) set(cx, tY + dy, true)
  } else {
    const accRoll = v5 % 10
    if (accRoll === 7 && !hasCenterLine) {
      // Tie
      for (let dy = 1; dy < Math.min(5, tH); dy++) set(cx, tY + dy, true)
      if (tH > 3) set(cx, tY + Math.min(4, tH - 1), false)
    } else if (accRoll === 8) {
      // Bowtie
      set(cx - 1, tY, true); set(cx, tY, false); set(cx + 1, tY, true)
    } else if (accRoll === 9) {
      // Chain / necklace on shoulder row
      for (let x = cx - 2; x <= cx + 2; x++) set(x, HR, false)
      set(cx, HR, true)
    }
  }

  // ── BELT (4 styles) ──────────────────────────────────────────────────────
  const beltY = tY + tH - 1
  if (beltType === 0) {
    // Standard — buckle gap
    for (let x = tX - 1; x <= tX + tW; x++) set(x, beltY, true)
    set(cx, beltY, false)
  } else if (beltType === 1) {
    // Double belt
    for (let x = tX - 1; x <= tX + tW; x++) set(x, beltY, true)
    if (beltY - 1 >= tY) for (let x = tX - 1; x <= tX + tW; x++) set(x, beltY - 1, true)
    set(cx, beltY, false)
  } else if (beltType === 2) {
    // Studded belt
    for (let x = tX - 1; x <= tX + tW; x++) set(x, beltY, true)
    for (let x = tX; x < tX + tW; x += 2) set(x, beltY, false)
  } else {
    // No belt — simple bottom edge
    for (let x = tX; x < tX + tW; x++) set(x, beltY, true)
  }

  // ── ARMS ─────────────────────────────────────────────────────────────────
  const armW  = 2
  const armH  = [6, 8, 10][torsoVar]     // arm length tracks torso height
  const handW = 2, handH = 2
  const lArmX = tX - armW
  const rArmX = tX + tW
  const armY0 = HR

  function fillArm(rootX: number, dx: number, dy: number) {
    for (let s = 0; s < armH; s++) {
      const t  = s / (armH - 1)
      const ax = rootX + Math.round(dx * t)
      const ay = armY0 + s + Math.round(dy * t)
      for (let w = 0; w < armW; w++) set(ax + w, ay, true)
    }
    const hx = rootX + Math.round(dx)
    const hy = armY0 + armH + Math.round(dy)
    for (let r = 0; r < handH; r++)
      for (let c = 0; c < handW; c++) set(hx + c, hy + r, true)
  }

  fillArm(lArmX, cfg.lArmDx, cfg.lArmDy)
  fillArm(rArmX, cfg.rArmDx, cfg.rArmDy)

  // Tank top: clear top arm row for sleeveless look
  if (shirtType === 7) {
    for (let w = 0; w < armW; w++) { set(lArmX + w, armY0, false); set(rArmX + w, armY0, false) }
  }

  // ── HIP / PELVIS ─────────────────────────────────────────────────────────
  const hipY = tY + tH
  for (let x = tX - 1; x <= tX + tW; x++) set(x, hipY, true)
  const pelvisW = Math.max(legSpan + 2, tW)
  const pelvisX = cx - Math.floor(pelvisW / 2)
  for (let x = pelvisX; x < pelvisX + pelvisW; x++) set(x, hipY + 1, true)

  // ── LEGS (8 pants × 3 widths × 5 shoes) ──────────────────────────────────
  const lLegX = cx - Math.floor(legSpan / 2)
  const rLegX = lLegX + legW + legGap
  const legY0 = hipY + 2

  // Crotch fill
  for (let s = 0; s < 2; s++)
    for (let x = lLegX + legW; x < rLegX; x++) set(x, legY0 + s, true)

  function fillLeg(baseX: number, drift: number, lh: number) {
    for (let s = 0; s < lh; s++) {
      const lx = Math.round(baseX + drift * s / Math.max(lh - 1, 1))
      for (let w = 0; w < legW; w++) set(lx + w, legY0 + s, true)
      // 8 pants styles
      if (pantsDetail === 1) set(lx + Math.floor(legW / 2), legY0 + s, false)                           // center seam
      if (pantsDetail === 2 && s >= 1 && s <= 3) set(lx + legW - 1, legY0 + s, false)                   // side pocket
      if (pantsDetail === 3 && s === lh - 1) for (let x = lx; x < lx + legW + 1; x++) set(x, legY0 + s, true) // cuffed
      if (pantsDetail === 4 && s === Math.floor(lh * 0.4)) for (let x = lx; x < lx + legW; x++) set(x, legY0 + s, false) // shorts hem
      if (pantsDetail === 5 && s === lh - 3 && lh > 4) for (let x = lx; x < lx + legW; x++) set(x, legY0 + s, false)     // rolled cuff
      if (pantsDetail === 6 && s > 0 && s < lh) {                                                        // pinstripe
        const trd = Math.floor(legW / 3)
        if (trd > 0) set(lx + trd, legY0 + s, false)
        if (legW > 3) set(lx + legW - 1 - trd, legY0 + s, false)
      }
      if (pantsDetail === 7 && (s === 2 || s === 5) && s < lh) set(lx + 1, legY0 + s, false)            // patched
    }
    // Ankle
    const ankX = Math.round(baseX + drift)
    const ankY = legY0 + lh
    for (let w = 0; w < legW; w++) set(ankX + w, ankY, true)
    // Shoe — 5 styles scaled to leg width
    const sw = [legW+1, legW+1, legW+1, legW, legW+2][shoeType]
    const sh = [2, 3, 2, 1, 2][shoeType]
    const sx = shoeType === 3 ? ankX : ankX - 1                // flat shoes don't extend
    const sy = shoeType === 1 ? ankY : ankY + 1                // boots start at ankle row
    for (let r = 0; r < sh; r++)
      for (let c = 0; c < sw; c++) set(sx + c, sy + r, true)
    if (shoeType === 2) set(sx + sw - 1, sy, false)            // sneaker detail
  }

  fillLeg(lLegX, cfg.lLegDx, cfg.legH)
  fillLeg(rLegX, cfg.rLegDx, cfg.legH)

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
// 12-frame sheet: 3 clips × 4 keyframes, each row = one animation.
export function makeAnimSheet(
  pix: string,
  traits: TraitsData,
  tokenId: number | null,
  scale = 1
): HTMLCanvasElement {
  const cols = 4, rows = ANIM_CLIPS.length
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
