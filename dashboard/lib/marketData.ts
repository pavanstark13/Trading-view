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
    // datetime is "2024-12-17" (daily) or "2024-12-17 14:00:00" (intraday)
    const iso = v.datetime.includes(' ')
      ? v.datetime.replace(' ', 'T') + 'Z'   // intraday → UTC ISO
      : v.datetime + 'T00:00:00Z'             // daily → midnight UTC
    const ts = Math.floor(new Date(iso).getTime() / 1000)
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

// Compute how many candles are needed for a given range + interval combination
function calcOutputsize(range: string, interval: string): string {
  const rangeHours: Record<string, number> = {
    '1d': 24, '5d': 120, '7d': 168, '14d': 336, '30d': 720,
    '60d': 1440, '90d': 2160, '180d': 4320, '1y': 8760, '2y': 17520,
  }
  const candlesPerHour: Record<string, number> = {
    '1m': 60, '5m': 12, '15m': 4, '30m': 2, '1h': 1,
    '4h': 0.25, '1d': 1 / 24, '1wk': 1 / 168,
  }
  const hours   = rangeHours[range]          ?? 720
  const perHour = candlesPerHour[interval]   ?? 1
  // Add 20% buffer; cap at 5000 (TwelveData per-request max)
  return String(Math.min(Math.ceil(hours * perHour * 1.2) + 10, 5000))
}

async function fetchTwelveData(yahooSymbol: string, interval: string, range: string): Promise<unknown> {
  const apiKey = process.env.TWELVE_DATA_API_KEY
  if (!apiKey) throw new Error('TWELVE_DATA_API_KEY not configured')

  const { symbol, exchange } = toTwelveData(yahooSymbol)
  const tdInterval = TD_INTERVAL[interval] ?? '1h'
  const outputsize = calcOutputsize(range, interval)

  const params = new URLSearchParams({ symbol, interval: tdInterval, outputsize, apikey: apiKey, format: 'JSON' })
  if (exchange) params.set('exchange', exchange)

  const res = await fetch(`https://api.twelvedata.com/time_series?${params}`, {
    headers: { 'User-Agent': 'trading-dashboard/1.0' },
    next: { revalidate: 300 },
  })

  if (!res.ok) throw new Error(`TwelveData HTTP ${res.status} for ${symbol}`)

  const data = await res.json() as {
    status: string
    message?: string
    code?: number
    values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume: string }>
  }

  if (data.status === 'error') {
    throw new Error(`TwelveData error ${data.code ?? ''}: ${data.message ?? 'unknown'}`)
  }

  if (!data.values?.length) throw new Error(`TwelveData: no data for ${symbol}`)

  return tdToChartFormat(data.values)
}

// ── Public interface (same signature as fetchYahooChart) ─────────────────────

export async function fetchChartData(yahooSymbol: string, interval: string, range: string): Promise<unknown> {
  if (process.env.TWELVE_DATA_API_KEY) {
    try {
      return await fetchTwelveData(yahooSymbol, interval, range)
    } catch (err) {
      // Log and fall through to Yahoo Finance
      console.warn('[marketData] TwelveData failed, falling back to Yahoo:', (err as Error).message)
    }
  }
  // Yahoo Finance + Stooq fallback
  return fetchYahooChart(yahooSymbol, interval, range)
}

export { parseYahooChart as parseChartData }
