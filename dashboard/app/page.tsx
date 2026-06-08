'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import AIPanel from '@/components/AIPanel'
import StrengthMeter from '@/components/StrengthMeter'
import StrategyFeed from '@/components/StrategyFeed'
import { analyseMarket, type Candle, type AIAnalysis } from '@/lib/indicators'

const TradingChart = dynamic(() => import('@/components/TradingChart'), { ssr: false })

// ── Config ────────────────────────────────────────────────────────────────────
const FX     = ['EURUSD','GBPUSD','AUDUSD','NZDUSD','USDJPY','USDCHF','USDCAD','GBPJPY','EURJPY','EURCAD']
const METALS = ['XAUUSD','XAGUSD']
const CRYPTO = ['BTCUSD','ETHUSD']
const ALL    = [...FX, ...METALS, ...CRYPTO]

const INTERVALS = ['1m','5m','15m','30m','1h','4h','1d']

const PIP: Record<string, number> = {
  USDJPY:0.01, GBPJPY:0.01, EURJPY:0.01,
  XAUUSD:0.1,  XAGUSD:0.001,
  BTCUSD:1.0,  ETHUSD:0.1,
}
const DEC: Record<string, number> = {
  USDJPY:3, GBPJPY:3, EURJPY:3,
  XAUUSD:2, XAGUSD:4,
  BTCUSD:0, ETHUSD:2,
}
const CAT = (p: string): 'fx' | 'metals' | 'crypto' =>
  METALS.includes(p) ? 'metals' : CRYPTO.includes(p) ? 'crypto' : 'fx'

const CAT_COLOR: Record<string, string> = {
  fx: 'var(--blue)', metals: 'var(--amber)', crypto: '#ff9d00',
}

const REFRESH_SEC = 300

function fmt(pair: string, price: number) {
  const d = DEC[pair] ?? 5
  return price.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function ChartSkeleton({ loading, error, pair }: { loading: boolean; error: string; pair: string }) {
  if (error) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      height:'100%', gap:12 }}>
      <div style={{ fontSize:28, opacity:0.4 }}>⚠</div>
      <div style={{ color:'var(--bear)', fontSize:11 }}>{error}</div>
    </div>
  )
  if (loading) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      height:'100%', gap:10 }}>
      <div className="animate-pulse" style={{ fontSize:11, color:'var(--text-muted)' }}>
        Loading {pair}…
      </div>
      <div style={{ display:'flex', gap:3, alignItems:'flex-end', height:32 }}>
        {[18,28,22,35,25,20,30,22,28,16,32,24,26].map((h,i) => (
          <div key={i} className="animate-pulse" style={{
            width:6, height:h, borderRadius:2,
            background:'var(--border-hi)', opacity:0.3 + (i%3)*0.2,
            animationDelay: `${i*80}ms`,
          }} />
        ))}
      </div>
    </div>
  )
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100%', color:'var(--text-muted)', fontSize:11 }}>
      Select a pair to begin
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [pair,      setPair]      = useState('EURUSD')
  const [iv,        setIv]        = useState('1h')
  const [candles,   setCandles]   = useState<Candle[]>([])
  const [analysis,  setAnalysis]  = useState<AIAnalysis | null>(null)
  const [strength,  setStrength]  = useState<Record<string,number>>({USD:50,EUR:50,GBP:50,JPY:50,CHF:50,AUD:50,NZD:50,CAD:50})
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [price,     setPrice]     = useState<number|null>(null)
  const [account,   setAccount]   = useState(10000)
  const [riskPct,   setRiskPct]   = useState(1.0)
  const [countdown, setCountdown] = useState(REFRESH_SEC)
  const [lastAt,    setLastAt]    = useState('')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refreshRef  = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cdRef       = useRef<any>(null)
  const cdVal       = useRef(REFRESH_SEC)

  const pipSize = PIP[pair] ?? 0.0001
  const cat     = CAT(pair)
  const catCol  = CAT_COLOR[cat]

  const fetchCandles = useCallback(async (p = pair, interval = iv) => {
    setLoading(true); setError('')
    try {
      const r    = await fetch(`/api/candles?symbol=${p}&interval=${interval}`)
      const data = await r.json()
      if (data.error) throw new Error(data.error)
      const cds: Candle[] = data.candles
      setCandles(cds)
      setAnalysis(analyseMarket(cds, PIP[p] ?? 0.0001))
      setPrice(cds[cds.length - 1]?.close ?? null)
      setLastAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      cdVal.current = REFRESH_SEC; setCountdown(REFRESH_SEC)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally { setLoading(false) }
  }, [pair, iv])

  const fetchStrength = useCallback(async () => {
    try {
      const r = await fetch('/api/strength'); const d = await r.json()
      if (d.strength) setStrength(d.strength)
    } catch { /**/ }
  }, [])

  useEffect(() => { fetchCandles(pair, iv); fetchStrength() }, [pair, iv]) // eslint-disable-line

  // 5-min auto-refresh
  useEffect(() => {
    if (refreshRef.current) clearInterval(refreshRef.current)
    refreshRef.current = (window.setInterval as (f:()=>void,ms:number)=>number)(() => {
      fetchCandles(); fetchStrength()
    }, REFRESH_SEC * 1000)
    return () => clearInterval(refreshRef.current)
  }, [fetchCandles, fetchStrength])

  // Countdown
  useEffect(() => {
    if (cdRef.current) clearInterval(cdRef.current)
    cdRef.current = (window.setInterval as (f:()=>void,ms:number)=>number)(() => {
      cdVal.current = Math.max(0, cdVal.current - 1)
      setCountdown(cdVal.current)
    }, 1000)
    return () => clearInterval(cdRef.current)
  }, [])

  const handlePair = (p: string) => { setPair(p); setCandles([]); setAnalysis(null); setPrice(null) }

  const biasCol = analysis?.bias === 'BULLISH' ? 'var(--bull)' : analysis?.bias === 'BEARISH' ? 'var(--bear)' : 'var(--amber)'
  const mm = String(Math.floor(countdown / 60)).padStart(2,'0')
  const ss = String(countdown % 60).padStart(2,'0')

  const NAV_SEP = <div className="nav-sep" />

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'var(--bg)', overflow:'hidden' }}>

      {/* ═══ NAV ROW 1 — Pairs ═══════════════════════════════════════════════ */}
      <div className="nav-row" style={{ padding:'5px 14px' }}>

        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:7, marginRight:10, flexShrink:0 }}>
          <div style={{
            width:26, height:26, borderRadius:6,
            background:'linear-gradient(135deg,#1b3a7a,#0f2050)',
            border:'1px solid #2d5090',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:14,
          }}>🤖</div>
          <div>
            <div style={{ fontSize:11, fontWeight:800, color:'var(--text)', letterSpacing:'-0.01em', lineHeight:1.1 }}>FOREX AI</div>
            <div style={{ fontSize:7.5, color:'var(--text-muted)', letterSpacing:'0.12em', textTransform:'uppercase' }}>Terminal</div>
          </div>
        </div>

        {NAV_SEP}

        {/* FX pairs */}
        <div style={{ display:'flex', gap:1, alignItems:'center' }}>
          <span style={{ fontSize:7.5, color:'var(--blue)', fontWeight:800, letterSpacing:'.12em',
            padding:'1px 5px', background:'var(--blue-glow)', borderRadius:3, marginRight:3 }}>FX</span>
          {FX.map(p => (
            <button key={p} className={`pair-btn pair-btn-fx${pair===p?' active':''}`} onClick={() => handlePair(p)}>
              {p}
            </button>
          ))}
        </div>

        {NAV_SEP}

        {/* Metals */}
        <div style={{ display:'flex', gap:1, alignItems:'center' }}>
          <span style={{ fontSize:7.5, color:'var(--amber)', fontWeight:800, letterSpacing:'.12em',
            padding:'1px 5px', background:'var(--amber-glow)', borderRadius:3, marginRight:3 }}>METALS</span>
          {METALS.map(p => (
            <button key={p} className={`pair-btn pair-btn-metals${pair===p?' active':''}`} onClick={() => handlePair(p)}>
              {p}
            </button>
          ))}
        </div>

        {NAV_SEP}

        {/* Crypto */}
        <div style={{ display:'flex', gap:1, alignItems:'center' }}>
          <span style={{ fontSize:7.5, color:'#ff9d00', fontWeight:800, letterSpacing:'.12em',
            padding:'1px 5px', background:'#ff9d0018', borderRadius:3, marginRight:3 }}>CRYPTO</span>
          {CRYPTO.map(p => (
            <button key={p} className={`pair-btn pair-btn-crypto${pair===p?' active':''}`} onClick={() => handlePair(p)}>
              {p}
            </button>
          ))}
        </div>

        {/* Live price */}
        {price !== null && (
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            <div className="live-dot" style={{ background: catCol }} />
            <div style={{
              fontSize:14, fontWeight:800,
              color: catCol,
              letterSpacing:'-0.01em',
              fontVariantNumeric:'tabular-nums',
              textShadow:`0 0 20px ${catCol}66`,
            }}>{fmt(pair, price)}</div>
          </div>
        )}
      </div>

      {/* ═══ NAV ROW 2 — Controls ════════════════════════════════════════════ */}
      <div className="nav-row" style={{ padding:'4px 14px', background:'var(--bg)', borderBottom:'1px solid var(--border)' }}>

        {/* Intervals */}
        <div style={{ display:'flex', gap:1 }}>
          {INTERVALS.map(t => (
            <button key={t} className={`iv-btn${iv===t?' active':''}`} onClick={() => setIv(t)}>{t}</button>
          ))}
        </div>

        {NAV_SEP}

        {/* Account */}
        <label style={{ display:'flex', alignItems:'center', gap:5, color:'var(--text-muted)', fontSize:10 }}>
          Account
          <input type="number" value={account} onChange={e => setAccount(+e.target.value)}
            className="fx-input" style={{ width:72 }} />
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:5, color:'var(--text-muted)', fontSize:10 }}>
          Risk %
          <input type="number" value={riskPct} onChange={e => setRiskPct(+e.target.value)}
            step={.1} min={.1} max={10} className="fx-input" style={{ width:46 }} />
        </label>

        {NAV_SEP}

        {/* Refresh */}
        <button className="btn btn-ghost" onClick={() => fetchCandles()} disabled={loading}
          style={{ padding:'3px 10px' }}>
          {loading ? '⟳ …' : '⟳ Refresh'}
        </button>

        {/* Bias badge */}
        {analysis && (
          <div style={{
            padding:'3px 12px', borderRadius:5, fontSize:11, fontWeight:800,
            background: `${biasCol}18`, border:`1px solid ${biasCol}44`, color:biasCol,
            letterSpacing:'0.07em',
          }}>
            {analysis.bias}
          </div>
        )}

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
          {lastAt && <span style={{ fontSize:9, color:'var(--text-muted)' }}>{lastAt}</span>}
          <div className={`countdown ${countdown < 30 ? 'countdown-warn' : 'countdown-ok'}`}>
            <span style={{ fontSize:8, opacity:0.6 }}>REFRESH IN</span>
            {mm}:{ss}
          </div>
        </div>
      </div>

      {/* ═══ Error bar ═══════════════════════════════════════════════════════ */}
      {error && (
        <div style={{ background:'var(--bear-glow)', color:'var(--bear)',
          padding:'5px 14px', fontSize:10, border:'none',
          borderBottom:'1px solid #ff4e6a33', flexShrink:0 }}>
          ⚠ {error}
        </div>
      )}

      {/* ═══ Body ════════════════════════════════════════════════════════════ */}
      <div style={{ display:'flex', flex:1, overflow:'hidden', gap:6, padding:6 }}>

        {/* ── Chart panel ── */}
        <div style={{
          flex:1, minWidth:0,
          borderRadius:8, overflow:'hidden',
          background:'var(--bg)',
          border:`1px solid ${catCol}44`,
          boxShadow:`0 0 30px ${catCol}0e, inset 0 0 0 0 transparent`,
          position:'relative',
        }}>
          {candles.length > 0
            ? <TradingChart candles={candles} pair={`${pair}  ·  ${iv}`} pipSize={pipSize} />
            : <ChartSkeleton loading={loading} error={error} pair={pair} />
          }
        </div>

        {/* ── Sidebar ── */}
        <div style={{
          width:300, display:'flex', flexDirection:'column',
          gap:5, overflowY:'auto', flexShrink:0,
          paddingRight:2,
        }}>
          <AIPanel analysis={analysis} loading={loading && !analysis}
            pair={pair} account={account} riskPct={riskPct} pipSize={pipSize} />
          <StrategyFeed candles={candles} pipSize={pipSize} />
          <StrengthMeter strength={strength} />
        </div>
      </div>

      {/* ═══ Footer ══════════════════════════════════════════════════════════ */}
      <div style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        padding:'3px 14px', flexShrink:0,
        background:'var(--bg-panel)', borderTop:'1px solid var(--border)',
        fontSize:8.5, color:'var(--text-muted)',
      }}>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <span>Forex AI Terminal</span>
          <span style={{ color:'var(--border-hi)' }}>·</span>
          <span>SMC + ICT + 7 Strategies</span>
          <span style={{ color:'var(--border-hi)' }}>·</span>
          <span>{ALL.length} pairs</span>
          <span style={{ color:'var(--border-hi)' }}>·</span>
          <span>Data: Yahoo Finance</span>
        </div>
        <span style={{ color:'var(--text-muted)' }}>Educational use only — not financial advice</span>
      </div>
    </div>
  )
}
