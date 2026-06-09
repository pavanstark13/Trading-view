'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { IndicatorConfig } from '@/components/TradingChart'
import { DEFAULT_INDICATORS } from '@/components/TradingChart'
import type { Candle, AIAnalysis } from '@/lib/indicators'
import { analyseMarket } from '@/lib/indicators'
import { INDIA_MAP } from '@/lib/indianMarket'
import { SIGNAL_MAP } from '@/lib/signalMap'

const TradingChart  = dynamic(() => import('@/components/TradingChart'),   { ssr: false })
const IndicatorPanel = dynamic(() => import('@/components/IndicatorPanel'), { ssr: false })

// ── Pair groups ───────────────────────────────────────────────────────────────
const FX        = ['EURUSD','GBPUSD','AUDUSD','NZDUSD','USDJPY','USDCHF','USDCAD','GBPJPY','EURJPY','EURCAD']
const METALS    = ['XAUUSD','XAGUSD']
const CRYPTO    = ['BTCUSD','ETHUSD']
const NSE_INDEX = ['NIFTY','BANKNIFTY','FINNIFTY','MIDCPNIFTY']
const NSE_STOCK = ['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK','SBIN','WIPRO','AXISBANK','BAJFINANCE','TATAMOTORS','LT','MARUTI','SUNPHARMA','ADANIENT']

const GROUP_COLORS: Record<string, string> = {
  FX: 'var(--os-blue)', METALS: 'var(--os-amber)', CRYPTO: 'var(--os-purple)',
  'NSE IDX': 'var(--os-cyan)', 'NSE F&O': 'var(--os-green)',
}

const INTERVALS = ['1m','5m','15m','30m','1h','4h','1d']

const WATCHLIST = ['NIFTY','BANKNIFTY','RELIANCE','TCS','INFY','HDFCBANK','EURUSD','XAUUSD','BTCUSD']

// Mock watchlist prices
const MOCK_PRICES: Record<string, { price: number; change: number; exchange: string }> = {
  NIFTY:     { price: 24312.55, change: +0.87, exchange: 'NSE' },
  BANKNIFTY: { price: 52140.20, change: +1.12, exchange: 'NSE' },
  RELIANCE:  { price: 2847.35,  change: -0.34, exchange: 'NSE' },
  TCS:       { price: 3621.80,  change: +0.52, exchange: 'NSE' },
  INFY:      { price: 1742.60,  change: +1.24, exchange: 'NSE' },
  HDFCBANK:  { price: 1623.45,  change: -0.18, exchange: 'NSE' },
  EURUSD:    { price: 1.08432,  change: +0.21, exchange: 'FX'  },
  XAUUSD:    { price: 2341.50,  change: +0.67, exchange: 'FX'  },
  BTCUSD:    { price: 67234.00, change: -1.42, exchange: 'CRYPTO' },
}

function fmt(p: number, pair: string): string {
  if (p >= 10000) return p.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  if (p >= 100)   return p.toFixed(2)
  if (p >= 1)     return p.toFixed(4)
  return p.toFixed(5)
}

// ── AI Signal Panel ───────────────────────────────────────────────────────────
function AISignalPanel({ analysis, pair, onBuy, onSell }: { analysis: AIAnalysis | null; pair: string; onBuy: () => void; onSell: () => void }) {
  if (!analysis) return (
    <div className="os-card" style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
      <span className="os-live-dot" style={{ background: 'var(--os-blue)' }} />
      <span style={{ fontSize: 10, color: 'var(--os-t3)' }}>Analysing market…</span>
    </div>
  )

  const bias = analysis.bias
  const biasColor = bias === 'BULLISH' ? 'var(--os-green)' : bias === 'BEARISH' ? 'var(--os-red)' : 'var(--os-amber)'
  const score = analysis.longScore + analysis.shortScore
  const pct = Math.round((Math.max(analysis.longScore, analysis.shortScore) / analysis.maxScore) * 100)

  return (
    <div className="os-card" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--os-t3)' }}>AI SIGNAL</span>
        <span className={`os-badge ${bias === 'BULLISH' ? 'os-badge-green' : bias === 'BEARISH' ? 'os-badge-red' : 'os-badge-amber'}`} style={{ fontSize: 9 }}>
          {bias}
        </span>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 9, color: 'var(--os-t3)' }}>{Math.max(analysis.longScore, analysis.shortScore)}/{analysis.maxScore} signals</span>
          <span style={{ fontSize: 9, color: biasColor, fontFamily: 'var(--font-mono)' }}>{pct}%</span>
        </div>
        <div className="os-progress"><div className="os-progress-fill" style={{ width: `${pct}%`, background: biasColor }} /></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
        <div><span style={{ color: 'var(--os-t3)', fontSize: 9 }}>ENTRY </span><span style={{ color: 'var(--os-t1)' }}>{fmt(analysis.entry, pair)}</span></div>
        <div><span style={{ color: 'var(--os-t3)', fontSize: 9 }}>STOP </span><span style={{ color: 'var(--os-red)' }}>{fmt(analysis.longSL, pair)}</span></div>
        <div><span style={{ color: 'var(--os-t3)', fontSize: 9 }}>TP1 </span><span style={{ color: 'var(--os-green)' }}>{fmt(analysis.longTP1, pair)}</span></div>
        <div><span style={{ color: 'var(--os-t3)', fontSize: 9 }}>TP2 </span><span style={{ color: 'var(--os-green)' }}>{fmt(analysis.longTP2, pair)}</span></div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
        <button className="os-btn-buy" style={{ flex: 1, fontSize: 10, padding: '4px 0' }} onClick={onBuy}>BUY</button>
        <button className="os-btn-sell" style={{ flex: 1, fontSize: 10, padding: '4px 0' }} onClick={onSell}>SELL</button>
      </div>
    </div>
  )
}

// ── Watchlist Panel ───────────────────────────────────────────────────────────
function WatchlistPanel({ activePair, onSelect }: { activePair: string; onSelect: (p: string) => void }) {
  return (
    <div className="os-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
      <div className="os-panel-header" style={{ padding: '7px 10px', flexShrink: 0 }}>WATCHLIST</div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {WATCHLIST.map(sym => {
          const d = MOCK_PRICES[sym]
          if (!d) return null
          const isActive = sym === activePair
          const isUp = d.change >= 0
          return (
            <div
              key={sym}
              onClick={() => onSelect(sym)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '5px 10px', cursor: 'pointer',
                background: isActive ? 'var(--os-active)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--os-blue)' : '2px solid transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--os-hover)' }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--os-t1)' }}>{sym}</div>
                <div style={{ fontSize: 8, color: 'var(--os-t3)' }}>{d.exchange}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--os-t1)' }}>{fmt(d.price, sym)}</div>
                <span className={`os-badge ${isUp ? 'os-badge-green' : 'os-badge-red'}`} style={{ fontSize: 8 }}>
                  {isUp ? '+' : ''}{d.change.toFixed(2)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Market Stats ──────────────────────────────────────────────────────────────
function MarketStats({ analysis }: { analysis: AIAnalysis | null }) {
  const rsi = analysis ? Math.round(50 + (analysis.longScore - analysis.shortScore) * 2.5) : null
  const rsiColor = !rsi ? 'var(--os-t3)' : rsi < 30 ? 'var(--os-green)' : rsi > 70 ? 'var(--os-red)' : 'var(--os-t2)'
  const atr = analysis ? (analysis.atrValue * 10000).toFixed(1) : '--'

  return (
    <div className="os-card" style={{ padding: '8px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 8, color: 'var(--os-t3)', letterSpacing: '0.05em', marginBottom: 2 }}>RSI</div>
        <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 700, color: rsiColor }}>{rsi ?? '--'}</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 8, color: 'var(--os-t3)', letterSpacing: '0.05em', marginBottom: 2 }}>ATR</div>
        <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--os-t2)' }}>{atr}</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 8, color: 'var(--os-t3)', letterSpacing: '0.05em', marginBottom: 2 }}>VOL</div>
        <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--os-cyan)' }}>1.2x</div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TerminalView() {
  const [pair, setPair]             = useState('EURUSD')
  const [iv, setIv]                 = useState('15m')
  const [candles, setCandles]       = useState<Candle[]>([])
  const [analysis, setAnalysis]     = useState<AIAnalysis | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [indicators, setIndicators] = useState<IndicatorConfig>(DEFAULT_INDICATORS)
  const [countdown, setCountdown]   = useState(300)
  const countdownRef = useRef(300)

  const fetchCandles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/candles?symbol=${pair}&interval=${iv}`)
      const json = await res.json()
      const data: Candle[] = json.candles ?? []
      setCandles(data)
      if (json.error) {
        setError(`Data unavailable: ${json.error}`)
      } else if (data.length === 0) {
        setError(json.warning ?? 'No candle data returned')
      } else if (data.length >= 50) {
        const a = analyseMarket(data, pair.includes('JPY') ? 0.01 : 0.0001)
        setAnalysis(a)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed')
    } finally {
      setLoading(false)
    }
  }, [pair, iv])

  useEffect(() => { fetchCandles() }, [fetchCandles])

  // Countdown + auto-refresh
  useEffect(() => {
    countdownRef.current = 300
    setCountdown(300)
    const id = setInterval(() => {
      countdownRef.current -= 1
      setCountdown(countdownRef.current)
      if (countdownRef.current <= 0) {
        fetchCandles()
        countdownRef.current = 300
        setCountdown(300)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [pair, iv, fetchCandles])

  const livePrice = candles.length > 0 ? candles[candles.length - 1].close : null

  const groups: { label: string; pairs: string[] }[] = [
    { label: 'FX',      pairs: FX       },
    { label: 'METALS',  pairs: METALS   },
    { label: 'CRYPTO',  pairs: CRYPTO   },
    { label: 'NSE IDX', pairs: NSE_INDEX },
    { label: 'NSE F&O', pairs: NSE_STOCK },
  ]

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top strip */}
      <div style={{ height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', background: 'var(--os-surface)', borderBottom: '1px solid var(--os-border)', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', padding: '0 8px', scrollbarWidth: 'none' }}>
          {groups.map(g => (
            <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: GROUP_COLORS[g.label] || 'var(--os-t3)', padding: '1px 5px', background: `${GROUP_COLORS[g.label] || 'var(--os-t3)'}22`, borderRadius: 3, letterSpacing: '0.06em', flexShrink: 0 }}>
                {g.label}
              </span>
              {g.pairs.map(p => (
                <button
                  key={p}
                  onClick={() => setPair(p)}
                  style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 3, cursor: 'pointer', border: 'none', fontFamily: 'var(--font-mono)',
                    background: pair === p ? GROUP_COLORS[g.label] || 'var(--os-active)' : 'var(--os-surface2)',
                    color: pair === p ? '#fff' : 'var(--os-t2)',
                    fontWeight: pair === p ? 700 : 400,
                    transition: 'all 0.1s',
                  }}
                >
                  {p}
                </button>
              ))}
              <span style={{ width: 1, height: 16, background: 'var(--os-border)', flexShrink: 0, margin: '0 2px' }} />
            </div>
          ))}
        </div>
        {livePrice && (
          <div style={{ padding: '0 12px', flexShrink: 0, textAlign: 'right' }}>
            <span style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 700, color: GROUP_COLORS[
              NSE_INDEX.includes(pair) || NSE_STOCK.includes(pair) ? (NSE_INDEX.includes(pair) ? 'NSE IDX' : 'NSE F&O') :
              METALS.includes(pair) ? 'METALS' : CRYPTO.includes(pair) ? 'CRYPTO' : 'FX'
            ] || 'var(--os-t1)' }}>
              {fmt(livePrice, pair)}
            </span>
            {loading && <span style={{ fontSize: 9, color: 'var(--os-t3)', marginLeft: 6 }}>↻</span>}
          </div>
        )}
      </div>

      {/* Interval selector */}
      <div style={{ height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', background: 'var(--os-surface)', borderBottom: '1px solid var(--os-border)' }}>
        {INTERVALS.map(i => (
          <button
            key={i}
            onClick={() => setIv(i)}
            style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 3, cursor: 'pointer', border: '1px solid',
              borderColor: iv === i ? 'var(--os-blue)' : 'transparent',
              background: iv === i ? 'rgba(59,130,246,0.12)' : 'transparent',
              color: iv === i ? 'var(--os-blue)' : 'var(--os-t3)',
              fontFamily: 'var(--font-mono)', fontWeight: iv === i ? 700 : 400,
            }}
          >{i}</button>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--os-t3)', fontFamily: 'var(--font-mono)' }}>
          Refresh in {countdown}s
        </div>
      </div>

      {/* Main body */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
        {/* Chart area */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {error && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--os-red)', background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
              ⚠ {error} — <button onClick={fetchCandles} style={{ color: 'var(--os-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}>Retry</button>
            </div>
          )}
          {candles.length > 0 ? (
            <div style={{ flex: 1, position: 'relative' }}>
              <TradingChart candles={candles} pair={pair} indicators={indicators} />
              <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
                <IndicatorPanel indicators={indicators} onChange={(key, value) => setIndicators(prev => ({ ...prev, [key]: value }))} />
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
              {loading ? (
                <>
                  <span className="os-live-dot" style={{ background: 'var(--os-blue)', width: 8, height: 8 }} />
                  <span style={{ fontSize: 11, color: 'var(--os-t3)' }}>Loading candles for {pair}…</span>
                </>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--os-t3)' }}>No data — select a pair</span>
              )}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, padding: 4, background: 'var(--os-surface)', borderLeft: '1px solid var(--os-border)', overflowY: 'auto' }}>
          <AISignalPanel analysis={analysis} pair={pair} onBuy={() => {}} onSell={() => {}} />
          <WatchlistPanel activePair={pair} onSelect={setPair} />
          <MarketStats analysis={analysis} />
        </div>
      </div>
    </div>
  )
}
