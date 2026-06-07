import { Candle, ema, rsi, macd, stoch, atr, sma } from './indicators'

export interface BacktestResult {
  trades: number
  winRate: number
  profitFactor: number
  maxDrawdown: number
  avgWin: number
  avgLoss: number
  passed: boolean
  failReason?: string
  rulesFound: string[]
}

export interface ForwardTrade {
  timestamp: number
  direction: 'long' | 'short'
  entryPrice: number
  outcome: 'win' | 'loss' | 'pending'
  exitPrice?: number
}

interface Rule {
  label: string
  indicator: string
  condition: string
  direction: 'bull' | 'bear'
}

// ── Rule extraction patterns ──────────────────────────────────────────────────
const RULE_PATTERNS: { re: RegExp; rule: Rule }[] = [
  // RSI
  { re: /rsi.{0,25}(above|over|>).{0,10}50/i,                rule: { label:'RSI > 50',        indicator:'rsi', condition:'above50',    direction:'bull' } },
  { re: /rsi.{0,25}(below|under|<).{0,10}50/i,               rule: { label:'RSI < 50',        indicator:'rsi', condition:'below50',    direction:'bear' } },
  { re: /(oversold|rsi.{0,15}(under|below|<).{0,6}(30|35))/i, rule: { label:'RSI oversold',   indicator:'rsi', condition:'oversold',   direction:'bull' } },
  { re: /(overbought|rsi.{0,15}(above|over|>).{0,6}(70|65))/i,rule: { label:'RSI overbought', indicator:'rsi', condition:'overbought', direction:'bear' } },
  // MACD
  { re: /macd.{0,20}(bull|cross.{0,5}up|positive|above.{0,5}signal)/i, rule: { label:'MACD bullish', indicator:'macd', condition:'bull', direction:'bull' } },
  { re: /macd.{0,20}(bear|cross.{0,5}down|negative|below.{0,5}signal)/i,rule: { label:'MACD bearish', indicator:'macd', condition:'bear', direction:'bear' } },
  { re: /(bull|positive).{0,10}macd/i,                        rule: { label:'MACD bullish',   indicator:'macd', condition:'bull',       direction:'bull' } },
  // EMA / MA trend
  { re: /price.{0,15}(above|over).{0,10}(ema|sma|ma|moving)/i,rule: { label:'Price > EMA',    indicator:'ema',  condition:'priceAbove', direction:'bull' } },
  { re: /price.{0,15}(below|under).{0,10}(ema|sma|ma|moving)/i,rule: { label:'Price < EMA',   indicator:'ema',  condition:'priceBelow', direction:'bear' } },
  { re: /(ema|ma).{0,10}(stack|align|bullish|uptrend)/i,      rule: { label:'EMA bullish stack',indicator:'ema', condition:'stack_bull', direction:'bull' } },
  { re: /(ema|ma).{0,10}(bearish|downtrend)/i,                rule: { label:'EMA bearish stack',indicator:'ema', condition:'stack_bear', direction:'bear' } },
  { re: /golden.?cross/i,                                     rule: { label:'Golden cross',   indicator:'ema',  condition:'golden',     direction:'bull' } },
  { re: /death.?cross/i,                                      rule: { label:'Death cross',    indicator:'ema',  condition:'death',      direction:'bear' } },
  // Stochastic
  { re: /stoch.{0,20}oversold|oversold.{0,10}stoch/i,         rule: { label:'Stoch oversold', indicator:'stoch',condition:'oversold',   direction:'bull' } },
  { re: /stoch.{0,20}overbought|overbought.{0,10}stoch/i,     rule: { label:'Stoch overbought',indicator:'stoch',condition:'overbought',direction:'bear' } },
  { re: /stoch.{0,15}(k.{0,5}cross|bull|cross.{0,5}up)/i,    rule: { label:'Stoch K cross up',indicator:'stoch',condition:'bull_cross',direction:'bull' } },
  // VWAP
  { re: /(price|close).{0,10}above.{0,10}vwap/i,             rule: { label:'Price > VWAP',   indicator:'vwap', condition:'above',      direction:'bull' } },
  { re: /(price|close).{0,10}below.{0,10}vwap/i,             rule: { label:'Price < VWAP',   indicator:'vwap', condition:'below',      direction:'bear' } },
  // Trend / Structure
  { re: /(uptrend|bull.{0,5}trend|trending.{0,5}up)/i,       rule: { label:'Uptrend',        indicator:'trend',condition:'up',         direction:'bull' } },
  { re: /(downtrend|bear.{0,5}trend|trending.{0,5}down)/i,   rule: { label:'Downtrend',      indicator:'trend',condition:'down',       direction:'bear' } },
  // SMC / ICT
  { re: /demand.?zone|bull.{0,10}order.?block/i,              rule: { label:'Demand zone/OB', indicator:'smc',  condition:'demand',     direction:'bull' } },
  { re: /supply.?zone|bear.{0,10}order.?block/i,              rule: { label:'Supply zone/OB', indicator:'smc',  condition:'supply',     direction:'bear' } },
  { re: /bull.{0,10}(fvg|fair.?value.?gap)/i,                rule: { label:'Bullish FVG',    indicator:'smc',  condition:'bull_fvg',   direction:'bull' } },
  { re: /bear.{0,10}(fvg|fair.?value.?gap)/i,                rule: { label:'Bearish FVG',    indicator:'smc',  condition:'bear_fvg',   direction:'bear' } },
  { re: /(bos|break.{0,5}structure).{0,15}bull/i,            rule: { label:'Bullish BOS',    indicator:'smc',  condition:'bull_bos',   direction:'bull' } },
  { re: /bull.{0,10}(bos|break.{0,5}structure)/i,            rule: { label:'Bullish BOS',    indicator:'smc',  condition:'bull_bos',   direction:'bull' } },
  // Volume
  { re: /volume.{0,15}(spike|surge|high|above.{0,5}average)/i,rule:{ label:'Volume spike',   indicator:'vol',  condition:'spike',      direction:'bull' } },
  // Candle patterns
  { re: /bull.{0,10}(engulf|candle|pin.?bar|hammer)/i,       rule: { label:'Bullish candle', indicator:'candle',condition:'bull',      direction:'bull' } },
  { re: /bear.{0,10}(engulf|candle|pin.?bar|shooting)/i,     rule: { label:'Bearish candle', indicator:'candle',condition:'bear',      direction:'bear' } },
  { re: /hammer/i,                                            rule: { label:'Hammer',         indicator:'candle',condition:'hammer',    direction:'bull' } },
  { re: /shooting.?star/i,                                    rule: { label:'Shooting star',  indicator:'candle',condition:'shooting', direction:'bear' } },
]

export function extractRules(text: string): Rule[] {
  const seen = new Set<string>()
  const rules: Rule[] = []
  for (const { re, rule } of RULE_PATTERNS) {
    if (re.test(text) && !seen.has(rule.label)) {
      seen.add(rule.label)
      rules.push(rule)
    }
  }
  return rules
}

// ── Evaluate one rule at candle i ─────────────────────────────────────────────
function evalRule(
  rule: Rule, i: number, candles: Candle[],
  ind: { rsi: number[]; macdL: number[]; macdS: number[]; e20: number[]; e50: number[]; e200: number[]; stochK: number[]; stochD: number[]; vwap: number[]; volAvg: number[] }
): boolean {
  const c = candles[i]
  switch (rule.indicator) {
    case 'rsi': {
      const v = ind.rsi[i]
      if (isNaN(v)) return false
      if (rule.condition === 'above50')    return v > 50
      if (rule.condition === 'below50')    return v < 50
      if (rule.condition === 'oversold')   return v < 35
      if (rule.condition === 'overbought') return v > 65
      return false
    }
    case 'macd': {
      const bull = ind.macdL[i] > ind.macdS[i]
      return rule.direction === 'bull' ? bull : !bull
    }
    case 'ema': {
      const { e20, e50, e200 } = ind
      if (rule.condition === 'priceAbove') return c.close > e20[i]
      if (rule.condition === 'priceBelow') return c.close < e20[i]
      if (rule.condition === 'stack_bull') return e20[i] > e50[i] && e50[i] > e200[i]
      if (rule.condition === 'stack_bear') return e20[i] < e50[i] && e50[i] < e200[i]
      if (rule.condition === 'golden')     return i > 0 && e50[i] > e200[i] && e50[i-1] <= e200[i-1]
      if (rule.condition === 'death')      return i > 0 && e50[i] < e200[i] && e50[i-1] >= e200[i-1]
      return false
    }
    case 'trend':
      return rule.direction === 'bull'
        ? ind.e20[i] > ind.e50[i] && ind.e50[i] > ind.e200[i]
        : ind.e20[i] < ind.e50[i] && ind.e50[i] < ind.e200[i]
    case 'stoch': {
      const { stochK: k, stochD: d } = ind
      if (rule.condition === 'oversold')   return k[i] < 25
      if (rule.condition === 'overbought') return k[i] > 75
      if (rule.condition === 'bull_cross') return i > 0 && k[i] > d[i] && k[i-1] <= d[i-1]
      return false
    }
    case 'vwap':
      return rule.direction === 'bull' ? c.close > ind.vwap[i] : c.close < ind.vwap[i]
    case 'smc': {
      // Approximate: use EMA stack as proxy for SMC bias
      const bull = ind.e20[i] > ind.e50[i]
      return rule.direction === 'bull' ? bull : !bull
    }
    case 'vol':
      return (c.volume ?? 0) > ind.volAvg[i] * 1.3
    case 'candle': {
      const body = Math.abs(c.close - c.open)
      const range = c.high - c.low || 0.0001
      if (rule.condition === 'bull')     return c.close > c.open && body / range > 0.5
      if (rule.condition === 'bear')     return c.close < c.open && body / range > 0.5
      if (rule.condition === 'hammer')   return c.close > c.open && (c.open - c.low) > body * 1.5
      if (rule.condition === 'shooting') return c.close < c.open && (c.high - c.open) > body * 1.5
      return false
    }
    default: return false
  }
}

// ── Core backtest engine ──────────────────────────────────────────────────────
export function runBacktest(candles: Candle[], text: string): BacktestResult {
  const rules = extractRules(text)

  if (rules.length === 0) {
    return { trades:0, winRate:0, profitFactor:0, maxDrawdown:0, avgWin:0, avgLoss:0,
      passed:false, failReason:'No recognisable indicator rules found in the strategy text.', rulesFound:[] }
  }

  if (candles.length < 60) {
    return { trades:0, winRate:0, profitFactor:0, maxDrawdown:0, avgWin:0, avgLoss:0,
      passed:false, failReason:'Need at least 60 candles of history to backtest.', rulesFound: rules.map(r => r.label) }
  }

  const closes = candles.map(c => c.close)
  const n = candles.length

  // Pre-compute indicators
  const rsiArr  = rsi(closes, 14)
  const { macd: macdL, signal: macdS } = macd(closes)
  const e20     = ema(closes, 20)
  const e50     = ema(closes, 50)
  const e200    = ema(closes, 200)
  const { k: stochK, d: stochD } = stoch(candles)
  const volAvg  = sma(candles.map(c => c.volume ?? 0), 20)

  let cumPV = 0, cumV = 0
  const vwap = candles.map(c => {
    const tp = (c.high + c.low + c.close) / 3; const v = c.volume ?? 1
    cumPV += tp * v; cumV += v; return cumPV / cumV
  })

  const ind = { rsi: rsiArr, macdL, macdS, e20, e50, e200, stochK, stochD, vwap, volAvg }

  const bullRules = rules.filter(r => r.direction === 'bull')
  const bearRules = rules.filter(r => r.direction === 'bear')
  const HOLD = Math.max(5, Math.min(15, Math.floor(n / 20))) // adaptive hold period

  const wins: number[] = [], losses: number[] = []
  let equity = 0, peak = 0, maxDD = 0

  for (let i = 30; i < n - HOLD - 1; i++) {
    const atrV = (atr(candles.slice(0, i + 1), 14).slice(-1)[0]) || 0.0001

    // Long entry
    if (bullRules.length > 0) {
      const fired = bullRules.filter(r => evalRule(r, i, candles, ind)).length
      if (fired >= Math.ceil(bullRules.length * 0.5)) {
        const pnl = (candles[i + HOLD].close - candles[i + 1].open) / atrV // in ATR units
        if (pnl > 0) wins.push(pnl); else losses.push(Math.abs(pnl))
        equity += pnl
        if (equity > peak) peak = equity
        const dd = peak - equity; if (dd > maxDD) maxDD = dd
      }
    }

    // Short entry
    if (bearRules.length > 0) {
      const fired = bearRules.filter(r => evalRule(r, i, candles, ind)).length
      if (fired >= Math.ceil(bearRules.length * 0.5)) {
        const pnl = (candles[i + 1].open - candles[i + HOLD].close) / atrV
        if (pnl > 0) wins.push(pnl); else losses.push(Math.abs(pnl))
        equity += pnl
        if (equity > peak) peak = equity
        const dd = peak - equity; if (dd > maxDD) maxDD = dd
      }
    }
  }

  const total = wins.length + losses.length
  if (total < 5) {
    return { trades: total, winRate:0, profitFactor:0, maxDrawdown:0, avgWin:0, avgLoss:0,
      passed:false, failReason:`Only ${total} signals fired — strategy may be too selective or rules too strict.`,
      rulesFound: rules.map(r => r.label) }
  }

  const winRate      = (wins.length / total) * 100
  const grossWin     = wins.reduce((s, v) => s + v, 0)
  const grossLoss    = losses.reduce((s, v) => s + v, 0) || 0.001
  const profitFactor = grossWin / grossLoss
  const avgWin       = wins.length  ? grossWin  / wins.length  : 0
  const avgLoss      = losses.length ? grossLoss / losses.length : 0

  const passed = winRate >= 52 && profitFactor >= 1.2
  const failReason = passed ? undefined
    : winRate < 52
      ? `Win rate ${winRate.toFixed(1)}% is below the 52% minimum (${wins.length}W / ${losses.length}L)`
      : `Profit factor ${profitFactor.toFixed(2)} is below 1.2 minimum`

  return { trades: total, winRate, profitFactor, maxDrawdown: maxDD, avgWin, avgLoss, passed, failReason,
    rulesFound: rules.map(r => r.label) }
}

// ── Forward test signal evaluation ───────────────────────────────────────────
export function evalForwardSignal(
  candles: Candle[], text: string
): 'long' | 'short' | null {
  if (candles.length < 30) return null
  const rules = extractRules(text)
  const closes = candles.map(c => c.close)
  const n = candles.length - 1

  const rsiArr  = rsi(closes, 14)
  const { macd: macdL, signal: macdS } = macd(closes)
  const e20     = ema(closes, 20)
  const e50     = ema(closes, 50)
  const e200    = ema(closes, 200)
  const { k: stochK, d: stochD } = stoch(candles)
  const volAvg  = sma(candles.map(c => c.volume ?? 0), 20)
  let cumPV = 0, cumV = 0
  const vwap = candles.map(c => {
    const tp = (c.high + c.low + c.close) / 3; const v = c.volume ?? 1
    cumPV += tp * v; cumV += v; return cumPV / cumV
  })
  const ind = { rsi: rsiArr, macdL, macdS, e20, e50, e200, stochK, stochD, vwap, volAvg }

  const bullRules = rules.filter(r => r.direction === 'bull')
  const bearRules = rules.filter(r => r.direction === 'bear')

  const bullFired = bullRules.length > 0
    ? bullRules.filter(r => evalRule(r, n, candles, ind)).length / bullRules.length
    : 0
  const bearFired = bearRules.length > 0
    ? bearRules.filter(r => evalRule(r, n, candles, ind)).length / bearRules.length
    : 0

  if (bullFired >= 0.5 && bullFired > bearFired) return 'long'
  if (bearFired >= 0.5 && bearFired > bullFired) return 'short'
  return null
}
