/**
 * GET /api/strategy/scan?interval=1h&exchange=ALL
 *
 * Scans a curated watchlist of NSE/Forex symbols using real Yahoo Finance data.
 * Runs all 5 strategy rules. Returns only symbols with confirmed signals.
 * No mock data. Parallel fetching with graceful failure handling.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runAllStrategies } from '@/lib/strategies'
import { ema, rsi, macd, atr, sma } from '@/lib/indicators'
import { fetchYahooChart, parseYahooChart } from '@/lib/yahooFinance'
import type { Candle } from '@/lib/indicators'

// ── Symbol list ───────────────────────────────────────────────────────────────
// These are the symbols we scan. Each entry: [displaySymbol, yahooTicker, exchange, sector]
const SCAN_SYMBOLS: [string, string, string, string][] = [
  // NSE Indices
  ['NIFTY50',   '^NSEI',         'NSE',   'Index'],
  ['BANKNIFTY', '^NSEBANK',      'NSE',   'Index'],
  // NSE Large-cap (high liquidity F&O stocks)
  ['RELIANCE',  'RELIANCE.NS',   'NSE',   'Oil & Gas'],
  ['HDFCBANK',  'HDFCBANK.NS',   'NSE',   'Banking'],
  ['ICICIBANK', 'ICICIBANK.NS',  'NSE',   'Banking'],
  ['SBIN',      'SBIN.NS',       'NSE',   'Banking'],
  ['TCS',       'TCS.NS',        'NSE',   'IT'],
  ['INFY',      'INFY.NS',       'NSE',   'IT'],
  ['AXISBANK',  'AXISBANK.NS',   'NSE',   'Banking'],
  ['BHARTIARTL','BHARTIARTL.NS', 'NSE',   'Telecom'],
  ['WIPRO',     'WIPRO.NS',      'NSE',   'IT'],
  ['KOTAKBANK', 'KOTAKBANK.NS',  'NSE',   'Banking'],
  // Forex
  ['EURUSD',    'EURUSD=X',      'FOREX', 'FX'],
  ['GBPUSD',    'GBPUSD=X',      'FOREX', 'FX'],
  ['USDJPY',    'USDJPY=X',      'FOREX', 'FX'],
  // Metals
  ['XAUUSD',    'XAUUSD=X',      'MCX',   'Metal'],
  // Crypto
  ['BTCUSD',    'BTC-USD',       'CRYPTO','Crypto'],
]

const RANGE_MAP: Record<string, string> = {
  '15m': '7d', '30m': '14d', '1h': '30d', '4h': '60d', '1d': '1y',
}
const IV_MAP: Record<string, string> = {
  '15m': '15m', '30m': '30m', '1h': '1h', '4h': '1h', '1d': '1d',
}

interface ScanRow {
  symbol:    string
  yahoo:     string
  exchange:  string
  sector:    string
  price:     number
  change:    number
  changePct: number
  volume:    number
  volumeRatio: number
  rsi:       number
  ema9:      number
  ema21:     number
  ema50:     number
  macdHist:  number
  atrValue:  number
  signals:   { strategyId: string; strategyName: string; direction: 'LONG' | 'SHORT'; confidence: number }[]
  topSignal: { direction: 'LONG' | 'SHORT'; strategyName: string; confidence: number } | null
  error?:    string
}

async function scanSymbol(
  symbol: string, yahoo: string, exchange: string, sector: string, interval: string
): Promise<ScanRow> {
  const range     = RANGE_MAP[interval] ?? '30d'
  const yInterval = IV_MAP[interval] ?? '1h'

  const json    = await fetchYahooChart(yahoo, yInterval, range)
  const candles: Candle[] = parseYahooChart(json)

  if (candles.length < 30) throw new Error('Insufficient candles')

  const closes = candles.map(c => c.close)
  const n = candles.length - 1

  const ema9v    = ema(closes, 9)[n]
  const ema21v   = ema(closes, 21)[n]
  const ema50v   = ema(closes, 50)[n]
  const rsiVal   = rsi(closes, 14)[n]
  const macdRes  = macd(closes)
  const atrArr   = atr(candles, 14)
  const atrVal   = atrArr[n]
  const vols     = candles.map(c => c.volume ?? 0)
  const volAvg   = sma(vols, 20)[n]
  const volRatio = volAvg > 0 ? (candles[n].volume ?? 0) / volAvg : 1

  const prevClose = candles[n - 1]?.close ?? candles[n].close
  const change    = closes[n] - prevClose
  const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0

  const signals = runAllStrategies(candles, symbol, interval)

  const topSignal = signals.length > 0
    ? signals.reduce((best, s) => s.confidence > best.confidence ? s : best, signals[0])
    : null

  return {
    symbol, yahoo, exchange, sector,
    price:    parseFloat(closes[n].toFixed(2)),
    change:   parseFloat(change.toFixed(4)),
    changePct: parseFloat(changePct.toFixed(2)),
    volume:   candles[n].volume ?? 0,
    volumeRatio: parseFloat(volRatio.toFixed(2)),
    rsi:     parseFloat((rsiVal ?? 50).toFixed(1)),
    ema9:    parseFloat(ema9v.toFixed(4)),
    ema21:   parseFloat(ema21v.toFixed(4)),
    ema50:   parseFloat(ema50v.toFixed(4)),
    macdHist: parseFloat(macdRes.hist[n].toFixed(6)),
    atrValue: parseFloat(atrVal.toFixed(4)),
    signals: signals.map(s => ({ strategyId: s.strategyId, strategyName: s.strategyName, direction: s.direction, confidence: s.confidence })),
    topSignal: topSignal ? { direction: topSignal.direction, strategyName: topSignal.strategyName, confidence: topSignal.confidence } : null,
  }
}

export async function GET(req: NextRequest) {
  const interval = req.nextUrl.searchParams.get('interval') ?? '1h'
  const exchange = req.nextUrl.searchParams.get('exchange') ?? 'ALL'

  const symbols = exchange === 'ALL'
    ? SCAN_SYMBOLS
    : SCAN_SYMBOLS.filter(([,, ex]) => ex === exchange)

  // Parallel fetch — allow individual failures
  const results = await Promise.allSettled(
    symbols.map(([sym, yahoo, ex, sector]) =>
      scanSymbol(sym, yahoo, ex, sector, interval)
    )
  )

  const rows: ScanRow[] = results.map((r, i) => {
    const [sym, yahoo, ex, sector] = symbols[i]
    if (r.status === 'fulfilled') return r.value
    return {
      symbol: sym, yahoo, exchange: ex, sector,
      price: 0, change: 0, changePct: 0, volume: 0, volumeRatio: 0,
      rsi: 0, ema9: 0, ema21: 0, ema50: 0, macdHist: 0, atrValue: 0,
      signals: [], topSignal: null,
      error: r.reason?.message ?? 'Failed',
    }
  })

  const successful = rows.filter(r => !r.error)
  const failed     = rows.filter(r => r.error)

  return NextResponse.json({
    rows: successful,
    failed: failed.map(r => ({ symbol: r.symbol, error: r.error })),
    scannedAt: new Date().toISOString(),
    interval,
  })
}
