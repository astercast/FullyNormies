'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Nav from '../components/Nav'
import Footer from '../components/Footer'
import { Suspense } from 'react'
import {
  PL, SW, SH, SCL,
  type Pose, type PoseCfg, type TraitsData,
  POSES, POSE_LABEL, ANIM_CLIPS,
  drawNormie, upscale, makeAnimSheet,
} from '@/lib/sprite-engine'

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
    idle:null, walk:null, jump:null, crouch:null,
  })
  const [sheet,     setSheet]    = useState<HTMLCanvasElement|null>(null)
  const [activePose, setActivePose] = useState<Pose>('idle')

  const [uploading, setUploading] = useState(false)
  const [savedUrl,  setSavedUrl]  = useState<string|null>(null)
  const [dlOpen,    setDlOpen]    = useState(false)

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
    setFrames({ idle:null, walk:null, jump:null, crouch:null }); setSheet(null)
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

  // -- Generate 4 reference pose cards + full 16-frame animation sheet -------
  const generateAll = useCallback((pix: string, td: TraitsData, id: number | null) => {
    const newFrames: Record<Pose, HTMLCanvasElement|null> = {
      idle:null, walk:null, jump:null, crouch:null,
    }
    POSES.forEach(pose => {
      const native = drawNormie(pix, td, pose, id)
      newFrames[pose] = upscale(native, SCL)
    })
    setFrames({ ...newFrames })
    setSheet(makeAnimSheet(pix, td, id, SCL))
  }, [])

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

  // dlSheet — 16-frame animation sheet (4 clips × 4 keyframes), generated on-the-fly
  function dlSheet(scale: number, transparent = false) {
    if (!pixels || !normTraits) return
    const cols = 4, rows = ANIM_CLIPS.length
    const fw = SW * scale, fh = SH * scale, gap = Math.max(1, scale)
    const out = document.createElement('canvas')
    out.width  = fw * cols + gap * (cols - 1)
    out.height = fh * rows + gap * (rows - 1)
    const ctx  = out.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    if (!transparent) { ctx.fillStyle = `rgb(${PL[0]},${PL[1]},${PL[2]})`; ctx.fillRect(0,0,out.width,out.height) }
    ANIM_CLIPS.forEach((clip, row) => {
      clip.frames.forEach((cfg, col) => {
        ctx.drawImage(upscale(drawNormie(pixels, normTraits!, cfg, currentId), scale), col*(fw+gap), row*(fh+gap))
      })
    })
    out.toBlob(b => {
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(b!),
        download: `normie-${currentId}-anim-${fw}x${fh}-16f${transparent?'-t':''}.png`,
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

  function shareSprite() {
    const url  = `https://fully-normies.vercel.app/engine?id=${currentId}`
    const text = currentId != null
      ? `Just generated Normie #${currentId} as a full body pixel art sprite with 8 animation frames! 🕹️\n`
      : `Check out FullNormies — pixel art sprite generator for Normies NFTs! 🕹️\n`
    window.open(
      `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      '_blank', 'noopener,noreferrer'
    )
  }

  const traitList = normTraits?.attributes.filter(a => !['Level','Pixel Count','Action Points','Customized'].includes(a.trait_type)) ?? []

  // Download dropdown options
  const dlOptions = hasFrames ? [
    { label: `Frame: ${SW}×${SH}px native`,             action: () => dlFrame(activePose, 1) },
    { label: `Frame: ${SW*2}×${SH*2}px`,                action: () => dlFrame(activePose, 2) },
    { label: `Frame: ${SW*4}×${SH*4}px`,                action: () => dlFrame(activePose, 4) },
    { label: `Frame: ${SW*4}×${SH*4}px transparent`,    action: () => dlFrame(activePose, 4, true) },
    { label: `Sheet: ${SW}px · 4×4 · 16 frames · native`, action: () => dlSheet(1) },
    { label: `Sheet: ${SW*2}px · 4×4 · 16 frames`,       action: () => dlSheet(2) },
    { label: `Sheet: ${SW*4}px · 4×4 · 16 frames`,       action: () => dlSheet(4) },
    { label: `Sheet: ${SW*4}px · transparent`,           action: () => dlSheet(4, true) },
  ] : []

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh' }}>
      <Nav />
      <main style={{
        flex:1,
        // Zoom the engine out 25% so more content is visible at once
        // Text sizes are bumped below to compensate
        transformOrigin:'top center',
        zoom: '0.78',
      }}>

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
                    color:'var(--ink)', fontFamily:'inherit', fontSize:'2.2rem',
                    fontWeight:900, letterSpacing:'-.04em', width:'8rem',
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

              {normName && <div style={{ fontSize:'1.6rem', fontWeight:900, letterSpacing:'-.05em', lineHeight:1, marginBottom:'.9rem' }}>{normName}</div>}

              <span style={S.lbl}>Traits</span>
              <div style={{ display:'grid', gridTemplateColumns:'auto 1fr' }}>
                {traitList.length === 0 ? (
                  <div style={{ gridColumn:'span 2', fontSize:'.65rem', color:'var(--ink-muted)', padding:'.3rem 0' }}>No traits loaded.</div>
                ) : traitList.map((t,i) => [
                  <div key={i+'k'} style={{ padding:'.24rem .6rem .24rem 0', fontSize:'.7rem', letterSpacing:'.07em', textTransform:'uppercase', color:'var(--ink-muted)', borderBottom:'1px solid var(--line-soft)', whiteSpace:'nowrap' }}>{t.trait_type}</div>,
                  <div key={i+'v'} style={{ padding:'.24rem 0', fontSize:'.88rem', fontWeight:700, letterSpacing:'-.01em', borderBottom:'1px solid var(--line-soft)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={t.value}>{t.value}</div>,
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

              {/* 4 pose cards — single row */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'.35rem', marginBottom:'1rem' }}>
                {POSES.map(pose => (
                  <PoseCard
                    key={pose} pose={pose}
                    canvas={frames[pose]}
                    active={activePose===pose}
                    onClick={() => setActivePose(pose)}
                  />
                ))}
              </div>

              {/* Action row */}
              {hasFrames && (
                <div style={{ display:'flex', gap:'.3rem', marginBottom:'.7rem', flexWrap:'wrap' }}>
                  <button
                    style={{ ...S.btn, flex:1, fontSize:'.82rem', padding:'.65rem' }}
                    onClick={shareSprite}
                  >𝕏 Tweet</button>
                  <button
                    style={{ ...S.btn, ...(savedUrl ? S.dis : {}), flex:1, fontSize:'.82rem', padding:'.65rem' }}
                    onClick={saveToGallery} disabled={uploading||!!savedUrl}
                  >{uploading ? 'Saving…' : savedUrl ? '✓ Saved' : '+ Gallery'}</button>
                </div>
              )}
              {!hasFrames && (
                <div style={{ fontSize:'.62rem', color:'var(--ink-muted)', marginBottom:'.7rem', lineHeight:1.9 }}>
                  {loadState === 'loading' ? 'Generating 8 poses…' : 'Load a Normie above to generate its full body sprites.'}
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
                    style={{ ...S.btn, width:'100%', justifyContent:'space-between', fontSize:'.82rem', padding:'.65rem .84rem' }}
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
                      <div style={{ padding:'.28rem .6rem', fontSize:'.48rem', letterSpacing:'.1em', textTransform:'uppercase', color:'var(--ink-muted)', borderBottom:'1px solid var(--line-soft)', borderTop:'1px solid var(--line-soft)', marginTop:'.1rem' }}>Animation Sheet — 16 frames (4×4)</div>
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
                  16 frames · 4 clips × 4 keyframes · {SW}×{SH}px · Idle/Walk/Jump/Crouch · Unity&nbsp;/&nbsp;Godot
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
                {/* Clip row labels: name + F2/F3/F4 for each row */}
                {ANIM_CLIPS.map((clip, row) => (
                  <div key={row} style={{ display:'flex', marginTop:'.1rem', maxWidth:'100%' }}>
                    <span style={{ width:'25%', fontSize:'.44rem', letterSpacing:'.06em', textTransform:'uppercase',
                      color:'var(--ink)', fontWeight:700, textAlign:'center', display:'inline-block' }}>{clip.label}</span>
                    {[2,3,4].map(n => (
                      <span key={n} style={{ width:'25%', fontSize:'.42rem', color:'var(--ink-muted)',
                        textAlign:'center', display:'inline-block' }}>F{n}</span>
                    ))}
                  </div>
                ))}
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
