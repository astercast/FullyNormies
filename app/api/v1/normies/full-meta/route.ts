// =============================================================================
//  POST /api/v1/normies/full-meta
//  Body: { "ids": [1, 2, 3, ...] }   (max 50 IDs per request)
//
//  Returns an array of full-meta objects — useful for prefetching a dorm roster.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { buildSpriteMeta } from '@/lib/sprite-engine-server'

interface TraitAttr { trait_type: string; value: string }
interface TraitsPayload { attributes: TraitAttr[] }

export const maxDuration = 30
export const dynamic     = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const MAX_BATCH = 50

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

async function probeMeta(id: number): Promise<{ id: number; exists: boolean; traits?: TraitsPayload; pixels?: string }> {
  try {
    const [pr, tr] = await Promise.all([
      fetch(`https://api.normies.art/normie/${id}/pixels`, { next: { revalidate: 3600 } }),
      fetch(`https://api.normies.art/normie/${id}/traits`,  { next: { revalidate: 3600 } }),
    ])
    if (!tr.ok) return { id, exists: false }
    const traits = (await tr.json()) as TraitsPayload
    if (!traits.attributes?.length) return { id, exists: false }
    let pixels: string | undefined
    if (pr.ok) {
      const text = await pr.text()
      if (text.length === 1600) pixels = text
    }
    return { id, exists: true, traits, pixels }
  } catch {
    return { id, exists: false }
  }
}

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS })
  }

  if (!body || typeof body !== 'object' || !Array.isArray((body as { ids?: unknown }).ids)) {
    return NextResponse.json(
      { error: 'Body must be { "ids": number[] }' },
      { status: 400, headers: CORS }
    )
  }

  const rawIds: unknown[] = (body as { ids: unknown[] }).ids
  if (rawIds.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Maximum ${MAX_BATCH} IDs per request` },
      { status: 400, headers: CORS }
    )
  }

  const ids = rawIds
    .map(Number)
    .filter(n => Number.isInteger(n) && n >= 0 && n <= 9999)

  if (ids.length === 0) {
    return NextResponse.json(
      { error: 'No valid IDs provided (must be integers 0–9999)' },
      { status: 400, headers: CORS }
    )
  }

  // Probe each normie in parallel
  const probes = await Promise.all(ids.map(probeMeta))

  const results = probes.map(({ id, exists, traits, pixels }) =>
    exists && traits
      ? buildSpriteMeta(id, traits, pixels)
      : { id, exists: false, status: 'not_found' as const },
  )

  return NextResponse.json(results, {
    headers: {
      ...CORS,
      'Cache-Control': 'public, max-age=60',
    },
  })
}
