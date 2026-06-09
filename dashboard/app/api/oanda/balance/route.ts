import { NextResponse } from 'next/server'
import { getOANDABalance } from '@/lib/brokers/oanda'

export async function GET() {
  const accountId = process.env.OANDA_ACCOUNT_ID
  const apiKey    = process.env.OANDA_API_KEY
  const practice  = process.env.OANDA_PRACTICE !== 'false' // default to practice

  if (!accountId || !apiKey) {
    return NextResponse.json(
      { error: 'OANDA_ACCOUNT_ID and OANDA_API_KEY env vars are required' },
      { status: 400 },
    )
  }

  try {
    const balance = await getOANDABalance({ accountId, apiKey, practice })
    return NextResponse.json(balance)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
