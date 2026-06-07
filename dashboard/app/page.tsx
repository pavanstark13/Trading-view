'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import AIPanel from '@/components/AIPanel'
import StrengthMeter from '@/components/StrengthMeter'
import StrategyFeed from '@/components/StrategyFeed'
import { analyseMarket, type Candle, type AIAnalysis } from '@/lib/indicators'

const TradingChart = dynamic(() => import('@/components/TradingChart'), { ssr: false })

const PAIRS = ['EURUSD','GBPUSD','AUDUSD','NZDUSD','USDJPY','USDCHF','USDCAD','GBPJPY','EURJPY','EURCAD']
const INTERVALS = ['5m','15m','30m','1h','4h','1d']
const PIP: Record<string, number> = {
  USDJPY:0.01, GBPJPY:0.01, EURJPY:0.01, CADJPY:0.01, AUDJPY:0.01,
}

export default function Dashboard() {
  const [pair,       setPair]       = useState('EURUSD')
  const [interval,   setInterval]   = useState('1h')
  const [candles,    setCandles]    = useState<Candle[]>([])
  const [analysis,   setAnalysis]   = useState<AIAnalysis | null>(null)
  const [strength,   setStrength]   = useState<Record<string,number>>({USD:50,EUR:50,GBP:50,JPY:50,CHF:50,AUD:50,NZD:50,CAD:50})
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [account,    setAccount]    = useState(10000)
  const [riskPct,    setRiskPct]    = useState(1.0)
  const [lastUpdate, setLastUpdate] = useState('')
  const [customSig,  setCustomSig]  = useState({ bullish: 0, bearish: 0 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timerRef = useRef<any>(null)

  const pipSize = PIP[pair] ?? 0.0001

  const fetchCandles = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/candles?symbol=${pair}&interval=${interval}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setCandles(data.candles)
      setAnalysis(analyseMarket(data.candles, pipSize))
      setLastUpdate(new Date().toLocaleTimeString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally { setLoading(false) }
  }, [pair, interval, pipSize])

  const fetchStrength = useCallback(async () => {
    try {
      const res  = await fetch('/api/strength')
      const data = await res.json()
      if (data.strength) setStrength(data.strength)
    } catch { /* keep stale */ }
  }, [])

  useEffect(() => { fetchCandles(); fetchStrength() }, [fetchCandles, fetchStrength])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    timerRef.current = (window.setInterval as (fn: () => void, ms: number) => number)(fetchCandles, 60000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchCandles])

  // Merge custom strategy sentiment into bias display
  const effectiveBias = (() => {
    if (!analysis) return null
    const aiL = analysis.longScore, aiS = analysis.shortScore
    const cL = aiL + customSig.bullish, cS = aiS + customSig.bearish
    return cL > cS ? 'BULLISH' : cS > cL ? 'BEARISH' : 'NEUTRAL'
  })()

  const biasCol = effectiveBias === 'BULLISH' ? '#00c853' : effectiveBias === 'BEARISH' ? '#ff1744' : '#ffd600'

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#0d1117' }}>

      {/* ── Nav ── */}
      <nav style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 12px',
        background:'#161b22', borderBottom:'1px solid #30363d', flexShrink:0, flexWrap:'wrap' }}>

        <span style={{ color:'#58a6ff', fontWeight:800, fontSize:14, marginRight:4 }}>🤖 FOREX AI</span>

        {PAIRS.map(p => (
          <button key={p} onClick={() => setPair(p)} style={{
            padding:'3px 8px', fontSize:11, fontWeight:600, borderRadius:4,
            cursor:'pointer', border:'none', fontFamily:'inherit',
            background: pair === p ? '#58a6ff' : '#21262d',
            color:      pair === p ? '#0d1117'  : '#8b949e',
          }}>{p}</button>
        ))}

        <div style={{ display:'flex', gap:3, marginLeft:4 }}>
          {INTERVALS.map(iv => (
            <button key={iv} onClick={() => setInterval(iv)} style={{
              padding:'3px 7px', fontSize:10, fontWeight:600, borderRadius:4,
              cursor:'pointer', border:'none', fontFamily:'inherit',
              background: interval === iv ? '#30363d' : 'transparent',
              color:      interval === iv ? '#e6edf3' : '#8b949e',
            }}>{iv}</button>
          ))}
        </div>

        <div style={{ display:'flex', gap:8, alignItems:'center', marginLeft:'auto' }}>
          <label style={{ fontSize:10, color:'#8b949e', display:'flex', alignItems:'center', gap:4 }}>
            Account $
            <input type="number" value={account} onChange={e => setAccount(+e.target.value)}
              style={{ width:72, padding:'2px 5px', background:'#21262d',
                border:'1px solid #30363d', borderRadius:4, color:'#e6edf3',
                fontSize:10, fontFamily:'inherit' }} />
          </label>
          <label style={{ fontSize:10, color:'#8b949e', display:'flex', alignItems:'center', gap:4 }}>
            Risk %
            <input type="number" value={riskPct} onChange={e => setRiskPct(+e.target.value)}
              step={0.1} min={0.1} max={5}
              style={{ width:48, padding:'2px 5px', background:'#21262d',
                border:'1px solid #30363d', borderRadius:4, color:'#e6edf3',
                fontSize:10, fontFamily:'inherit' }} />
          </label>
        </div>

        <button onClick={fetchCandles} disabled={loading} style={{
          padding:'3px 10px', fontSize:10, borderRadius:4, cursor:'pointer',
          background:'#21262d', border:'1px solid #30363d', color:'#e6edf3',
          fontFamily:'inherit', opacity: loading ? 0.5 : 1,
        }}>{loading ? '⟳ …' : '⟳ Refresh'}</button>

        {effectiveBias && (
          <div style={{ padding:'3px 10px', borderRadius:4, fontSize:11, fontWeight:700,
            background: biasCol + '22', border:`1px solid ${biasCol}44`, color: biasCol }}>
            {effectiveBias}
            {customSig.bullish + customSig.bearish > 0 &&
              <span style={{ fontSize:9, marginLeft:4, opacity:0.7 }}>+custom</span>}
          </div>
        )}

        {lastUpdate && <div style={{ fontSize:10, color:'#444d56' }}>{lastUpdate}</div>}
      </nav>

      {error && (
        <div style={{ background:'#3d0d14', color:'#ff1744', padding:'5px 12px',
          fontSize:11, borderBottom:'1px solid #ff174440' }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ display:'flex', flex:1, overflow:'hidden', gap:6, padding:6 }}>

        {/* Chart */}
        <div style={{ flex:1, minWidth:0, border:'1px solid #30363d',
          borderRadius:8, overflow:'hidden', background:'#0d1117' }}>
          {candles.length > 0
            ? <TradingChart candles={candles} pair={`${pair}  ·  ${interval}`} />
            : <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
                height:'100%', color:'#8b949e', fontSize:12 }}>
                {loading
                  ? <span className="animate-pulse">Loading chart data for {pair}…</span>
                  : 'No data — click Refresh'}
              </div>
          }
        </div>

        {/* Sidebar */}
        <div style={{ width:276, display:'flex', flexDirection:'column',
          gap:6, overflowY:'auto', flexShrink:0 }}>
          <AIPanel analysis={analysis} loading={loading && !analysis}
            pair={pair} account={account} riskPct={riskPct} pipSize={pipSize} />
          <StrengthMeter strength={strength} />
          <StrategyFeed onSignalsChange={setCustomSig} />
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding:'3px 12px', background:'#161b22',
        borderTop:'1px solid #30363d', fontSize:9, color:'#444d56',
        display:'flex', justifyContent:'space-between', flexShrink:0 }}>
        <span>Forex AI · SMC + ICT + Strategy Feed · Data: Yahoo Finance · Auto-refresh 60s</span>
        <span>Educational use only — not financial advice</span>
      </div>
    </div>
  )
}
