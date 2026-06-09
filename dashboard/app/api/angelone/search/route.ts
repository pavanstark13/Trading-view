import { NextRequest, NextResponse } from 'next/server'
import { angelSearchScrip } from '@/lib/angelone'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const jwt    = req.cookies.get('ao_jwt')?.value
  const apiKey = req.cookies.get('ao_apikey')?.value
  if (!jwt || !apiKey) {
    return NextResponse.json({ error: 'Not connected' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const exchange = searchParams.get('exchange') ?? 'MCX'
  const query    = searchParams.get('q') ?? ''
  if (!query) return NextResponse.json({ results: [] })
  try {
    const results = await angelSearchScrip(apiKey, jwt, exchange, query)
    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Search failed' }, { status: 500 })
  }
}
