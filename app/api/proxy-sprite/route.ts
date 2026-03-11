import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return new NextResponse('Missing url', { status: 400 })

  // Fetch the image from the signed URL (server-side, so token is sent)
  const res = await fetch(url)
  if (!res.ok) return new NextResponse('Failed to fetch image', { status: 502 })

  // Stream the image to the client
  const headers = new Headers(res.headers)
  // Remove any set-cookie headers for security
  headers.delete('set-cookie')
  return new NextResponse(res.body, {
    status: res.status,
    headers,
  })
}
