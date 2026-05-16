'use client'
import Link from 'next/link'
import Nav from './components/Nav'
import Footer from './components/Footer'
import { useEffect, useState } from 'react'

const DEMO_IDS = [6793, 1337, 420, 888, 3141, 2048, 5555, 9001]
const BASE = '/api/v1/normies'

// Uses the v1 API directly — stable URLs, browser-cached, no canvas required
function HeroSprite({ id, active }: { id: number; active: boolean }) {
  const [frame, setFrame] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!active) { setFrame(0); return }
    const t = setInterval(() => setFrame(f => (f + 1) % 4), 160)
    return () => clearInterval(t)
  }, [active])

  const pose = active ? 'walk' : 'stand'
  const src  = `${BASE}/${id}/full.png?pose=${pose}&frame=${frame}`

  return (
    <div style={{ position: 'relative', width: 56, height: 112 }}>
      {/* Face fallback while full-body loads */}
      {!loaded && (
        <img
          src={`${BASE}/${id}/face.png`}
          alt=""
          style={{ position: 'absolute', bottom: 0, left: 8, imageRendering: 'pixelated', width: 40, height: 40, opacity: 0.4 }}
        />
      )}
      <img
        key={pose}
        src={src}
        alt={`Normie #${id}`}
        onLoad={() => setLoaded(true)}
        style={{ display: 'block', imageRendering: 'pixelated', width: 56, height: 112, opacity: loaded ? 1 : 0, transition: 'opacity .2s' }}
      />
    </div>
  )
}

function HeroStrip() {
  const [active, setActive] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % DEMO_IDS.length), 2400)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
      <style>{`.fn-strip-item:nth-child(n+5){display:none}@media(min-width:700px){.fn-strip-item:nth-child(n+5){display:block}}`}</style>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        {DEMO_IDS.map((id, i) => (
          <div key={id} className="fn-strip-item" style={{
            transform: active === i ? 'translateY(-8px) scale(1.1)' : 'none',
            transition:  'transform .35s cubic-bezier(.34,1.56,.64,1)',
            opacity: active === i ? 1 : 0.35,
          }}>
            <HeroSprite id={id} active={active === i} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: '.42rem', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
        #{DEMO_IDS[active]} · live from api
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');.fn-px{font-family:'Press Start 2P',monospace!important}`}</style>
      <Nav />
      <main style={{ flex: 1 }}>

        {/* ── HERO ── */}
        <section style={{ borderBottom: '1px solid var(--line)', padding: 'clamp(2.5rem,6vw,5.5rem) 0', overflow: 'hidden' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25rem' }}>
            <style>{`@media(min-width:700px){.fn-hero{flex-direction:row!important;align-items:center!important;justify-content:space-between!important}}`}</style>
            <div className="fn-hero" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(2rem,6vw,4rem)' }}>

              <div style={{ maxWidth: 480 }}>
                <div className="fn-px" style={{
                  fontSize: 'clamp(1.25rem,5.5vw,2.8rem)', lineHeight: 1.35,
                  letterSpacing: '.04em', color: 'var(--ink)', marginBottom: 'clamp(.8rem,3vw,1.8rem)',
                }}>
                  <div>FULL</div>
                  <div>BODY</div>
                  <div style={{ opacity: .15 }}>SPRITES.</div>
                </div>

                <p style={{ fontSize: 'clamp(.8rem,2vw,.95rem)', color: 'var(--ink-mid)', lineHeight: 1.85, marginBottom: 'clamp(1rem,3vw,2rem)' }}>
                  Every Normie NFT as a live-generated, game-ready full-body sprite.<br />
                  One URL. Four poses. Zero setup.
                </p>

                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  <Link href="/engine" style={btnStyle('solid')}>▶ Sprite Engine</Link>
                  <Link href="/gallery" style={btnStyle('outline')}>Gallery →</Link>
                  <Link href="/how-it-works" style={btnStyle('outline')}>API Docs →</Link>
                </div>
              </div>

              <div style={{ flexShrink: 0 }}>
                <HeroStrip />
              </div>
            </div>
          </div>
        </section>

        {/* ── API PREVIEW ── */}
        <section style={{ borderBottom: '1px solid var(--line)', padding: 'clamp(1.8rem,4vw,3.5rem) 0' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25rem' }}>
            <div style={{ fontSize: '.48rem', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: '1.2rem' }}>Use it in any game or app</div>
            <div style={{ background: 'var(--bg-sink)', border: '1px solid var(--line)', padding: '1rem 1.25rem', overflowX: 'auto' }}>
              <pre style={{ fontSize: '.68rem', color: 'var(--ink-mid)', lineHeight: 1.75, margin: 0 }}>{[
                `GET /api/v1/normies/{id}/full.png?pose=stand`,
                `GET /api/v1/normies/{id}/full.png?pose=walk&frame=0`,
                `GET /api/v1/normies/{id}/full.png?pose=sit`,
                `GET /api/v1/normies/{id}/full.png?pose=sleep`,
                `GET /api/v1/normies/{id}/full-meta.json`,
                `GET /api/v1/normies/{id}/sheet.png`,
              ].join('\n')}</pre>
            </div>
            <div style={{ marginTop: '.8rem', display: 'flex', justifyContent: 'flex-end' }}>
              <Link href="/how-it-works" style={{ fontSize: '.55rem', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-muted)', textDecoration: 'none' }}>
                Full API docs →
              </Link>
            </div>
          </div>
        </section>

        {/* ── STAT ROW ── */}
        <section style={{ padding: 'clamp(2rem,5vw,4rem) 0' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem 4rem' }}>
              {[
                ['10,000',    'Normies'],
                ['3M+',       'Unique bodies'],
                ['4',         'Poses  (stand / walk / sit / sleep)'],
                ['40×80 px',  'Native resolution'],
                ['0',         'External dependencies'],
              ].map(([n, l]) => (
                <div key={n}>
                  <div style={{ fontSize: 'clamp(1.1rem,3vw,1.8rem)', fontWeight: 900, letterSpacing: '-.04em', color: 'var(--ink)' }}>{n}</div>
                  <div style={{ fontSize: '.55rem', color: 'var(--ink-muted)', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: '.15rem' }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}

function btnStyle(variant: 'solid' | 'outline'): React.CSSProperties {
  return {
    display: 'inline-block', textDecoration: 'none',
    fontFamily: 'inherit', fontWeight: 700,
    fontSize: '.65rem', letterSpacing: '.12em', textTransform: 'uppercase',
    padding: '.7rem 1.3rem',
    background: variant === 'solid' ? 'var(--ink)' : 'transparent',
    color:      variant === 'solid' ? 'var(--bg)'  : 'var(--ink)',
    border: `1px solid ${variant === 'solid' ? 'var(--ink)' : 'var(--line)'}`,
  }
}
