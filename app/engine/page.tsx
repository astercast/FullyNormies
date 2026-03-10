'use client'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Nav from '../components/Nav'
import Footer from '../components/Footer'
import { Suspense } from 'react'

// ══════════════════════════════════════════════════════════════
//  FULLNORMIES SPRITE ENGINE v8  — AI-powered via fal.ai
//
//  Pipeline:
//    1. User loads a Normie (0-9999) → face image + traits fetched
//    2. Click Generate → POST /api/generate → fal.ai FLUX + pixel LoRA
//       4 poses generated in PARALLEL (idle, walk, attack, crouch)
//    3. Each returned image snapped to 2-color Normies palette
//    4. 4 frames assembled into 480×120 sprite sheet canvas
//    5. Download: individual frames at 120/480/960px, full sprite sheet
//
//  Palette: PL=#e3e5e4 (light) / PD=#48494b (dark)
//  FAL_KEY lives in Vercel env — never exposed client-side
// ══════════════════════════════════════════════════════════════

const PL    = '#e3e5e4'
const PD    = '#48494b'
const PL_V: [number,number,number] = [0xe3,0xe5,0xe4]
const PD_V: [number,number,number] = [0x48,0x49,0x4b]

type Pose  = 'idle'|'walk'|'attack'|'crouch'
const POSES: Pose[]     = ['idle','walk','attack','crouch']
const POSE_LABEL        = { idle:'Idle', walk:'Walk', attack:'Attack', crouch:'Crouch' }

interface Trait { key:string; value:string }
type FaceGrid = Uint8Array

function toErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

// ── Palette snap ───────────────────────────────────────────────
//  Loads a remote image URL → draws 120×120 → snaps every pixel to 2-color
function snapToPalette(url: string, contrastBias = 0): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c   = document.createElement('canvas')
      c.width   = 120; c.height = 120
      const ctx = c.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      ctx.fillStyle = PL
      ctx.fillRect(0, 0, 120, 120)
      ctx.drawImage(img, 0, 0, 120, 120)

      const id = ctx.getImageData(0, 0, 120, 120), p = id.data
      const thr = 128 + contrastBias * 16   // bias adjusts snap threshold
      for (let i = 0; i < p.length; i += 4) {
        const lm = 0.2126*p[i] + 0.7152*p[i+1] + 0.0722*p[i+2]
        const v  = lm > thr ? PL_V : PD_V
        p[i]=v[0]; p[i+1]=v[1]; p[i+2]=v[2]; p[i+3]=255
      }
      ctx.putImageData(id, 0, 0)
      resolve(c)
    }
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

// Preserve the exact 40x40 Normie head by resampling it once and pasting it onto each pose.
function sampleFaceGrid(url: string): Promise<FaceGrid> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = 40
      c.height = 40
      const ctx = c.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0, 40, 40)

      const p = ctx.getImageData(0, 0, 40, 40).data
      const grid = new Uint8Array(40 * 40)
      for (let i = 0; i < grid.length; i++) {
        const pi = i * 4
        if (p[pi + 3] < 40) {
          grid[i] = 0
          continue
        }
        const lm = 0.2126 * p[pi] + 0.7152 * p[pi + 1] + 0.0722 * p[pi + 2]
        grid[i] = lm < 140 ? 1 : 0
      }
      resolve(grid)
    }
    img.onerror = () => reject(new Error(`Failed to sample face from image: ${url}`))
    img.src = url
  })
}

function pasteFaceGrid(canvas: HTMLCanvasElement, faceGrid: FaceGrid) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const id = ctx.getImageData(40, 2, 40, 40)
  const p = id.data
  for (let i = 0; i < faceGrid.length; i++) {
    const pi = i * 4
    const v = faceGrid[i] === 1 ? PD_V : PL_V
    p[pi] = v[0]
    p[pi + 1] = v[1]
    p[pi + 2] = v[2]
    p[pi + 3] = 255
  }
  ctx.putImageData(id, 40, 2)
}

// ── Build 480×120 sprite sheet from 4 pose canvases ───────────
function makeSheet(frames: (HTMLCanvasElement|null)[]): HTMLCanvasElement {
  const sheet   = document.createElement('canvas')
  sheet.width   = 480; sheet.height = 120
  const ctx     = sheet.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = PL
  ctx.fillRect(0, 0, 480, 120)
  // Fill any missing frames with copies of the first available frame
  const first = frames.find(Boolean)
  frames.forEach((f, i) => {
    const src = f ?? first
    if (src) ctx.drawImage(src, i * 120, 0, 120, 120)
  })
  return sheet
}

// ── Download a canvas at given scale ──────────────────────────
function dlCanvas(src: HTMLCanvasElement, filename: string, scale = 1) {
  const out   = document.createElement('canvas')
  out.width   = src.width  * scale
  out.height  = src.height * scale
  const ctx   = out.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(src, 0, 0, out.width, out.height)
  out.toBlob(b => {
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(b!), download: filename,
    })
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000)
  }, 'image/png')
}

// ── Minimal style tokens ───────────────────────────────────────
const S = {
  btn: {
    background:'transparent', border:'1px solid var(--line)', color:'var(--ink)',
    fontFamily:'inherit', fontSize:'.6rem', fontWeight:700, letterSpacing:'.1em',
    textTransform:'uppercase' as const, padding:'.44rem .84rem', cursor:'pointer',
    display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'.3rem',
    userSelect:'none' as const, WebkitTapHighlightColor:'transparent',
  },
  fill: { background:'var(--ink)', color:'var(--bg)', borderColor:'var(--ink)' },
  dis:  { opacity:0.38, cursor:'not-allowed' as const, pointerEvents:'none' as const },
  lbl:  {
    fontSize:'.6rem', letterSpacing:'.13em', textTransform:'uppercase' as const,
    color:'var(--ink-muted)', display:'block', marginBottom:'.3rem',
  },
  frame: {
    width:'100%', maxWidth:200, aspectRatio:'1' as const,
    background:'#e3e5e4', border:'1px solid var(--line)',
    display:'flex', alignItems:'center', justifyContent:'center',
    marginBottom:'1.1rem', overflow:'hidden',
  },
}

// ── Single pose thumbnail card ─────────────────────────────────
function PoseThumb({ pose, canvas, active, onClick }: {
  pose:Pose; canvas:HTMLCanvasElement|null; active:boolean; onClick:()=>void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current && canvas) {
      const el = ref.current
      el.width = el.height = 120
      el.getContext('2d')!.drawImage(canvas, 0, 0)
    }
  }, [canvas])

  return (
    <button onClick={onClick} style={{
      ...S.btn, padding:0, flexDirection:'column' as const, overflow:'hidden',
      border: active ? '2px solid var(--ink)' : '1px solid var(--line)',
      ...(active ? S.fill : {}),
    }}>
      <div style={{ width:'100%', aspectRatio:'1', background:'#e3e5e4', position:'relative' }}>
        {canvas
          ? <canvas ref={ref} width={120} height={120}
              style={{ width:'100%', height:'100%', imageRendering:'pixelated', display:'block' }} />
          : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', opacity:.2 }}>
              <span style={{ fontSize:'1.5rem' }}>▦</span>
            </div>
        }
      </div>
      <span style={{ fontSize:'.48rem', letterSpacing:'.1em', padding:'.28rem', display:'block', width:'100%', textAlign:'center' }}>
        {POSE_LABEL[pose]}
      </span>
    </button>
  )
}

// ════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ════════════════════════════════════════════════════════════════
function EngineInner() {
  const searchParams = useSearchParams()
  const router       = useRouter()

  // Normie data
  const [tokenInput,  setTokenInput]  = useState('')
  const [loadState,   setLoadState]   = useState<'idle'|'loading'|'done'|'error'>('idle')
  const [loadErr,     setLoadErr]     = useState('')
  const [currentId,   setCurrentId]   = useState<number|null>(null)
  const [normName,    setNormName]    = useState('')
  const [traits,      setTraits]      = useState<Trait[]>([])
  const [faceUrl,     setFaceUrl]     = useState<string|null>(null)     // blob for display
  const [faceApiUrl,  setFaceApiUrl]  = useState<string|null>(null)     // direct url for fal
  const [faceGrid,    setFaceGrid]    = useState<FaceGrid|null>(null)

  // Generation
  type GenState = 'idle'|'calling'|'snapping'|'done'|'error'
  const [genState,    setGenState]    = useState<GenState>('idle')
  const [genErr,      setGenErr]      = useState('')
  const [genProgress, setGenProgress] = useState(0)   // 0-100
  const [seed,        setSeed]        = useState<number|null>(null)
  const [contrast,    setContrast]    = useState(0)
  // Store raw fal URLs so we can re-snap without re-generating
  const rawUrls = useRef<Record<Pose,string|null>>({ idle:null, walk:null, attack:null, crouch:null })

  // Output canvases — one per pose
  const [frames, setFrames]       = useState<Record<Pose,HTMLCanvasElement|null>>({
    idle:null, walk:null, attack:null, crouch:null,
  })
  const [sheet,  setSheet]        = useState<HTMLCanvasElement|null>(null)
  const [activePose, setActivePose] = useState<Pose>('idle')

  // Gallery
  const [uploading, setUploading] = useState(false)
  const [savedUrl,  setSavedUrl]  = useState<string|null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  const hasFrames   = POSES.some(p => frames[p])
  const allFrames   = POSES.every(p => frames[p])
  const isGenerating = genState === 'calling' || genState === 'snapping'
  const canGenerate  = !!faceApiUrl && !isGenerating

  const wait = (ms:number) => new Promise<void>(r => setTimeout(r,ms))

  // ── Auto-load from URL param ──────────────────────────────────
  useEffect(() => {
    const id = searchParams.get('id')
    if (id) { setTokenInput(id); setTimeout(() => loadById(parseInt(id)), 250) }
  }, [])

  // ── Load a Normie ─────────────────────────────────────────────
  async function loadById(id: number) {
    if (isNaN(id) || id < 0 || id > 9999) return
    setLoadState('loading'); setLoadErr('')
    setTraits([]); setNormName(''); setFaceUrl(null); setFaceApiUrl(null); setFaceGrid(null)
    setSavedUrl(null); setCurrentId(id); setGenState('idle')
    setFrames({ idle:null, walk:null, attack:null, crouch:null }); setSheet(null)
    rawUrls.current = { idle:null, walk:null, attack:null, crouch:null }
    router.replace(`/engine?id=${id}`, { scroll:false })

    try {
      // Fetch metadata
      const mRes = await fetch(`https://api.normies.art/normie/${id}/metadata`, { cache:'no-store' })
      if (!mRes.ok) throw new Error(`Normie #${id} not found (${mRes.status})`)
      const mData = await mRes.json()
      const parsed: Trait[] = []
      if (Array.isArray(mData.attributes))
        mData.attributes.forEach((a: Record<string, unknown>) => {
          if (a.trait_type && a.value != null)
            parsed.push({ key:String(a.trait_type), value:String(a.value) })
        })
      setTraits(parsed)
      setNormName(mData.name || `Normie #${id}`)

      // Load face image
      const imgUrl = `https://api.normies.art/normie/${id}/image.png`
      setFaceApiUrl(imgUrl)
      const imgRes = await fetch(imgUrl, { cache:'no-store' })
      if (imgRes.ok) {
        const blob = await imgRes.blob()
        const objectUrl = URL.createObjectURL(blob)
        setFaceUrl(objectUrl)
        const sampled = await sampleFaceGrid(objectUrl).catch(() => null)
        setFaceGrid(sampled)
      }
      setLoadState('done')
    } catch(e: unknown) {
      setLoadErr(toErrorMessage(e, 'Failed to load'))
      setLoadState('error')
    }
  }

  // ── Generate all 4 poses via AI ───────────────────────────────
  async function generate(opts: { newSeed?:boolean } = {}) {
    if (!canGenerate) return

    const s = (opts.newSeed || seed === null)
      ? ((Math.random() * 0xFFFFFF) | 0)
      : seed
    if (opts.newSeed || seed === null) setSeed(s)

    setGenState('calling'); setGenErr(''); setGenProgress(10)
    setSavedUrl(null)
    rawUrls.current = { idle:null, walk:null, attack:null, crouch:null }

    // Progress ticker while waiting for fal
    const ticker = setInterval(() => {
      setGenProgress(p => p < 82 ? p + 3 : p)
    }, 700)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          normieImageUrl: faceApiUrl,
          normieId: currentId,
          traits,
          poses: POSES,
          seed: s,
        }),
      })

      clearInterval(ticker)
      const data = await res.json()
      if (!res.ok || data.error) {
        const detailText = Array.isArray(data?.details)
          ? data.details
              .map((d: Record<string, unknown>) => `${String(d.pose ?? 'unknown')}: ${String(d.error ?? 'failed')}`)
              .join(' | ')
          : ''
        throw new Error(detailText ? `${data.error || 'Generation failed'}. ${detailText}` : (data.error || 'Generation failed'))
      }

      // Store raw URLs for re-snapping
      data.poses.forEach((p:{pose:string;url:string|null}) => {
        if (p.url) rawUrls.current[p.pose as Pose] = p.url
      })

      // Snap palette
      setGenState('snapping'); setGenProgress(88)
      await applySnap(contrast)

    } catch(e: unknown) {
      clearInterval(ticker)
      console.error('[generate]', e)
      setGenErr(toErrorMessage(e, 'Generation failed'))
      setGenState('error')
      setGenProgress(0)
    }
  }

  // ── Apply palette snap to raw URLs (can re-run with new contrast) ──
  async function applySnap(cBias: number) {
    const urls = rawUrls.current
    const hasSome = Object.values(urls).some(Boolean)
    if (!hasSome) return

    setGenState('snapping')
    const newFrames: Record<Pose,HTMLCanvasElement|null> = { idle:null, walk:null, attack:null, crouch:null }

    await Promise.all(POSES.map(async pose => {
      const url = urls[pose]
      if (!url) return
      try {
        newFrames[pose] = await snapToPalette(url, cBias)
        if (newFrames[pose] && faceGrid) {
          pasteFaceGrid(newFrames[pose], faceGrid)
        }
      } catch(e) {
        console.error(`snap failed for ${pose}:`, e)
      }
    }))

    setFrames({ ...newFrames })

    // Build sprite sheet
    const frameArr = POSES.map(p => newFrames[p])
    const newSheet = makeSheet(frameArr)
    setSheet(newSheet)

    setGenState('done'); setGenProgress(100)
    await new Promise<void>(r => setTimeout(r, 300))
    setGenProgress(0)
  }

  // ── Download helpers ──────────────────────────────────────────
  function dlFrame(pose: Pose, size: number, transparent = false) {
    const c = frames[pose]; if (!c) return
    const out = document.createElement('canvas')
    out.width = out.height = size
    const ctx = out.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    if (!transparent) { ctx.fillStyle = PL; ctx.fillRect(0,0,size,size) }
    ctx.drawImage(c, 0, 0, size, size)
    dlCanvas(out, `normie-${currentId}-${pose}-${size}px.png`)
  }

  function dlSheet(scale = 1) {
    if (!sheet) return
    dlCanvas(sheet, `normie-${currentId}-spritesheet${scale > 1 ? `-${scale}x` : ''}.png`, scale)
  }

  async function saveToGallery() {
    const c = frames[activePose]; if (!c || uploading) return
    setUploading(true)
    try {
      const blob: Blob = await new Promise(res => c.toBlob(b => res(b!), 'image/png'))
      const form = new FormData()
      form.append('file', blob, `normie-${currentId}-${activePose}.png`)
      form.append('meta', JSON.stringify({ id:currentId, name:normName, traits, pose:activePose }))
      const data = await (await fetch('/api/upload', { method:'POST', body:form })).json()
      if (data.url) setSavedUrl(data.url); else throw new Error()
    } catch { /* silent */ } finally { setUploading(false) }
  }

  const g2: React.CSSProperties = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.3rem', marginBottom:'.4rem' }

  // Progress bar display
  const showProgress = isGenerating && genProgress > 0
  const progressLabel =
    genState === 'calling'  ? 'Generating 4 poses with AI…' :
    genState === 'snapping' ? 'Applying Normies palette…' : ''

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh' }}>
      <Nav />
      <main style={{ flex:1 }}>

        {/* ── Token input bar ─────────────────────────────────── */}
        <div style={{ borderBottom:'1px solid var(--line)', padding:'1.3rem 0' }}>
          <div style={{ maxWidth:1080, margin:'0 auto', padding:'0 1.25rem' }}>
            <div style={{ display:'flex', alignItems:'flex-end', gap:'.5rem', flexWrap:'wrap' }}>
              <div>
                <span style={S.lbl}>Token ID — 0 to 9999</span>
                <input
                  type="number" min={0} max={9999} placeholder="6793"
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
              >{loadState==='loading'?'Loading…':'Load'}</button>
              <button style={S.btn} onClick={() => {
                const id = Math.floor(Math.random()*10000)
                setTokenInput(String(id)); loadById(id)
              }}>Random</button>
            </div>
            {loadErr && (
              <div style={{ marginTop:'.7rem', padding:'.45rem .65rem', border:'1px solid var(--line)', fontSize:'.65rem' }}>
                ⚠ {loadErr}
              </div>
            )}
          </div>
        </div>

        {/* ── Main two-column grid ─────────────────────────────── */}
        <div style={{ maxWidth:1080, margin:'0 auto', padding:'0 1.25rem' }}>
          <style>{`
            @media(min-width:700px){
              .fn-grid{grid-template-columns:1fr 1fr !important}
              .fn-right{border-left:1px solid var(--line) !important;border-top:none !important;padding-left:1.6rem !important}
            }
          `}</style>
          <div className="fn-grid" style={{ display:'grid', gridTemplateColumns:'1fr', borderBottom:'1px solid var(--line)' }}>

            {/* ── LEFT: Original Normie ──────────────────────── */}
            <div style={{ padding:'1.4rem 0' }}>
              <div style={{ fontSize:'.58rem', letterSpacing:'.16em', textTransform:'uppercase', color:'var(--ink-muted)', marginBottom:'1.1rem', display:'flex', alignItems:'center', gap:'.4rem' }}>
                01 — Original Normie
                <span style={{ flex:1, height:1, background:'var(--line-soft)', display:'block', opacity:.5 }} />
              </div>
              <div style={S.frame}>
                {faceUrl
                  ? <img src={faceUrl} alt={normName} style={{ width:'100%', height:'100%', imageRendering:'pixelated', objectFit:'contain', display:'block' }} />
                  : <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'.28rem', color:'#48494b', textAlign:'center' }}>
                      <div style={{ fontSize:'1.3rem', opacity:.1 }}>◻</div>
                      <div style={{ fontSize:'.58rem', letterSpacing:'.1em', textTransform:'uppercase' }}>Load a Normie</div>
                      <div style={{ fontSize:'.5rem', opacity:.55 }}>0 – 9999</div>
                    </div>
                }
              </div>
              {normName && <div style={{ fontSize:'1.4rem', fontWeight:900, letterSpacing:'-.05em', lineHeight:1, marginBottom:'.9rem' }}>{normName}</div>}
              <span style={S.lbl}>Traits</span>
              <div style={{ display:'grid', gridTemplateColumns:'auto 1fr' }}>
                {traits.length === 0
                  ? <div style={{ gridColumn:'span 2', fontSize:'.65rem', color:'var(--ink-muted)', padding:'.3rem 0' }}>No traits loaded.</div>
                  : traits.map((t,i) => [
                      <div key={i+'k'} style={{ padding:'.24rem .75rem .24rem 0', fontSize:'.55rem', letterSpacing:'.07em', textTransform:'uppercase', color:'var(--ink-muted)', borderBottom:'1px solid var(--line-soft)', whiteSpace:'nowrap' }}>{t.key}</div>,
                      <div key={i+'v'} style={{ padding:'.24rem 0', fontSize:'.72rem', fontWeight:700, letterSpacing:'-.01em', borderBottom:'1px solid var(--line-soft)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={t.value}>{t.value}</div>,
                    ])
                }
              </div>
              {faceUrl && <>
                <hr style={{ border:'none', borderTop:'1px solid var(--line-soft)', margin:'.9rem 0' }} />
                <button style={S.btn} onClick={() => {
                  const a = Object.assign(document.createElement('a'), { href:faceUrl!, download:`normie-${currentId}-face.png` })
                  a.click()
                }}>↓ Download Face PNG</button>
              </>}
            </div>

            {/* ── RIGHT: Sprite Engine ───────────────────────── */}
            <div className="fn-right" style={{ padding:'1.4rem 0', borderTop:'1px solid var(--line)' }}>
              <div style={{ fontSize:'.58rem', letterSpacing:'.16em', textTransform:'uppercase', color:'var(--ink-muted)', marginBottom:'1.1rem', display:'flex', alignItems:'center', gap:'.4rem' }}>
                02 — Full Body Sprite Engine
                <span style={{ flex:1, height:1, background:'var(--line-soft)', display:'block', opacity:.5 }} />
                <span style={{ fontSize:'.46rem', opacity:.5, letterSpacing:'.04em', textTransform:'none' as const }}>AI · fal.ai</span>
              </div>

              {/* ── 4-pose grid ───────────────────────────────── */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'.35rem', marginBottom:'.9rem' }}>
                {POSES.map(pose => (
                  <PoseThumb
                    key={pose} pose={pose}
                    canvas={frames[pose]}
                    active={activePose===pose}
                    onClick={() => setActivePose(pose)}
                  />
                ))}
              </div>

              {/* ── Progress bar ──────────────────────────────── */}
              {showProgress && (
                <div style={{ marginBottom:'.7rem' }}>
                  <div style={{ fontSize:'.55rem', letterSpacing:'.09em', textTransform:'uppercase', color:'var(--ink-muted)', marginBottom:'.3rem' }}>
                    {progressLabel}
                  </div>
                  <div style={{ height:2, background:'var(--line-soft)' }}>
                    <div style={{ height:2, background:'var(--ink)', width:`${genProgress}%`, transition:'width .6s ease' }} />
                  </div>
                </div>
              )}

              {/* ── Error display ─────────────────────────────── */}
              {genState==='error' && (
                <div style={{ padding:'.5rem .65rem', border:'1px solid var(--line)', fontSize:'.62rem', marginBottom:'.6rem', lineHeight:1.7 }}>
                  ⚠ {genErr}
                  {genErr.includes('FAL_KEY') && (
                    <> — <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer" style={{ color:'var(--ink)' }}>
                      Get a free key at fal.ai
                    </a></>
                  )}
                </div>
              )}

              {/* ── Primary generate button ────────────────────── */}
              <button
                style={{ ...S.btn, ...S.fill, width:'100%', marginBottom:'.45rem', fontSize:'.65rem', padding:'.6rem', ...(canGenerate?{}:S.dis) }}
                onClick={() => generate({ newSeed: seed===null })}
                disabled={!canGenerate}
              >
                {isGenerating
                  ? (genState==='snapping' ? '🎨 Applying palette…' : '⏳ Generating 4 poses…')
                  : hasFrames ? '↺ Regenerate All Poses' : '▶ Generate Full Body Sprites'
                }
              </button>

              {/* ── Controls row ─────────────────────────────── */}
              {hasFrames && !isGenerating && (
                <div style={{ ...g2, marginBottom:'.6rem' }}>
                  <button style={S.btn} onClick={() => generate({ newSeed:true })}>⚂ New Seed</button>
                  <button style={S.btn} onClick={() => generate()}>↺ Same Seed</button>
                  <button style={S.btn} onClick={() => { const c2 = Math.min(4,contrast+1); setContrast(c2); applySnap(c2) }}>+ Contrast</button>
                  <button style={S.btn} onClick={() => { const c2 = Math.max(-4,contrast-1); setContrast(c2); applySnap(c2) }}>− Contrast</button>
                </div>
              )}

              {!hasFrames && !isGenerating && faceApiUrl && (
                <div style={{ fontSize:'.58rem', color:'var(--ink-muted)', marginBottom:'.7rem', lineHeight:1.8 }}>
                  Powered by FLUX + pixel art LoRA via fal.ai.<br/>
                  Generates all 4 poses in parallel, then snaps output to the 2-color Normies palette.<br/>
                  ~8–15 seconds per run.
                </div>
              )}

              <hr style={{ border:'none', borderTop:'1px solid var(--line-soft)', margin:'.9rem 0' }} />

              {/* ── Downloads ─────────────────────────────────── */}
              <span style={S.lbl}>Download</span>
              {hasFrames ? (<>
                {/* Active pose single frame */}
                <div style={{ fontSize:'.55rem', color:'var(--ink-muted)', marginBottom:'.3rem', letterSpacing:'.06em', textTransform:'uppercase' }}>
                  Active pose: {POSE_LABEL[activePose]}
                </div>
                <div style={{ ...g2 }}>
                  <button style={S.btn} onClick={() => dlFrame(activePose,120)}>↓ 120px</button>
                  <button style={S.btn} onClick={() => dlFrame(activePose,120,true)}>↓ Transparent</button>
                  <button style={S.btn} onClick={() => dlFrame(activePose,480)}>↓ 480px</button>
                  <button style={S.btn} onClick={() => dlFrame(activePose,960)}>↓ 960px</button>
                </div>

                {/* Sprite sheet */}
                {sheet && <>
                  <div style={{ fontSize:'.55rem', color:'var(--ink-muted)', margin:'.6rem 0 .3rem', letterSpacing:'.06em', textTransform:'uppercase' }}>
                    Sprite sheet (all 4 poses)
                  </div>
                  <div style={{ ...g2 }}>
                    <button style={S.btn} onClick={() => dlSheet(1)}>↓ Sheet 480×120</button>
                    <button style={S.btn} onClick={() => dlSheet(4)}>↓ Sheet 4× (1920×480)</button>
                    <button style={{ ...S.btn, gridColumn:'span 2' }} onClick={() => dlSheet(8)}>↓ Sheet 8× (3840×960)</button>
                  </div>
                </>}

                {/* Gallery + share */}
                <div style={{ ...g2, marginTop:'.6rem' }}>
                  <button style={{ ...S.btn, ...(savedUrl?S.dis:{}) }}
                    onClick={saveToGallery} disabled={uploading||!!savedUrl}>
                    {uploading?'Saving…':savedUrl?'✓ Saved':'↑ Save to Gallery'}
                  </button>
                  <div style={{ position:'relative' }}>
                    <button style={{ ...S.btn, width:'100%' }} onClick={() => setShareOpen(o=>!o)}>↗ Share</button>
                    {shareOpen && (
                      <div style={{ position:'absolute', bottom:'calc(100% + 4px)', left:0, right:0, background:'var(--bg-raise)', border:'1px solid var(--line)', zIndex:10 }}>
                        <button style={{ ...S.btn, width:'100%', borderWidth:0, borderBottom:'1px solid var(--line-soft)' }}
                          onClick={() => { window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(`Just generated Normie #${currentId} as a pixel art sprite!\nhttps://fully-normies.vercel.app/engine?id=${currentId}`)}`, '_blank'); setShareOpen(false) }}>
                          X / Twitter
                        </button>
                        <button style={{ ...S.btn, width:'100%', borderWidth:0 }}
                          onClick={async () => {
                            const c = frames[activePose]
                            if (navigator.share && c) c.toBlob(async b => {
                              if (b) try { await navigator.share({ title:`Normie #${currentId}`, files:[new File([b],'sprite.png',{type:'image/png'})] }) } catch{}
                            })
                            setShareOpen(false)
                          }}>Share Image</button>
                      </div>
                    )}
                  </div>
                </div>
                {savedUrl && (
                  <div style={{ marginTop:'.4rem', fontSize:'.6rem', color:'var(--ink-muted)' }}>
                    Saved! <a href="/gallery" style={{ color:'var(--ink)', textDecoration:'underline' }}>View Gallery</a>
                  </div>
                )}
              </>) : (
                <div style={{ fontSize:'.65rem', color:'var(--ink-muted)' }}>
                  Generate sprites to unlock downloads.
                </div>
              )}

              {/* ── Sprite sheet preview ──────────────────────── */}
              {sheet && (<>
                <hr style={{ border:'none', borderTop:'1px solid var(--line-soft)', margin:'.9rem 0' }} />
                <span style={S.lbl}>Sprite Sheet Preview — 480×120</span>
                <div style={{ background:'#e3e5e4', border:'1px solid var(--line)', padding:4, display:'inline-block' }}>
                  <canvas
                    ref={el => {
                      if (el && sheet) {
                        el.width=480; el.height=120
                        const ctx=el.getContext('2d')!
                        ctx.imageSmoothingEnabled=false
                        ctx.drawImage(sheet,0,0)
                      }
                    }}
                    width={480} height={120}
                    style={{ display:'block', imageRendering:'pixelated', maxWidth:'100%', height:'auto' }}
                  />
                </div>
                <div style={{ display:'flex', marginTop:'.25rem' }}>
                  {POSES.map(p => (
                    <span key={p} style={{ fontSize:'.48rem', letterSpacing:'.08em', textTransform:'uppercase', color:'var(--ink-muted)', width:'25%', textAlign:'center', display:'inline-block' }}>
                      {POSE_LABEL[p]}
                    </span>
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
