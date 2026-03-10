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
//    3. Procedurally draw a full body below:  torso ? arms ? hands ? legs ? feet
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

type Pose = 'idle' | 'walk' | 'attack' | 'crouch'
const POSES: Pose[] = ['idle', 'walk', 'attack', 'crouch']
const POSE_LABEL: Record<Pose,string> = {
  idle: 'Idle', walk: 'Walk', attack: 'Attack', crouch: 'Crouch'
}

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

const POSE_CFG: Record<Pose, PoseCfg> = {
  // idle: arms hang slightly outward (natural rest)
  idle:   { torsoSquash:0, lArmDx:-1, lArmDy:2,  rArmDx:1,  rArmDy:2,  lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H },
  // walk: opposing arm/leg swing
  walk:   { torsoSquash:0, lArmDx:-6, lArmDy:-4, rArmDx:6,  rArmDy:-4, lLegDx:-4, rLegDx: 4, legH:NORMAL_LEG_H },
  // attack: right arm punches hard, left pulls back
  attack: { torsoSquash:0, lArmDx:-4, lArmDy:2,  rArmDx:9,  rArmDy:-5, lLegDx:-3, rLegDx: 3, legH:NORMAL_LEG_H },
  // crouch: body stays upright, legs SHORT and spread WIDE (bent-knee silhouette)
  crouch: { torsoSquash:1, lArmDx:-5, lArmDy:5,  rArmDx:5,  rArmDy:5,  lLegDx:-6, rLegDx: 6, legH:8  },
}

// Derive a stable per-normie variation seed from token ID
function varSeed(id: number | null): number { return id ?? 0 }

// =============================================================================
//  drawNormie: compose head pixels + procedural body into a SW x SH sprite
// =============================================================================
function drawNormie(pixels: string, traits: TraitsData, pose: Pose, tokenId: number | null = null): HTMLCanvasElement {
  const { canvas, px, flush } = createSprite()
  const set = px
  const cfg  = POSE_CFG[pose]
  const seed = varSeed(tokenId)

  const normType  = tv(traits, 'type')
  const age       = tv(traits, 'age')
  const accessory = tv(traits, 'accessory')
  const gender    = tv(traits, 'gender')

  const isAgent  = normType === 'agent'
  const isCat    = normType === 'cat'
  const isAlien  = normType === 'alien'
  const isZombie = normType === 'zombie'
  const isRobot  = normType === 'robot'
  const isOld    = age.includes('old')
  const isYoung  = age.includes('young')
  const isFemale = gender.includes('female')
  const cx       = Math.floor(SW / 2)  // 20

  // Deterministic clothing variation from token ID
  // (Normies have no shirt/pants traits, so we derive style from seed)
  const shirtStyle = (seed >> 2) % 4   // 0=plain  1=striped  2=hoodie  3=jacket/lapels
  const pantsStyle = seed % 4          // 0=straight  1=jeans-seam  2=cargo  3=slim

  // ── HEAD (rows 0-27) ──────────────────────────────────────────────────────
  for (let r = 0; r < HR; r++)
    for (let c = 0; c < SW; c++)
      if (pixels[r * SW + c] === '1') set(c, r, true)

  // ── SHOULDER TAPER (rows 28-30): lerp from shW → tW over 3 rows ──────────
  // Wider at shoulder, narrows to torso width — creates V-taper silhouette
  const tW  = isAlien ? 9 : isFemale ? 10 : 12
  const tX  = cx - Math.floor(tW / 2)          // col 14 for 12px torso
  const shW = isAlien ? 13 : isFemale ? 15 : 19
  const shX = cx - Math.floor(shW / 2)          // col 11 for 19px shoulder

  for (let si = 0; si < 3; si++) {
    const w  = Math.round(shW + (tW - shW) * si / 2)  // si=0:shW  si=2:tW
    const x0 = cx - Math.floor(w / 2)
    for (let x = x0; x < x0 + w; x++) set(x, HR + si, true)
  }

  // ── TORSO (row 31 onward): solid with waist taper ─────────────────────────
  const tY = HR + 3                            // always row 31
  const tH = 17 - cfg.torsoSquash

  for (let y = 0; y < tH; y++) {
    // 1px waist inset at rows 4-8 creates chest→waist→hip silhouette
    const inset = (y >= 4 && y <= 8) ? 1 : 0
    for (let x = tX + inset; x < tX + tW - inset; x++) set(x, tY + y, true)
  }

  // ── CLOTHING DETAILS ──────────────────────────────────────────────────────
  if (isAgent) {
    // Suit: white shirt center + tie + lapels
    for (let y = tY + 1; y < tY + tH - 2; y++) { set(cx-1, y, false); set(cx, y, false) }
    set(cx-1, tY+1, true); set(cx, tY+1, true)                   // tie knot
    for (let y = tY+3; y < tY+tH-2; y += 2) set(cx-1, y, true)  // tie
    set(tX+1, tY, false); set(tX+tW-2, tY, false)                // lapels top
    set(tX+2, tY+1, false); set(tX+tW-3, tY+1, false)            // lapels step
  } else if (isZombie) {
    // Zombie: torn shirt — irregular holes
    set(cx-1, tY, false); set(cx, tY, false)
    for (let y = tY+2; y < tY+tH; y += 3) {
      set(tX+1, y, false); set(tX+tW-2, y, false)
    }
    for (let x = tX+2; x < tX+tW-2; x++) set(x, tY+9, false)
    if (isCat) for (let y = tY; y < tY+tH-2; y++) set(cx, y, false)
  } else if (isRobot) {
    // Robot: panel lines + bolts
    for (let x = tX+1; x < tX+tW-1; x++) set(x, tY+5, false)
    for (let x = tX+1; x < tX+tW-1; x++) set(x, tY+10, false)
    set(tX+2, tY+2, false); set(tX+tW-3, tY+2, false)  // bolts
    set(tX+2, tY+7, false); set(tX+tW-3, tY+7, false)
  } else if (shirtStyle === 2 || (isCat && shirtStyle !== 0)) {
    // Hoodie: wide round collar + kangaroo pocket
    for (let x = cx-3; x <= cx+2; x++) set(x, tY, false)          // wide collar
    set(cx-2, tY+1, false); set(cx-1, tY+1, false)
    set(cx, tY+1, false); set(cx+1, tY+1, false)
    const pY = tY + 8
    if (pY + 4 < tY + tH - 1) {                                    // front pocket
      for (let x = tX+2; x < tX+tW-2; x++) set(x, pY, false)
      for (let y = pY; y < pY+4; y++) { set(tX+2, y, false); set(tX+tW-3, y, false) }
    }
    if (isCat) set(cx, tY+5, false)
  } else if (shirtStyle === 3) {
    // Jacket/blazer: V-collar with visible lapel diagonals + 2 buttons
    set(cx-1, tY, false); set(cx, tY, false)
    for (let d = 1; d <= 3; d++) {
      if (tX+d < SW) set(tX+d, tY+d, false)              // left lapel diagonal
      if (tX+tW-1-d >= 0) set(tX+tW-1-d, tY+d, false)   // right lapel diagonal
    }
    set(cx, tY+7,  false)                                 // button 1
    set(cx, tY+10, false)                                 // button 2
    if (isCat) for (let y = tY+4; y < tY+tH-2; y++) set(cx, y, false)
  } else if (shirtStyle === 1) {
    // Striped shirt: collar + 3 horizontal light stripes
    set(cx-1, tY, false); set(cx, tY, false)
    for (let x = tX+1; x < tX+tW-1; x++) {
      if (tY+3 < SH) set(x, tY+3, false)
      if (tY+7 < SH) set(x, tY+7, false)
      if (tY+11 < SH) set(x, tY+11, false)
    }
    if (isCat) for (let y = tY; y < tY+tH-2; y++) set(cx, y, false)
  } else {
    // Plain shirt: simple V collar + single chest crease + cat belly stripe
    set(cx-1, tY, false); set(cx, tY, false)
    if (tH > 10) for (let x = tX+2; x < tX+tW-2; x++) set(x, tY+8, false)
    if (isCat) for (let y = tY; y < tY+tH-2; y++) set(cx, y, false)
  }

  // Belt row (spans slightly outside torso like a real belt)
  for (let x = tX-1; x <= tX+tW; x++) set(x, tY+tH-2, true)
  set(cx-1, tY+tH-2, false); set(cx, tY+tH-2, false)  // belt buckle gap

  // ── ARMS: 3px slim, taper to 2px at forearm ──────────────────────────────
  const armW  = isYoung ? 2 : 3
  const armH  = isYoung ? 10 : 12
  const handW = 4
  const handH = 3
  // Arms attach at outer shoulder: lArmX at left edge of shoulder, rArmX at right edge
  const lArmX = shX                     // col 11
  const rArmX = shX + shW - armW        // col 27 (for shW=19, armW=3)
  const armY0 = HR

  function fillArm(rootX: number, dx: number, dy: number) {
    for (let s = 0; s < armH; s++) {
      const t  = s / (armH - 1)
      const ax = rootX + Math.round(dx * t)
      const ay = armY0 + s + Math.round(dy * t)
      // Upper arm full width; forearm (lower half) tapers 1px if room
      const aw = (armW > 2 && s > armH / 2) ? armW - 1 : armW
      for (let w = 0; w < aw; w++) set(ax + w, ay, true)
    }
    // Hand: 4×3
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

  // ── LEGS: centered, gap between them, pants style detail ─────────────────
  // pantsStyle 3=slim(3px) else 4px. Centered with 2px gap.
  const legW   = pantsStyle === 3 ? 3 : 4
  const legGap = 2
  const lLegX  = cx - Math.floor((legW + legGap + legW) / 2)  // col 15 for legW=4
  const rLegX  = lLegX + legW + legGap
  const legY0  = hipY + 1

  function fillLeg(baseX: number, drift: number, lh: number) {
    for (let s = 0; s < lh; s++) {
      const lx = Math.round(baseX + drift * s / Math.max(lh - 1, 1))
      // Thigh (upper 6px): full width; shin (lower): -1px taper
      const lw = (legW > 3 && s >= 6) ? legW - 1 : legW
      for (let w = 0; w < lw; w++) set(lx + w, legY0 + s, true)
      // Pants details
      if (pantsStyle === 1 && lw >= 3) set(lx + Math.floor(lw/2), legY0+s, false)  // jeans seam
      if (pantsStyle === 2 && s >= 2 && s <= 5) set(lx + lw - 1, legY0+s, false)  // cargo pocket
    }
    // Ankle (3px) + shoe (6×3)
    const ankX = Math.round(baseX + drift)
    const ankY = legY0 + lh
    set(ankX, ankY, true); set(ankX+1, ankY, true); set(ankX+2, ankY, true)
    const sX = ankX - 1; const sY = ankY + 1
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) set(sX+c, sY+r, true)
    set(sX+1, sY, false); set(sX+2, sY, false)  // toe highlight
  }

  fillLeg(lLegX, cfg.lLegDx, cfg.legH)
  fillLeg(rLegX, cfg.rLegDx, cfg.legH)

  // ── ACCESSORIES ───────────────────────────────────────────────────────────
  if (accessory.includes('chain') || accessory.includes('necklace')) {
    for (let x = cx-2; x <= cx+2; x++) set(x, tY+2, true)
    set(cx, tY+3, true)
  }

  if (isOld && (pose === 'idle' || pose === 'walk')) {
    const caneX   = tX + tW + 3
    const caneBot = Math.min(legY0 + cfg.legH + 4, SH - 2)
    for (let y = armY0 + 3; y <= caneBot; y++) set(caneX, y, true)
    set(caneX-1, armY0+3, true); set(caneX+1, armY0+3, true)
  }

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

// -- Build game-ready sprite sheet: NxN grid with optional padding ----------
// Standard game format: each frame is SW×SH, laid out in a horizontal strip.
// With 1px transparent gutters between frames (Unity/Godot friendly).
function makeSheet(frames: (HTMLCanvasElement|null)[], scale = 1): HTMLCanvasElement {
  const fw = SW * scale
  const fh = SH * scale
  const gap = scale  // 1 native px gutter between frames
  const sheet = document.createElement('canvas')
  sheet.width  = fw * 4 + gap * 3
  sheet.height = fh
  const ctx = sheet.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  frames.forEach((f, i) => {
    if (!f) return
    const src = upscale(f, 1)  // f is already at SCL, we need native
    ctx.drawImage(f, i * (fw + gap), 0, fw, fh)
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
    idle:null, walk:null, attack:null, crouch:null,
  })
  const [sheet,     setSheet]    = useState<HTMLCanvasElement|null>(null)
  const [activePose, setActivePose] = useState<Pose>('idle')

  const [uploading, setUploading] = useState(false)
  const [savedUrl,  setSavedUrl]  = useState<string|null>(null)
  const [dlOpen,    setDlOpen]    = useState(false)
  const [shareMsg,  setShareMsg]  = useState('')

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
    setFrames({ idle:null, walk:null, attack:null, crouch:null }); setSheet(null)
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

  // -- Generate all 4 poses --------------------------------------------------
  const generateAll = useCallback((pix: string, td: TraitsData, id: number | null) => {
    const newFrames: Record<Pose, HTMLCanvasElement|null> = {
      idle:null, walk:null, attack:null, crouch:null,
    }
    POSES.forEach(pose => {
      const native = drawNormie(pix, td, pose, id)
      newFrames[pose] = upscale(native, SCL)
    })
    setFrames({ ...newFrames })
    setSheet(makeSheet(POSES.map(p => newFrames[p])))
  }, [])

  function regenerate() {
    if (pixels && normTraits) generateAll(pixels, normTraits, currentId)
  }

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

  // dlSheet downloads all 4 poses in a horizontal strip — game-engine ready
  // scale options: 1=native (40px frames), 2=80px, 4=160px per frame
  function dlSheet(scale: number, transparent = false) {
    const frames4 = POSES.map(p => frames[p])
    const fw = SW * scale, fh = SH * scale
    const gap = Math.max(1, scale)  // 1px gutter at native, scaled up
    const out = document.createElement('canvas')
    out.width  = fw * 4 + gap * 3
    out.height = fh
    const ctx  = out.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    if (!transparent) { ctx.fillStyle = `rgb(${PL[0]},${PL[1]},${PL[2]})`; ctx.fillRect(0,0,out.width,out.height) }
    frames4.forEach((f, i) => {
      if (f) ctx.drawImage(f, i*(fw+gap), 0, fw, fh)
    })
    out.toBlob(b => {
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(b!),
        download: `normie-${currentId}-sheet-${fw}x${fh}${transparent?'-transparent':''}.png`,
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

  async function shareSprite() {
    const c = frames['idle'] ?? frames[activePose]; if (!c) return
    // Upscale to 4x for sharing (looks good on mobile)
    const out = document.createElement('canvas')
    out.width = SW * 4; out.height = SH * 4
    const ctx = out.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = `rgb(${PL[0]},${PL[1]},${PL[2]})`; ctx.fillRect(0,0,out.width,out.height)
    ctx.drawImage(c, 0, 0, out.width, out.height)
    out.toBlob(async blob => {
      if (!blob) return
      const file = new File([blob], `normie-${currentId}.png`, { type: 'image/png' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ title: `Normie #${currentId}`, files: [file] })
          return
        } catch {}
      }
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setShareMsg('Image copied to clipboard!')
        setTimeout(() => setShareMsg(''), 2500)
      } catch {
        // Final fallback: download
        const a = Object.assign(document.createElement('a'), {
          href: URL.createObjectURL(blob), download: `normie-${currentId}.png`
        })
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000)
      }
    }, 'image/png')
  }

  const traitList = normTraits?.attributes.filter(a => !['Level','Pixel Count','Action Points','Customized'].includes(a.trait_type)) ?? []

  // Download dropdown options
  const dlOptions = hasFrames ? [
    { label: `Single frame — ${SW}×${SH}px (native)`,     action: () => dlFrame(activePose, 1) },
    { label: `Single frame — ${SW*2}×${SH*2}px`,          action: () => dlFrame(activePose, 2) },
    { label: `Single frame — ${SW*4}×${SH*4}px`,          action: () => dlFrame(activePose, 4) },
    { label: `Single frame — transparent bg`,              action: () => dlFrame(activePose, 4, true) },
    { label: `Sprite sheet — ${SW}px frames (native)`,     action: () => dlSheet(1) },
    { label: `Sprite sheet — ${SW*2}px frames`,            action: () => dlSheet(2) },
    { label: `Sprite sheet — ${SW*4}px frames`,            action: () => dlSheet(4) },
    { label: `Sprite sheet — transparent bg`,              action: () => dlSheet(4, true) },
  ] : []

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh' }}>
      <Nav />
      <main style={{ flex:1 }}>

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
                    color:'var(--ink)', fontFamily:'inherit', fontSize:'1.75rem',
                    fontWeight:900, letterSpacing:'-.04em', width:'7.2rem',
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

              {normName && <div style={{ fontSize:'1.3rem', fontWeight:900, letterSpacing:'-.05em', lineHeight:1, marginBottom:'.9rem' }}>{normName}</div>}

              <span style={S.lbl}>Traits</span>
              <div style={{ display:'grid', gridTemplateColumns:'auto 1fr' }}>
                {traitList.length === 0 ? (
                  <div style={{ gridColumn:'span 2', fontSize:'.65rem', color:'var(--ink-muted)', padding:'.3rem 0' }}>No traits loaded.</div>
                ) : traitList.map((t,i) => [
                  <div key={i+'k'} style={{ padding:'.24rem .6rem .24rem 0', fontSize:'.55rem', letterSpacing:'.07em', textTransform:'uppercase', color:'var(--ink-muted)', borderBottom:'1px solid var(--line-soft)', whiteSpace:'nowrap' }}>{t.trait_type}</div>,
                  <div key={i+'v'} style={{ padding:'.24rem 0', fontSize:'.72rem', fontWeight:700, letterSpacing:'-.01em', borderBottom:'1px solid var(--line-soft)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={t.value}>{t.value}</div>,
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

              {/* 4 pose cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'.4rem', marginBottom:'1rem' }}>
                {POSES.map(pose => (
                  <PoseCard
                    key={pose} pose={pose}
                    canvas={frames[pose]}
                    active={activePose===pose}
                    onClick={() => setActivePose(pose)}
                  />
                ))}
              </div>

              {/* Generate / action row */}
              {loadState === 'done' && (
                <div style={{ display:'flex', gap:'.3rem', marginBottom:'.7rem', flexWrap:'wrap' }}>
                  <button
                    style={{ ...S.btn, ...S.fill, flex:1, fontSize:'.65rem', padding:'.55rem' }}
                    onClick={regenerate}
                  >↺ Regenerate</button>
                  {hasFrames && (
                    <button
                      style={{ ...S.btn, flex:1, fontSize:'.65rem', padding:'.55rem' }}
                      onClick={shareSprite}
                    >↑ Share Image</button>
                  )}
                  {hasFrames && (
                    <button
                      style={{ ...S.btn, ...(savedUrl ? S.dis : {}), flex:1, fontSize:'.65rem', padding:'.55rem' }}
                      onClick={saveToGallery} disabled={uploading||!!savedUrl}
                    >{uploading ? 'Saving…' : savedUrl ? '✓ Saved' : '+ Gallery'}</button>
                  )}
                </div>
              )}
              {!hasFrames && loadState !== 'done' && (
                <div style={{ fontSize:'.62rem', color:'var(--ink-muted)', marginBottom:'.7rem', lineHeight:1.9 }}>
                  Load a Normie above to generate its full body sprites.
                </div>
              )}
              {shareMsg && (
                <div style={{ fontSize:'.6rem', color:'var(--ink)', marginBottom:'.5rem', padding:'.35rem .6rem', border:'1px solid var(--line)' }}>
                  {shareMsg}
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
                    style={{ ...S.btn, width:'100%', justifyContent:'space-between', fontSize:'.65rem', padding:'.55rem .84rem' }}
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
                      <div style={{ padding:'.28rem .6rem', fontSize:'.48rem', letterSpacing:'.1em', textTransform:'uppercase', color:'var(--ink-muted)', borderBottom:'1px solid var(--line-soft)', borderTop:'1px solid var(--line-soft)', marginTop:'.1rem' }}>Sprite Sheet — all 4 poses</div>
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
                  4 frames · {SW}×{SH}px each · 1px gutters · game-engine ready
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
                <div style={{ display:'flex', marginTop:'.25rem', maxWidth:'100%' }}>
                  {POSES.map(p => (
                    <span key={p} style={{
                      fontSize:'.46rem', letterSpacing:'.08em', textTransform:'uppercase',
                      color:'var(--ink-muted)', width:'25%', textAlign:'center', display:'inline-block',
                    }}>{POSE_LABEL[p]}</span>
                  ))}
                </div>
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
