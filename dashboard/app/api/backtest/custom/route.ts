/**
 * POST /api/backtest/custom
 *
 * Accepts a user-defined rule set and runs a bar-by-bar backtest against
 * real Yahoo Finance candle data. Returns aggregate stats plus a validation
 * verdict (PASSED / MARGINAL / FAILED).
 */

import { NextRequest, NextResponse } from 'next/server'
import { INDIA_MAP } from '@/lib/indianMarket'
import {
  rsi, macd, ema, supertrend, bollingerBands, stoch, atr,
} from '@/lib/indicators'
import type { Candle } from '@/lib/indicators'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RuleCondition =
  | 'RSI < 30' | 'RSI > 70'
  | 'MACD Cross Up' | 'MACD Cross Down'
  | 'Price > EMA20' | 'Price < EMA20'
  | 'Price > EMA50' | 'Price < EMA50'
  | 'Supertrend Bull' | 'Supertrend Bear'
  | 'BB Breakout' | 'Stoch Oversold' | 'Stoch Overbought'

export interface Rule {
  condition: RuleCondition
  logic: 'AND' | 'OR'   // logic applied BEFORE this rule (ignored for first rule)
}

interface RequestBody {
  rules:     Rule[]
  direction: 'LONG' | 'SHORT'
  rr:        number
  symbol:    string
  interval:  string
}

// ── Yahoo Finance helpers ─────────────────────────────────────────────────────

const YAHOO_MAP: Record<string, string> = {
  NIFTY: '^NSEI', BANKNIFTY: '^NSEBANK',
  BTCUSD: 'BTC-USD', ETHUSD: 'ETH-USD',
  XAUUSD: 'XAUUSD=X', GBPUSD: 'GBPUSD=X', EURUSD: 'EURUSD=X', USDJPY: 'USDJPY=X',
}

const RANGE_MAP: Record<string, string> = {
  '1m': '7d', '5m': '30d', '15m': '60d', '1h': '180d', '4h': '1y', '1d': '2y',
}

const IV_MAP: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '1h', '1d': '1d',
}

function toYahoo(symbol: string): string {
  if (YAHOO_MAP[symbol])   return YAHOO_MAP[symbol]
  if (INDIA_MAP[symbol])   return INDIA_MAP[symbol].yahoo
  if (/\.NS$/.test(symbol)) return symbol
  if (/^[A-Z]{2,10}$/.test(symbol)) return `${symbol}.NS`
  return `${symbol}=X`
}

// ── Indicator evaluation ──────────────────────────────────────────────────────

interface IndicatorCache {
  rsiVals:    number[]
  macdObj:    { macd: number[]; signal: number[]; hist: number[] }
  ema20:      number[]
  ema50:      number[]
  stTrend:    ('bull' | 'bear')[]
  bbObj:      { upper: number[]; mid: number[]; lower: number[] }
  stochObj:   { k: number[]; d: number[] }
}

function buildIndicators(candles: Candle[]): IndicatorCache {
  const closes = candles.map(c => c.close)
  const rsiVals  = rsi(closes, 14)
  const macdObj  = macd(closes)
  const ema20    = ema(closes, 20)
  const ema50    = ema(closes, 50)
  const { trend: stTrend } = supertrend(candles, 10, 3)
  const bbObj    = bollingerBands(closes, 20, 2)
  const stochObj = stoch(candles, 14, 3)
  return { rsiVals, macdObj, ema20, ema50, stTrend, bbObj, stochObj }
}

function evalCondition(cond: RuleCondition, i: number, candles: Candle[], ind: IndicatorCache): boolean {
  const c = candles[i]
  switch (cond) {
    case 'RSI < 30':          return ind.rsiVals[i] < 30
    case 'RSI > 70':          return ind.rsiVals[i] > 70
    case 'MACD Cross Up':
      return i > 0 &&
        ind.macdObj.hist[i] > 0 &&
        ind.macdObj.hist[i - 1] <= 0
    case 'MACD Cross Down':
      return i > 0 &&
        ind.macdObj.hist[i] < 0 &&
        ind.macdObj.hist[i - 1] >= 0
    case 'Price > EMA20':     return c.close > ind.ema20[i]
    case 'Price < EMA20':     return c.close < ind.ema20[i]
    case 'Price > EMA50':     return c.close > ind.ema50[i]
    case 'Price < EMA50':     return c.close < ind.ema50[i]
    case 'Supertrend Bull':   return ind.stTrend[i] === 'bull'
    case 'Supertrend Bear':   return ind.stTrend[i] === 'bear'
    case 'BB Breakout':
      return c.close > ind.bbObj.upper[i] || c.close < ind.bbObj.lower[i]
    case 'Stoch Oversold':    return ind.stochObj.k[i] < 20
    case 'Stoch Overbought':  return ind.stochObj.k[i] > 80
    default:                  return false
  }
}

function evalRules(rules: Rule[], i: number, candles: Candle[], ind: IndicatorCache): boolean {
  if (!rules.length) return false
  let result = evalCondition(rules[0].condition, i, candles, ind)
  for (let r = 1; r < rules.length; r++) {
    const val = evalCondition(rules[r].condition, i, candles, ind)
    result = rules[r].logic === 'AND' ? result && val : result || val
  }
  return result
}

// ── Backtest engine ───────────────────────────────────────────────────────────

interface TradeResult { pnlR: number; result: 'WIN' | 'LOSS' }

function runCustomBacktest(
  candles: Candle[],
  rules: Rule[],
  direction: 'LONG' | 'SHORT',
  rr: number,
): { trades: TradeResult[]; maxDrawdownPct: number } {
  const ind   = buildIndicators(candles)
  const atrVals = atr(candles, 14)
  const trades: TradeResult[] = []
  const WARMUP = 60

  let inTrade = false
  let entryPrice = 0, sl = 0, tp = 0
  let tradeDir: 'LONG' | 'SHORT' = 'LONG'

  // for drawdown tracking
  let peak = 0, trough = 0, maxDD = 0, equity = 0

  for (let i = WARMUP; i < candles.length - 1; i++) {
    // manage open trade
    if (inTrade) {
      const hi = candles[i].high
      const lo = candles[i].low

      let closed = false
      let pnlR   = 0

      if (tradeDir === 'LONG') {
        if (lo <= sl) { pnlR = -1; closed = true }
        else if (hi >= tp) { pnlR = rr; closed = true }
      } else {
        if (hi >= sl) { pnlR = -1; closed = true }
        else if (lo <= tp) { pnlR = rr; closed = true }
      }

      if (closed) {
        trades.push({ pnlR, result: pnlR > 0 ? 'WIN' : 'LOSS' })
        equity += pnlR
        if (equity > peak) { peak = equity; trough = equity }
        else { trough = equity; maxDD = Math.max(maxDD, peak - trough) }
        inTrade = false
      }
      continue
    }

    // check for new signal
    if (!evalRules(rules, i, candles, ind)) continue

    // entry next bar
    const nextBar = candles[i + 1]
    const atrVal  = isNaN(atrVals[i]) ? (candles[i].close * 0.005) : atrVals[i]
    entryPrice = nextBar.open
    tradeDir   = direction

    if (direction === 'LONG') {
      sl = entryPrice - atrVal * 1.5
      tp = entryPrice + atrVal * 1.5 * rr
    } else {
      sl = entryPrice + atrVal * 1.5
      tp = entryPrice - atrVal * 1.5 * rr
    }

    inTrade = true
    i++ // skip the entry bar from signal loop
  }

  // express maxDD as % of total R swings
  const totalR = Math.abs(equity) || 1
  const maxDrawdownPct = maxDD > 0 ? (maxDD / (peak + totalR + 1)) * 100 : 0

  return { trades, maxDrawdownPct }
}

// ── Verdict ───────────────────────────────────────────────────────────────────

function computeVerdict(winRate: number, profitFactor: number, totalTrades: number) {
  if (winRate >= 45 && profitFactor >= 1.3 && totalTrades >= 10) return 'PASSED'
  if (winRate >= 35 && profitFactor >= 1.0 && totalTrades >= 6)  return 'MARGINAL'
  return 'FAILED'
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { rules, direction, rr, symbol = 'RELIANCE', interval = '1h' } = body

  if (!rules || rules.length < 2) {
    return NextResponse.json({ error: 'At least 2 rules required' }, { status: 400 })
  }

  const yahooSymbol = toYahoo(symbol)
  const range       = RANGE_MAP[interval] ?? '180d'
  const yInterval   = IV_MAP[interval]    ?? '1h'

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${yInterval}&range=${range}`
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status} for ${yahooSymbol}`)

    const json   = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result) throw new Error('No chart data from Yahoo Finance')

    const timestamps: number[] = result.timestamp ?? []
    const ohlcv = result.indicators?.quote?.[0]
    if (!ohlcv) throw new Error('No OHLCV data in Yahoo response')

    const candles: Candle[] = timestamps.map((t: number, i: number) => ({
      time: t, open: ohlcv.open[i], high: ohlcv.high[i],
      low: ohlcv.low[i], close: ohlcv.close[i], volume: ohlcv.volume[i] ?? 0,
    })).filter((c: Candle) =>
      c.open != null && c.close != null && !isNaN(c.close) && c.close > 0
    )

    if (candles.length < 80) {
      return NextResponse.json({ error: `Only ${candles.length} candles — need at least 80.` }, { status: 422 })
    }

    const { trades, maxDrawdownPct } = runCustomBacktest(candles, rules, direction, rr)

    const totalTrades  = trades.length
    const wins         = trades.filter(t => t.result === 'WIN').length
    const losses       = totalTrades - wins
    const winRate      = totalTrades ? (wins / totalTrades) * 100 : 0

    const grossWin     = trades.filter(t => t.pnlR > 0).reduce((a, t) => a + t.pnlR, 0)
    const grossLoss    = Math.abs(trades.filter(t => t.pnlR < 0).reduce((a, t) => a + t.pnlR, 0))
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0

    const totalR    = trades.reduce((a, t) => a + t.pnlR, 0)
    const expectancy = totalTrades ? totalR / totalTrades : 0

    const verdict = computeVerdict(winRate, profitFactor, totalTrades)

    return NextResponse.json({
      verdict,
      totalTrades,
      wins,
      losses,
      winRate:       +winRate.toFixed(1),
      profitFactor:  +profitFactor.toFixed(2),
      expectancy:    +expectancy.toFixed(3),
      maxDrawdownPct: +maxDrawdownPct.toFixed(1),
      totalR:        +totalR.toFixed(2),
      candleCount:   candles.length,
      symbol,
      interval,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
