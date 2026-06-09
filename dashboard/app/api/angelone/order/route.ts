import { NextRequest, NextResponse } from 'next/server'
import { angelPlaceOrder, angelCancelOrder, type PlaceOrderParams } from '@/lib/angelone'

export const runtime = 'nodejs'

function getCreds(req: NextRequest) {
  const jwt    = req.cookies.get('ao_jwt')?.value
  const apiKey = req.cookies.get('ao_apikey')?.value
  return { jwt, apiKey }
}

export async function POST(req: NextRequest) {
  const { jwt, apiKey } = getCreds(req)
  if (!jwt || !apiKey) {
    return NextResponse.json({ error: 'Not connected to Angel One' }, { status: 401 })
  }
  try {
    const order: PlaceOrderParams = await req.json()
    const result = await angelPlaceOrder(apiKey, jwt, order)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Order failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { jwt, apiKey } = getCreds(req)
  if (!jwt || !apiKey) {
    return NextResponse.json({ error: 'Not connected to Angel One' }, { status: 401 })
  }
  try {
    const { variety, orderid } = await req.json()
    await angelCancelOrder(apiKey, jwt, variety, orderid)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Cancel failed' }, { status: 500 })
  }
}
