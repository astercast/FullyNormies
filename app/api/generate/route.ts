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

    if (!pixelsRes.ok) throw new Error(`Pixels fetch failed: ${pixelsRes.status}`)
    if (!traitsRes.ok) throw new Error(`Traits fetch failed: ${traitsRes.status}`)

    const pixels = await pixelsRes.text()
    const traits = await traitsRes.json()

    if (pixels.length !== 1600) throw new Error('Unexpected pixel data length')

    return NextResponse.json({ pixels, traits })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch Normie data'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
