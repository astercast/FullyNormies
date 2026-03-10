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

  const seed  = traitHash(tokenId, traits)
  const s0    = seed             & 0xff   // shirt style
  const s1    = (seed >>  8)     & 0xff   // pants style
  const s2    = (seed >> 16)     & 0xff   // build
  const s3    = (seed >> 24)     & 0xff   // shoe style
  // s4 unused currently

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

  // ── Body proportions ──────────────────────────────────────────────────────
  const buildLvl = s2 % 3   // 0=slim  1=medium  2=stocky
  const baseTW   = isAlien ? 8 : isYoung ? 9 : isCat ? 10 : 10
  const tW       = baseTW + buildLvl      // 8–12 px
  const tX       = cx - Math.floor(tW / 2)

  // ── HEAD (rows 0–27) ─ head sits directly on body, no explicit neck ─────────
  for (let r = 0; r < HR; r++)
    for (let c = 0; c < SW; c++)
      if (pixels[r * SW + c] === '1') set(c, r, true)

  // ── SHOULDER (1 row at tW+2) ─ subtle cap under the head ───────────────────
  const shW  = tW + 2
  const shX  = cx - Math.floor(shW / 2)
  for (let x = shX; x < shX + shW; x++) set(x, HR, true)

  // ── TORSO (solid filled block) ─────────────────────────────────────────
  const tY = HR + 1
  const tH = 10 - cfg.torsoSquash

  for (let y = 0; y < tH; y++) {
    for (let x = tX; x < tX + tW; x++) set(x, tY + y, true)
  }

  // ── CLOTHING (minimal cuts — keeps torso filled in) ────────────────────────
  const rawShirt  = isAgent ? 4 : isZombie ? 5 : isCat ? (s0 % 3) : (s0 % 4)
  const shirtType = rawShirt

  if (shirtType === 4) {
    // Agent suit — center seam + buttons
    for (let y = tY + 1; y < tY + tH - 1; y++) set(cx, y, false)
    for (let y = tY + 2; y < tY + tH - 1; y += 3) set(cx, y, true)
  } else if (shirtType === 5) {
    // Zombie torn — scattered holes
    set(cx, tY, false)
    for (const hy of [3, 6]) if (hy < tH - 1) {
      set(tX + 1, tY + hy, false); set(tX + tW - 2, tY + hy, false)
    }
  } else if (shirtType === 2) {
    // Hoodie — small collar
    set(cx - 1, tY, false); set(cx, tY, false)
  } else if (shirtType === 3) {
    // Jacket — center line + buttons
    for (let y = tY; y < tY + tH - 1; y++) set(cx, y, false)
    set(cx, tY + 3, true); set(cx, tY + 6, true)
  } else if (shirtType === 1) {
    // Striped — single stripe
    const stripeY = tY + Math.floor(tH * 0.6)
    if (stripeY < tY + tH - 1) for (let x = tX + 1; x < tX + tW - 1; x++) set(x, stripeY, false)
  } else {
    // Plain — collar notch
    set(cx, tY, false)
  }

  // Belt
  for (let x = tX - 1; x <= tX + tW; x++) set(x, tY + tH - 1, true)
  set(cx, tY + tH - 1, false)

  // ── ARMS ─────────────────────────────────────────────────────────────────
  const armW  = 2
  const armH  = isYoung ? 6 : 8
  const handW = 2
  const handH = 2
  // Arms hang from torso edges
  const lArmX = tX - armW
  const rArmX = tX + tW
  const armY0 = HR   // start at shoulder row

  function fillArm(rootX: number, dx: number, dy: number) {
    for (let s = 0; s < armH; s++) {
      const t  = s / (armH - 1)
      const ax = rootX + Math.round(dx * t)
      const ay = armY0 + s + Math.round(dy * t)
      for (let w = 0; w < armW; w++) set(ax + w, ay, true)
    }
    // Hand
    const hx = rootX + Math.round(dx)
    const hy = armY0 + armH + Math.round(dy)
    for (let hy2 = 0; hy2 < handH; hy2++)
      for (let hx2 = 0; hx2 < handW; hx2++) set(hx + hx2, hy + hy2, true)
  }

  fillArm(lArmX, cfg.lArmDx, cfg.lArmDy)
  fillArm(rArmX, cfg.rArmDx, cfg.rArmDy)

  // ── HIP / PELVIS (2 rows) ─────────────────────────────────────────────────
  const hipY       = tY + tH
  const legW       = 4
  const legGap     = 2
  const legSpan    = legW * 2 + legGap   // 10px
  // Hip line
  for (let x = tX - 1; x <= tX + tW; x++) set(x, hipY, true)
  // Pelvis bridge — smooth transition from torso to leg width
  const pelvisW = Math.max(legSpan + 2, tW)
  const pelvisX = cx - Math.floor(pelvisW / 2)
  for (let x = pelvisX; x < pelvisX + pelvisW; x++) set(x, hipY + 1, true)

  // ── LEGS ──────────────────────────────────────────────────────────────────
  const lLegX      = cx - Math.floor(legSpan / 2)
  const rLegX      = lLegX + legW + legGap
  const legY0      = hipY + 2
  const pantsDetail = s1 % 4   // 0=plain 1=center-seam 2=side-pocket 3=cuffed

  // Crotch fill — first 2 rows between legs for smooth pelvis→leg transition
  for (let s = 0; s < 2; s++)
    for (let x = lLegX + legW; x < rLegX; x++) set(x, legY0 + s, true)

  function fillLeg(baseX: number, drift: number, lh: number) {
    for (let s = 0; s < lh; s++) {
      const lx = Math.round(baseX + drift * s / Math.max(lh - 1, 1))
      for (let w = 0; w < legW; w++) set(lx + w, legY0 + s, true)
      if (pantsDetail === 1) set(lx + Math.floor(legW / 2), legY0 + s, false)
      if (pantsDetail === 2 && s >= 1 && s <= 3) set(lx + legW - 1, legY0 + s, false)
      if (pantsDetail === 3 && s === lh - 1) for (let x = lx; x < lx + legW + 1; x++) set(x, legY0 + s, true)
    }
    // Ankle
    const ankX = Math.round(baseX + drift)
    const ankY = legY0 + lh
    for (let w = 0; w < legW; w++) set(ankX + w, ankY, true)
    // Shoe — 5×2
    const sX = ankX - 1; const sY = ankY + 1
    for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) set(sX + c, sY + r, true)
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
