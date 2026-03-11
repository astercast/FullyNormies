'use client'
import { useEffect, useState, useRef } from 'react'
import Nav from '../components/Nav'
import Footer from '../components/Footer'
import Link from 'next/link'

interface Sprite {
  url: string
  id: number | null
  timestamp: number
  uploadedAt: string
}

// Download a sprite at a given scale with optional transparent bg
function dlGallerySprite(url: string, id: number|null, size: number, transparent: boolean) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    const aspect = img.naturalHeight / img.naturalWidth
    const w = size, h = Math.round(size * aspect)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false
    if (!transparent) { ctx.fillStyle = '#e3e5e4'; ctx.fillRect(0,0,w,h) }
    ctx.drawImage(img, 0, 0, w, h)
    const name = `normie-${id ?? 'unknown'}-sprite-${w}x${h}${transparent ? '-transparent' : ''}.png`
    c.toBlob(b => {
      if (!b) return
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: name })
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000)
    }, 'image/png')
  }
  img.src = url
}

function SpriteCard({ s }: { s: Sprite }) {
  const [dlOpen, setDlOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!dlOpen) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setDlOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dlOpen])

  const btnBase: React.CSSProperties = {
    background: 'transparent', border: 'none', color: 'var(--ink)',
    fontFamily: 'inherit', fontSize: '.44rem', fontWeight: 700,
    letterSpacing: '.08em', textTransform: 'uppercase', padding: '.3rem .5rem',
    cursor: 'pointer', display: 'block', width: '100%', textAlign: 'left',
    userSelect: 'none', WebkitTapHighlightColor: 'transparent',
  }

  return (
    <div ref={ref} style={{ position: 'relative', background: 'var(--bg-raise)', border: '1px solid var(--line-soft)' }}>
      {/* Sprite image */}
      <div style={{ aspectRatio: '1', background: '#e3e5e4', overflow: 'hidden', cursor: 'pointer' }}
        onClick={() => setDlOpen(o => !o)}
        title={s.id !== null ? `Normie #${s.id} — click to download` : 'Click to download'}
      >
        <img
          src={`/api/proxy-sprite?url=${encodeURIComponent(s.url)}`}
          alt={s.id !== null ? `Normie #${s.id}` : 'Sprite'}
          loading="lazy"
          style={{ width: '100%', height: '100%', imageRendering: 'pixelated', objectFit: 'contain', display: 'block' }}
        />
      </div>

      {/* Footer bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.2rem .3rem', borderTop: '1px solid var(--line-soft)' }}>
        <span style={{ fontSize: '.42rem', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-muted)', fontWeight: 700 }}>
          {s.id !== null ? `#${s.id}` : '?'}
        </span>
        <div style={{ display: 'flex', gap: '.2rem' }}>
          {/* Archive link */}
          {s.id !== null && (
            <a
              href={`https://normiesarchive.vercel.app/normie/${s.id}`}
              target="_blank"
              rel="noopener"
              title={`View Normie #${s.id} on Normies Archive`}
              style={{ ...btnBase, display: 'inline-flex', alignItems: 'center', padding: '.18rem .28rem', color: 'var(--ink-muted)', width: 'auto', fontSize: '.5rem' }}
            >
              ↗
            </a>
          )}
          {/* Download button */}
          <button
            style={{ ...btnBase, display: 'inline-flex', alignItems: 'center', padding: '.18rem .28rem', width: 'auto', fontSize: '.5rem' }}
            onClick={() => setDlOpen(o => !o)}
            title="Download"
          >
            ↓
          </button>
        </div>
      </div>

      {/* Download dropdown */}
      {dlOpen && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 2px)', right: 0,
          background: 'var(--bg-raise)', border: '1px solid var(--line)',
          zIndex: 20, minWidth: 160, boxShadow: '0 4px 16px rgba(0,0,0,.12)',
        }}>
          {[
            { label: '200px PNG',             size: 200, transparent: false },
            { label: '200px Transparent',      size: 200, transparent: true  },
            { label: '480px PNG',              size: 480, transparent: false },
            { label: '960px PNG',              size: 960, transparent: false },
          ].map((opt, i) => (
            <button key={i} style={{ ...btnBase, borderBottom: i < 3 ? '1px solid var(--line-soft)' : 'none', padding: '.38rem .6rem' }}
              onClick={() => { dlGallerySprite(s.url, s.id, opt.size, opt.transparent); setDlOpen(false) }}
            >
              ↓ {opt.label}
            </button>
          ))}
          {/* Fallback direct download link for original image */}
          <a
            href={s.url}
            download
            style={{ ...btnBase, borderTop: '1px solid var(--line)', padding: '.38rem .6rem', color: 'var(--ink)' }}
            target="_blank"
            rel="noopener"
          >
            ↓ Original PNG (fallback)
          </a>
          {s.id !== null && <>
            <div style={{ height: 1, background: 'var(--line)' }} />
            <Link
              href={`/engine?id=${s.id}`}
              style={{ ...btnBase, display: 'block', padding: '.38rem .6rem', textDecoration: 'none', color: 'var(--ink)' }}
            >
              ▶ Regenerate in Engine
            </Link>
          </>}
        </div>
      )}
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 1, background: 'var(--line-soft)', border: '1px solid var(--line-soft)' }}>
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} style={{ background: 'var(--bg-raise)' }}>
          <div style={{
            aspectRatio: '1',
            background: 'linear-gradient(90deg, var(--bg-raise) 25%, var(--bg-sink) 50%, var(--bg-raise) 75%)',
            backgroundSize: '200% 100%',
            animation: `fn-shimmer 1.4s infinite ${(i * 0.06).toFixed(2)}s`,
          }} />
          <div style={{ height: 20, borderTop: '1px solid var(--line-soft)', background: 'var(--bg-raise)' }} />
        </div>
      ))}
      <style>{`
        @keyframes fn-shimmer {
          0%   { background-position: 200% 0 }
          100% { background-position: -200% 0 }
        }
      `}</style>
    </div>
  )
}

export default function GalleryPage() {
  const [sprites, setSprites] = useState<Sprite[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    fetch('/api/sprites')
      .then(r => r.json())
      .then(d => { setSprites(d.sprites || []); setTotal(d.total || 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Nav />
      <main style={{ flex: 1 }}>

        {/* Header */}
        <div style={{ borderBottom: '1px solid var(--line)', padding: '1.8rem 0 1.4rem' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25rem', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
            <div>
              <div style={{ fontSize: 'clamp(1.4rem,5vw,2.4rem)', fontWeight: 900, letterSpacing: '-.05em', lineHeight: 1, color: 'var(--ink)' }}>
                Generated Sprites
              </div>
              <div style={{ marginTop: '.3rem', fontSize: '.54rem', letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
                Community gallery · click any sprite to download
              </div>
            </div>
            <div style={{ fontSize: '.58rem', letterSpacing: '.08em', color: 'var(--ink-muted)' }}>
              {loading ? '…' : `${total} sprite${total !== 1 ? 's' : ''}`}
            </div>
          </div>
        </div>

        {/* Grid */}
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '1.6rem 1.25rem 3rem' }}>

          {loading && <SkeletonGrid />}

          {!loading && sprites.length === 0 && (
            <div style={{ textAlign: 'center', padding: '5rem 0' }}>
              <div style={{ fontSize: '2rem', opacity: .08, marginBottom: '1rem' }}>▦</div>
              <div style={{ fontSize: '.62rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: '1.2rem' }}>No sprites yet</div>
              <Link href="/engine" style={{ display: 'inline-block', background: 'var(--ink)', color: 'var(--bg)', border: '1px solid var(--ink)', fontFamily: 'inherit', fontWeight: 700, fontSize: '.56rem', letterSpacing: '.13em', textTransform: 'uppercase', padding: '.55rem 1.1rem', textDecoration: 'none' }}>
                ▶ Generate the first sprite
              </Link>
            </div>
          )}

          {!loading && sprites.length > 0 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 1, background: 'var(--line-soft)', border: '1px solid var(--line-soft)', marginBottom: '1.5rem' }}>
                {sprites.map((s, i) => <SpriteCard key={i} s={s} />)}
              </div>
              <div style={{ textAlign: 'center' }}>
                <Link href="/engine" style={{ display: 'inline-block', background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)', fontFamily: 'inherit', fontWeight: 700, fontSize: '.56rem', letterSpacing: '.13em', textTransform: 'uppercase', padding: '.55rem 1.1rem', textDecoration: 'none' }}>
                  ▶ Add yours to the gallery
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
