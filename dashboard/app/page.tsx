'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import AIPanel from '@/components/AIPanel'
import StrengthMeter from '@/components/StrengthMeter'
import StrategyFeed from '@/components/StrategyFeed'
import { analyseMarket, type Candle, type AIAnalysis } from '@/lib/indicators'

const TradingChart = dynamic(() => import('@/components/TradingChart'), { ssr: false })

const PAIR_GROUPS = [
  { label:'FX',     color:'#58a6ff', pairs:['EURUSD','GBPUSD','AUDUSD','NZDUSD','USDJPY','USDCHF','USDCAD','GBPJPY','EURJPY','EURCAD'] },
  { label:'METALS', color:'#ffd600', pairs:['XAUUSD','XAGUSD'] },
  { label:'CRYPTO', color:'#ff9800', pairs:['BTCUSD','ETHUSD'] },
]
const INTERVALS = ['1m','5m','15m','30m','1h','4h','1d']
const PIP: Record<string,number> = {
  USDJPY:0.01, GBPJPY:0.01, EURJPY:0.01, CADJPY:0.01, AUDJPY:0.01,
  XAUUSD:0.1, XAGUSD:0.001, BTCUSD:1.0, ETHUSD:0.1,
}
const PAIR_LABEL: Record<string,string> = {
  XAUUSD:'XAU/USD  Gold', XAGUSD:'XAG/USD  Silver',
  BTCUSD:'BTC/USD  Bitcoin', ETHUSD:'ETH/USD  Ethereum',
}
function getPairGroup(pair: string) {
  return PAIR_GROUPS.find(g => g.pairs.includes(pair)) ?? PAIR_GROUPS[0]
}
function fmtPrice(pair: string, price: number): string {
  if (['BTCUSD','ETHUSD','XAUUSD'].includes(pair)) return price.toFixed(2)
  if (pair === 'XAGUSD') return price.toFixed(3)
  if (['USDJPY','GBPJPY','EURJPY'].includes(pair)) return price.toFixed(3)
  return price.toFixed(5)
}

const REFRESH_SEC = 300

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
  const [customSig,  setCustomSig]  = useState({ bullish:0, bearish:0 })
  const [countdown,  setCountdown]  = useState(REFRESH_SEC)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timerRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cdRef    = useRef<any>(null)

  const pipSize   = PIP[pair] ?? 0.0001
  const pairGroup = getPairGroup(pair)

  const startCountdown = useCallback(() => {
    if (cdRef.current) clearInterval(cdRef.current)
    setCountdown(REFRESH_SEC)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cdRef.current = (window.setInterval as any)(
      () => setCountdown((c: number) => c <= 1 ? REFRESH_SEC : c - 1),
      1000
    )
  }, [])

  const fetchCandles = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/candles?symbol=${pair}&interval=${interval}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setCandles(data.candles)
      setAnalysis(analyseMarket(data.candles, pipSize))
      setLastUpdate(new Date().toLocaleTimeString())
      startCountdown()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }, [pair, interval, pipSize, startCountdown])

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    timerRef.current = (window.setInterval as any)(fetchCandles, REFRESH_SEC * 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchCandles])

  useEffect(() => () => { if (cdRef.current) clearInterval(cdRef.current) }, [])

  const effectiveBias = (() => {
    if (!analysis) return null
    const l = analysis.longScore  + customSig.bullish
    const s = analysis.shortScore + customSig.bearish
    return l > s ? 'BULLISH' : s > l ? 'BEARISH' : 'NEUTRAL'
  })()
  const biasCol = effectiveBias === 'BULLISH' ? '#00c853' : effectiveBias === 'BEARISH' ? '#ff1744' : '#ffd600'

  const cdMM = String(Math.floor(countdown / 60)).padStart(2,'0')
  const cdSS = String(countdown % 60).padStart(2,'0')
  const currentPrice = candles.length ? candles[candles.length - 1].close : null

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#0d1117' }}>

      {/* Row 1 — Logo + Pairs */}
      <nav style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 12px',
        background:'linear-gradient(180deg,#1a2030 0%,#161b22 100%)',
        borderBottom:'1px solid #30363d', flexShrink:0, flexWrap:'wrap' }}>

        <div style={{ display:'flex', alignItems:'center', gap:6, marginRight:4 }}>
          <div style={{ width:24, height:24, borderRadius:6,
            background:'linear-gradient(135deg,#58a6ff,#7b68ee)',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>🤖</div>
          <span style={{ color:'#e6edf3', fontWeight:900, fontSize:13, letterSpacing:'0.04em' }}>FOREX AI</span>
        </div>

        <div className="nav-divider" />

        {PAIR_GROUPS.map(group => (
          <div key={group.label} style={{ display:'flex', alignItems:'center', gap:3 }}>
            <span className="cat-label" style={{ color:group.color }}>{group.label}</span>
            {group.pairs.map(p => (
              <button key={p} className="btn-pair" onClick={() => setPair(p)} style={{
                background: pair===p ? group.color : '#21262d',
                color:      pair===p ? '#0d1117'   : '#8b949e',
                boxShadow:  pair===p ? `0 0 8px ${group.color}60` : 'none',
              }}>
                {p==='XAUUSD'?'🥇 GOLD':p==='XAGUSD'?'🥈 SILVER':p==='BTCUSD'?'₿ BTC':p==='ETHUSD'?'Ξ ETH':p}
              </button>
            ))}
          </div>
        ))}

        <div className="nav-divider" />

        {currentPrice && (
          <div style={{ fontSize:13, fontWeight:900, color:pairGroup.color,
            textShadow:`0 0 12px ${pairGroup.color}60`, minWidth:80 }}>
            {fmtPrice(pair, currentPrice)}
          </div>
        )}
      </nav>

      {/* Row 2 — Intervals + Controls */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 12px',
        background:'#161b22', borderBottom:'1px solid #21262d', flexShrink:0, flexWrap:'wrap' }}>

        <div style={{ display:'flex', gap:2 }}>
          {INTERVALS.map(iv => (
            <button key={iv} className="btn-interval" onClick={() => setInterval(iv)} style={{
              background: interval===iv ? '#30363d' : 'transparent',
              color:      interval===iv ? '#e6edf3'  : '#8b949e',
            }}>{iv}</button>
          ))}
        </div>

        <div className="nav-divider" />

        <label style={{ fontSize:10, color:'#8b949e', display:'flex', alignItems:'center', gap:4 }}>
          Account $
          <input type="number" value={account} onChange={e => setAccount(+e.target.value)}
            className="fx-input" style={{ width:72, fontSize:10 }} />
        </label>
        <label style={{ fontSize:10, color:'#8b949e', display:'flex', alignItems:'center', gap:4 }}>
          Risk %
          <input type="number" value={riskPct} onChange={e => setRiskPct(+e.target.value)}
            step={0.1} min={0.1} max={5}
            className="fx-input" style={{ width:48, fontSize:10 }} />
        </label>

        <div className="nav-divider" />

        <button className="btn-action" onClick={fetchCandles} disabled={loading}>
          {loading ? '⟳ Loading…' : '⟳ Refresh'}
        </button>

        {effectiveBias && (
          <div style={{ padding:'3px 12px', borderRadius:5, fontSize:11, fontWeight:800,
            background:biasCol+'18', border:`1px solid ${biasCol}50`, color:biasCol,
            letterSpacing:'0.06em', boxShadow:`0 0 12px ${biasCol}20` }}>
            {effectiveBias==='BULLISH'?'▲':effectiveBias==='BEARISH'?'▼':'●'} {effectiveBias}
            {(customSig.bullish+customSig.bearish)>0 &&
              <span style={{ fontSize:8, marginLeft:5, opacity:0.6 }}>+strat</span>}
          </div>
        )}

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10 }}>
          {lastUpdate && <span style={{ fontSize:9, color:'#444d56' }}>Updated {lastUpdate}</span>}
          <div className="countdown" title="Next auto-refresh">⟳ {cdMM}:{cdSS}</div>
        </div>
      </div>

      {error && (
        <div style={{ background:'#3d0d14', color:'#ff1744', padding:'5px 12px',
          fontSize:11, borderBottom:'1px solid #ff174440', display:'flex', alignItems:'center', gap:6 }}>
          <span>⚠</span> {error}
        </div>
      )}

      {/* Body */}
      <div style={{ display:'flex', flex:1, overflow:'hidden', gap:6, padding:6 }}>
        <div style={{ flex:1, minWidth:0, border:`1px solid ${pairGroup.color}30`,
          borderRadius:8, overflow:'hidden', background:'#0d1117',
          boxShadow:`0 0 20px ${pairGroup.color}08`, transition:'border-color 0.3s,box-shadow 0.3s' }}>
          {candles.length > 0
            ? <TradingChart candles={candles} pair={`${PAIR_LABEL[pair]??pair}  ·  ${interval}`} />
            : <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
                height:'100%', color:'#8b949e', fontSize:12, flexDirection:'column', gap:8 }}>
                {loading
                  ? <><div className="skeleton" style={{width:120,height:12}} />
                     <span className="animate-pulse" style={{fontSize:11,color:'#444d56'}}>Loading {pair}…</span></>
                  : <><span style={{fontSize:24}}>📊</span><span>Select a pair and click Refresh</span></>}
              </div>}
        </div>

        <div style={{ width:280, display:'flex', flexDirection:'column', gap:6, overflowY:'auto', flexShrink:0 }}>
          <AIPanel analysis={analysis} loading={loading && !analysis}
            pair={PAIR_LABEL[pair]??pair} account={account} riskPct={riskPct} pipSize={pipSize} />
          <StrengthMeter strength={strength} />
          <StrategyFeed candles={candles} onSignalsChange={setCustomSig} />
        </div>
      </div>

      <div style={{ padding:'3px 14px', background:'#161b22', borderTop:'1px solid #21262d',
        fontSize:9, color:'#444d56', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
        <span>Forex AI · SMC + ICT · Forex / Metals / Crypto · Backtest ≥ 72% WR · Auto-refresh 5 min</span>
        <span style={{color:'#30363d'}}>Educational use only — not financial advice</span>
      </div>
    </div>
  )
}
