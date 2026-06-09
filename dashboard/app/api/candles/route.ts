import { NextRequest, NextResponse } from 'next/server'

import { INDIA_MAP } from '@/lib/indianMarket'

const YAHOO_MAP: Record<string, string> = {
  BTCUSD: 'BTC-USD',
  ETHUSD: 'ETH-USD',
  XAUUSD: 'XAUUSD=X',
  XAGUSD: 'XAGUSD=X',
}

function toYahoo(symbol: string): string {
  if (YAHOO_MAP[symbol])        return YAHOO_MAP[symbol]
  if (INDIA_MAP[symbol])        return INDIA_MAP[symbol].yahoo
  return symbol + '=X'          // forex default
}

const RANGE_MAP: Record<string, string> = {
  '1m': '1d', '5m': '5d', '15m': '7d',
  '30m': '14d', '1h': '30d', '4h': '60d', '1d': '1y',
}

const IV_MAP: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m',
  '30m': '30m', '1h': '1h', '4h': '1h', '1d': '1d',
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol') ?? 'EURUSD'
  const interval = req.nextUrl.searchParams.get('interval') ?? '1h'

  const yahooSymbol = toYahoo(symbol)
  const yInterval = IV_MAP[interval] ?? '1h'
  const range = RANGE_MAP[interval] ?? '30d'

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${yInterval}&range=${range}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 60 },
    })

    if (!res.ok) throw new Error(`Yahoo returned ${res.status}`)
    const json = await res.json()

    const result = json?.chart?.result?.[0]
    if (!result) throw new Error('No data from Yahoo Finance')

    const timestamps: number[] = result.timestamp ?? []
    const ohlcv = result.indicators?.quote?.[0]
    if (!ohlcv) throw new Error('No OHLCV data')

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
