// =============================================================================
//  GET  /api/v1/normies/{id}/{filename}
//
//  filename can be:
//    full.png       ?pose=stand|walk|sit|sleep  &frame=0-3  &facing=right (default)
//    full-meta.json
//    sheet.png
//    sheet.json
//    face.png        (proxied from api.normies.art — 40×40 face fallback)
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { drawNormieServer, buildSpriteSheet, API_POSES, ApiPose, NATIVE_WIDTH, NATIVE_HEIGHT, normieStandAnchor, WALK_FRAME_COUNT, buildSpriteMeta, ENGINE_VERSION, summarizeBodyProfile } from '@/lib/sprite-engine-server'
import { encodePng } from '@/lib/png-encode'

export const maxDuration = 30
export const dynamic     = 'force-dynamic'

// ---------------------------------------------------------------------------
//  CORS + caching helpers
// ---------------------------------------------------------------------------
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function pngResponse(buf: Buffer, etag: string, maxAge = 3600) {
  // Convert Buffer → Uint8Array so the Web Response API accepts it
  return new Response(new Uint8Array(buf), {
    headers: {
      ...CORS,
      'Content-Type':  'image/png',
      'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 24}`,
      'ETag':          etag,
      'Vary':          'Accept-Encoding',
    },
  })
}

function jsonResponse(data: unknown, maxAge = 3600) {
  return NextResponse.json(data, {
    headers: {
      ...CORS,
      'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 24}`,
    },
  })
}

function errResponse(msg: string, status: number) {
  return NextResponse.json({ error: msg }, { status, headers: CORS })
}

// ---------------------------------------------------------------------------
//  OPTIONS preflight
// ---------------------------------------------------------------------------
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function HEAD(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  return GET(req, { params })
}

// ---------------------------------------------------------------------------
//  Normie data fetcher (pixels + traits from normies.art)
// ---------------------------------------------------------------------------
interface NormieData { pixels: string; traits: { attributes: { trait_type: string; value: string }[] } }

async function fetchNormie(id: number): Promise<NormieData | null> {
  try {
    const [pr, tr] = await Promise.all([
      fetch(`https://api.normies.art/normie/${id}/pixels`, { next: { revalidate: 3600 } }),
      fetch(`https://api.normies.art/normie/${id}/traits`,  { next: { revalidate: 3600 } }),
    ])
    // Traits failure or non-existent normie → 404
    if (!tr.ok) return null
    const traits = await tr.json()
    // normies.art returns HTTP 200 with {"error":"..."} for unminted IDs
    if (!traits.attributes || !Array.isArray(traits.attributes) || traits.attributes.length === 0) return null
    // Pixels may be temporarily unavailable (upstream 502/503).
    // Fall back to blank pixels so the body still renders without a face.
    let pixels = '0'.repeat(1600)
    if (pr.ok) {
      const text = await pr.text()
      if (text.length === 1600) pixels = text
    }
    return { pixels, traits }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
//  Main handler
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  const { id: idStr, filename } = await params
  const id = Number(idStr)

  if (!Number.isInteger(id) || id < 0 || id > 9999) {
    return errResponse('normie id must be an integer 0–9999', 400)
  }

  // ── sprite-data.json — raw pixels + traits for client-side canvas rendering
  if (filename === 'sprite-data.json') {
    const data = await fetchNormie(id)
    if (!data) {
      return NextResponse.json(
        { id, exists: false },
        { status: 404, headers: CORS }
      )
    }
    return jsonResponse({ id, exists: true, pixels: data.pixels, traits: data.traits }, 3600)
  }

  // ── full-meta.json ────────────────────────────────────────────────────────
  if (filename === 'full-meta.json') {
    const data = await fetchNormie(id)
    if (!data) {
      return NextResponse.json(
        { id, exists: false, status: 'not_found' },
        { status: 404, headers: CORS }
      )
    }
    return jsonResponse(buildSpriteMeta(id, data.traits, data.pixels))
  }

  // ── sheet.json ────────────────────────────────────────────────────────────
  if (filename === 'sheet.json') {
    const data = await fetchNormie(id)
    if (!data) {
      return errResponse('Normie not found or pixel data unavailable', 404)
    }
    return jsonResponse({
      engineVersion: ENGINE_VERSION,
      frameWidth:  NATIVE_WIDTH,
      frameHeight: NATIVE_HEIGHT,
      totalFrames: 7,
      frames: {
        walk:  [0, 1, 2, 3],
        stand: [4],
        sit:   [5],
        sleep: [6],
      },
      anchor:      normieStandAnchor(id, data.traits),
      bodyProfile: summarizeBodyProfile(id, data.traits, data.pixels),
      palette:     { ink: '#48494b', fill: '#e3e5e4', background: 'transparent' },
      recommendedScale: [2, 3, 4, 5],
      note:        'All sprites face right. Flip horizontally in client for left-facing. Use anchor for floor placement.',
    }, 86400)  // sheet layout never changes — long cache
  }

  // ── face.png ──────────────────────────────────────────────────────────────
  if (filename === 'face.png') {
    try {
      const res = await fetch(`https://api.normies.art/normie/${id}/image.png`, {
        next: { revalidate: 3600 },
      })
      if (!res.ok) return errResponse('Face image not found', 404)
      const buf = await res.arrayBuffer()
      return new Response(buf, {
        headers: {
          ...CORS,
          'Content-Type':  'image/png',
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
      })
    } catch {
      return errResponse('Failed to fetch face image', 502)
    }
  }

  // ── full.png ──────────────────────────────────────────────────────────────
  if (filename === 'full.png') {
    const sp  = req.nextUrl.searchParams
    const pose  = (sp.get('pose') ?? 'stand') as ApiPose
    const frame = Math.max(0, Math.min(WALK_FRAME_COUNT - 1, parseInt(sp.get('frame') ?? '0') || 0))

    if (!API_POSES.includes(pose)) {
      return errResponse(`Invalid pose. Valid values: ${API_POSES.join(', ')}`, 400)
    }

    const data = await fetchNormie(id)
    if (!data) return errResponse('Normie not found or pixel data unavailable', 404)

    const frameBuf = drawNormieServer(data.pixels, data.traits, pose, frame, id, true)
    const png      = encodePng(frameBuf.data, frameBuf.width, frameBuf.height)
    return pngResponse(png, `"v1-${id}-${pose}-${frame}"`)
  }

  // ── sheet.png ─────────────────────────────────────────────────────────────
  if (filename === 'sheet.png') {
    const data = await fetchNormie(id)
    if (!data) return errResponse('Normie not found or pixel data unavailable', 404)

    const sheet = buildSpriteSheet(data.pixels, data.traits, id)
    const png   = encodePng(sheet.buf.data, sheet.buf.width, sheet.buf.height)
    return pngResponse(png, `"v1-${id}-sheet"`, 3600)
  }

  return errResponse(`Unknown resource "${filename}". Valid: full.png, full-meta.json, sheet.png, sheet.json, face.png`, 404)
}
