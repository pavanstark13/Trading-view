/**
 * Unified market data layer.
 *
 * Priority order:
 *  1. TwelveData  — if TWELVE_DATA_API_KEY env var is set (recommended)
 *  2. Yahoo Finance + Stooq fallback — when no API key present
 *
 * TwelveData free tier:  800 req/day, all intervals, no credit card needed.
 * Sign up at https://twelvedata.com  →  Dashboard → API Keys
 * Then set TWELVE_DATA_API_KEY in Vercel Environment Variables.
 */

import { fetchYahooChart, parseYahooChart } from './yahooFinance'
export type { YahooCandle as Candle } from './yahooFinance'

// ── TwelveData symbol mapping ─────────────────────────────────────────────────

interface TDParams { symbol: string; exchange?: string }

function toTwelveData(yahooSymbol: string): TDParams {
  // Forex: EURUSD=X → EUR/USD
  if (yahooSymbol.endsWith('=X')) {
    const raw = yahooSymbol.slice(0, -2)       // e.g. EURUSD, GBPUSD, XAUUSD
    if (raw.length === 6) return { symbol: `${raw.slice(0, 3)}/${raw.slice(3)}` }
    return { symbol: raw }
  }
  // Crypto: BTC-USD → BTC/USD
  if (yahooSymbol.includes('-')) return { symbol: yahooSymbol.replace('-', '/') }
  // NSE indices (Yahoo uses ^prefix)
  if (yahooSymbol === '^NSEI')    return { symbol: 'NIFTY 50',   exchange: 'NSE' }
  if (yahooSymbol === '^NSEBANK') return { symbol: 'NIFTY BANK', exchange: 'NSE' }
  if (yahooSymbol.startsWith('^')) return { symbol: yahooSymbol.slice(1) }
  // NSE stocks: RELIANCE.NS → RELIANCE @ NSE
  if (yahooSymbol.endsWith('.NS')) return { symbol: yahooSymbol.slice(0, -3), exchange: 'NSE' }
  if (yahooSymbol.endsWith('.BO')) return { symbol: yahooSymbol.slice(0, -3), exchange: 'BSE' }
  return { symbol: yahooSymbol }
}

const TD_INTERVAL: Record<string, string> = {
  '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min',
  '1h': '1h', '4h': '4h', '1d': '1day', '1wk': '1week',
}

// TwelveData → Yahoo-compatible chart format (so parseYahooChart still works)
function tdToChartFormat(values: Array<{
  datetime: string; open: string; high: string; low: string; close: string; volume: string
}>): unknown {
  const sorted = [...values].reverse()   // API returns newest-first

  const timestamps: number[] = []
  const open: number[] = [], high: number[] = [], low: number[] = []
  const close: number[] = [], volume: number[] = []

  for (const v of sorted) {
    // datetime can be "2024-12-17" or "2024-12-17 14:00:00"
    const ts = Math.floor(new Date(v.datetime.replace(' ', 'T') + 'Z').getTime() / 1000)
    const c  = parseFloat(v.close)
    if (isNaN(ts) || isNaN(c) || c <= 0) continue
    timestamps.push(ts)
    open.push(parseFloat(v.open)   || c)
    high.push(parseFloat(v.high)   || c)
    low.push(parseFloat(v.low)     || c)
    close.push(c)
    volume.push(parseFloat(v.volume) || 0)
  }

  return { chart: { result: [{ timestamp: timestamps, indicators: { quote: [{ open, high, low, close, volume }] } }] } }
}

async function fetchTwelveData(yahooSymbol: string, interval: string): Promise<unknown> {
  const apiKey = process.env.TWELVE_DATA_API_KEY
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY not configured')

  const { symbol, exchange } = toTwelveData(yahooSymbol)
  const tdInterval = TD_INTERVAL[interval] ?? '1h'
  // Use larger outputsize for daily charts, conservative for intraday
  const outputsize = tdInterval === '1day' || tdInterval === '1week' ? '1000' : '500'

  const params = new URLSearchParams({ symbol, interval: tdInterval, outputsize, apikey: apiKey, format: 'JSON' })
  if (exchange) params.set('exchange', exchange)

  const res = await fetch(`https://api.twelvedata.com/time_series?${params}`, {
    headers: { 'User-Agent': 'trading-dashboard/1.0' },
    next: { revalidate: 300 },          // 5-minute server-side cache
  })

  if (!res.ok) throw new Error(`TwelveData HTTP ${res.status} for ${symbol}`)

  const data = await res.json() as {
    status: string
    message?: string
    code?: number
    values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume: string }>
  }

  if (data.status === 'error') {
    // Rate-limit hit — propagate clearly so caller can log/alert
    throw new Error(`TwelveData error ${data.code ?? ''}: ${data.message ?? 'unknown'}`)
  }

  if (!data.values?.length) throw new Error(`TwelveData: no data for ${symbol}`)

  return tdToChartFormat(data.values)
}

// ── Public interface (same signature as fetchYahooChart) ─────────────────────

export async function fetchChartData(yahooSymbol: string, interval: string, range: string): Promise<unknown> {
  if (process.env.TWELVE_DATA_API_KEY) {
    try {
      return await fetchTwelveData(yahooSymbol, interval)
    } catch (err) {
      // Log and fall through to Yahoo Finance
      console.warn('[marketData] TwelveData failed, falling back to Yahoo:', (err as Error).message)
    }
  }
  // Yahoo Finance + Stooq fallback
  return fetchYahooChart(yahooSymbol, interval, range)
}

export { parseYahooChart as parseChartData }
