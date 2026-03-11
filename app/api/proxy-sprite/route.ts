import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new NextResponse('Missing url', { status: 400 })

  // Add Authorization header for private blob access
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return new NextResponse('Missing blob token', { status: 500 })

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  if (!res.ok) return new NextResponse('Failed to fetch image', { status: 502 })

  // Stream the image to the client
  const headers = new Headers(res.headers)
  headers.delete('set-cookie')
  return new NextResponse(res.body, {
    status: res.status,
    headers,
  })
}
