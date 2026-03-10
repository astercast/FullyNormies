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
const SH  = 84  // sprite height (40 full head + 44 body)
const HR  = 40  // use ALL 40 rows of the original Normie bitmap
const SCL = 5   // display upscale (40x84 -> 200x420)

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
  torsoSquash: number   // compress torso by N px (crouch only)
  torsoShift:  number   // push torso down by N px (crouch only)
  lArmDx: number        // left arm x tip offset (neg=back, pos=forward)
  lArmDy: number        // left arm y tip offset (neg=up, pos=angled)
  rArmDx: number
  rArmDy: number
  lLegDx: number        // left leg foot x drift
  rLegDx: number
  legH:   number
}

const POSE_CFG: Record<Pose, PoseCfg> = {
  idle:   { torsoSquash:0, torsoShift:0, lArmDx: 0, lArmDy:0, rArmDx: 0, rArmDy:0, lLegDx: 0, rLegDx: 0, legH:NORMAL_LEG_H },
  walk:   { torsoSquash:0, torsoShift:0, lArmDx:-5, lArmDy:-3, rArmDx: 5, rArmDy:-3, lLegDx:-3, rLegDx: 3, legH:NORMAL_LEG_H },
  attack: { torsoSquash:0, torsoShift:0, lArmDx:-5, lArmDy: 0, rArmDx:10, rArmDy:-2, lLegDx:-2, rLegDx: 2, legH:NORMAL_LEG_H },
  crouch: { torsoSquash:5, torsoShift:3, lArmDx:-3, lArmDy: 4, rArmDx: 3, rArmDy: 4, lLegDx:-3, rLegDx: 3, legH:8 },
}

// =============================================================================
//  drawNormie: compose head pixels + procedural body into a SW x SH sprite
// =============================================================================
function drawNormie(pixels: string, traits: TraitsData, pose: Pose): HTMLCanvasElement {
  const { canvas, px, flush } = createSprite()
  const set = px
  const cfg  = POSE_CFG[pose]

  const normType  = tv(traits, 'type')
  const gender    = tv(traits, 'gender')
  const age       = tv(traits, 'age')
  const accessory = tv(traits, 'accessory')

  const isAgent  = normType === 'agent'
  const isCat    = normType === 'cat'
  const isAlien  = normType === 'alien'
  const isFemale = gender.includes('female')
  const isOld    = age.includes('old')

  const cx = Math.floor(SW / 2)   // center column = 20

  // ── FULL HEAD/TORSO: stamp all 40 original Normie pixels exactly ──────────
  // Rows 0-29 = face+hair, rows 30-39 = shoulders/upper shirt (already drawn)
  for (let r = 0; r < HR; r++)
    for (let c = 0; c < SW; c++)
      if (pixels[r * SW + c] === '1') set(c, r, true)

  // Everything below row 39 is procedurally generated to continue seamlessly.
  // The original bitmap bottom (rows 34-39) is roughly 26px wide, centred at 20.
  // We start the lower torso continuation from row HR=40.

  const tY = HR + cfg.torsoShift   // lower torso start row (40 idle)
  const tH = TORSO_H - cfg.torsoSquash  // lower torso height

  // Lower-torso width tapers slightly toward the waist
  // outer = 14px at top, 12px at waist (matches the shoulder silhouette)
  const bW  = isAlien ? 10 : isAgent ? 13 : 12
  const bX  = Math.floor((SW - bW) / 2)   // left edge (14 for 12-wide)

  // ── LOWER TORSO (rows 40-59) ──────────────────────────────────────────────
  // Draw row by row so we can taper the sides naturally
  for (let row = 0; row < tH; row++) {
    const y = tY + row
    // Taper: start 1px wider at top, reach bW at row 3, then slight waist pinch
    const taper = row < 3 ? 1 : 0
    const lx = bX - taper
    const rx = bX + bW + taper
    // Outline columns
    set(lx, y, true); set(rx - 1, y, true)
    // Interior fill (light) - but dark for agent suit
    for (let x = lx + 1; x < rx - 1; x++) set(x, y, isAgent ? false : false)
    // Top row blends into existing pixels (no explicit fill needed)
    if (row === 0) continue
    // Inner fill
    if (!isAgent) {
      for (let x = lx + 1; x < rx - 1; x++) set(x, y, false)
    } else {
      // Agent: dark suit, light shirt strip down center
      for (let x = lx; x < rx; x++) set(x, y, true)
      set(cx - 1, y, false); set(cx, y, false)
    }
    // Belt line
    if (row === tH - 3) {
      for (let x = lx; x < rx; x++) set(x, y, true)
      set(cx - 1, y, false); set(cx, y, false)  // buckle
    }
    // Cat chest stripe
    if (isCat && row > 0 && row < tH - 3) set(cx, y, true)
  }

  // ── ARMS ─────────────────────────────────────────────────────────────────
  // Arms attach at row 40-41 (shoulder level), hanging from the wide shoulders
  // already visible in the original bitmap rows 33-39.
  // Each arm: 3px wide (outer dark, inner light), tapers to 2px at hand,
  // ends in a rounded 3x3 hand blob.

  const shoulderY = tY + 1     // row 41 — arm root just below original bitmap
  // Shoulder attachment columns (just outside the torso edges)
  const lArmRootX = bX - 3     // col 11
  const rArmRootX = bX + bW + 2 // col 28

  function drawArm(rootX: number, dx: number, dy: number, facingRight: boolean) {
    const steps = ARM_H  // 9 steps = upper arm
    for (let s = 0; s < steps; s++) {
      const t  = s / (steps - 1)
      const ax = Math.round(rootX + dx * t)
      const ay = shoulderY + s + Math.round(dy * t)
      // 2px wide arm
      if (facingRight) {
        set(ax,     ay, true)
        set(ax + 1, ay, true)
        if (s > 0 && s < steps - 1) set(ax, ay, false)  // inner soften
      } else {
        set(ax - 1, ay, true)
        set(ax,     ay, true)
        if (s > 0 && s < steps - 1) set(ax, ay, false)
      }
    }
    // Forearm continuation (another ~5 steps, narrower)
    const foreSteps = 5
    const elbowX = Math.round(rootX + dx)
    const elbowY = shoulderY + steps + Math.round(dy)
    const handDx = facingRight ?  2 : -2
    for (let s = 0; s < foreSteps; s++) {
      const t  = s / (foreSteps - 1)
      const ax = Math.round(elbowX + handDx * t)
      const ay = elbowY + s
      set(ax, ay, true)
      if (s < foreSteps - 1) set(ax + (facingRight ? 1 : -1), ay, true)
    }
    // Hand: 3×3 rounded blob
    const hx = Math.round(elbowX + handDx) + (facingRight ? 0 : -2)
    const hy = elbowY + foreSteps
    set(hx + 1, hy,     true); set(hx + 2, hy,     true)  // top row (narrow)
    set(hx,     hy + 1, true); set(hx + 1, hy + 1, true); set(hx + 2, hy + 1, true)
    set(hx + 1, hy + 2, true); set(hx + 2, hy + 2, true)  // bottom
  }

  drawArm(lArmRootX, cfg.lArmDx, cfg.lArmDy, false)
  drawArm(rArmRootX, cfg.rArmDx, cfg.rArmDy, true)

  // ── HIP TRANSITION ────────────────────────────────────────────────────────
  // Row after torso: slight flare for hip belt
  const hipY = tY + tH
  for (let x = bX - 1; x < bX + bW + 1; x++) set(x, hipY, true)

  // ── LEGS ─────────────────────────────────────────────────────────────────
  // Two separate legs, each 3px wide (dark outer, light inner channel)
  // They split from the hip center and angle slightly outward then down.

  const lLegRootX = bX + 1         // col 15
  const rLegRootX = bX + bW - 4    // col 22

  function drawLeg(rootX: number, xDrift: number, lh: number) {
    for (let s = 0; s < lh; s++) {
      const t  = s / Math.max(lh - 1, 1)
      const lx = Math.round(rootX + xDrift * t)
      const ly = hipY + 1 + s
      // 3px wide: dark | light | dark
      set(lx,     ly, true)
      set(lx + 1, ly, false)  // inner highlight channel
      set(lx + 2, ly, true)
      // Knee cap bump at midpoint
      if (s === Math.floor(lh / 2)) {
        set(lx - 1, ly, true)
        set(lx + 3, ly, true)
      }
    }
    // Ankle (narrows to 2px)
    const ankleX = Math.round(rootX + xDrift)
    const ankleY = hipY + 1 + lh
    set(ankleX + 1, ankleY, true)
    set(ankleX + 2, ankleY, true)
    // Shoe: wider than leg, rounded toe
    const shoeX  = ankleX
    const shoeY  = ankleY + 1
    // Row 1 of shoe (narrow heel start)
    set(shoeX + 1, shoeY,     true); set(shoeX + 2, shoeY,     true)
    // Row 2 of shoe (full width)
    for (let x = shoeX; x < shoeX + FOOT_W; x++) set(x, shoeY + 1, true)
    set(shoeX + 1, shoeY + 1, false); set(shoeX + 2, shoeY + 1, false)  // shine
    // Row 3 (slight undercut at heel)
    for (let x = shoeX + 1; x < shoeX + FOOT_W; x++) set(x, shoeY + 2, true)
  }

  drawLeg(lLegRootX, cfg.lLegDx, cfg.legH)
  drawLeg(rLegRootX, cfg.rLegDx, cfg.legH)

  // ── ACCESSORIES (body portion) ────────────────────────────────────────────
  if (accessory.includes('chain') || accessory.includes('necklace')) {
    const aY = tY + 2
    for (let x = cx - 2; x <= cx + 2; x++) set(x, aY, true)
    set(cx, aY + 1, true)
  }

  if (isOld && (pose === 'idle' || pose === 'walk')) {
    // Walking cane — thin line to the right of the body
    const caneX  = bX + bW + 4
    const caneTop = shoulderY + 2
    const caneBot = Math.min(hipY + 1 + cfg.legH + FOOT_H + 2, SH - 2)
    for (let y = caneTop; y <= caneBot; y++) set(caneX, y, true)
    set(caneX - 1, caneTop, true); set(caneX + 1, caneTop, true)  // handle
    set(caneX - 1, caneBot, true)                                   // rubber tip
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

// -- Build 4-frame sprite sheet (horizontal strip) --------------------------
function makeSheet(frames: (HTMLCanvasElement|null)[]): HTMLCanvasElement {
  const first = frames.find(Boolean)
  const fw = first?.width  ?? SW * SCL
  const fh = first?.height ?? SH * SCL
  const sheet = document.createElement('canvas')
  sheet.width  = fw * 4
  sheet.height = fh
  const ctx = sheet.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = `rgb(${PL[0]},${PL[1]},${PL[2]})`
  ctx.fillRect(0, 0, sheet.width, sheet.height)
  frames.forEach((f, i) => {
    const src = f ?? first
    if (src) ctx.drawImage(src, i * fw, 0)
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
  const [shareOpen, setShareOpen] = useState(false)

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
      generateAll(data.pixels, td)
    } catch(e) {
      setLoadErr(e instanceof Error ? e.message : 'Failed to load')
      setLoadState('error')
    }
  }

  // -- Generate all 4 poses --------------------------------------------------
  const generateAll = useCallback((pix: string, td: TraitsData) => {
    const newFrames: Record<Pose, HTMLCanvasElement|null> = {
      idle:null, walk:null, attack:null, crouch:null,
    }
    POSES.forEach(pose => {
      const native = drawNormie(pix, td, pose)
      newFrames[pose] = upscale(native, SCL)
    })
    setFrames({ ...newFrames })
    setSheet(makeSheet(POSES.map(p => newFrames[p])))
  }, [])

  function regenerate() {
    if (pixels && normTraits) generateAll(pixels, normTraits)
  }

  // -- Download helpers ------------------------------------------------------
  function dlFrame(pose: Pose, scale: number, transparent = false) {
    const c = frames[pose]; if (!c) return
    const out = document.createElement('canvas')
    out.width  = c.width  * scale
    out.height = c.height * scale
    const ctx  = out.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    if (!transparent) { ctx.fillStyle = `rgb(${PL[0]},${PL[1]},${PL[2]})`; ctx.fillRect(0,0,out.width,out.height) }
    ctx.drawImage(c, 0, 0, out.width, out.height)
    out.toBlob(b => {
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(b!),
        download: `normie-${currentId}-${pose}${transparent?'-transparent':''}-${out.width}px.png`,
      })
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000)
    }, 'image/png')
  }

  function dlSheet(mul = 1) {
    if (!sheet) return
    dlCanvas(sheet, `normie-${currentId}-sheet${mul>1?`-${mul}x`:''}.png`, mul)
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

  const gd: React.CSSProperties = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.3rem', marginBottom:'.4rem' }
  const traitList = normTraits?.attributes.filter(a => !['Level','Pixel Count','Action Points','Customized'].includes(a.trait_type)) ?? []

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

              {/* Generate button */}
              {loadState !== 'done' ? (
                <div style={{ fontSize:'.62rem', color:'var(--ink-muted)', marginBottom:'.7rem', lineHeight:1.9 }}>
                  Load a Normie above to generate its full body sprites.<br/>
                  The real Normie head is used exactly - body is drawn from traits.
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.3rem', marginBottom:'.7rem' }}>
                  <button
                    style={{ ...S.btn, ...S.fill, gridColumn:'span 2', fontSize:'.65rem', padding:'.6rem' }}
                    onClick={regenerate}
                  >? Regenerate Sprites</button>
                </div>
              )}

              {/* Downloads */}
              {hasFrames && (<>
                <hr style={{ border:'none', borderTop:'1px solid var(--line-soft)', margin:'.8rem 0' }} />
                <span style={S.lbl}>Download - Active pose: {POSE_LABEL[activePose]}</span>
                <div style={gd}>
                  <button style={S.btn} onClick={() => dlFrame(activePose,1)}>? Native ({SW}-{SH}px)</button>
                  <button style={S.btn} onClick={() => dlFrame(activePose,1,true)}>? Transparent</button>
                  <button style={S.btn} onClick={() => dlFrame(activePose,2)}>? 2- ({SW*2}-{SH*2}px)</button>
                  <button style={S.btn} onClick={() => dlFrame(activePose,4)}>? 4- ({SW*4}-{SH*4}px)</button>
                  <button style={{ ...S.btn, gridColumn:'span 2' }} onClick={() => dlFrame(activePose,8)}>? 8- ({SW*8}-{SH*8}px)</button>
                </div>

                {sheet && (<>
                  <span style={{ ...S.lbl, marginTop:'.7rem' }}>Sprite Sheet - all 4 poses</span>
                  <div style={gd}>
                    <button style={S.btn} onClick={() => dlSheet(1)}>? Native Sheet</button>
                    <button style={S.btn} onClick={() => dlSheet(2)}>? 2- Sheet</button>
                    <button style={{ ...S.btn, gridColumn:'span 2' }} onClick={() => dlSheet(4)}>? 4- Sheet ({SW*16}-{SH*4}px)</button>
                  </div>
                </>)}

                {/* Gallery */}
                <div style={{ ...gd, marginTop:'.6rem' }}>
                  <button
                    style={{ ...S.btn, ...(savedUrl?S.dis:{}) }}
                    onClick={saveToGallery} disabled={uploading||!!savedUrl}
                  >{uploading?'Saving-':savedUrl?'? Saved':'? Save to Gallery'}</button>
                  <div style={{ position:'relative' }}>
                    <button style={{ ...S.btn, width:'100%' }} onClick={() => setShareOpen(o=>!o)}>? Share</button>
                    {shareOpen && (
                      <div style={{ position:'absolute', bottom:'calc(100% + 4px)', left:0, right:0, background:'var(--bg-raise)', border:'1px solid var(--line)', zIndex:10 }}>
                        <button
                          style={{ ...S.btn, width:'100%', borderWidth:0, borderBottom:'1px solid var(--line-soft)' }}
                          onClick={() => {
                            window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(`Just generated Normie #${currentId} as a full body pixel art sprite!\nhttps://fully-normies.vercel.app/engine?id=${currentId}`)}`, '_blank')
                            setShareOpen(false)
                          }}
                        >X / Twitter</button>
                        <button
                          style={{ ...S.btn, width:'100%', borderWidth:0 }}
                          onClick={async () => {
                            const c = frames[activePose]
                            if (navigator.share && c) c.toBlob(async b => {
                              if (b) try { await navigator.share({ title:`Normie #${currentId}`, files:[new File([b],'sprite.png',{type:'image/png'})] }) } catch{}
                            })
                            setShareOpen(false)
                          }}
                        >Share Image</button>
                      </div>
                    )}
                  </div>
                </div>
                {savedUrl && (
                  <div style={{ marginTop:'.4rem', fontSize:'.6rem', color:'var(--ink-muted)' }}>
                    Saved! <a href="/gallery" style={{ color:'var(--ink)', textDecoration:'underline' }}>View Gallery ?</a>
                  </div>
                )}
              </>)}

              {/* Sprite sheet preview */}
              {sheet && (<>
                <hr style={{ border:'none', borderTop:'1px solid var(--line-soft)', margin:'.9rem 0' }} />
                <span style={S.lbl}>Sprite Sheet Preview</span>
                <div style={{ background:'#e3e5e4', border:'1px solid var(--line)', padding:4, display:'inline-block', maxWidth:'100%' }}>
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
