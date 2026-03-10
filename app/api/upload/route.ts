import { put } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File
    const meta = form.get('meta') as string // JSON string

    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const parsed = meta ? JSON.parse(meta) : {}
    const id = parsed.id ?? 'unknown'
    const timestamp = Date.now()

    // Upload PNG to Vercel Blob
    const blob = await put(`sprites/normie-${id}-${timestamp}.png`, file, {
      access: 'public',
      contentType: 'image/png',
    })

    // Upload metadata JSON alongside it
    const metaBlob = await put(`sprites/normie-${id}-${timestamp}.json`, JSON.stringify({
      ...parsed,
      spriteUrl: blob.url,
      generatedAt: new Date().toISOString(),
    }), {
      access: 'public',
      contentType: 'application/json',
    })

    return NextResponse.json({
      url: blob.url,
      metaUrl: metaBlob.url,
      id,
      name: parsed.name,
      timestamp,
    })
  } catch (err) {
    console.error('[upload]', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
