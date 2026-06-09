/**
 * Bar-by-bar backtesting engine.
 *
 * Rules:
 * - All indicators computed over candles[0..i] (no look-ahead bias)
 * - Entry at the OPEN of the bar AFTER the signal bar (realistic execution)
 * - Exit at first of: SL hit, TP hit, or strategy exit signal
 * - One trade at a time per strategy
 * - Computes: win rate, profit factor, Sharpe ratio, max drawdown, expectancy
 */

import type { Candle } from './indicators'
import type { StrategyDef, TradingSignal } from './strategies'

export interface BacktestTrade {
  entryBar:    number
  exitBar:     number
  entryDate:   string
  exitDate:    string
  direction:   'LONG' | 'SHORT'
  entryPrice:  number
  exitPrice:   number
  stopLoss:    number
  target:      number
  pnlPct:      number          // % from entry
  pnlR:        number          // in R multiples (1R = risk distance)
  result:      'WIN' | 'LOSS' | 'BREAKEVEN'
  exitReason:  'SL' | 'TP' | 'TP2' | 'SIGNAL_EXIT' | 'END_OF_DATA'
  reasons:     string[]
  confidence:  number
}

export interface BacktestStats {
  strategyId:    string
  strategyName:  string
  symbol:        string
  interval:      string
  fromDate:      string
  toDate:        string
  totalTrades:   number
  wins:          number
  losses:        number
  winRate:       number          // %
  profitFactor:  number
  totalR:        number          // net R multiple
  avgWinR:       number
  avgLossR:      number
  maxDrawdownR:  number          // in R units
  maxDrawdownPct: number         // %
  sharpeRatio:   number
  expectancy:    number          // avg expected R per trade
  consecutiveWins:  number
  consecutiveLosses: number
  trades:        BacktestTrade[]
  equityCurve:   { date: string; r: number; equity: number }[]
  passed:        boolean         // passes minimum quality bar
  failReason?:   string
}

const MIN_TRADES     = 10   // minimum trades to consider result meaningful
const MIN_WIN_RATE   = 40   // %
const MIN_PF         = 1.2  // profit factor
const MIN_R          = 1.0  // minimum total R

// ── Main backtest runner ──────────────────────────────────────────────────────

export function runBacktest(
  candles: Candle[],
  strategy: StrategyDef,
  symbol: string,
  interval: string,
): BacktestStats {
  const trades:       BacktestTrade[]                           = []
  const equityCurve: { date: string; r: number; equity: number }[] = []

  let inTrade:       TradingSignal | null = null
  let entryBar:      number = 0
  let cumulativeR    = 0
  let peakR          = 0
  let maxDrawdownR   = 0
  let consWins       = 0
  let consLosses     = 0
  let maxConsWins    = 0
  let maxConsLosses  = 0

  const WARMUP = Math.max(strategy.minCandles, 60)

  for (let i = WARMUP; i < candles.length; i++) {
    const windowCandles = candles.slice(0, i + 1)  // no look-ahead
    const c = candles[i]

    // ── Check if open trade hits SL or TP ──────────────────────────────────
    if (inTrade) {
      const { direction, stopLoss, target, target2, entry } = inTrade
      const riskDist = Math.abs(entry - stopLoss)

      let exitPrice:  number | null = null
      let exitReason: BacktestTrade['exitReason'] | null = null

      if (direction === 'LONG') {
        if (c.low <= stopLoss)  { exitPrice = stopLoss;  exitReason = 'SL' }
        else if (c.high >= target2) { exitPrice = target2; exitReason = 'TP2' }
        else if (c.high >= target)  { exitPrice = target;  exitReason = 'TP' }
      } else {
        if (c.high >= stopLoss) { exitPrice = stopLoss;  exitReason = 'SL' }
        else if (c.low <= target2)  { exitPrice = target2; exitReason = 'TP2' }
        else if (c.low <= target)   { exitPrice = target;  exitReason = 'TP' }
      }

      // Check for signal-based exit (strategy reversal on opposing signal)
      if (!exitPrice) {
        try {
          const sig = strategy.analyze(windowCandles, symbol, interval)
          if (sig && sig.direction !== direction) {
            exitPrice  = c.close
            exitReason = 'SIGNAL_EXIT'
          }
        } catch { /* skip */ }
      }

      if (exitPrice !== null && exitReason !== null) {
        const pnlDir   = direction === 'LONG' ? 1 : -1
        const pnlPct   = ((exitPrice - entry) / entry) * 100 * pnlDir
        const pnlR     = parseFloat(((exitPrice - entry) * pnlDir / riskDist).toFixed(2))
        const result: BacktestTrade['result'] =
          pnlR >= 0.1 ? 'WIN' : pnlR <= -0.9 ? 'LOSS' : 'BREAKEVEN'

        const trade: BacktestTrade = {
          entryBar, exitBar: i,
          entryDate: new Date(candles[entryBar].time * 1000).toISOString().slice(0, 10),
          exitDate:  new Date(c.time * 1000).toISOString().slice(0, 10),
          direction,
          entryPrice: entry, exitPrice, stopLoss, target,
          pnlPct: parseFloat(pnlPct.toFixed(3)),
          pnlR,
          result,
          exitReason,
          reasons: inTrade.reasons,
          confidence: inTrade.confidence,
        }
        trades.push(trade)

        cumulativeR += pnlR
        if (cumulativeR > peakR) peakR = cumulativeR
        const drawdown = peakR - cumulativeR
        if (drawdown > maxDrawdownR) maxDrawdownR = drawdown

        if (result === 'WIN')  { consWins++; consLosses = 0; if (consWins > maxConsWins) maxConsWins = consWins }
        if (result === 'LOSS') { consLosses++; consWins = 0; if (consLosses > maxConsLosses) maxConsLosses = consLosses }

        equityCurve.push({
          date: new Date(c.time * 1000).toISOString().slice(0, 10),
          r: parseFloat(cumulativeR.toFixed(3)),
          equity: parseFloat((100000 + cumulativeR * 2000).toFixed(0)),
        })

        inTrade = null
      }

      continue  // don't enter new trade on same bar as exit
    }

    // ── Look for new entry ──────────────────────────────────────────────────
    if (!inTrade && i < candles.length - 1) {
      try {
        const sig = strategy.analyze(windowCandles, symbol, interval)
        if (sig) {
          // Enter at open of NEXT bar (realistic: can't fill on signal bar)
          inTrade   = { ...sig, entry: candles[i + 1].open }
          entryBar  = i + 1
        }
      } catch { /* skip */ }
    }
  }

  // Close any open trade at end of data
  if (inTrade && candles.length > 0) {
    const lastC = candles[candles.length - 1]
    const { direction, entry, stopLoss, target } = inTrade
    const riskDist = Math.abs(entry - stopLoss)
    const pnlDir   = direction === 'LONG' ? 1 : -1
    const pnlPct   = ((lastC.close - entry) / entry) * 100 * pnlDir
    const pnlR     = parseFloat(((lastC.close - entry) * pnlDir / (riskDist || 1)).toFixed(2))
    trades.push({
      entryBar, exitBar: candles.length - 1,
      entryDate: new Date(candles[entryBar].time * 1000).toISOString().slice(0, 10),
      exitDate:  new Date(lastC.time * 1000).toISOString().slice(0, 10),
      direction, entryPrice: entry, exitPrice: lastC.close,
      stopLoss, target,
      pnlPct: parseFloat(pnlPct.toFixed(3)),
      pnlR,
      result: pnlR > 0 ? 'WIN' : 'LOSS',
      exitReason: 'END_OF_DATA',
      reasons: inTrade.reasons, confidence: inTrade.confidence,
    })
  }

  // ── Compute stats ──────────────────────────────────────────────────────────
  const wins   = trades.filter(t => t.result === 'WIN').length
  const losses = trades.filter(t => t.result === 'LOSS').length
  const total  = trades.length

  const winRate = total > 0 ? (wins / total) * 100 : 0

  const grossWin  = trades.filter(t => t.pnlR > 0).reduce((s, t) => s + t.pnlR, 0)
  const grossLoss = Math.abs(trades.filter(t => t.pnlR < 0).reduce((s, t) => s + t.pnlR, 0))
  const profitFactor = grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 99 : 0

  const avgWinR  = wins  > 0 ? grossWin  / wins        : 0
  const avgLossR = losses > 0 ? -grossLoss / losses     : 0
  const expectancy = winRate / 100 * avgWinR - (1 - winRate / 100) * Math.abs(avgLossR)

  // Sharpe: using R series (risk-free ≈ 0 for simplicity)
  const rSeries = trades.map(t => t.pnlR)
  const meanR   = rSeries.length ? rSeries.reduce((a, b) => a + b, 0) / rSeries.length : 0
  const stdR    = rSeries.length > 1
    ? Math.sqrt(rSeries.reduce((s, r) => s + Math.pow(r - meanR, 2), 0) / (rSeries.length - 1))
    : 0
  const sharpeRatio = stdR > 0 ? parseFloat((meanR / stdR * Math.sqrt(252)).toFixed(2)) : 0

  // Max drawdown in %: track equity from 100k base
  let equityPeak = 100000
  let maxDDPct   = 0
  let runEq      = 100000
  for (const t of trades) {
    runEq += t.pnlR * 2000
    if (runEq > equityPeak) equityPeak = runEq
    const dd = (equityPeak - runEq) / equityPeak * 100
    if (dd > maxDDPct) maxDDPct = dd
  }

  const totalR = parseFloat(cumulativeR.toFixed(2))

  const passed = total >= MIN_TRADES && winRate >= MIN_WIN_RATE && profitFactor >= MIN_PF && totalR >= MIN_R
  let failReason: string | undefined
  if (!passed) {
    if (total < MIN_TRADES) failReason = `Only ${total} trades — need ${MIN_TRADES}+ for statistical significance`
    else if (winRate < MIN_WIN_RATE) failReason = `Win rate ${winRate.toFixed(1)}% below minimum ${MIN_WIN_RATE}%`
    else if (profitFactor < MIN_PF) failReason = `Profit factor ${profitFactor} below minimum ${MIN_PF}`
    else failReason = `Total R ${totalR} below minimum ${MIN_R}R`
  }

  const fromDate = candles.length > WARMUP ? new Date(candles[WARMUP].time * 1000).toISOString().slice(0, 10) : ''
  const toDate   = candles.length > 0 ? new Date(candles[candles.length - 1].time * 1000).toISOString().slice(0, 10) : ''

  return {
    strategyId: strategy.id, strategyName: strategy.name,
    symbol, interval, fromDate, toDate,
    totalTrades: total, wins, losses,
    winRate: parseFloat(winRate.toFixed(1)),
    profitFactor,
    totalR,
    avgWinR:  parseFloat(avgWinR.toFixed(2)),
    avgLossR: parseFloat(Math.abs(avgLossR).toFixed(2)),
    maxDrawdownR:   parseFloat(maxDrawdownR.toFixed(2)),
    maxDrawdownPct: parseFloat(maxDDPct.toFixed(1)),
    sharpeRatio,
    expectancy: parseFloat(expectancy.toFixed(3)),
    consecutiveWins:   maxConsWins,
    consecutiveLosses: maxConsLosses,
    trades,
    equityCurve,
    passed, failReason,
  }
}
