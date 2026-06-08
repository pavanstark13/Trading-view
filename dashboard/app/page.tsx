'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import AIPanel from '@/components/AIPanel'
import StrengthMeter from '@/components/StrengthMeter'
import StrategyFeed from '@/components/StrategyFeed'
import { analyseMarket, type Candle, type AIAnalysis } from '@/lib/indicators'

const TradingChart = dynamic(() => import('@/components/TradingChart'), { ssr: false })

// ── Config ────────────────────────────────────────────────────────────────────
const PAIR_GROUPS = {
  FX:     ['EURUSD','GBPUSD','AUDUSD','NZDUSD','USDJPY','USDCHF','USDCAD','GBPJPY','EURJPY','EURCAD'],
  Metals: ['XAUUSD','XAGUSD'],
  Crypto: ['BTCUSD','ETHUSD'],
}
const ALL_PAIRS = [...PAIR_GROUPS.FX, ...PAIR_GROUPS.Metals, ...PAIR_GROUPS.Crypto]

const INTERVALS = ['1m','5m','15m','30m','1h','4h','1d']

const PIP_SIZE: Record<string, number> = {
  USDJPY: 0.01, GBPJPY: 0.01, EURJPY: 0.01, CADJPY: 0.01, AUDJPY: 0.01,
  XAUUSD: 0.1, XAGUSD: 0.001,
  BTCUSD: 1.0, ETHUSD: 0.1,
}

const PAIR_DECIMAL: Record<string, number> = {
  USDJPY: 3, GBPJPY: 3, EURJPY: 3,
  XAUUSD: 2, XAGUSD: 4,
  BTCUSD: 0, ETHUSD: 2,
}

const PAIR_CAT: Record<string, 'FX' | 'Metals' | 'Crypto'> = {
  ...Object.fromEntries(PAIR_GROUPS.FX.map(p => [p, 'FX' as const])),
  ...Object.fromEntries(PAIR_GROUPS.Metals.map(p => [p, 'Metals' as const])),
  ...Object.fromEntries(PAIR_GROUPS.Crypto.map(p => [p, 'Crypto' as const])),
}

const CAT_COLOR = { FX: '#58a6ff', Metals: '#ffd600', Crypto: '#ff9d00' }

const REFRESH_SEC = 300

function fmtPrice(pair: string, price: number) {
  const dec = PAIR_DECIMAL[pair] ?? 5
  return price.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [pair,       setPair]       = useState('EURUSD')
  const [interval,   setInterval_]  = useState('1h')
  const [candles,    setCandles]    = useState<Candle[]>([])
  const [analysis,   setAnalysis]   = useState<AIAnalysis | null>(null)
  const [strength,   setStrength]   = useState<Record<string,number>>({USD:50,EUR:50,GBP:50,JPY:50,CHF:50,AUD:50,NZD:50,CAD:50})
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [account,    setAccount]    = useState(10000)
  const [riskPct,    setRiskPct]    = useState(1.0)
  const [livePrice,  setLivePrice]  = useState<number | null>(null)
  const [countdown,  setCountdown]  = useState(REFRESH_SEC)
  const [lastUpdate, setLastUpdate] = useState('')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refreshTimerRef  = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const countdownRef     = useRef<any>(null)
  const countdownVal     = useRef(REFRESH_SEC)

  const pipSize = PIP_SIZE[pair] ?? 0.0001
  const cat = PAIR_CAT[pair] ?? 'FX'

  const fetchCandles = useCallback(async (p = pair, iv = interval) => {
    setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/candles?symbol=${p}&interval=${iv}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const cds: Candle[] = data.candles
      setCandles(cds)
      setAnalysis(analyseMarket(cds, PIP_SIZE[p] ?? 0.0001))
      setLivePrice(cds[cds.length - 1]?.close ?? null)
      setLastUpdate(new Date().toLocaleTimeString())
      countdownVal.current = REFRESH_SEC
      setCountdown(REFRESH_SEC)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally { setLoading(false) }
  }, [pair, interval])

  const fetchStrength = useCallback(async () => {
    try {
      const res  = await fetch('/api/strength')
      const data = await res.json()
      if (data.strength) setStrength(data.strength)
    } catch { /* keep stale */ }
  }, [])

  // Initial load + whenever pair/interval changes
  useEffect(() => {
    fetchCandles(pair, interval)
    fetchStrength()
  }, [pair, interval]) // eslint-disable-line react-hooks/exhaustive-deps

  // 5-minute auto-refresh
  useEffect(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    refreshTimerRef.current = (window.setInterval as (fn: () => void, ms: number) => number)(() => {
      fetchCandles()
      fetchStrength()
    }, REFRESH_SEC * 1000)
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current) }
  }, [fetchCandles, fetchStrength])

  // Countdown timer
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = (window.setInterval as (fn: () => void, ms: number) => number)(() => {
      countdownVal.current = Math.max(0, countdownVal.current - 1)
      setCountdown(countdownVal.current)
    }, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [])

  const handlePairChange = (p: string) => {
    setPair(p)
    setCandles([])
    setAnalysis(null)
    setLivePrice(null)
  }

  const biasCol = analysis?.bias === 'BULLISH' ? '#00c853' : analysis?.bias === 'BEARISH' ? '#ff1744' : '#ffd600'
  const catCol  = CAT_COLOR[cat]

  const mm = String(Math.floor(countdown / 60)).padStart(2, '0')
  const ss = String(countdown % 60).padStart(2, '0')

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#0d1117', overflow:'hidden' }}>

      {/* ── Nav Row 1: Logo + Pairs ── */}
      <nav style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px',
        background:'#161b22', borderBottom:'1px solid #21262d', flexShrink:0, flexWrap:'wrap' }}>

        <span style={{ color:'#58a6ff', fontWeight:800, fontSize:13, marginRight:6, letterSpacing:'-0.02em' }}>
          🤖 FOREX AI
        </span>

        {/* FX */}
        <span style={{ fontSize:9, color:'#58a6ff88', fontWeight:700, letterSpacing:'0.1em', marginRight:2 }}>FX</span>
        {PAIR_GROUPS.FX.map(p => (
          <button key={p} onClick={() => handlePairChange(p)} style={{
            padding:'3px 7px', fontSize:10, fontWeight:600, borderRadius:4,
            cursor:'pointer', border:'none', fontFamily:'inherit',
            background: pair === p ? '#58a6ff' : 'transparent',
            color:      pair === p ? '#0d1117'  : '#6e7681',
          }}>{p}</button>
        ))}

        {/* Metals */}
        <span style={{ fontSize:9, color:'#ffd60088', fontWeight:700, letterSpacing:'0.1em', margin:'0 2px' }}>METALS</span>
        {PAIR_GROUPS.Metals.map(p => (
          <button key={p} onClick={() => handlePairChange(p)} style={{
            padding:'3px 7px', fontSize:10, fontWeight:600, borderRadius:4,
            cursor:'pointer', border:'none', fontFamily:'inherit',
            background: pair === p ? '#ffd600' : 'transparent',
            color:      pair === p ? '#0d1117'  : '#6e7681',
          }}>{p}</button>
        ))}

        {/* Crypto */}
        <span style={{ fontSize:9, color:'#ff9d0088', fontWeight:700, letterSpacing:'0.1em', margin:'0 2px' }}>CRYPTO</span>
        {PAIR_GROUPS.Crypto.map(p => (
          <button key={p} onClick={() => handlePairChange(p)} style={{
            padding:'3px 7px', fontSize:10, fontWeight:600, borderRadius:4,
            cursor:'pointer', border:'none', fontFamily:'inherit',
            background: pair === p ? '#ff9d00' : 'transparent',
            color:      pair === p ? '#0d1117'  : '#6e7681',
          }}>{p}</button>
        ))}

        {/* Live price */}
        {livePrice !== null && (
          <div style={{ marginLeft:'auto', padding:'3px 10px', borderRadius:4, fontSize:12, fontWeight:800,
            background: catCol + '18', border:`1px solid ${catCol}44`, color: catCol }}>
            {fmtPrice(pair, livePrice)}
          </div>
        )}
      </nav>

      {/* ── Nav Row 2: Intervals + Controls ── */}
      <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px',
        background:'#0d1117', borderBottom:'1px solid #21262d', flexShrink:0, flexWrap:'wrap' }}>

        {/* Intervals */}
        <div style={{ display:'flex', gap:2 }}>
          {INTERVALS.map(iv => (
            <button key={iv} onClick={() => setInterval_(iv)} style={{
              padding:'3px 8px', fontSize:10, fontWeight:600, borderRadius:4,
              cursor:'pointer', border:'none', fontFamily:'inherit',
              background: interval === iv ? '#21262d' : 'transparent',
              color:      interval === iv ? '#e6edf3'  : '#6e7681',
            }}>{iv}</button>
          ))}
        </div>

        <div style={{ width:1, height:16, background:'#21262d', margin:'0 2px' }} />

        {/* Account & Risk */}
        <label style={{ fontSize:10, color:'#8b949e', display:'flex', alignItems:'center', gap:4 }}>
          $
          <input type="number" value={account} onChange={e => setAccount(+e.target.value)}
            style={{ width:68, padding:'2px 5px', background:'#21262d',
              border:'1px solid #30363d', borderRadius:4, color:'#e6edf3',
              fontSize:10, fontFamily:'inherit' }} />
        </label>
        <label style={{ fontSize:10, color:'#8b949e', display:'flex', alignItems:'center', gap:4 }}>
          R%
          <input type="number" value={riskPct} onChange={e => setRiskPct(+e.target.value)}
            step={0.1} min={0.1} max={10}
            style={{ width:42, padding:'2px 5px', background:'#21262d',
              border:'1px solid #30363d', borderRadius:4, color:'#e6edf3',
              fontSize:10, fontFamily:'inherit' }} />
        </label>

        <div style={{ width:1, height:16, background:'#21262d', margin:'0 2px' }} />

        {/* Refresh button */}
        <button onClick={() => fetchCandles()} disabled={loading} style={{
          padding:'3px 10px', fontSize:10, borderRadius:4, cursor:'pointer',
          background:'#21262d', border:'1px solid #30363d', color:'#e6edf3',
          fontFamily:'inherit', opacity: loading ? 0.5 : 1,
        }}>{loading ? '⟳ …' : '⟳ Refresh'}</button>

        {/* Bias badge */}
        {analysis && (
          <div style={{ padding:'3px 10px', borderRadius:4, fontSize:11, fontWeight:800,
            background: biasCol + '18', border:`1px solid ${biasCol}44`, color: biasCol,
            letterSpacing: '0.06em' }}>
            {analysis.bias}
          </div>
        )}

        {/* Countdown */}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, fontSize:10 }}>
          {lastUpdate && <span style={{ color:'#444d56' }}>{lastUpdate}</span>}
          <div style={{
            padding:'2px 8px', borderRadius:4, fontSize:10, fontWeight:700, fontVariantNumeric:'tabular-nums',
            background: countdown < 30 ? '#3d200d' : '#21262d',
            color: countdown < 30 ? '#ff6d00' : '#8b949e',
            border: `1px solid ${countdown < 30 ? '#ff6d0044' : '#30363d'}`,
          }}>
            ⟳ {mm}:{ss}
          </div>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ background:'#3d0d14', color:'#ff1744', padding:'5px 12px',
          fontSize:11, borderBottom:'1px solid #ff174440', flexShrink:0 }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ display:'flex', flex:1, overflow:'hidden', gap:6, padding:6 }}>

        {/* Chart */}
        <div style={{ flex:1, minWidth:0,
          border:`1px solid ${catCol}55`,
          borderRadius:8, overflow:'hidden', background:'#0d1117',
          boxShadow: `0 0 16px ${catCol}18` }}>
          {candles.length > 0
            ? <TradingChart candles={candles} pair={`${pair}  ·  ${interval}`} />
            : <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
                height:'100%', color:'#8b949e', fontSize:12 }}>
                {loading
                  ? <span className="animate-pulse">⟳ Loading {pair} {interval}…</span>
                  : 'No data — click Refresh'}
              </div>
          }
        </div>

        {/* Sidebar */}
        <div style={{ width:280, display:'flex', flexDirection:'column',
          gap:5, overflowY:'auto', flexShrink:0 }}>
          <AIPanel analysis={analysis} loading={loading && !analysis}
            pair={pair} account={account} riskPct={riskPct} pipSize={pipSize} />
          <StrategyFeed candles={candles} pipSize={pipSize} />
          <StrengthMeter strength={strength} />
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding:'3px 12px', background:'#161b22',
        borderTop:'1px solid #21262d', fontSize:9, color:'#444d56',
        display:'flex', justifyContent:'space-between', flexShrink:0 }}>
        <span>Forex AI · SMC + ICT + 7 Strategies · {ALL_PAIRS.length} pairs · Data: Yahoo Finance · 5-min refresh</span>
        <span>Educational use only — not financial advice</span>
      </div>
    </div>
  )
}
