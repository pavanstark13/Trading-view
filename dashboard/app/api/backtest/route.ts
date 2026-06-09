/**
 * GET /api/backtest?symbol=NIFTY&strategy=ema_cross&interval=1d&range=1y
 *
 * Fetches real historical candles from Yahoo Finance, runs a bar-by-bar
 * backtest using the requested strategy. Returns trade-by-trade results
 * plus aggregate statistics. No randomness. No mock data.
 */

import { NextRequest, NextResponse } from 'next/server'
import { STRATEGY_MAP } from '@/lib/strategies'
import { runBacktest } from '@/lib/backtest'
import type { Candle } from '@/lib/indicators'

const YAHOO_MAP: Record<string, string> = {
  NIFTY: '^NSEI', BANKNIFTY: '^NSEBANK',
  BTCUSD: 'BTC-USD', ETHUSD: 'ETH-USD',
  XAUUSD: 'XAUUSD=X', GBPUSD: 'GBPUSD=X', EURUSD: 'EURUSD=X', USDJPY: 'USDJPY=X',
}

const RANGE_MAP: Record<string, string> = {
  '1d': '2y', '4h': '1y', '1h': '90d', '15m': '30d',
}
const IV_MAP: Record<string, string> = {
  '1d': '1d', '4h': '1h', '1h': '1h', '15m': '15m',
}

function toYahoo(symbol: string): string {
  if (YAHOO_MAP[symbol]) return YAHOO_MAP[symbol]
  if (/^[A-Z]{2,10}$/.test(symbol)) return `${symbol}.NS`
  return `${symbol}=X`
}

export async function GET(req: NextRequest) {
  const symbol   = req.nextUrl.searchParams.get('symbol')   ?? 'NIFTY'
  const stratId  = req.nextUrl.searchParams.get('strategy') ?? 'ema_cross'
  const interval = req.nextUrl.searchParams.get('interval') ?? '1d'

  const strategy = STRATEGY_MAP[stratId]
  if (!strategy) {
    return NextResponse.json({
      error: `Unknown strategy: ${stratId}. Available: ${Object.keys(STRATEGY_MAP).join(', ')}`,
    }, { status: 400 })
  }

  const yahooSymbol = toYahoo(symbol)
  const range       = RANGE_MAP[interval] ?? '2y'
  const yInterval   = IV_MAP[interval] ?? '1d'

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${yInterval}&range=${range}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 3600 },  // backtest data: 1h cache (historical, changes slowly)
    })
    if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status} for ${yahooSymbol}`)

    const json   = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result) throw new Error('No chart data returned from Yahoo Finance')

    const timestamps: number[] = result.timestamp ?? []
    const ohlcv = result.indicators?.quote?.[0]
    if (!ohlcv) throw new Error('No OHLCV data in response')

    const candles: Candle[] = timestamps.map((t: number, i: number) => ({
      time: t, open: ohlcv.open[i], high: ohlcv.high[i],
      low: ohlcv.low[i], close: ohlcv.close[i], volume: ohlcv.volume[i] ?? 0,
    })).filter((c: Candle) =>
      c.open != null && c.close != null &&
      !isNaN(c.close) && !isNaN(c.open) &&
      c.close > 0 && c.open > 0
    )

    if (candles.length < strategy.minCandles + 10) {
      return NextResponse.json({
        error: `Only ${candles.length} candles available. Strategy needs ${strategy.minCandles + 10} minimum.`,
      }, { status: 422 })
    }

    const stats = runBacktest(candles, strategy, symbol, interval)

    return NextResponse.json({
      ...stats,
      dataInfo: {
        totalCandles: candles.length,
        from: new Date(candles[0].time * 1000).toISOString().slice(0, 10),
        to:   new Date(candles[candles.length - 1].time * 1000).toISOString().slice(0, 10),
        yahooSymbol,
        interval,
      },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
