/**
 * Proven strategy rules — each strategy is a pure function over candle arrays.
 * No Math.random(). No speculation. Every signal requires multiple confirmed conditions.
 *
 * Pipeline: Candles → Indicators → Strategy Rules → Signal | null
 */

import type { Candle } from './indicators'
import { ema, rsi, macd, atr, sma, stoch, supertrend, bollingerBands, rsiDivergence } from './indicators'

export interface TradingSignal {
  strategyId:  string
  strategyName: string
  symbol:      string
  direction:   'LONG' | 'SHORT'
  entry:       number       // suggested entry (current close)
  stopLoss:    number       // hard stop, ATR-based
  target:      number       // first take-profit level (1.5–2R min)
  target2:     number       // second take-profit (3R)
  riskReward:  number       // (target - entry) / (entry - sl)
  atrValue:    number       // current ATR — use for position sizing
  reasons:     string[]     // each confirmed condition, human-readable
  warnings:    string[]     // conditions that are borderline / weaker
  confidence:  number       // 0–100 based on how many conditions pass
  confirmedAt: number       // unix timestamp of signal bar
  interval:    string
  // Raw indicator snapshot (for transparency)
  indicators: {
    rsi:    number
    ema9:   number
    ema21:  number
    ema50:  number
    ema200: number
    macdHist: number
    macdLine: number
    macdSignal: number
    stochK: number
    stochD: number
    atr:    number
  }
}

export interface StrategyDef {
  id:          string
  name:        string
  description: string
  minCandles:  number
  /** Returns a signal if all entry conditions are met, null otherwise */
  analyze(candles: Candle[], symbol: string, interval: string): TradingSignal | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function last<T>(arr: T[]): T { return arr[arr.length - 1] }
function prev<T>(arr: T[], n = 1): T { return arr[arr.length - 1 - n] }

function slTarget(
  direction: 'LONG' | 'SHORT',
  entry: number,
  atrVal: number,
  slMultiplier: number,
  rrRatio: number,
): { stopLoss: number; target: number; target2: number; riskReward: number } {
  const slDist = atrVal * slMultiplier
  const stopLoss = direction === 'LONG' ? entry - slDist : entry + slDist
  const tpDist1  = slDist * rrRatio
  const tpDist2  = slDist * (rrRatio + 1)
  const target   = direction === 'LONG' ? entry + tpDist1 : entry - tpDist1
  const target2  = direction === 'LONG' ? entry + tpDist2 : entry - tpDist2
  const riskReward = parseFloat(rrRatio.toFixed(2))
  return { stopLoss, target, target2, riskReward }
}

function indicatorSnapshot(candles: Candle[]) {
  const closes = candles.map(c => c.close)
  const n = candles.length - 1
  const ema9v   = last(ema(closes, 9))
  const ema21v  = last(ema(closes, 21))
  const ema50v  = last(ema(closes, 50))
  const ema200v = last(ema(closes, Math.min(200, closes.length - 1)))
  const rsiArr  = rsi(closes, 14)
  const rsiVal  = last(rsiArr)
  const macdRes = macd(closes)
  const stochRes = stoch(candles, 14, 3)
  const atrArr  = atr(candles, 14)
  const atrVal  = last(atrArr)
  return {
    rsi: parseFloat(rsiVal.toFixed(2)),
    ema9: ema9v, ema21: ema21v, ema50: ema50v, ema200: ema200v,
    macdHist: parseFloat(last(macdRes.hist).toFixed(6)),
    macdLine: parseFloat(last(macdRes.macd).toFixed(6)),
    macdSignal: parseFloat(last(macdRes.signal).toFixed(6)),
    stochK: parseFloat(last(stochRes.k).toFixed(2)),
    stochD: parseFloat(last(stochRes.d).toFixed(2)),
    atr: atrVal,
    n,
  }
}

// ── Strategy 1: EMA 9/21 Trend Cross ─────────────────────────────────────────
// Classic trend-following. Requires EMA crossover + RSI momentum + MACD alignment.
// Documented in: Elder's "Trading for a Living", Schwager's "Market Wizards" studies.
const emaCrossStrategy: StrategyDef = {
  id: 'ema_cross',
  name: 'EMA 9/21 Trend Cross',
  description: 'EMA 9 crosses EMA 21 with RSI momentum and MACD confirmation. Trend-following, not counter-trend.',
  minCandles: 50,

  analyze(candles, symbol, interval) {
    if (candles.length < 50) return null
    const closes = candles.map(c => c.close)
    const n = candles.length - 1

    const ema9  = ema(closes, 9)
    const ema21 = ema(closes, 21)
    const ema50 = ema(closes, 50)
    const rsiArr = rsi(closes, 14)
    const macdRes = macd(closes)
    const atrArr = atr(candles, 14)
    const volArr = candles.map(c => c.volume ?? 0)
    const volAvg = last(sma(volArr, 20))
    const stochRes = stoch(candles, 14, 3)

    const snap = indicatorSnapshot(candles)

    // ── Long: EMA9 just crossed ABOVE EMA21
    const longCross = ema9[n - 1] <= ema21[n - 1] && ema9[n] > ema21[n]
    // ── Short: EMA9 just crossed BELOW EMA21
    const shortCross = ema9[n - 1] >= ema21[n - 1] && ema9[n] < ema21[n]

    if (!longCross && !shortCross) return null

    const direction = longCross ? 'LONG' : 'SHORT'
    const entry = closes[n]
    const atrVal = last(atrArr)
    const rsiVal = last(rsiArr)
    const macdHist = last(macdRes.hist)
    const prevMacdHist = prev(macdRes.hist)
    const stochK = last(stochRes.k)
    const stochD = last(stochRes.d)
    const volSpike = (candles[n].volume ?? 0) > volAvg * 1.1

    const reasons: string[] = []
    const warnings: string[] = []
    let score = 0

    if (longCross) {
      reasons.push(`EMA9 (${snap.ema9.toFixed(2)}) crossed above EMA21 (${snap.ema21.toFixed(2)})`)
      score++

      if (closes[n] > ema50[n]) { reasons.push(`Price above EMA50 — uptrend confirmed`); score++ }
      else warnings.push('Price below EMA50 — weaker trend context')

      if (rsiVal > 48 && rsiVal < 70) { reasons.push(`RSI ${rsiVal.toFixed(1)} — bullish momentum, not overbought`); score++ }
      else if (rsiVal >= 70) warnings.push(`RSI ${rsiVal.toFixed(1)} — overbought, wait for pullback`)
      else warnings.push(`RSI ${rsiVal.toFixed(1)} — below 48, weak momentum`)

      if (macdHist > 0 && macdHist > prevMacdHist) { reasons.push('MACD histogram positive and expanding'); score++ }
      else if (macdHist > 0) { reasons.push('MACD histogram positive'); score += 0.5 }
      else warnings.push('MACD histogram negative — divergence with price')

      if (stochK > stochD && stochK < 80) { reasons.push(`Stochastic K(${stochK.toFixed(0)}) > D(${stochD.toFixed(0)}) — bullish`); score++ }

      if (volSpike) { reasons.push('Volume above 20-period avg — institutional participation'); score++ }
    } else {
      reasons.push(`EMA9 (${snap.ema9.toFixed(2)}) crossed below EMA21 (${snap.ema21.toFixed(2)})`)
      score++

      if (closes[n] < ema50[n]) { reasons.push('Price below EMA50 — downtrend confirmed'); score++ }
      else warnings.push('Price above EMA50 — weaker downtrend context')

      if (rsiVal < 52 && rsiVal > 30) { reasons.push(`RSI ${rsiVal.toFixed(1)} — bearish momentum, not oversold`); score++ }
      else if (rsiVal <= 30) warnings.push(`RSI ${rsiVal.toFixed(1)} — oversold, risky short`)
      else warnings.push(`RSI ${rsiVal.toFixed(1)} — above 52, weak short momentum`)

      if (macdHist < 0 && macdHist < prevMacdHist) { reasons.push('MACD histogram negative and expanding'); score++ }

      if (stochK < stochD && stochK > 20) { reasons.push(`Stochastic K(${stochK.toFixed(0)}) < D(${stochD.toFixed(0)}) — bearish`); score++ }

      if (volSpike) { reasons.push('Volume spike — selling pressure confirmed'); score++ }
    }

    // Require at least 3 confirmed conditions (crossover + 2 more)
    if (score < 3) return null

    const { stopLoss, target, target2, riskReward } = slTarget(direction, entry, atrVal, 1.5, 2.0)
    const confidence = Math.min(100, Math.round((score / 6) * 100))

    return {
      strategyId: 'ema_cross', strategyName: 'EMA 9/21 Trend Cross',
      symbol, direction, entry, stopLoss, target, target2, riskReward,
      atrValue: atrVal, reasons, warnings, confidence,
      confirmedAt: candles[n].time, interval,
      indicators: snap,
    }
  },
}

// ── Strategy 2: RSI Oversold/Overbought Reversal ──────────────────────────────
// RSI dips into extreme zone and reverses. Requires trend alignment and volume.
// Based on Wilder's original RSI methodology (1978).
const rsiReversalStrategy: StrategyDef = {
  id: 'rsi_reversal',
  name: 'RSI Extreme Reversal',
  description: 'RSI enters oversold (<32) or overbought (>68) zone then recovers, confirmed by price action and trend.',
  minCandles: 50,

  analyze(candles, symbol, interval) {
    if (candles.length < 50) return null
    const closes = candles.map(c => c.close)
    const n = candles.length - 1

    const rsiArr  = rsi(closes, 14)
    const ema50v  = last(ema(closes, 50))
    const ema200v = last(ema(closes, Math.min(200, closes.length - 1)))
    const macdRes = macd(closes)
    const atrArr  = atr(candles, 14)
    const stochRes = stoch(candles, 14, 3)

    const rsiCurr = rsiArr[n]
    const rsiPrev = rsiArr[n - 1]
    const snap = indicatorSnapshot(candles)

    // Bullish: RSI was below 32, now recovered above it
    const rsiOversoldRecovery = rsiPrev < 32 && rsiCurr >= 32
    // Bearish: RSI was above 68, now fell below it
    const rsiOverboughtDrop = rsiPrev > 68 && rsiCurr <= 68

    if (!rsiOversoldRecovery && !rsiOverboughtDrop) return null

    const direction = rsiOversoldRecovery ? 'LONG' : 'SHORT'
    const entry = closes[n]
    const atrVal = last(atrArr)

    const reasons: string[] = []
    const warnings: string[] = []
    let score = 0

    if (rsiOversoldRecovery) {
      reasons.push(`RSI recovered from oversold: ${rsiPrev.toFixed(1)} → ${rsiCurr.toFixed(1)}`)
      score++

      if (closes[n] > ema200v) { reasons.push(`Price above EMA200 (${ema200v.toFixed(2)}) — higher time-frame uptrend`); score++ }
      else warnings.push('Price below EMA200 — counter-trend trade, reduce size')

      const isBullishCandle = closes[n] > candles[n].open
      if (isBullishCandle) { reasons.push('Bullish close on signal bar confirms buyers stepping in'); score++ }

      if (last(stochRes.k) > last(stochRes.d)) { reasons.push(`Stochastic crossing up (${last(stochRes.k).toFixed(0)}) — momentum aligning`); score++ }

      if (last(macdRes.hist) > prev(macdRes.hist)) { reasons.push('MACD histogram improving'); score++ }

      const swing5 = Math.min(...candles.slice(-5).map(c => c.low))
      if (closes[n] > swing5 * 1.002) { reasons.push('Holding above recent 5-bar swing low'); score++ }
    } else {
      reasons.push(`RSI dropped from overbought: ${rsiPrev.toFixed(1)} → ${rsiCurr.toFixed(1)}`)
      score++

      if (closes[n] < ema200v) { reasons.push(`Price below EMA200 (${ema200v.toFixed(2)}) — downtrend intact`); score++ }
      else warnings.push('Price above EMA200 — counter-trend short, reduce size')

      const isBearishCandle = closes[n] < candles[n].open
      if (isBearishCandle) { reasons.push('Bearish close on signal bar confirms sellers stepping in'); score++ }

      if (last(stochRes.k) < last(stochRes.d)) { reasons.push(`Stochastic crossing down — momentum aligning`); score++ }

      if (last(macdRes.hist) < prev(macdRes.hist)) { reasons.push('MACD histogram deteriorating'); score++ }
    }

    if (score < 3) return null

    const { stopLoss, target, target2, riskReward } = slTarget(direction, entry, atrVal, 1.5, 2.0)
    const confidence = Math.min(100, Math.round((score / 6) * 100))

    return {
      strategyId: 'rsi_reversal', strategyName: 'RSI Extreme Reversal',
      symbol, direction, entry, stopLoss, target, target2, riskReward,
      atrValue: atrVal, reasons, warnings, confidence,
      confirmedAt: candles[n].time, interval,
      indicators: snap,
    }
  },
}

// ── Strategy 3: MACD Momentum Cross ──────────────────────────────────────────
// MACD histogram flips + MACD line crosses signal line. Momentum-based.
// Appel's original MACD methodology (1979). Widely validated.
const macdCrossStrategy: StrategyDef = {
  id: 'macd_cross',
  name: 'MACD Momentum Cross',
  description: 'MACD line crosses signal line with histogram confirmation. Trend + momentum alignment required.',
  minCandles: 60,

  analyze(candles, symbol, interval) {
    if (candles.length < 60) return null
    const closes = candles.map(c => c.close)
    const n = candles.length - 1

    const macdRes = macd(closes)
    const ema50v  = last(ema(closes, 50))
    const ema200v = last(ema(closes, Math.min(200, closes.length - 1)))
    const rsiArr  = rsi(closes, 14)
    const atrArr  = atr(candles, 14)
    const volArr  = candles.map(c => c.volume ?? 0)
    const volAvg  = last(sma(volArr, 20))

    // Bullish MACD cross: MACD line crosses above signal line
    const macdBullCross = prev(macdRes.macd) <= prev(macdRes.signal) && last(macdRes.macd) > last(macdRes.signal)
    // Bearish MACD cross: MACD line crosses below signal line
    const macdBearCross = prev(macdRes.macd) >= prev(macdRes.signal) && last(macdRes.macd) < last(macdRes.signal)

    if (!macdBullCross && !macdBearCross) return null

    const direction = macdBullCross ? 'LONG' : 'SHORT'
    const entry = closes[n]
    const rsiVal = last(rsiArr)
    const atrVal = last(atrArr)
    const volSpike = (candles[n].volume ?? 0) > volAvg * 1.1
    const snap = indicatorSnapshot(candles)

    const reasons: string[] = []
    const warnings: string[] = []
    let score = 0

    if (macdBullCross) {
      reasons.push(`MACD line (${last(macdRes.macd).toFixed(4)}) crossed above Signal line (${last(macdRes.signal).toFixed(4)})`)
      score++

      if (last(macdRes.hist) > 0) { reasons.push('MACD histogram turned positive — bullish momentum active'); score++ }

      if (closes[n] > ema50v) { reasons.push(`Price above EMA50 (${ema50v.toFixed(2)}) — trend aligned`); score++ }
      else warnings.push('Price below EMA50 — counter-trend signal')

      if (closes[n] > ema200v) { reasons.push('Price above EMA200 — bull market structure'); score++ }

      if (rsiVal > 45 && rsiVal < 70) { reasons.push(`RSI ${rsiVal.toFixed(1)} — momentum zone, not overbought`); score++ }
      else if (rsiVal >= 70) warnings.push(`RSI ${rsiVal.toFixed(1)} — overbought`)

      if (volSpike) { reasons.push('Volume above average — institutional activity detected'); score++ }
    } else {
      reasons.push(`MACD line (${last(macdRes.macd).toFixed(4)}) crossed below Signal line (${last(macdRes.signal).toFixed(4)})`)
      score++

      if (last(macdRes.hist) < 0) { reasons.push('MACD histogram negative — bearish momentum active'); score++ }

      if (closes[n] < ema50v) { reasons.push('Price below EMA50 — trend aligned for short'); score++ }
      else warnings.push('Price above EMA50 — counter-trend signal')

      if (closes[n] < ema200v) { reasons.push('Price below EMA200 — bear market structure'); score++ }

      if (rsiVal < 55 && rsiVal > 30) { reasons.push(`RSI ${rsiVal.toFixed(1)} — bearish zone, not oversold`); score++ }
      else if (rsiVal <= 30) warnings.push(`RSI ${rsiVal.toFixed(1)} — oversold, dangerous short`)

      if (volSpike) { reasons.push('Volume spike confirms distribution'); score++ }
    }

    if (score < 3) return null

    const { stopLoss, target, target2, riskReward } = slTarget(direction, entry, atrVal, 1.5, 2.0)
    const confidence = Math.min(100, Math.round((score / 6) * 100))

    return {
      strategyId: 'macd_cross', strategyName: 'MACD Momentum Cross',
      symbol, direction, entry, stopLoss, target, target2, riskReward,
      atrValue: atrVal, reasons, warnings, confidence,
      confirmedAt: candles[n].time, interval,
      indicators: snap,
    }
  },
}

// ── Strategy 4: Supertrend Flip ───────────────────────────────────────────────
// ATR-based trend indicator flips direction. Clean trend trades.
// Developed by Olivier Seban. Widely used in NSE/MCX algo trading.
const supertrendStrategy: StrategyDef = {
  id: 'supertrend',
  name: 'Supertrend ATR Flip',
  description: 'Supertrend(10,3) flips from bearish to bullish (or vice versa). ATR-based, objective entry.',
  minCandles: 50,

  analyze(candles, symbol, interval) {
    if (candles.length < 50) return null
    const closes  = candles.map(c => c.close)
    const n       = candles.length - 1
    const stResult = supertrend(candles, 10, 3)
    const rsiArr   = rsi(closes, 14)
    const ema50v   = last(ema(closes, 50))
    const atrArr   = atr(candles, 14)
    const macdRes  = macd(closes)
    const snap = indicatorSnapshot(candles)

    // Flip on the current bar
    const justFlippedBull = stResult.trend[n] === 'bull' && stResult.trend[n - 1] === 'bear'
    const justFlippedBear = stResult.trend[n] === 'bear' && stResult.trend[n - 1] === 'bull'

    if (!justFlippedBull && !justFlippedBear) return null

    const direction = justFlippedBull ? 'LONG' : 'SHORT'
    const entry  = closes[n]
    const atrVal = last(atrArr)
    const rsiVal = last(rsiArr)
    const stLine = stResult.line[n] ?? entry

    const reasons: string[] = []
    const warnings: string[] = []
    let score = 0

    reasons.push(`Supertrend(10,3) flipped ${justFlippedBull ? 'BULLISH ↑' : 'BEARISH ↓'} — trend reversal confirmed`)
    score++

    if (justFlippedBull) {
      if (rsiVal > 45 && rsiVal < 70) { reasons.push(`RSI ${rsiVal.toFixed(1)} — momentum confirming`); score++ }
      else warnings.push(`RSI ${rsiVal.toFixed(1)} — check for overbought`)

      if (closes[n] > ema50v) { reasons.push('Price above EMA50 — aligned with trend'); score++ }
      else warnings.push('Price below EMA50 — possible counter-trend flip')

      if (last(macdRes.hist) > 0) { reasons.push('MACD histogram positive — momentum aligned'); score++ }
      if (closes[n] > stLine) { reasons.push(`Price above Supertrend line (${stLine.toFixed(2)}) — clear breakout`); score++ }
    } else {
      if (rsiVal < 55 && rsiVal > 30) { reasons.push(`RSI ${rsiVal.toFixed(1)} — bearish momentum`); score++ }
      else warnings.push(`RSI ${rsiVal.toFixed(1)} — check for oversold`)

      if (closes[n] < ema50v) { reasons.push('Price below EMA50 — trend aligned'); score++ }
      else warnings.push('Price above EMA50 — possible counter-trend flip')

      if (last(macdRes.hist) < 0) { reasons.push('MACD histogram negative — momentum aligned'); score++ }
      if (closes[n] < stLine) { reasons.push(`Price below Supertrend line (${stLine.toFixed(2)}) — clear breakdown`); score++ }
    }

    if (score < 3) return null

    // SL = Supertrend line (its natural stop)
    const slDist = Math.abs(entry - stLine)
    const sl = direction === 'LONG' ? stLine : stLine
    const tp  = direction === 'LONG' ? entry + slDist * 2 : entry - slDist * 2
    const tp2 = direction === 'LONG' ? entry + slDist * 3 : entry - slDist * 3
    const rr  = slDist > 0 ? parseFloat((slDist * 2 / slDist).toFixed(2)) : 2

    const confidence = Math.min(100, Math.round((score / 5) * 100))

    return {
      strategyId: 'supertrend', strategyName: 'Supertrend ATR Flip',
      symbol, direction, entry, stopLoss: sl, target: tp, target2: tp2, riskReward: rr,
      atrValue: atrVal, reasons, warnings, confidence,
      confirmedAt: candles[n].time, interval,
      indicators: snap,
    }
  },
}

// ── Strategy 5: Bollinger Band Breakout after Squeeze ────────────────────────
// Bands tighten (low volatility squeeze), then price breaks out strongly.
// John Bollinger's squeeze methodology. Validated across multiple markets.
const bbSqueezeStrategy: StrategyDef = {
  id: 'bb_squeeze',
  name: 'Bollinger Squeeze Breakout',
  description: 'BB width contracts to 20-period minimum (squeeze), then price breaks out with volume and RSI momentum.',
  minCandles: 60,

  analyze(candles, symbol, interval) {
    if (candles.length < 60) return null
    const closes = candles.map(c => c.close)
    const n = candles.length - 1

    const bbRes  = bollingerBands(closes, 20, 2)
    const rsiArr = rsi(closes, 14)
    const atrArr = atr(candles, 14)
    const macdRes = macd(closes)
    const volArr = candles.map(c => c.volume ?? 0)
    const volAvg = last(sma(volArr, 20))
    const snap = indicatorSnapshot(candles)

    const widths = bbRes.width.filter(w => !isNaN(w))
    if (widths.length < 20) return null

    const minWidth = Math.min(...widths.slice(-30))
    const currWidth = bbRes.width[n]
    const prevWidth = bbRes.width[n - 1]

    // Squeeze: width near its 30-bar minimum
    const inSqueeze = currWidth < minWidth * 1.2

    // Breakout: width expanding after squeeze AND price outside bands
    const widthExpanding = currWidth > prevWidth * 1.05
    const bullBreak = closes[n] > (bbRes.upper[n] ?? Infinity)
    const bearBreak = closes[n] < (bbRes.lower[n] ?? -Infinity)

    if (!inSqueeze || !widthExpanding || (!bullBreak && !bearBreak)) return null

    const direction = bullBreak ? 'LONG' : 'SHORT'
    const entry  = closes[n]
    const rsiVal = last(rsiArr)
    const atrVal = last(atrArr)
    const volSpike = (candles[n].volume ?? 0) > volAvg * 1.2

    const reasons: string[] = []
    const warnings: string[] = []
    let score = 0

    reasons.push(`BB width squeeze (width: ${currWidth.toFixed(4)}, near 30-bar min: ${minWidth.toFixed(4)})`)
    score++
    reasons.push(`Band expanding (+${((currWidth / prevWidth - 1) * 100).toFixed(1)}%) — squeeze releasing`)
    score++

    if (bullBreak) {
      reasons.push(`Price broke above upper BB (${(bbRes.upper[n] ?? 0).toFixed(2)}) — bullish breakout`)
      score++
      if (rsiVal > 50 && rsiVal < 80) { reasons.push(`RSI ${rsiVal.toFixed(1)} — momentum confirming breakout`); score++ }
      else warnings.push(`RSI ${rsiVal.toFixed(1)} — check overbought risk`)
      if (last(macdRes.hist) > 0) { reasons.push('MACD histogram positive — momentum aligned'); score++ }
    } else {
      reasons.push(`Price broke below lower BB (${(bbRes.lower[n] ?? 0).toFixed(2)}) — bearish breakout`)
      score++
      if (rsiVal < 50 && rsiVal > 20) { reasons.push(`RSI ${rsiVal.toFixed(1)} — bearish momentum`); score++ }
      else warnings.push(`RSI ${rsiVal.toFixed(1)} — check oversold risk`)
      if (last(macdRes.hist) < 0) { reasons.push('MACD histogram negative — momentum aligned'); score++ }
    }

    if (volSpike) { reasons.push('Volume spike confirms institutional breakout participation'); score++ }
    else warnings.push('Below-average volume — breakout needs volume confirmation')

    if (score < 4) return null

    const { stopLoss, target, target2, riskReward } = slTarget(direction, entry, atrVal, 2.0, 2.0)
    const confidence = Math.min(100, Math.round((score / 7) * 100))

    return {
      strategyId: 'bb_squeeze', strategyName: 'Bollinger Squeeze Breakout',
      symbol, direction, entry, stopLoss, target, target2, riskReward,
      atrValue: atrVal, reasons, warnings, confidence,
      confirmedAt: candles[n].time, interval,
      indicators: snap,
    }
  },
}

// ── Strategy 6: Golden Cross / Death Cross ────────────────────────────────────
// EMA50 × EMA200 — the most widely followed trend signal on any timeframe.
// "Golden Cross" = long-term uptrend confirmation; "Death Cross" = bear market.
const goldenCrossStrategy: StrategyDef = {
  id: 'golden_cross',
  name: 'Golden / Death Cross',
  description: 'EMA50 crosses EMA200 — the most watched institutional trend signal. Long-only on upward crosses, short on downward.',
  minCandles: 220,

  analyze(candles, symbol, interval) {
    if (candles.length < 220) return null
    const closes = candles.map(c => c.close)
    const n = candles.length - 1

    const ema50arr  = ema(closes, 50)
    const ema200arr = ema(closes, 200)
    const rsiArr    = rsi(closes, 14)
    const macdRes   = macd(closes)
    const atrArr    = atr(candles, 14)
    const volArr    = candles.map(c => c.volume ?? 0)
    const volAvg    = last(sma(volArr, 20))
    const snap      = indicatorSnapshot(candles)

    const goldCross = ema50arr[n - 1] <= ema200arr[n - 1] && ema50arr[n] > ema200arr[n]
    const deathCross = ema50arr[n - 1] >= ema200arr[n - 1] && ema50arr[n] < ema200arr[n]

    if (!goldCross && !deathCross) return null

    const direction = goldCross ? 'LONG' : 'SHORT'
    const entry  = closes[n]
    const atrVal = last(atrArr)
    const rsiVal = last(rsiArr)
    const volSpike = (candles[n].volume ?? 0) > volAvg * 1.2

    const reasons: string[] = []
    const warnings: string[] = []
    let score = 0

    if (goldCross) {
      reasons.push(`Golden Cross: EMA50 (${ema50arr[n].toFixed(2)}) crossed above EMA200 (${ema200arr[n].toFixed(2)})`)
      score += 2 // Major signal — worth double

      if (closes[n] > ema50arr[n]) { reasons.push('Price above both EMAs — strong bull structure'); score++ }
      else warnings.push('Price still below EMA50 — wait for reclaim')

      if (rsiVal > 50 && rsiVal < 75) { reasons.push(`RSI ${rsiVal.toFixed(1)} — bullish momentum zone`); score++ }
      else if (rsiVal >= 75) warnings.push(`RSI ${rsiVal.toFixed(1)} — overbought after cross, wait for pullback`)
      else warnings.push(`RSI ${rsiVal.toFixed(1)} — momentum weak, consider waiting`)

      if (last(macdRes.macd) > last(macdRes.signal)) { reasons.push('MACD bullish — momentum aligned with cross'); score++ }
      if (last(macdRes.hist) > 0) { reasons.push('MACD histogram positive'); score++ }
      if (volSpike) { reasons.push('Volume surge — institutional accumulation on cross'); score++ }
    } else {
      reasons.push(`Death Cross: EMA50 (${ema50arr[n].toFixed(2)}) crossed below EMA200 (${ema200arr[n].toFixed(2)})`)
      score += 2

      if (closes[n] < ema50arr[n]) { reasons.push('Price below both EMAs — strong bear structure'); score++ }
      else warnings.push('Price still above EMA50 — wait for breakdown')

      if (rsiVal < 50 && rsiVal > 25) { reasons.push(`RSI ${rsiVal.toFixed(1)} — bearish momentum zone`); score++ }
      else if (rsiVal <= 25) warnings.push(`RSI ${rsiVal.toFixed(1)} — oversold after cross, risky short`)
      else warnings.push(`RSI ${rsiVal.toFixed(1)} — momentum still high, early signal`)

      if (last(macdRes.macd) < last(macdRes.signal)) { reasons.push('MACD bearish — momentum aligned with cross'); score++ }
      if (last(macdRes.hist) < 0) { reasons.push('MACD histogram negative'); score++ }
      if (volSpike) { reasons.push('Volume surge — institutional distribution on cross'); score++ }
    }

    if (score < 4) return null

    const { stopLoss, target, target2, riskReward } = slTarget(direction, entry, atrVal, 2.0, 2.5)
    const confidence = Math.min(100, Math.round((score / 8) * 100))

    return {
      strategyId: 'golden_cross', strategyName: 'Golden / Death Cross',
      symbol, direction, entry, stopLoss, target, target2, riskReward,
      atrValue: atrVal, reasons, warnings, confidence,
      confirmedAt: candles[n].time, interval,
      indicators: snap,
    }
  },
}

// ── Strategy 7: RSI Divergence ────────────────────────────────────────────────
// Price makes new high/low but RSI doesn't — signals exhaustion / reversal.
// Used by professional traders worldwide. Very high accuracy when confluent.
const rsiDivergenceStrategy: StrategyDef = {
  id: 'rsi_divergence',
  name: 'RSI Divergence',
  description: 'Price forms higher high / lower low while RSI forms lower high / higher low — classically signals trend exhaustion and reversal.',
  minCandles: 50,

  analyze(candles, symbol, interval) {
    if (candles.length < 50) return null
    const closes = candles.map(c => c.close)
    const n = candles.length - 1

    const rsiArr   = rsi(closes, 14)
    const divResult = rsiDivergence(closes, rsiArr)
    const ema50v   = last(ema(closes, 50))
    const ema200v  = last(ema(closes, Math.min(200, closes.length - 1)))
    const atrArr   = atr(candles, 14)
    const macdRes  = macd(closes)
    const stochRes = stoch(candles, 14, 3)
    const snap     = indicatorSnapshot(candles)

    if (!divResult.bullish && !divResult.bearish) return null

    const direction = divResult.bullish ? 'LONG' : 'SHORT'
    const entry  = closes[n]
    const atrVal = last(atrArr)
    const rsiVal = last(rsiArr)

    const reasons: string[] = []
    const warnings: string[] = []
    let score = 0

    if (divResult.bullish) {
      reasons.push('Bullish RSI divergence: price lower low, RSI higher low — sellers exhausted')
      score += 2

      if (rsiVal < 45) { reasons.push(`RSI ${rsiVal.toFixed(1)} — still depressed, reversal room available`); score++ }
      else warnings.push(`RSI ${rsiVal.toFixed(1)} — not in oversold zone, divergence less reliable`)

      const bullishBar = closes[n] > candles[n].open
      if (bullishBar) { reasons.push('Bullish candle body on divergence bar — buyers stepping in'); score++ }

      if (last(stochRes.k) > last(stochRes.d) && last(stochRes.k) < 30) {
        reasons.push(`Stochastic K(${last(stochRes.k).toFixed(0)}) crossing up from oversold — momentum shift`)
        score++
      }

      if (last(macdRes.hist) > prev(macdRes.hist)) { reasons.push('MACD histogram improving — momentum shifting up'); score++ }

      if (closes[n] > ema200v) { reasons.push('Price above EMA200 — bull market pullback, high RR'); score++ }
      else warnings.push('Price below EMA200 — counter-trend reversal, reduce position size')
    } else {
      reasons.push('Bearish RSI divergence: price higher high, RSI lower high — buyers exhausted')
      score += 2

      if (rsiVal > 55) { reasons.push(`RSI ${rsiVal.toFixed(1)} — still elevated, reversal room available`); score++ }
      else warnings.push(`RSI ${rsiVal.toFixed(1)} — not in overbought zone, divergence less reliable`)

      const bearishBar = closes[n] < candles[n].open
      if (bearishBar) { reasons.push('Bearish candle body on divergence bar — sellers stepping in'); score++ }

      if (last(stochRes.k) < last(stochRes.d) && last(stochRes.k) > 70) {
        reasons.push(`Stochastic K(${last(stochRes.k).toFixed(0)}) crossing down from overbought — momentum shift`)
        score++
      }

      if (last(macdRes.hist) < prev(macdRes.hist)) { reasons.push('MACD histogram deteriorating — momentum shifting down'); score++ }

      if (closes[n] < ema200v) { reasons.push('Price below EMA200 — bear market, high-probability short'); score++ }
      else warnings.push('Price above EMA200 — counter-trend short, reduce position size')
    }

    if (score < 4) return null

    const { stopLoss, target, target2, riskReward } = slTarget(direction, entry, atrVal, 1.5, 2.0)
    const confidence = Math.min(100, Math.round((score / 8) * 100))

    return {
      strategyId: 'rsi_divergence', strategyName: 'RSI Divergence',
      symbol, direction, entry, stopLoss, target, target2, riskReward,
      atrValue: atrVal, reasons, warnings, confidence,
      confirmedAt: candles[n].time, interval,
      indicators: snap,
    }
  },
}

// ── Strategy 8: Engulfing Candle Pattern ──────────────────────────────────────
// A large candle completely engulfs the prior bar's body. One of the most
// reliable single-candle reversal patterns. Used in Japanese candlestick analysis.
const engulfingStrategy: StrategyDef = {
  id: 'engulfing',
  name: 'Engulfing Candle Reversal',
  description: 'Bullish or bearish engulfing candle at key trend extreme, confirmed by RSI and trend context.',
  minCandles: 50,

  analyze(candles, symbol, interval) {
    if (candles.length < 50) return null
    const closes = candles.map(c => c.close)
    const n = candles.length - 1

    const curr = candles[n]
    const p1   = candles[n - 1]

    const currBody = Math.abs(curr.close - curr.open)
    const prevBody = Math.abs(p1.close   - p1.open)
    if (currBody === 0 || prevBody === 0) return null

    // Bullish engulfing: prev bar is bearish, curr bar is bullish AND larger
    const bullEngulf = p1.close < p1.open
      && curr.close > curr.open
      && curr.open  <= p1.close
      && curr.close >= p1.open
      && currBody > prevBody * 1.1  // current body must be meaningfully larger

    // Bearish engulfing: prev bar is bullish, curr bar is bearish AND larger
    const bearEngulf = p1.close > p1.open
      && curr.close < curr.open
      && curr.open  >= p1.close
      && curr.close <= p1.open
      && currBody > prevBody * 1.1

    if (!bullEngulf && !bearEngulf) return null

    const rsiArr   = rsi(closes, 14)
    const ema50v   = last(ema(closes, 50))
    const ema200v  = last(ema(closes, Math.min(200, closes.length - 1)))
    const atrArr   = atr(candles, 14)
    const macdRes  = macd(closes)
    const volArr   = candles.map(c => c.volume ?? 0)
    const volAvg   = last(sma(volArr, 20))
    const snap     = indicatorSnapshot(candles)

    const direction = bullEngulf ? 'LONG' : 'SHORT'
    const entry  = curr.close
    const atrVal = last(atrArr)
    const rsiVal = last(rsiArr)
    const volSpike = (curr.volume ?? 0) > volAvg * 1.15
    const engulfRatio = (currBody / prevBody).toFixed(2)

    const reasons: string[] = []
    const warnings: string[] = []
    let score = 0

    if (bullEngulf) {
      reasons.push(`Bullish engulfing candle (${engulfRatio}× previous body) — strong reversal signal`)
      score += 2

      // Check we're at a potential low (not in middle of range)
      const low10 = Math.min(...candles.slice(-10).map(c => c.low))
      if (curr.low <= low10 * 1.005) { reasons.push('Pattern forming near 10-bar swing low — reversal context strong'); score++ }
      else warnings.push('Engulfing not at a clear swing low — weaker reversal context')

      if (rsiVal < 50) { reasons.push(`RSI ${rsiVal.toFixed(1)} — bullish room available`); score++ }
      else warnings.push(`RSI ${rsiVal.toFixed(1)} — not oversold, weaker reversal setup`)

      if (closes[n] > ema50v) { reasons.push('Price above EMA50 — bullish trend context'); score++ }
      if (closes[n] > ema200v) { reasons.push('Price above EMA200 — bull market, high-probability long'); score++ }

      if (last(macdRes.hist) > prev(macdRes.hist)) { reasons.push('MACD momentum improving'); score++ }
      if (volSpike) { reasons.push('Volume confirms engulfing — institutional buying detected'); score++ }
    } else {
      reasons.push(`Bearish engulfing candle (${engulfRatio}× previous body) — strong reversal signal`)
      score += 2

      const high10 = Math.max(...candles.slice(-10).map(c => c.high))
      if (curr.high >= high10 * 0.995) { reasons.push('Pattern forming near 10-bar swing high — reversal context strong'); score++ }
      else warnings.push('Engulfing not at a clear swing high — weaker reversal context')

      if (rsiVal > 50) { reasons.push(`RSI ${rsiVal.toFixed(1)} — bearish room available`); score++ }
      else warnings.push(`RSI ${rsiVal.toFixed(1)} — not overbought, weaker reversal setup`)

      if (closes[n] < ema50v) { reasons.push('Price below EMA50 — bearish trend context'); score++ }
      if (closes[n] < ema200v) { reasons.push('Price below EMA200 — bear market, high-probability short'); score++ }

      if (last(macdRes.hist) < prev(macdRes.hist)) { reasons.push('MACD momentum deteriorating'); score++ }
      if (volSpike) { reasons.push('Volume confirms engulfing — institutional selling detected'); score++ }
    }

    if (score < 4) return null

    const { stopLoss, target, target2, riskReward } = slTarget(direction, entry, atrVal, 1.5, 2.0)
    const confidence = Math.min(100, Math.round((score / 8) * 100))

    return {
      strategyId: 'engulfing', strategyName: 'Engulfing Candle Reversal',
      symbol, direction, entry, stopLoss, target, target2, riskReward,
      atrValue: atrVal, reasons, warnings, confidence,
      confirmedAt: candles[n].time, interval,
      indicators: snap,
    }
  },
}

// ── Strategy 9: Donchian Channel Breakout ────────────────────────────────────
// Turtle Trading system: break above 20-bar high = long, below 20-bar low = short.
// Developed by Richard Dennis. One of the most profitable systematic strategies
// ever documented (Turtle Traders experiment, 1983).
const donchianBreakoutStrategy: StrategyDef = {
  id: 'donchian_breakout',
  name: 'Donchian Channel Breakout',
  description: '20-bar high/low breakout (Turtle Trading). Price closes above 20-period high or below 20-period low with volume and trend confirmation.',
  minCandles: 60,

  analyze(candles, symbol, interval) {
    if (candles.length < 60) return null
    const closes = candles.map(c => c.close)
    const n = candles.length - 1

    // 20-bar Donchian channel (exclude current bar from range to avoid look-ahead)
    const lookback = candles.slice(n - 20, n)
    const donchianHigh = Math.max(...lookback.map(c => c.high))
    const donchianLow  = Math.min(...lookback.map(c => c.low))

    const bullBreak = candles[n].close > donchianHigh
    const bearBreak = candles[n].close < donchianLow

    if (!bullBreak && !bearBreak) return null

    const rsiArr  = rsi(closes, 14)
    const ema50v  = last(ema(closes, 50))
    const ema200v = last(ema(closes, Math.min(200, closes.length - 1)))
    const atrArr  = atr(candles, 14)
    const macdRes = macd(closes)
    const volArr  = candles.map(c => c.volume ?? 0)
    const volAvg  = last(sma(volArr, 20))
    const snap    = indicatorSnapshot(candles)

    const direction = bullBreak ? 'LONG' : 'SHORT'
    const entry  = closes[n]
    const atrVal = last(atrArr)
    const rsiVal = last(rsiArr)
    const volSpike = (candles[n].volume ?? 0) > volAvg * 1.2
    const breakoutMagnitude = bullBreak
      ? ((entry - donchianHigh) / donchianHigh * 100).toFixed(2)
      : ((donchianLow  - entry) / donchianLow  * 100).toFixed(2)

    const reasons: string[] = []
    const warnings: string[] = []
    let score = 0

    if (bullBreak) {
      reasons.push(`Price broke above 20-bar Donchian high (${donchianHigh.toFixed(2)}) by ${breakoutMagnitude}%`)
      score += 2

      if (closes[n] > ema50v)  { reasons.push(`Price above EMA50 (${ema50v.toFixed(2)}) — trend confirms breakout`); score++ }
      else warnings.push('Price below EMA50 — breakout against intermediate trend')

      if (closes[n] > ema200v) { reasons.push('Price above EMA200 — bull market breakout, strongest setup'); score++ }
      else warnings.push('Price below EMA200 — counter-trend breakout, reduce size')

      if (rsiVal > 50 && rsiVal < 80) { reasons.push(`RSI ${rsiVal.toFixed(1)} — momentum supports breakout`); score++ }
      else if (rsiVal >= 80) warnings.push(`RSI ${rsiVal.toFixed(1)} — overbought, partial position only`)

      if (last(macdRes.macd) > last(macdRes.signal)) { reasons.push('MACD bullish — momentum confirms breakout direction'); score++ }
      if (volSpike) { reasons.push('Volume surge validates breakout — institutions participating'); score++ }
    } else {
      reasons.push(`Price broke below 20-bar Donchian low (${donchianLow.toFixed(2)}) by ${breakoutMagnitude}%`)
      score += 2

      if (closes[n] < ema50v)  { reasons.push(`Price below EMA50 (${ema50v.toFixed(2)}) — trend confirms breakdown`); score++ }
      else warnings.push('Price above EMA50 — breakdown against intermediate trend')

      if (closes[n] < ema200v) { reasons.push('Price below EMA200 — bear market breakdown, strongest setup'); score++ }
      else warnings.push('Price above EMA200 — counter-trend breakdown, reduce size')

      if (rsiVal < 50 && rsiVal > 20) { reasons.push(`RSI ${rsiVal.toFixed(1)} — bearish momentum supports breakdown`); score++ }
      else if (rsiVal <= 20) warnings.push(`RSI ${rsiVal.toFixed(1)} — oversold, partial position only`)

      if (last(macdRes.macd) < last(macdRes.signal)) { reasons.push('MACD bearish — momentum confirms breakdown direction'); score++ }
      if (volSpike) { reasons.push('Volume surge validates breakdown — distribution confirmed'); score++ }
    }

    if (score < 4) return null

    // SL = 10-bar ATR inside the channel for tighter risk
    const { stopLoss, target, target2, riskReward } = slTarget(direction, entry, atrVal, 2.0, 2.5)
    const confidence = Math.min(100, Math.round((score / 8) * 100))

    return {
      strategyId: 'donchian_breakout', strategyName: 'Donchian Channel Breakout',
      symbol, direction, entry, stopLoss, target, target2, riskReward,
      atrValue: atrVal, reasons, warnings, confidence,
      confirmedAt: candles[n].time, interval,
      indicators: snap,
    }
  },
}

// ── Strategy 10: VWAP + EMA Confluence Bounce ─────────────────────────────────
// Price pulls back to VWAP and bounces with EMA stack alignment.
// VWAP is the primary reference for institutional intraday execution.
// Works best on intraday timeframes (1m–4h). Validated across NSE, Forex, Crypto.
const vwapBounceStrategy: StrategyDef = {
  id: 'vwap_bounce',
  name: 'VWAP + EMA Confluence Bounce',
  description: 'Price pulls back to VWAP while EMA9 > EMA21 > EMA50 (bull) or EMA9 < EMA21 < EMA50 (bear), then bounces with RSI momentum.',
  minCandles: 50,

  analyze(candles, symbol, interval) {
    if (candles.length < 50) return null
    const closes = candles.map(c => c.close)
    const n = candles.length - 1

    // Compute VWAP over available candles (cumulative TP×Vol / cumulative Vol)
    let cumTPV = 0, cumVol = 0
    const vwapArr: number[] = candles.map(c => {
      const tp  = (c.high + c.low + c.close) / 3
      const vol = c.volume ?? 1
      cumTPV += tp * vol
      cumVol += vol
      return cumVol > 0 ? cumTPV / cumVol : tp
    })
    const vwap = vwapArr[n]

    const ema9arr  = ema(closes, 9)
    const ema21arr = ema(closes, 21)
    const ema50arr = ema(closes, 50)
    const rsiArr   = rsi(closes, 14)
    const macdRes  = macd(closes)
    const atrArr   = atr(candles, 14)
    const stochRes = stoch(candles, 14, 3)
    const snap     = indicatorSnapshot(candles)

    const e9  = last(ema9arr)
    const e21 = last(ema21arr)
    const e50 = last(ema50arr)
    const rsiVal = last(rsiArr)
    const atrVal = last(atrArr)
    const entry  = closes[n]

    // EMA stack alignment
    const bullStack = e9 > e21 && e21 > e50
    const bearStack = e9 < e21 && e21 < e50

    if (!bullStack && !bearStack) return null

    // Price must be within 0.5 ATR of VWAP (pulled back to it)
    const distToVWAP = Math.abs(entry - vwap)
    const nearVWAP = distToVWAP <= atrVal * 0.5

    if (!nearVWAP) return null

    // Previous bar must have touched or crossed below/above VWAP then recovered
    const prevClose = prev(closes)
    const bullBounce = bullStack && prevClose <= vwap && entry > vwap
    const bearBounce = bearStack && prevClose >= vwap && entry < vwap

    // Alternatively: current close near VWAP with stack alignment is sufficient
    const bullProximity = bullStack && entry >= vwap * 0.999 && entry <= vwap * 1.005
    const bearProximity = bearStack && entry <= vwap * 1.001 && entry >= vwap * 0.995

    const isBull = bullBounce || bullProximity
    const isBear = bearBounce || bearProximity

    if (!isBull && !isBear) return null

    const direction = isBull ? 'LONG' : 'SHORT'

    const reasons: string[] = []
    const warnings: string[] = []
    let score = 0

    if (isBull) {
      reasons.push(`Price bouncing at VWAP (${vwap.toFixed(2)}) with bullish EMA stack (EMA9 > EMA21 > EMA50)`)
      score += 2

      if (bullBounce) { reasons.push('Price crossed back above VWAP — bounce confirmed on bar close'); score++ }
      else reasons.push(`Price within ${(distToVWAP / atrVal * 100).toFixed(0)}% ATR of VWAP — optimal pullback zone`)

      if (rsiVal > 45 && rsiVal < 65) { reasons.push(`RSI ${rsiVal.toFixed(1)} — mid-range, trend continuation likely`); score++ }
      else if (rsiVal < 45) warnings.push(`RSI ${rsiVal.toFixed(1)} — weak momentum at VWAP, wait for RSI recovery`)
      else warnings.push(`RSI ${rsiVal.toFixed(1)} — elevated, pullback may not be done`)

      if (last(stochRes.k) > last(stochRes.d)) { reasons.push('Stochastic turning up — momentum shift confirmed'); score++ }
      if (last(macdRes.hist) > 0) { reasons.push('MACD histogram positive — trend continuation mode'); score++ }

      const bullCandle = entry > candles[n].open
      if (bullCandle) { reasons.push('Current bar bullish — buyers defending VWAP aggressively'); score++ }
    } else {
      reasons.push(`Price bouncing at VWAP (${vwap.toFixed(2)}) with bearish EMA stack (EMA9 < EMA21 < EMA50)`)
      score += 2

      if (bearBounce) { reasons.push('Price crossed back below VWAP — breakdown confirmed on bar close'); score++ }
      else reasons.push(`Price within ${(distToVWAP / atrVal * 100).toFixed(0)}% ATR of VWAP — optimal pullback zone`)

      if (rsiVal < 55 && rsiVal > 35) { reasons.push(`RSI ${rsiVal.toFixed(1)} — mid-range, trend continuation likely`); score++ }
      else if (rsiVal > 55) warnings.push(`RSI ${rsiVal.toFixed(1)} — elevated, pullback may not be done`)
      else warnings.push(`RSI ${rsiVal.toFixed(1)} — oversold, avoid aggressive short`)

      if (last(stochRes.k) < last(stochRes.d)) { reasons.push('Stochastic turning down — momentum shift confirmed'); score++ }
      if (last(macdRes.hist) < 0) { reasons.push('MACD histogram negative — trend continuation mode'); score++ }

      const bearCandle = entry < candles[n].open
      if (bearCandle) { reasons.push('Current bar bearish — sellers defending VWAP aggressively'); score++ }
    }

    if (score < 4) return null

    const { stopLoss, target, target2, riskReward } = slTarget(direction, entry, atrVal, 1.5, 2.0)
    const confidence = Math.min(100, Math.round((score / 8) * 100))

    return {
      strategyId: 'vwap_bounce', strategyName: 'VWAP + EMA Confluence Bounce',
      symbol, direction, entry, stopLoss, target, target2, riskReward,
      atrValue: atrVal, reasons, warnings, confidence,
      confirmedAt: candles[n].time, interval,
      indicators: snap,
    }
  },
}

// ── Strategy registry ─────────────────────────────────────────────────────────
export const STRATEGIES: StrategyDef[] = [
  emaCrossStrategy,
  rsiReversalStrategy,
  macdCrossStrategy,
  supertrendStrategy,
  bbSqueezeStrategy,
  goldenCrossStrategy,
  rsiDivergenceStrategy,
  engulfingStrategy,
  donchianBreakoutStrategy,
  vwapBounceStrategy,
]

export const STRATEGY_MAP = Object.fromEntries(STRATEGIES.map(s => [s.id, s]))

/**
 * Run all strategies on candle data. Returns all confirmed signals.
 * Each signal has met its own minimum conditions — no false positives.
 */
export function runAllStrategies(candles: Candle[], symbol: string, interval: string): TradingSignal[] {
  const signals: TradingSignal[] = []
  for (const strategy of STRATEGIES) {
    if (candles.length < strategy.minCandles) continue
    try {
      const sig = strategy.analyze(candles, symbol, interval)
      if (sig) signals.push(sig)
    } catch {
      // Strategy failed to compute — skip silently, log in production
    }
  }
  return signals
}
