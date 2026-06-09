import { NextResponse } from 'next/server'
import { getBinanceBalance } from '@/lib/brokers/binance'

export async function GET() {
  const apiKey    = process.env.BINANCE_API_KEY
  const secretKey = process.env.BINANCE_SECRET_KEY
  const testnet   = process.env.BINANCE_TESTNET === 'true'

  if (!apiKey || !secretKey) {
    return NextResponse.json(
      { error: 'BINANCE_API_KEY and BINANCE_SECRET_KEY env vars are required' },
      { status: 400 },
    )
  }

  try {
    const balances = await getBinanceBalance(apiKey, secretKey, testnet)
    return NextResponse.json(balances)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
