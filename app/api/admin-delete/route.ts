import { NextRequest, NextResponse } from 'next/server'
import { del } from '@vercel/blob'

export async function POST(req: NextRequest) {
  const { url, passcode } = await req.json()
  if (passcode !== 'fullynormies') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // Extract the blob pathname from the URL
    const match = url.match(/\/sprites\/normie-\d+-\d+\.png$/)
    if (!match) return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    await del(match[0].slice(1)) // remove leading slash
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
