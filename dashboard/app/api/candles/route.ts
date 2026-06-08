import { NextRequest, NextResponse } from 'next/server'

// Yahoo Finance symbol mapping for non-standard pairs
const YAHOO_MAP: Record<string, string> = {
  BTCUSD:  'BTC-USD',
  ETHUSD:  'ETH-USD',
  XAUUSD:  'XAUUSD=X',
  XAGUSD:  'XAGUSD=X',
}

export async function GET(req: NextRequest) {
  const symbol   = req.nextUrl.searchParams.get('symbol')   ?? 'EURUSD'
  const interval = req.nextUrl.searchParams.get('interval') ?? '1h'

  const ivMap: Record<string, string> = {
    '1m':'1m','5m':'5m','15m':'15m','30m':'30m','1h':'1h','4h':'1h','1d':'1d',
  }
  const yInterval = ivMap[interval] ?? '1h'
  const range =
    interval === '1d'  ? '1y'  :
    interval === '4h'  ? '60d' :
    interval === '1h'  ? '30d' :
    interval === '30m' ? '14d' :
    interval === '15m' ? '7d'  :
    interval === '5m'  ? '5d'  : '1d'

  const yahooSymbol = YAHOO_MAP[symbol] ?? (symbol.replace('/', '') + '=X')

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${yInterval}&range=${range}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 60 },
    })
    if (!res.ok) throw new Error(`Yahoo returned ${res.status} for ${yahooSymbol}`)
    const json = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result) throw new Error('No data from Yahoo Finance')

    const timestamps: number[] = result.timestamp
    const ohlcv = result.indicators.quote[0]
    const candles = timestamps
      .map((t: number, i: number) => ({
        time:   t,
        open:   ohlcv.open[i]   ?? null,
        high:   ohlcv.high[i]   ?? null,
        low:    ohlcv.low[i]    ?? null,
        close:  ohlcv.close[i]  ?? null,
        volume: ohlcv.volume[i] ?? 0,
      }))
      .filter((c: { open: number|null; high: number|null; low: number|null; close: number|null }) =>
        c.open !== null && c.high !== null && c.low !== null && c.close !== null
      )

    return NextResponse.json({ candles, symbol, interval })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
