import { NextRequest, NextResponse } from 'next/server'
import { del } from '@vercel/blob'

export async function POST(req: NextRequest) {
  const { url, passcode } = await req.json()
  if (passcode !== 'fullynormies') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // Extract the blob pathname from the URL, ignoring domain and query params
    let path = url
    // Remove query string if present
    const qIdx = path.indexOf('?')
    if (qIdx !== -1) path = path.slice(0, qIdx)
    // Find the /sprites/ path
    const idx = path.indexOf('/sprites/')
    if (idx === -1) return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    path = path.slice(idx + 1) // remove leading slash
    await del(path)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
