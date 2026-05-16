import Nav from '../components/Nav'
import Footer from '../components/Footer'

const BASE = 'https://fullnormies.vercel.app/api/v1'

// ── Shared styles ────────────────────────────────────────────────────────────
const S = {
  section: {
    borderBottom: '1px solid var(--line)',
    padding: 'clamp(2rem,5vw,4rem) 0',
  } as React.CSSProperties,
  label: {
    fontSize: '.45rem', letterSpacing: '.18em',
    textTransform: 'uppercase' as const, color: 'var(--ink-muted)',
    marginBottom: '1.2rem',
  },
  h2: {
    fontSize: 'clamp(.9rem,2.5vw,1.3rem)', fontWeight: 900,
    letterSpacing: '-.03em', color: 'var(--ink)', marginBottom: '.6rem',
  } as React.CSSProperties,
  body: {
    fontSize: '.7rem', color: 'var(--ink-mid)', lineHeight: 1.8,
  } as React.CSSProperties,
  code: {
    background: 'var(--bg-sink)', border: '1px solid var(--line)',
    padding: '1rem 1.25rem', overflowX: 'auto' as const,
    fontSize: '.68rem', lineHeight: 1.75,
  } as React.CSSProperties,
  pre: { margin: 0, color: 'var(--ink-mid)', fontFamily: 'inherit' } as React.CSSProperties,
  inlineCode: {
    background: 'var(--bg-sink)', border: '1px solid var(--line-soft)',
    padding: '.1em .35em', fontSize: '.85em', borderRadius: 0,
  } as React.CSSProperties,
  table: {
    width: '100%', borderCollapse: 'collapse' as const,
    fontSize: '.68rem', color: 'var(--ink-mid)',
  } as React.CSSProperties,
  th: {
    textAlign: 'left' as const, fontSize: '.48rem', letterSpacing: '.14em',
    textTransform: 'uppercase' as const, color: 'var(--ink-muted)',
    padding: '.5rem .75rem .5rem 0', borderBottom: '1px solid var(--line)',
  } as React.CSSProperties,
  td: {
    padding: '.55rem .75rem .55rem 0', borderBottom: '1px solid var(--line-soft)',
    verticalAlign: 'top' as const,
  } as React.CSSProperties,
}

function Code({ children }: { children: string }) {
  return (
    <div style={S.code}>
      <pre style={S.pre}>{children.trim()}</pre>
    </div>
  )
}

function Ic({ children }: { children: string }) {
  return <code style={S.inlineCode}>{children}</code>
}

// ── Section wrapper ──────────────────────────────────────────────────────────
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={S.section}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25rem' }}>
        <div style={S.label}>{label}</div>
        {children}
      </div>
    </section>
  )
}

export default function HowItWorksPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Nav />
      <main style={{ flex: 1 }}>

        {/* ── PAGE HEADER ── */}
        <section style={{ borderBottom: '1px solid var(--line)', padding: 'clamp(2rem,5vw,4rem) 0' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25rem' }}>
            <h1 style={{ fontSize: 'clamp(1.4rem,5vw,2.6rem)', fontWeight: 900, letterSpacing: '-.04em', color: 'var(--ink)', marginBottom: '.75rem' }}>
              API Docs
            </h1>
            <p style={{ ...S.body, maxWidth: 560 }}>
              FullNormies generates full-body pixel art sprites for any Normie NFT on demand,
              server-side, with no dependencies. Point any game, dapp, or tool at a URL and
              get a pixel-perfect PNG back — CORS open, CDN-cached, ETag-ready.
            </p>
          </div>
        </section>

        {/* ── BASE URL ── */}
        <Section label="Base URL">
          <Code>{`${BASE}`}</Code>
          <p style={{ ...S.body, marginTop: '.9rem' }}>
            All endpoints are <strong>CORS open</strong> (<Ic>Access-Control-Allow-Origin: *</Ic>)
            so you can call them directly from a browser, game client, or any server.
            Sprites are cached for <strong>1 hour</strong> at the CDN and include ETags for cheap revalidation.
          </p>
        </Section>

        {/* ── ENDPOINTS ── */}
        <Section label="Endpoints">
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Method</th>
                <th style={S.th}>Path</th>
                <th style={S.th}>Returns</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['GET', `/v1/normies/{id}/full.png`, 'Sprite PNG  (40×80 px, transparent)'],
                ['GET', `/v1/normies/{id}/full-meta.json`, 'Metadata JSON  (size, anchor, poses)'],
                ['GET', `/v1/normies/{id}/sheet.png`, '7-frame atlas PNG  (280×80 px)'],
                ['GET', `/v1/normies/{id}/sheet.json`, 'Atlas layout  (frame indices, anchor)'],
                ['GET', `/v1/normies/{id}/face.png`, '40×40 face PNG  (from normies.art)'],
                ['HEAD', `/v1/normies/{id}/full-meta.json`, '200 = exists, 404 = not found'],
                ['POST', `/v1/normies/full-meta`, 'Batch metadata  (up to 50 IDs)'],
              ].map(([m, p, r]) => (
                <tr key={p}>
                  <td style={{ ...S.td, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{m}</td>
                  <td style={{ ...S.td, whiteSpace: 'nowrap' }}><Ic>{p}</Ic></td>
                  <td style={S.td}>{r}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* ── full.png PARAMS ── */}
        <Section label="full.png — query params">
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Param</th>
                <th style={S.th}>Values</th>
                <th style={S.th}>Default</th>
                <th style={S.th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['pose',  'stand · walk · sit · sleep', 'stand', 'Pose family'],
                ['frame', '0 · 1 · 2 · 3',             '0',     'Walk frame only. 0 = heel-strike R, 1 = passing R, 2 = heel-strike L, 3 = passing L'],
              ].map(([p, v, d, n]) => (
                <tr key={p}>
                  <td style={{ ...S.td, fontWeight: 700, color: 'var(--ink)' }}>{p}</td>
                  <td style={S.td}><Ic>{v}</Ic></td>
                  <td style={S.td}>{d}</td>
                  <td style={S.td}>{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ ...S.body, marginTop: '.9rem' }}>
            All sprites face <strong>right</strong>. Flip horizontally in canvas (<Ic>ctx.scale(-1,1)</Ic>)
            or CSS (<Ic>transform: scaleX(-1)</Ic>) for left-facing art.
          </p>
        </Section>

        {/* ── CANVAS PLACEMENT ── */}
        <Section label="Placing sprites on a floor">
          <p style={{ ...S.body, marginBottom: '1rem' }}>
            Every sprite has a fixed <strong>anchor point</strong> at <Ic>{'{ x: 20, y: 76 }'}</Ic> — the bottom-center of the feet in native pixels.
            Use it to align characters to any floor line regardless of pose or build variation.
          </p>
          <Code>{`
// Fetch meta once per normie (or use known values)
const meta = await fetch(\`/api/v1/normies/\${id}/full-meta.json\`).then(r => r.json())
// → { pixelWidth: 40, pixelHeight: 80, anchor: { x: 20, y: 76 } }

// Draw at floor position (floorX, floorY) using the anchor
const img = new Image()
img.src = \`/api/v1/normies/\${id}/full.png?pose=stand\`
img.onload = () => {
  const scale = 4  // upscale 4× for crisp pixel art
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    img,
    floorX - meta.anchor.x * scale,
    floorY - meta.anchor.y * scale,
    meta.pixelWidth  * scale,
    meta.pixelHeight * scale,
  )
}
`}</Code>
        </Section>

        {/* ── WALK ANIMATION ── */}
        <Section label="Walk animation">
          <p style={{ ...S.body, marginBottom: '1rem' }}>
            Cycle <Ic>frame=0</Ic> through <Ic>frame=3</Ic> at ~150 ms per frame for a smooth walk loop.
            The 4 frames are: right heel-strike → right passing → left heel-strike → left passing.
          </p>
          <Code>{`
const FRAME_MS = 150
let frame = 0
const img = new Image()

function tick() {
  img.src = \`/api/v1/normies/\${id}/full.png?pose=walk&frame=\${frame}\`
  frame = (frame + 1) % 4
}

tick()
setInterval(tick, FRAME_MS)

img.onload = () => {
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(x, y, 40 * scale, 80 * scale)
  ctx.drawImage(img, x, y, 40 * scale, 80 * scale)
}
`}</Code>
        </Section>

        {/* ── SPRITESHEET ── */}
        <Section label="Spritesheet (atlas)">
          <p style={{ ...S.body, marginBottom: '1rem' }}>
            Load one PNG + one JSON to get all poses in a single HTTP request.
            The atlas is <strong>280×80 px</strong> — 7 frames × 40 px wide.
          </p>
          <Code>{`
// Layout (from /sheet.json):
{
  "frameWidth":  40,
  "frameHeight": 80,
  "totalFrames": 7,
  "frames": {
    "walk":  [0, 1, 2, 3],   // x = frameIndex * 40
    "stand": [4],
    "sit":   [5],
    "sleep": [6]
  },
  "anchor": { "x": 20, "y": 76 }
}

// Drawing frame N from the atlas:
const frameX = frameIndex * sheet.frameWidth
ctx.drawImage(atlasImg, frameX, 0, 40, 80, destX, destY, 40 * scale, 80 * scale)
`}</Code>
        </Section>

        {/* ── BATCH PREFETCH ── */}
        <Section label="Batch prefetch">
          <p style={{ ...S.body, marginBottom: '1rem' }}>
            Prefetch metadata for a full dorm roster in one call. Useful for sizing canvases
            before images arrive and for checking which normies have pixel data available.
          </p>
          <Code>{`
const res = await fetch('/api/v1/normies/full-meta', {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({ ids: [1, 42, 627, 9999] }),  // max 50
})
const metas = await res.json()
// → [{ id: 1, exists: true, pixelWidth: 40, ... }, ...]
`}</Code>
        </Section>

        {/* ── HOW THE ENGINE WORKS ── */}
        <Section label="How the engine works">
          <div style={{ display: 'grid', gap: '1.5rem 3rem' }}>
            <style>{`@media(min-width:640px){.fn-engine-grid{grid-template-columns:repeat(2,1fr)!important}}`}</style>
            <div className="fn-engine-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem 3rem' }}>
              {[
                {
                  n: '01', title: 'On-chain data',
                  body: 'Pixel and trait data is fetched from api.normies.art for each token ID (0–9999). Pixels: a 1600-char string encoding the 40×40 face grid. Traits: JSON attributes (type, age, hair, expression, etc.).',
                },
                {
                  n: '02', title: 'Deterministic body seed',
                  body: 'A three-layer hash of the token ID and all trait values produces seed bytes that deterministically select: 5 body builds, 12 shirts, 8 pants, 5 shoes, 4 belt styles, and 3+ accessory types. Same ID = same body, every time.',
                },
                {
                  n: '03', title: 'Pixel-by-pixel drawing',
                  body: 'The engine draws every pixel by hand into a 40×80 Uint8ClampedArray — no SVG, no AI, no sprites library. Head pixels are composited from the on-chain face data; the body is assembled from geometric primitives.',
                },
                {
                  n: '04', title: 'Zero-dep PNG encode',
                  body: 'The RGBA buffer is encoded to PNG using Node.js\'s built-in zlib (deflate) with a hand-written PNG chunk serializer. No canvas package, no sharp, no jimp — runs on any edge/serverless runtime.',
                },
                {
                  n: '05', title: 'CDN + ETag caching',
                  body: 'Sprites are served with Cache-Control: public, max-age=3600 and an ETag. The CDN caches each URL variant (id + pose + frame) independently. Subsequent requests are instant from edge.',
                },
                {
                  n: '06', title: 'Palette',
                  body: 'Two colors only — #e3e5e4 (light) and #48494b (dark) — matching the Normies monochrome aesthetic exactly. Background is fully transparent (RGBA PNG). Scale to any size with nearest-neighbor for zero quality loss.',
                },
              ].map(f => (
                <div key={f.n} style={{ paddingTop: '1rem', borderTop: '1px solid var(--line-soft)' }}>
                  <div style={{ display: 'flex', gap: '.75rem' }}>
                    <div style={{ fontWeight: 900, opacity: .12, fontSize: '.9rem', lineHeight: 1, minWidth: '1.4rem', flexShrink: 0 }}>{f.n}</div>
                    <div>
                      <div style={{ fontSize: '.72rem', fontWeight: 700, marginBottom: '.3rem', color: 'var(--ink)' }}>{f.title}</div>
                      <div style={S.body}>{f.body}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ── OPENAPI ── */}
        <section style={{ padding: 'clamp(1.5rem,4vw,3rem) 0' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <div style={S.label}>OpenAPI spec</div>
              <p style={S.body}>Full schema, request/response examples, and caching docs.</p>
            </div>
            <a href="/openapi.json" target="_blank" rel="noopener" style={{
              display: 'inline-block', textDecoration: 'none',
              fontFamily: 'inherit', fontWeight: 700,
              fontSize: '.62rem', letterSpacing: '.12em', textTransform: 'uppercase',
              padding: '.65rem 1.3rem',
              color: 'var(--ink)', border: '1px solid var(--line)', background: 'transparent',
            }}>
              openapi.json ↗
            </a>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  )
}
