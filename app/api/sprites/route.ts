import { list, getDownloadUrl } from '@vercel/blob'
import { NextResponse } from 'next/server'

export const revalidate = 30 // revalidate every 30 seconds

export async function GET() {
  try {
    // List all sprite PNGs (not the JSON files)
    const { blobs } = await list({ prefix: 'sprites/', limit: 200 })

    // Filter to only .png files, sort newest first
    const pngBlobs = blobs
      .filter(b => b.pathname.endsWith('.png'))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())

    // Get signed download URLs for each blob
    const sprites = await Promise.all(pngBlobs.map(async b => {
      const match = b.pathname.match(/normie-(\d+)-(\d+)\.png$/)
      const signedUrl = await getDownloadUrl(b.url)
      return {
        url: signedUrl,
        id: match ? parseInt(match[1]) : null,
        timestamp: match ? parseInt(match[2]) : b.uploadedAt,
        uploadedAt: b.uploadedAt,
        size: b.size,
      }
    }))

    return NextResponse.json({ sprites, total: sprites.length })
  } catch (err) {
    console.error('[sprites list]', err)
    return NextResponse.json({ sprites: [], total: 0 })
  }
}
