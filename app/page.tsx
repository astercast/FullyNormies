'use client'
import Link from 'next/link'
import Nav from './components/Nav'
import Footer from './components/Footer'
import { useEffect, useState } from 'react'
import { drawNormie, upscale } from '@/lib/sprite-engine'

// ── Strip of demo normies using full-body sprites ──
const DEMO_IDS = [6793, 1337, 420, 888, 3141, 2048]

// Renders a single full-body normie sprite by calling /api/generate then
// drawing with the shared sprite engine. Falls back to face image while loading.
function HeroSprite({ id, active }: { id: number; active: boolean }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ normieId: id }),
    })
      .then(r => r.json())
      .then(data => {
        if (cancelled || !data.pixels) return
        const canvas = upscale(drawNormie(data.pixels, data.traits, 'idle', id), 2)
        if (!cancelled) setDataUrl(canvas.toDataURL())
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [id])

  return (
    <div style={{ background: '#e3e5e4', border: '1px solid rgba(72,73,75,.15)', padding: 3 }}>
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={`Normie #${id}`}
          style={{ display: 'block', imageRendering: 'pixelated', width: 56, height: 100 }}
        />
      ) : (
        /* Placeholder while sprite loads — show face image at bottom */
        <div style={{ width: 56, height: 100, position: 'relative' }}>
          <img
            src={`https://api.normies.art/normie/${id}/image.png`}
            alt={`Normie #${id}`}
            style={{ display: 'block', imageRendering: 'pixelated', width: 56, height: 56, position: 'absolute', bottom: 0 }}
          />
        </div>
      )}
    </div>
  )
}

function HeroStrip() {
  const [active, setActive] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % DEMO_IDS.length), 2200)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        {DEMO_IDS.map((id, i) => (
          <div key={id} style={{
            transform: active === i ? 'translateY(-6px) scale(1.08)' : 'none',
            transition: 'transform .4s cubic-bezier(.34,1.56,.64,1)',
            opacity: active === i ? 1 : 0.45,
            zIndex: active === i ? 2 : 1,
          }}>
            <HeroSprite id={id} active={active === i} />
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
    { n: '01', title: 'Trait-aware bodies',     body: '4 animated clips: Idle, Walk, Jump, Crouch — each 4 keyframes. Every Normie gets a unique build, outfit, and proportions from on-chain traits.' },
    { n: '02', title: 'Real face compositing',  body: 'Your Normie\'s actual 40×40 face is pixel-sampled and composited onto the body. Every sunglass, beard, and mask preserved exactly.' },
    { n: '03', title: 'Strict 2-color palette', body: 'Every pixel snapped to #e3e5e4 / #48494b. No gradients, no blur — pure Normies-style monochrome at every scale.' },
    { n: '04', title: '16-frame sprite sheets',  body: '4 clips × 4 keyframes in a game-ready 4×4 grid. Slice each row for Idle/Walk/Jump/Crouch animations in Unity or Godot.' },
    { n: '05', title: 'Community gallery',      body: 'Every saved sprite enters the public gallery. Browse, download at any size, and jump to any Normie\'s archive page.' },
    { n: '06', title: 'Game-ready exports',     body: 'Download at native 40px, 2×, or 4× scale. Transparent or solid background. Nearest-neighbor — zero quality loss.' },
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

                <p style={{ fontSize: 'clamp(.75rem,1.8vw,1rem)', color: 'var(--ink-mid)', lineHeight: 1.8, marginBottom: 'clamp(1.4rem,3.5vw,2.5rem)' }}>
                  Turn any Normie NFT into a full-body 120×120 pixel art game sprite.
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
