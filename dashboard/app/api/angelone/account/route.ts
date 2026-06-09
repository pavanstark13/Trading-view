import { NextRequest, NextResponse } from 'next/server'
import { angelGetFunds, angelGetPositions, angelGetOrders } from '@/lib/angelone'

export const runtime = 'nodejs'

function getCreds(req: NextRequest) {
  const jwt    = req.cookies.get('ao_jwt')?.value
  const apiKey = req.cookies.get('ao_apikey')?.value
  return { jwt, apiKey }
}

export async function GET(req: NextRequest) {
  const { jwt, apiKey } = getCreds(req)
  if (!jwt || !apiKey) {
    return NextResponse.json({ error: 'Not connected to Angel One' }, { status: 401 })
  }
  try {
    const [funds, positions, orders] = await Promise.all([
      angelGetFunds(apiKey, jwt),
      angelGetPositions(apiKey, jwt),
      angelGetOrders(apiKey, jwt),
    ])
    return NextResponse.json({ funds, positions, orders })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
