import { NextResponse } from 'next/server'

const PAIRS = ['EURUSD','GBPUSD','AUDUSD','NZDUSD','USDJPY','USDCHF','USDCAD']

async function fetchClose(symbol: string): Promise<number[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}=X?interval=1h&range=7d`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 300 },
  })
  const json = await res.json()
  const closes: number[] = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []
  return closes.filter((c: number | null) => c !== null) as number[]
}

function roc(arr: number[], n: number): number {
  if (arr.length < n + 1) return 0
  const last = arr[arr.length - 1]
  const prev = arr[arr.length - 1 - n]
  return prev ? ((last - prev) / prev) * 100 : 0
}

export async function GET() {
  try {
    const closes = await Promise.all(PAIRS.map(p => fetchClose(p)))
    const [eu, gu, au, nu, uj, uc, ud] = closes.map(c => roc(c, 14))

    const raw = {
      USD: (-eu - gu - au - nu + uj + uc + ud) / 7,
      EUR: eu,
      GBP: gu,
      AUD: au,
      NZD: nu,
      JPY: -uj,
      CHF: -uc,
      CAD: -ud,
    }

    const vals = Object.values(raw)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const range = max - min || 1

    const strength = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, Math.round(((v - min) / range) * 100)])
    )

    return NextResponse.json({ strength })
  } catch {
    return NextResponse.json({ strength: { USD:50,EUR:50,GBP:50,JPY:50,CHF:50,AUD:50,NZD:50,CAD:50 } })
  }
}
