import { NextRequest, NextResponse } from 'next/server'
import { placeBinanceOrder, convertSymbolToBinance } from '@/lib/brokers/binance'

export async function POST(req: NextRequest) {
  const apiKey    = process.env.BINANCE_API_KEY
  const secretKey = process.env.BINANCE_SECRET_KEY
  const testnet   = process.env.BINANCE_TESTNET === 'true'

  if (!apiKey || !secretKey) {
    return NextResponse.json(
      { error: 'BINANCE_API_KEY and BINANCE_SECRET_KEY env vars are required' },
      { status: 400 },
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { symbol, side, quantity, price } = body

  if (!symbol || !side || quantity === undefined) {
    return NextResponse.json(
      { error: 'symbol, side, and quantity are required' },
      { status: 400 },
    )
  }

  if (side !== 'BUY' && side !== 'SELL') {
    return NextResponse.json({ error: "side must be 'BUY' or 'SELL'" }, { status: 400 })
  }

  try {
    const result = await placeBinanceOrder(
      { apiKey, secretKey, testnet },
      convertSymbolToBinance(symbol),
      side,
      Number(quantity),
      price ? Number(price) : undefined,
    )
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
