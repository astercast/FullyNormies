'use client'
import Link from 'next/link'
import Nav from './components/Nav'
import Footer from './components/Footer'
import { useEffect, useRef, useState } from 'react'

// Renders a tiny deterministic pixel art body from a seed — no API needed
// These are purely decorative silhouettes shown in the hero
function DemoSprite({ seed, style }: { seed: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false
    const PL = '#e3e5e4', PD = '#48494b'
    const W = 40, H = 40

    function r(n: number) { let s = n | 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 0x100000000 } }
    const rng = r(seed)
    const slim = rng() > .5
    const bW = slim ? 13 : 15, bX = (W - bW) >> 1
    const nW = slim ? 3 : 4, nX = (W - nW) >> 1
    const lW = slim ? 4 : 5

    ctx.fillStyle = PL; ctx.fillRect(0, 0, W, H)
    // Head placeholder (just a rect — real face comes from API)
    ctx.fillStyle = PD; ctx.fillRect(nX, 0, nW, 3)   // neck
    ctx.fillRect(bX, 3, bW, 1)                         // shoulder
    ctx.fillRect(bX + 1, 4, bW - 2, 9)                // torso
    // Arms
    ctx.fillRect(bX - 2, 4, 2, 8)
    ctx.fillRect(bX + bW, 4, 2, 8)
    // Belt
    ctx.fillRect(bX, 13, bW, 2)
    // Legs
    const gap = 1, lLX = (W >> 1) - gap - lW, rLX = (W >> 1) + gap
    ctx.fillRect(lLX, 15, lW, 10); ctx.fillRect(rLX, 15, lW, 10)
    // Shoes
    ctx.fillRect(lLX - 1, 25, lW + 2, 3); ctx.fillRect(rLX - 1, 25, lW + 2, 3)
    // Head box (face area — checkered placeholder)
    for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
      ctx.fillStyle = rng() > .55 ? PD : PL; ctx.fillRect(bX + 1 + x, -13 + y, 1, 1)
    }
    ctx.fillStyle = PD
  }, [seed])

  return (
    <canvas ref={ref} width={40} height={40}
      style={{ imageRendering: 'pixelated', display: 'block', ...style }} />
  )
}

// Rotating strip of real sprites from the gallery, or fallback to generated demos
function HeroStrip() {
  const [sprites, setSprites] = useState<string[]>([])
  const [active, setActive] = useState(0)
  const DEMO_SEEDS = [1337, 420, 888, 3141, 777, 2048]

  useEffect(() => {
    fetch('/api/sprites')
      .then(r => r.json())
      .then(d => {
        const urls = (d.sprites || []).slice(0, 8).map((s: any) => s.url)
        if (urls.length >= 3) setSprites(urls)
      })
      .catch(() => {})
  }, [])

  // Rotate active highlight every 1.8s
  useEffect(() => {
    const count = sprites.length || DEMO_SEEDS.length
    const t = setInterval(() => setActive(a => (a + 1) % count), 1800)
    return () => clearInterval(t)
  }, [sprites.length])

  const items = sprites.length >= 3 ? sprites : null

  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', flexWrap: 'nowrap' }}>
      {DEMO_SEEDS.map((s, i) => {
        const isActive = active === i
        return (
          <div key={i} style={{
            background: '#e3e5e4',
            border: `1px solid ${isActive ? '#48494b' : 'transparent'}`,
            padding: 2,
            transition: 'all .3s ease',
            transform: isActive ? 'translateY(-6px) scale(1.08)' : 'none',
            flex: '0 0 auto',
          }}>
            {items
              ? <img src={items[i % items.length]} alt="" loading="lazy"
                  style={{ width: 40, height: 40, imageRendering: 'pixelated', display: 'block' }} />
              : <DemoSprite seed={s} style={{ width: 40, height: 40 }} />
            }
          </div>
        )
      })}
    </div>
  )
}

export default function Home() {
  const features = [
    { n: '01', title: 'Trait-aware bodies',    body: 'Reads on-chain metadata. Human, Cat, Alien, Robot, Ape, Zombie, Skeleton — each with their own proportions and extras.' },
    { n: '02', title: 'Real face pixels',       body: 'Your Normie\'s actual 40×40 face is sampled and composited pixel-perfect onto the body. Every detail preserved.' },
    { n: '03', title: 'Strict 2-color palette', body: 'Every pixel snapped to #e3e5e4 / #48494b. No gradients, no anti-aliasing. Pure Normies-style monochrome.' },
    { n: '04', title: '4-pose sprite sheets',   body: 'Generate Idle, Walk, Attack, and Crouch frames in one click. Download as a single 480×120 sprite sheet.' },
    { n: '05', title: 'Community gallery',      body: 'Every saved sprite goes into the public gallery. Browse, download, and jump to any Normie\'s archive page.' },
    { n: '06', title: 'Game-ready exports',     body: 'Download at 120, 480, or 960px. Transparent or white background. Nearest-neighbor scale — zero blur.' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Nav />
      <main style={{ flex: 1 }}>

        {/* ── HERO ── */}
        <section style={{ borderBottom: '1px solid var(--line)', padding: 'clamp(3rem,8vw,6rem) 0' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2.5rem', alignItems: 'center' }}>
              <style>{`@media(min-width:640px){.fn-hero-grid{grid-template-columns:1fr auto !important}}`}</style>
              <div className="fn-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2.5rem', alignItems: 'center' }}>

                {/* Text */}
                <div>
                  <div style={{ fontSize: 'clamp(2.8rem,11vw,8rem)', fontWeight: 900, letterSpacing: '-.05em', lineHeight: .92, color: 'var(--ink)', marginBottom: 'clamp(1.2rem,3vw,2.2rem)' }}>
                    FULL<br/>BODY<br/><span style={{ opacity: .18 }}>SPRITES.</span>
                  </div>
                  <p style={{ fontSize: 'clamp(.7rem,1.8vw,.95rem)', color: 'var(--ink-mid)', maxWidth: 480, lineHeight: 1.75, marginBottom: 'clamp(1.6rem,4vw,2.8rem)' }}>
                    Turn any Normie NFT into a full-body 120×120 pixel art game sprite. 4 poses, dithered shading, trait-aware bodies.
                  </p>
                  <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
                    <Link href="/engine" style={{ display: 'inline-block', background: 'var(--ink)', color: 'var(--bg)', border: '1px solid var(--ink)', fontFamily: 'inherit', fontWeight: 700, fontSize: '.6rem', letterSpacing: '.13em', textTransform: 'uppercase', padding: '.65rem 1.4rem', textDecoration: 'none' }}>
                      ▶ Open Sprite Engine
                    </Link>
                    <Link href="/gallery" style={{ display: 'inline-block', background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)', fontFamily: 'inherit', fontWeight: 700, fontSize: '.6rem', letterSpacing: '.13em', textTransform: 'uppercase', padding: '.65rem 1.4rem', textDecoration: 'none' }}>
                      View Gallery →
                    </Link>
                  </div>
                </div>

                {/* Rotating sprite strip */}
                <div style={{ flexShrink: 0 }}>
                  <HeroStrip />
                  <div style={{ marginTop: '.5rem', fontSize: '.44rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-muted)', textAlign: 'center' }}>
                    Community sprites
                  </div>
                </div>

              </div>
            </div>
          </div>
        </section>

        {/* ── PALETTE STRIP ── */}
        <section style={{ borderBottom: '1px solid var(--line)', padding: '1.4rem 0' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.5rem', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Normies Palette</span>
            {[['#e3e5e4','Light'],['#48494b','Dark']].map(([hex,lbl])=>(
              <div key={hex} style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <div style={{ width: 18, height: 18, background: hex, border: '1px solid var(--line)', flexShrink: 0 }} />
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
              {features.map((f,i)=>(
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
                  10,000 Normies.<br/>Infinite sprites.
                </div>
                <div style={{ fontSize: '.65rem', color: 'var(--ink-mid)' }}>Every Normie gets a unique body based on their traits.</div>
              </div>
              <Link href="/engine" style={{ display: 'inline-block', flexShrink: 0, background: 'var(--ink)', color: 'var(--bg)', border: '1px solid var(--ink)', fontFamily: 'inherit', fontWeight: 700, fontSize: '.6rem', letterSpacing: '.13em', textTransform: 'uppercase', padding: '.65rem 1.4rem', textDecoration: 'none' }}>
                ▶ Generate a Sprite
              </Link>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}
