import { NextRequest, NextResponse } from 'next/server'
import { INDIA_MAP } from '@/lib/indianMarket'
import { fetchYahooChart, parseYahooChart } from '@/lib/yahooFinance'

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
    const json = await fetchYahooChart(yahooSymbol, yInterval, range)
    const candles = parseYahooChart(json)
    if (!candles.length) {
      return NextResponse.json({ candles: [], symbol, interval, warning: 'No candles returned for this symbol/interval' })
    }
    return NextResponse.json({ candles, symbol, interval })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    // Return 200 with empty candles so the chart renders gracefully
    return NextResponse.json({ candles: [], symbol, interval, error: msg })
  }
}
