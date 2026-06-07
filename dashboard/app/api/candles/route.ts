import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol') ?? 'EURUSD'
  const interval = req.nextUrl.searchParams.get('interval') ?? '1h'

  // Map interval to Yahoo Finance interval
  const ivMap: Record<string, string> = {
    '1m':'1m','5m':'5m','15m':'15m','30m':'30m',
    '1h':'1h','4h':'1h','1d':'1d',
  }
  const yInterval = ivMap[interval] ?? '1h'
  const range = interval === '1d' ? '1y' : interval === '4h' ? '60d' : '30d'

  // Yahoo Finance symbol format
  const yahooSymbol = symbol.replace('/', '') + '=X'

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${yInterval}&range=${range}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 60 },
    })

    if (!res.ok) throw new Error(`Yahoo returned ${res.status}`)
    const json = await res.json()

    const result = json?.chart?.result?.[0]
    if (!result) throw new Error('No data')

    const timestamps: number[] = result.timestamp
    const ohlcv = result.indicators.quote[0]

    const candles = timestamps.map((t: number, i: number) => ({
      time: t,
      open:   ohlcv.open[i]   ?? null,
      high:   ohlcv.high[i]   ?? null,
      low:    ohlcv.low[i]    ?? null,
      close:  ohlcv.close[i]  ?? null,
      volume: ohlcv.volume[i] ?? 0,
    })).filter((c: { open: number | null; high: number | null; low: number | null; close: number | null }) =>
      c.open !== null && c.high !== null && c.low !== null && c.close !== null
    )

    return NextResponse.json({ candles, symbol, interval })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
