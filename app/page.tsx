'use client'
import Link from 'next/link'
import Nav from './components/Nav'
import Footer from './components/Footer'
import { useEffect, useRef, useState } from 'react'

// ── Live preview that loads actual Normie #6793 face + generates body ──
function HeroSprite({ id, label }: { id: number; label?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function go() {
      try {
        const res = await fetch(`https://api.normies.art/normie/${id}/image.png`, { cache: 'force-cache' })
        if (!res.ok || cancelled) return
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image(); i.crossOrigin = 'anonymous'
          i.onload = () => res(i); i.onerror = rej; i.src = url
        })
        if (cancelled) return

        const c = canvasRef.current; if (!c) return
        const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false

        // Minimal inline sprite draw (same palette, same approach)
        const PL = '#e3e5e4', PD = '#48494b'
        const W = 80, H = 80

        ctx.fillStyle = PL; ctx.fillRect(0, 0, W, H)

        // Draw face at top (32×32)
        const faceC = document.createElement('canvas'); faceC.width = faceC.height = 32
        const fc = faceC.getContext('2d')!; fc.imageSmoothingEnabled = false
        fc.drawImage(img, 0, 0, 32, 32)
        const fd = fc.getImageData(0, 0, 32, 32).data
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
          const i = (y * 32 + x) * 4
          const lm = 0.2126 * fd[i] + 0.7152 * fd[i + 1] + 0.0722 * fd[i + 2]
          ctx.fillStyle = lm < 128 ? PD : PL
          ctx.fillRect(24 + x, 2 + y, 1, 1)
        }

        // Body at 80px scale (simplified but connected)
        const cx = 40
        // Neck
        ctx.fillStyle = PD; ctx.fillRect(cx - 3, 34, 6, 3)
        // Shoulders
        ctx.fillRect(cx - 14, 37, 28, 3)
        ctx.fillStyle = PL; ctx.fillRect(cx - 12, 37, 24, 1)
        // Torso
        ctx.fillStyle = PD
        ctx.fillRect(cx - 11, 40, 22, 1) // top
        ctx.fillRect(cx - 11, 60, 22, 1) // bottom
        ctx.fillRect(cx - 11, 40, 1, 21) // left side
        ctx.fillRect(cx + 10, 40, 1, 21) // right side
        ctx.fillStyle = PL; ctx.fillRect(cx - 10, 41, 20, 19) // fill
        ctx.fillStyle = PD; ctx.fillRect(cx - 9, 52, 18, 1)   // chest seam
        // Belt
        ctx.fillStyle = PD; ctx.fillRect(cx - 12, 61, 24, 3)
        ctx.fillStyle = PL; ctx.fillRect(cx - 2, 62, 4, 1)
        ctx.fillStyle = PD; ctx.fillRect(cx - 1, 62, 2, 1)
        // Arms
        ctx.fillStyle = PD
        ctx.fillRect(cx - 19, 38, 6, 18) // left upper+lower
        ctx.fillRect(cx - 20, 56, 8, 7)  // left hand
        ctx.fillStyle = PL; ctx.fillRect(cx - 19, 56, 6, 5)
        ctx.fillStyle = PD
        ctx.fillRect(cx + 13, 38, 6, 18) // right
        ctx.fillRect(cx + 12, 56, 8, 7)
        ctx.fillStyle = PL; ctx.fillRect(cx + 13, 56, 6, 5)
        // Legs
        ctx.fillStyle = PD
        ctx.fillRect(cx - 11, 64, 9, 10) // left thigh
        ctx.fillRect(cx + 2, 64, 9, 10)  // right thigh
        ctx.fillRect(cx - 12, 74, 11, 3) // left knee
        ctx.fillRect(cx + 1, 74, 11, 3)
        ctx.fillStyle = PL; ctx.fillRect(cx - 11, 75, 9, 1); ctx.fillRect(cx + 2, 75, 9, 1)
        ctx.fillStyle = PD
        ctx.fillRect(cx - 11, 77, 9, 0) // calf stub
        // Shoes
        ctx.fillStyle = PD
        ctx.fillRect(cx - 15, 74, 13, 6)
        ctx.fillRect(cx + 2, 74, 13, 6)
        ctx.fillStyle = PL
        ctx.fillRect(cx - 13, 75, 9, 2)
        ctx.fillRect(cx + 4, 75, 9, 2)

        // Snap to strict palette
        const id2 = ctx.getImageData(0, 0, W, H), p = id2.data
        for (let i = 0; i < p.length; i += 4) {
          const lm = 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]
          if (lm < 128) { p[i] = 0x48; p[i + 1] = 0x49; p[i + 2] = 0x4b }
          else { p[i] = 0xe3; p[i + 1] = 0xe5; p[i + 2] = 0xe4 }
          p[i + 3] = 255
        }
        ctx.putImageData(id2, 0, 0)

        URL.revokeObjectURL(url)
        if (!cancelled) setReady(true)
      } catch {}
    }
    go()
    return () => { cancelled = true }
  }, [id])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ background: '#e3e5e4', border: '1px solid rgba(72,73,75,.15)', padding: 2 }}>
        <canvas ref={canvasRef} width={80} height={80}
          style={{ display: 'block', imageRendering: 'pixelated', width: 80, height: 80, opacity: ready ? 1 : 0, transition: 'opacity .4s' }} />
      </div>
      {label && <span style={{ fontSize: '.4rem', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>{label}</span>}
    </div>
  )
}

// Strip of demo normies — loads actual faces from API
const DEMO_IDS = [6793, 1337, 420, 888, 3141, 2048]

function HeroStrip() {
  const [active, setActive] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % DEMO_IDS.length), 2200)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        {DEMO_IDS.map((id, i) => (
          <div key={id} style={{
            transform: active === i ? 'translateY(-8px) scale(1.1)' : 'none',
            transition: 'transform .4s cubic-bezier(.34,1.56,.64,1)',
            filter: active === i ? 'none' : 'opacity(0.6)',
            zIndex: active === i ? 2 : 1,
          }}>
            <HeroSprite id={id} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: '.44rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
        #{DEMO_IDS[active]} · Live from chain
      </div>
    </div>
  )
}

export default function Home() {
  const features = [
    { n: '01', title: 'Trait-aware bodies',     body: 'Reads on-chain metadata. Human, Cat, Alien, Robot, Ape, Zombie, Skeleton — each type with unique proportions, fur, panels, and extras.' },
    { n: '02', title: 'Real face compositing',  body: 'Your Normie\'s actual 40×40 face is pixel-sampled and composited onto the body. Every sunglass, beard, and mask preserved exactly.' },
    { n: '03', title: 'Strict 2-color palette', body: 'Every pixel snapped to #e3e5e4 / #48494b via Bayer dithering. No gradients, no blur — pure Normies-style monochrome.' },
    { n: '04', title: '4-pose sprite sheets',   body: 'Generate Idle, Walk, Attack, and Crouch in one click. Export as a game-ready 480×120 sprite sheet.' },
    { n: '05', title: 'Community gallery',      body: 'Every saved sprite enters the public gallery. Browse, download at any size, and jump to any Normie\'s archive page.' },
    { n: '06', title: 'Game-ready exports',     body: 'Download at 120, 480, or 960px. Transparent or solid background. Nearest-neighbor — zero quality loss at any scale.' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Press Start 2P for hero headline */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');.fn-hero-font{font-family:'Press Start 2P',monospace!important}`}</style>
      <Nav />
      <main style={{ flex: 1 }}>

        {/* ── HERO ── */}
        <section style={{ borderBottom: '1px solid var(--line)', padding: 'clamp(2.5rem,7vw,5rem) 0' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25rem' }}>
            <style>{`@media(min-width:700px){.fn-hero-inner{flex-direction:row!important;align-items:center!important;justify-content:space-between!important}}`}</style>
            <div className="fn-hero-inner" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(2rem,5vw,3.5rem)' }}>

              {/* Text */}
              <div style={{ maxWidth: 520 }}>
                {/* Digital headline */}
                <div className="fn-hero-font" style={{
                  fontSize: 'clamp(1.6rem,6vw,3.2rem)',
                  lineHeight: 1.3,
                  letterSpacing: '.04em',
                  color: 'var(--ink)',
                  marginBottom: 'clamp(1rem,3vw,2rem)',
                }}>
                  <div>FULL</div>
                  <div>BODY</div>
                  <div style={{ opacity: 0.18 }}>SPRITES.</div>
                </div>

                <p style={{ fontSize: 'clamp(.65rem,1.6vw,.9rem)', color: 'var(--ink-mid)', lineHeight: 1.8, marginBottom: 'clamp(1.4rem,3.5vw,2.5rem)' }}>
                  Turn any Normie NFT into a full-body 120×120 pixel art game sprite. 4 poses, Bayer dithering, trait-aware bodies. Pure browser engine.
                </p>

                <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
                  <Link href="/engine?id=6793" style={{
                    display: 'inline-block', background: 'var(--ink)', color: 'var(--bg)',
                    border: '1px solid var(--ink)', fontFamily: 'inherit', fontWeight: 700,
                    fontSize: '.6rem', letterSpacing: '.13em', textTransform: 'uppercase',
                    padding: '.65rem 1.4rem', textDecoration: 'none',
                  }}>▶ Open Sprite Engine</Link>
                  <Link href="/gallery" style={{
                    display: 'inline-block', background: 'transparent', color: 'var(--ink)',
                    border: '1px solid var(--line)', fontFamily: 'inherit', fontWeight: 700,
                    fontSize: '.6rem', letterSpacing: '.13em', textTransform: 'uppercase',
                    padding: '.65rem 1.4rem', textDecoration: 'none',
                  }}>View Gallery →</Link>
                </div>
              </div>

              {/* Live sprite strip */}
              <div style={{ flexShrink: 0 }}>
                <HeroStrip />
              </div>
            </div>
          </div>
        </section>

        {/* ── PALETTE STRIP ── */}
        <section style={{ borderBottom: '1px solid var(--line)', padding: '1.2rem 0' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.5rem', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Normies Palette</span>
            {[['#e3e5e4','Light'],['#48494b','Dark']].map(([hex,lbl])=>(
              <div key={hex} style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <div style={{ width: 16, height: 16, background: hex, border: '1px solid var(--line)', flexShrink: 0 }} />
                <span style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--ink)' }}>{hex} — {lbl}</span>
              </div>
            ))}
            <span style={{ fontSize: '.5rem', color: 'var(--ink-muted)', marginLeft: 'auto' }}>2 colors · 120×120px · CC0</span>
          </div>
        </section>

        {/* ── FEATURES ── */}
        <section style={{ borderBottom: '1px solid var(--line)', padding: 'clamp(2rem,5vw,4rem) 0' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25rem' }}>
            <div style={{ fontSize: '.52rem', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: '1.8rem' }}>How it works</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 0 }}>
              {features.map((f, i) => (
                <div key={i} style={{ padding: '1.2rem 0', borderTop: '1px solid var(--line-soft)' }}>
                  <div style={{ display: 'flex', gap: '.75rem', paddingRight: '1.5rem' }}>
                    <div style={{ fontSize: '.9rem', fontWeight: 900, opacity: .12, lineHeight: 1, minWidth: '1.4rem', flexShrink: 0, color: 'var(--ink)' }}>{f.n}</div>
                    <div>
                      <div style={{ fontSize: '.68rem', fontWeight: 700, marginBottom: '.2rem', color: 'var(--ink)' }}>{f.title}</div>
                      <div style={{ fontSize: '.62rem', color: 'var(--ink-mid)', lineHeight: 1.7 }}>{f.body}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── BOTTOM CTA ── */}
        <section style={{ padding: 'clamp(2.5rem,6vw,5rem) 0' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '1.5rem' }}>
              <div>
                <div style={{ fontSize: 'clamp(1.2rem,4vw,2.2rem)', fontWeight: 900, letterSpacing: '-.04em', color: 'var(--ink)', marginBottom: '.5rem' }}>
                  10,000 Normies.<br />Infinite sprites.
                </div>
                <div style={{ fontSize: '.65rem', color: 'var(--ink-mid)' }}>Every Normie gets a unique body based on their traits.</div>
              </div>
              <Link href="/engine?id=6793" style={{
                display: 'inline-block', flexShrink: 0, background: 'var(--ink)', color: 'var(--bg)',
                border: '1px solid var(--ink)', fontFamily: 'inherit', fontWeight: 700,
                fontSize: '.6rem', letterSpacing: '.13em', textTransform: 'uppercase',
                padding: '.65rem 1.4rem', textDecoration: 'none',
              }}>▶ Generate a Sprite</Link>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}
