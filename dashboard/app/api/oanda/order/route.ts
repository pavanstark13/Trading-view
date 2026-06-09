import { NextRequest, NextResponse } from 'next/server'
import { placeOANDAOrder, convertSymbolToOANDA } from '@/lib/brokers/oanda'

export async function POST(req: NextRequest) {
  const accountId = process.env.OANDA_ACCOUNT_ID
  const apiKey    = process.env.OANDA_API_KEY
  const practice  = process.env.OANDA_PRACTICE !== 'false'

  if (!accountId || !apiKey) {
    return NextResponse.json(
      { error: 'OANDA_ACCOUNT_ID and OANDA_API_KEY env vars are required' },
      { status: 400 },
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { instrument, units, stopLoss, takeProfit } = body

  if (!instrument || units === undefined) {
    return NextResponse.json(
      { error: 'instrument and units are required' },
      { status: 400 },
    )
  }

  try {
    const result = await placeOANDAOrder(
      { accountId, apiKey, practice },
      {
        instrument:       convertSymbolToOANDA(instrument),
        units:            Number(units),
        type:             'MARKET',
        stopLossOnFill:   stopLoss   ? { price: String(stopLoss)   } : undefined,
        takeProfitOnFill: takeProfit ? { price: String(takeProfit) } : undefined,
      },
    )
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
