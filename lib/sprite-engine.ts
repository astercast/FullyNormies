// =============================================================================
//  FULLNORMIES SPRITE ENGINE  —  shared pure-canvas drawing library
//  No React, no hooks. Safe to import in any client component.
// =============================================================================

// -- Palette ------------------------------------------------------------------
export const PL: [number,number,number] = [0xe3,0xe5,0xe4]  // light gray
export const PD: [number,number,number] = [0x48,0x49,0x4b]  // dark charcoal

// -- Native sprite dimensions -------------------------------------------------
export const SW  = 40   // sprite width  (matches Normie head width)
export const SH  = 72   // sprite height (28 head + 44 body)
export const HR  = 28   // head rows
export const SCL = 5    // display upscale  (40×72 → 200×360)
export const NORMAL_LEG_H = 14

// -- Types --------------------------------------------------------------------
export interface TraitAttr { trait_type: string; value: string }
export interface TraitsData { attributes: TraitAttr[] }
export type Pose = 'idle' | 'walk' | 'jump' | 'crouch'

export interface PoseCfg {
  torsoSquash: number
  lArmDx: number; lArmDy: number
  rArmDx: number; rArmDy: number
  lLegDx: number; rLegDx: number
  legH: number
}

// -- Pose data ----------------------------------------------------------------
export const POSES: Pose[] = ['idle', 'walk', 'jump', 'crouch']
export const POSE_LABEL: Record<Pose,string> = { idle:'Idle', walk:'Walk', jump:'Jump', crouch:'Crouch' }

// Reference poses — used for the 4 display cards
export const POSE_CFG: Record<Pose, PoseCfg> = {
  idle:   { torsoSquash:0, lArmDx:-1, lArmDy:2,  rArmDx:1,  rArmDy:2,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H },
  // Walk card shows the "right contact" frame (right foot fully forward)
  walk:   { torsoSquash:0, lArmDx:+6, lArmDy:-3, rArmDx:-5, rArmDy:-2, lLegDx:-7, rLegDx:+8, legH:NORMAL_LEG_H },
  jump:   { torsoSquash:0, lArmDx:-2, lArmDy:-9, rArmDx:2,  rArmDy:-9, lLegDx:-3, rLegDx: 3, legH:7 },
  crouch: { torsoSquash:2, lArmDx:-5, lArmDy:6,  rArmDx:5,  rArmDy:6,  lLegDx:-4, rLegDx: 4, legH:8 },
}

// =============================================================================
//  ANIMATION CLIPS  —  4 clips × 4 keyframes = 16-frame downloadable sheet
//
//  Walk biomechanics: opposite arm & leg swing together.
//  Character walks RIGHT. Positive leg-drift = foot goes right (forward).
//  "Contact" frames: feet fully spread (large drift). "Down" frames: feet
//  under body (small drift), legH–2 to suggest bent knees on weight-acceptance.
// =============================================================================
export const ANIM_CLIPS: { label: string; frames: PoseCfg[] }[] = [
  //
  // ── IDLE  (gentle arm/body sway) ──────────────────────────────────────────
  { label: 'Idle', frames: [
    { torsoSquash:0, lArmDx:-1, lArmDy:1,  rArmDx:1,  rArmDy:1,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H   },
    { torsoSquash:0, lArmDx:-1, lArmDy:3,  rArmDx:1,  rArmDy:3,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H   },
    { torsoSquash:0, lArmDx:-1, lArmDy:1,  rArmDx:1,  rArmDy:1,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H   },
    { torsoSquash:0, lArmDx:-1, lArmDy:3,  rArmDx:1,  rArmDy:3,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H   },
  ]},

  //
  // ── WALK  (4-frame stride cycle) ──────────────────────────────────────────
  // F1 "Right contact": R-foot forward (+8), L-foot back (-7). L-arm forward, R-arm back.
  // F2 "Mid/Down":      feet passing through (±1), bent knees (legH-2), arms neutral.
  // F3 "Left contact":  L-foot forward (+7), R-foot back (-8). R-arm forward, L-arm back.
  // F4 "Mid/Down":      mirror of F2.
  { label: 'Walk', frames: [
    { torsoSquash:0, lArmDx:+6, lArmDy:-3, rArmDx:-5, rArmDy:-2, lLegDx:-7, rLegDx:+8, legH:NORMAL_LEG_H   },
    { torsoSquash:0, lArmDx:+1, lArmDy: 2, rArmDx:-1, rArmDy: 2, lLegDx:+1, rLegDx:-1, legH:NORMAL_LEG_H-2 },
    { torsoSquash:0, lArmDx:-5, lArmDy:-2, rArmDx:+6, rArmDy:-3, lLegDx:+7, rLegDx:-8, legH:NORMAL_LEG_H   },
    { torsoSquash:0, lArmDx:-1, lArmDy: 2, rArmDx:+1, rArmDy: 2, lLegDx:-1, rLegDx:+1, legH:NORMAL_LEG_H-2 },
  ]},

  //
  // ── JUMP  (crouch-wind-up → launch → apex-tuck → land) ───────────────────
  { label: 'Jump', frames: [
    // F1 pre-jump crouch: body squashes, arms swing down-back
    { torsoSquash:2, lArmDx:-1, lArmDy: 5, rArmDx: 1, rArmDy: 5, lLegDx:-3, rLegDx: 3, legH:9  },
    // F2 launch: legs fully extend, arms drive upward
    { torsoSquash:0, lArmDx:-5, lArmDy:-5, rArmDx: 5, rArmDy:-5, lLegDx:-1, rLegDx: 1, legH:NORMAL_LEG_H },
    // F3 apex: arms fully raised, legs tuck up (short legH)
    { torsoSquash:0, lArmDx:-2, lArmDy:-9, rArmDx: 2, rArmDy:-9, lLegDx:-3, rLegDx: 3, legH:7  },
    // F4 land: arms spread wide for balance, legs bent on impact
    { torsoSquash:2, lArmDx:-7, lArmDy: 3, rArmDx: 7, rArmDy: 3, lLegDx:-4, rLegDx: 4, legH:9  },
  ]},

  //
  // ── CROUCH  (enter → full crouch × 2 → rise) ─────────────────────────────
  { label: 'Crouch', frames: [
    // F1 entering: body starting to lower, arms drift out
    { torsoSquash:0, lArmDx:-2, lArmDy: 3, rArmDx: 2, rArmDy: 3, lLegDx:-3, rLegDx: 3, legH:11 },
    // F2 full crouch: max squat, arms braced forward
    { torsoSquash:2, lArmDx:-5, lArmDy: 6, rArmDx: 5, rArmDy: 6, lLegDx:-4, rLegDx: 4, legH:8  },
    // F3 hold: slight arm-shift to feel alive
    { torsoSquash:2, lArmDx:-4, lArmDy: 7, rArmDx: 4, rArmDy: 7, lLegDx:-4, rLegDx: 4, legH:8  },
    // F4 rising: mirror of entering
    { torsoSquash:0, lArmDx:-2, lArmDy: 3, rArmDx: 2, rArmDy: 3, lLegDx:-3, rLegDx: 3, legH:11 },
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
function createSprite() {
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

// =============================================================================
//  drawNormie — main sprite compositor
// =============================================================================
export function drawNormie(
  pixels: string,
  traits: TraitsData,
  poseOrCfg: Pose | PoseCfg,
  tokenId: number | null = null
): HTMLCanvasElement {
  const { canvas, px, flush } = createSprite()
  const set = px
  const cfg = typeof poseOrCfg === 'string' ? POSE_CFG[poseOrCfg] : poseOrCfg

  const seed  = traitHash(tokenId, traits)
  const s0    = seed             & 0xff   // shirt style
  const s1    = (seed >>  8)     & 0xff   // pants style
  const s2    = (seed >> 16)     & 0xff   // build
  const s3    = (seed >> 24)     & 0xff   // shoe style
  // s4 unused currently

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
  const isAngry  = expr.includes('angry') || expr.includes('serious')
  const cx       = Math.floor(SW / 2)   // 20

  // ── Body proportions ──────────────────────────────────────────────────────
  const buildLvl = s2 % 3   // 0=slim  1=medium  2=stocky
  const baseTW   = isAlien ? 8 : isFemale ? 8 : isYoung ? 10 : isOld ? 12 : isCat ? 11 : 12
  const tW       = baseTW + buildLvl
  const shW      = tW + (isFemale || isAlien ? 2 : 4)
  const tX       = cx - Math.floor(tW  / 2)
  const shX      = cx - Math.floor(shW / 2)

  // ── HEAD (rows 0-27) ──────────────────────────────────────────────────────
  for (let r = 0; r < HR; r++)
    for (let c = 0; c < SW; c++)
      if (pixels[r * SW + c] === '1') set(c, r, true)

  // ── SHOULDER TAPER (rows 28-31): 4-row lerp shoulder→torso ───────────────
  for (let si = 0; si < 4; si++) {
    const t  = si / 3
    const w  = Math.round(shW * (1 - t) + tW * t)
    const x0 = cx - Math.floor(w / 2)
    for (let x = x0; x < x0 + w; x++) set(x, HR + si, true)
  }

  // ── TORSO ──────────────────────────────────────────────────────────────────
  const tY = HR + 4
  const tH = 15 - cfg.torsoSquash

  for (let y = 0; y < tH; y++) {
    // Waist pinch only for female — males stay rectangular
    const inset = (isFemale && y >= 3 && y <= 7) ? 1 : 0
    for (let x = tX + inset; x < tX + tW - inset; x++) set(x, tY + y, true)
  }

  // ── CLOTHING ──────────────────────────────────────────────────────────────
  const rawShirt  = isAgent ? 4 : isZombie ? 5 : isCat ? (s0 % 3) : (s0 % 4)
  const shirtType = rawShirt

  if (shirtType === 4) {
    // Agent suit — placket strip + tie + lapels
    for (let y = tY; y < tY + tH - 1; y++) { set(cx-1, y, false); set(cx, y, false) }
    set(cx-1, tY, true); set(cx, tY, true)
    for (let y = tY+2; y < tY+tH-1; y += 2) set(cx-1, y, true)
    for (let d = 1; d <= 4; d++) {
      set(Math.max(tX, tX+d-1), tY+d, false)
      set(Math.min(tX+tW-1, tX+tW-d), tY+d, false)
    }
  } else if (shirtType === 5) {
    // Zombie torn — collar + ragged holes
    set(cx-1, tY, false); set(cx, tY, false)
    for (const hy of [2,5,9,12]) if (hy < tH - 1) {
      set(tX+1, tY+hy, false); set(tX+2, tY+hy, false); set(tX+tW-2, tY+hy, false)
    }
    if (isCat) for (let y = tY+1; y < tY+tH-2; y++) set(cx, y, false)
  } else if (shirtType === 2) {
    // Hoodie — scoop collar + kangaroo pocket
    for (let x = cx-3; x <= cx+2; x++) set(x, tY, false)
    set(cx-2, tY+1, false); set(cx+1, tY+1, false)
    const pY = tY + 7
    if (pY + 3 < tY + tH - 1) {
      for (let x = tX+2; x < tX+tW-2; x++) set(x, pY, false)
      for (let y = pY+1; y < pY+3; y++) { set(tX+2, y, false); set(tX+tW-3, y, false) }
    }
    if (isCat) set(cx, tY+4, false)
  } else if (shirtType === 3) {
    // Jacket — V collar + lapels + 2 buttons
    set(cx-1, tY, false); set(cx, tY, false)
    for (let d = 1; d <= 4; d++) {
      set(tX + d, tY + d, false)
      set(tX + tW - 1 - d, tY + d, false)
    }
    set(cx, tY + 8,  false)
    set(cx, tY + 11, false)
    if (isCat) for (let y = tY+5; y < tY+tH-2; y++) set(cx, y, false)
  } else if (shirtType === 1) {
    // Striped shirt — V collar + 2 stripes
    set(cx-1, tY, false); set(cx, tY, false)
    for (let x = tX+2; x < tX+tW-2; x++) {
      if (tY+4 < tY+tH-2) set(x, tY+4, false)
      if (tY+9 < tY+tH-2) set(x, tY+9, false)
    }
    if (isCat) for (let y = tY; y < tY+tH-2; y++) set(cx, y, false)
  } else {
    // Plain shirt — V collar + chest crease
    const vDepth = isAngry ? 2 : 1
    for (let d = 0; d < vDepth; d++) {
      set(cx-1-d, tY+d, false); set(cx+d, tY+d, false)
    }
    if (tH > 10) for (let x = tX+2; x < tX+tW-2; x++) set(x, tY+6, false)
    if (isCat) for (let y = tY; y < tY+tH-2; y++) set(cx, y, false)
  }

  // Belt
  for (let x = tX-1; x <= tX+tW; x++) set(x, tY+tH-1, true)
  set(cx-1, tY+tH-1, false); set(cx, tY+tH-1, false)

  // ── ARMS ─────────────────────────────────────────────────────────────────
  const armW  = isYoung ? 2 : isOld ? 3 : buildLvl === 2 ? 4 : 3
  const armH  = isYoung ? 10 : isOld ? 11 : 12
  const handW = armW + 1
  const handH = 3
  const lArmX = shX
  const rArmX = shX + shW - armW
  const armY0 = HR

  function fillArm(rootX: number, dx: number, dy: number) {
    for (let s = 0; s < armH; s++) {
      const t  = s / (armH - 1)
      const ax = rootX + Math.round(dx * t)
      const ay = armY0 + s + Math.round(dy * t)
      const aw = (armW >= 3 && s >= Math.floor(armH * 0.55)) ? armW - 1 : armW
      for (let w = 0; w < aw; w++) set(ax + w, ay, true)
    }
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

  // ── LEGS ──────────────────────────────────────────────────────────────────
  const pStyle     = s1 % 3
  const legW       = [4, 3, 5][pStyle]
  const legGap     = 2
  const lLegX      = cx - Math.floor((legW * 2 + legGap) / 2)
  const rLegX      = lLegX + legW + legGap
  const legY0      = hipY + 1
  const pantsDetail = s1 % 4   // 0=plain 1=center-seam 2=side-pocket 3=cuffed

  function fillLeg(baseX: number, drift: number, lh: number) {
    for (let s = 0; s < lh; s++) {
      const lx = Math.round(baseX + drift * s / Math.max(lh - 1, 1))
      const lw = (legW >= 4 && s >= 6) ? legW - 1 : legW
      for (let w = 0; w < lw; w++) set(lx + w, legY0 + s, true)
      if (pantsDetail === 1 && lw >= 3) set(lx + Math.floor(lw/2), legY0+s, false)
      if (pantsDetail === 2 && s >= 1 && s <= 4) set(lx + lw - 1, legY0+s, false)
      if (pantsDetail === 3 && s === lh - 1) for (let x = lx; x < lx+lw+1; x++) set(x, legY0+s, true)
    }
    const ankX  = Math.round(baseX + drift)
    const ankY  = legY0 + lh
    set(ankX, ankY, true); set(ankX+1, ankY, true); set(ankX+2, ankY, true)
    const shoeW = s3 % 3 === 2 ? 7 : 6
    const sX = ankX - 1; const sY = ankY + 1
    for (let r = 0; r < 3; r++) for (let c = 0; c < shoeW; c++) set(sX+c, sY+r, true)
    set(sX+1, sY, false); set(sX+2, sY, false)
    if (s3 % 3 === 1) { set(sX+shoeW-1, sY, false); set(sX+shoeW-1, sY+1, false) }
    set(sX, sY, false)
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
// 16-frame sheet: 4 clips × 4 keyframes, each row = one animation.
export function makeAnimSheet(
  pix: string,
  traits: TraitsData,
  tokenId: number | null,
  scale = 1
): HTMLCanvasElement {
  const cols = 4, rows = ANIM_CLIPS.length
  const fw = SW * scale, fh = SH * scale, gap = scale
  const sheet = document.createElement('canvas')
  sheet.width  = fw * cols + gap * (cols - 1)
  sheet.height = fh * rows + gap * (rows - 1)
  const ctx = sheet.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ANIM_CLIPS.forEach((clip, row) => {
    clip.frames.forEach((cfg, col) => {
      ctx.drawImage(
        upscale(drawNormie(pix, traits, cfg, tokenId), scale),
        col * (fw + gap), row * (fh + gap)
      )
    })
  })
  return sheet
}
