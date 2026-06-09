/**
 * GET /api/strategy/signal?symbol=NIFTY&interval=1h&strategy=ema_cross
 *
 * Fetches real candles from Yahoo Finance, runs the requested strategy,
 * returns a confirmed signal or null. No mock data.
 */

import { NextRequest, NextResponse } from 'next/server'
import { STRATEGY_MAP, runAllStrategies } from '@/lib/strategies'
import { INDIA_MAP } from '@/lib/indianMarket'
import type { Candle } from '@/lib/indicators'

const YAHOO_MAP: Record<string, string> = {
  NIFTY: '^NSEI', BANKNIFTY: '^NSEBANK', FINNIFTY: 'NIFTY_FIN_SERVICE.NS',
  BTCUSD: 'BTC-USD', ETHUSD: 'ETH-USD',
  XAUUSD: 'XAUUSD=X', XAGUSD: 'XAGUSD=X',
  EURUSD: 'EURUSD=X', GBPUSD: 'GBPUSD=X', USDJPY: 'USDJPY=X',
  AUDUSD: 'AUDUSD=X', USDCAD: 'USDCAD=X',
}

const RANGE_MAP: Record<string, string> = {
  '1m': '1d', '5m': '5d', '15m': '7d', '30m': '14d',
  '1h': '30d', '4h': '60d', '1d': '1y',
}
const IV_MAP: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1h', '4h': '1h', '1d': '1d',
}

function toYahoo(symbol: string): string {
  if (YAHOO_MAP[symbol]) return YAHOO_MAP[symbol]
  if (INDIA_MAP[symbol]) return INDIA_MAP[symbol].yahoo
  // Try appending .NS for NSE stocks
  if (/^[A-Z]{2,10}$/.test(symbol)) return `${symbol}.NS`
  return `${symbol}=X`
}

async function fetchCandles(symbol: string, interval: string): Promise<Candle[]> {
  const yahooSymbol = toYahoo(symbol)
  const yInterval   = IV_MAP[interval] ?? '1h'
  const range       = RANGE_MAP[interval] ?? '30d'

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${yInterval}&range=${range}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 120 },
  })
  if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status} for ${yahooSymbol}`)

  const json   = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error('No chart data returned')

  const timestamps: number[] = result.timestamp ?? []
  const ohlcv = result.indicators?.quote?.[0]
  if (!ohlcv) throw new Error('No OHLCV data')

  return timestamps.map((t: number, i: number) => ({
    time:   t,
    open:   ohlcv.open[i],
    high:   ohlcv.high[i],
    low:    ohlcv.low[i],
    close:  ohlcv.close[i],
    volume: ohlcv.volume[i] ?? 0,
  })).filter((c: Candle) =>
    c.open !== null && c.open !== undefined &&
    c.high !== null && c.close !== null && c.low !== null &&
    !isNaN(c.close)
  )
}

export async function GET(req: NextRequest) {
  const symbol   = req.nextUrl.searchParams.get('symbol')   ?? 'NIFTY'
  const interval = req.nextUrl.searchParams.get('interval') ?? '1h'
  const stratId  = req.nextUrl.searchParams.get('strategy') // optional — run one or all

  try {
    const candles = await fetchCandles(symbol, interval)
    if (candles.length < 30) {
      return NextResponse.json({ error: 'Insufficient data', candles: candles.length }, { status: 422 })
    }

    if (stratId && STRATEGY_MAP[stratId]) {
      const strategy = STRATEGY_MAP[stratId]
      const signal   = strategy.analyze(candles, symbol, interval)
      return NextResponse.json({ signal, candles: candles.length, symbol, interval })
    }

    // Run all strategies
    const signals = runAllStrategies(candles, symbol, interval)
    return NextResponse.json({ signals, candles: candles.length, symbol, interval })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
