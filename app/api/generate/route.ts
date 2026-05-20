import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 10

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { normieId } = body

  if (normieId == null || isNaN(Number(normieId))) {
    return NextResponse.json({ error: 'normieId is required' }, { status: 400 })
  }

  const id = Number(normieId)
  if (id < 0 || id > 9999) {
    return NextResponse.json({ error: 'normieId must be 0-9999' }, { status: 400 })
  }

  try {
    const [pixelsRes, traitsRes] = await Promise.all([
      fetch(`https://api.normies.art/normie/${id}/pixels`, { next: { revalidate: 3600 } }),
      fetch(`https://api.normies.art/normie/${id}/traits`,  { next: { revalidate: 3600 } }),
    ])

    // Traits gate normie existence
    if (!traitsRes.ok) {
      return NextResponse.json({ error: `Normie #${id} not found` }, { status: 404 })
    }

    let traits: { attributes?: unknown[] } = {}
    try { traits = await traitsRes.json() } catch { /* non-JSON from normies.art */ }

    // normies.art returns HTTP 200 with {"error":"..."} for unminted IDs
    if (!traits.attributes || !Array.isArray(traits.attributes) || traits.attributes.length === 0) {
      return NextResponse.json({ error: `Normie #${id} not found` }, { status: 404 })
    }

    // Pixels may be temporarily unavailable — fall back to blank (body still renders)
    let pixels = '0'.repeat(1600)
    if (pixelsRes.ok) {
      try {
        const text = await pixelsRes.text()
        if (text.length === 1600) pixels = text
      } catch { /* keep blank fallback */ }
    }

    return NextResponse.json({ pixels, traits })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch Normie data'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
