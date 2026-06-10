'use client'
/**
 * Market Scanner — real data only.
 * Calls /api/strategy/scan which fetches from TwelveData/Yahoo Finance,
 * runs indicator calculations, and returns only mathematically confirmed signals.
 */

import { useState, useMemo, useEffect, useCallback, Fragment } from 'react'

type ExchangeFilter = 'ALL' | 'NSE' | 'FOREX' | 'MCX' | 'CRYPTO'
type SortKey = 'changePct' | 'rsi' | 'macdHist' | 'volumeRatio' | 'confidence'
type SortDir = 'asc' | 'desc'

interface ScanRow {
  symbol:     string
  exchange:   string
  sector:     string
  price:      number
  change:     number
  changePct:  number
  volume:     number
  volumeRatio: number
  rsi:        number
  ema9:       number
  ema21:      number
  ema50:      number
  macdHist:   number
  atrValue:   number
  signals:    { strategyId: string; strategyName: string; direction: 'LONG' | 'SHORT'; confidence: number }[]
  topSignal:  { direction: 'LONG' | 'SHORT'; strategyName: string; confidence: number } | null
  error?:     string
}

const INTERVALS = ['15m','1h','4h','1d']

function rsiColor(v: number) {
  if (v <= 30) return 'var(--os-green)'
  if (v <= 45) return 'var(--os-cyan)'
  if (v <= 55) return 'var(--os-t2)'
  if (v <= 70) return 'var(--os-amber)'
  return 'var(--os-red)'
}

function macdColor(h: number) {
  if (h > 0) return 'var(--os-green)'
  if (h < 0) return 'var(--os-red)'
  return 'var(--os-t3)'
}

function VolBar({ ratio }: { ratio: number }) {
  const pct = Math.min(ratio * 50, 100)
  const col = ratio >= 1.5 ? 'var(--os-amber)' : ratio >= 1 ? 'var(--os-blue)' : 'var(--os-t3)'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
      <div style={{ width:40, height:4, background:'var(--os-surface3)', borderRadius:2 }}>
        <div style={{ width:`${pct}%`, height:'100%', background:col, borderRadius:2 }} />
      </div>
      <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:col }}>{ratio.toFixed(1)}x</span>
    </div>
  )
}

function SignalPills({ signals }: { signals: ScanRow['signals'] }) {
  if (!signals.length) return <span style={{ fontSize:9, color:'var(--os-t3)' }}>—</span>
  return (
    <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
      {signals.map(s => (
        <span key={s.strategyId} style={{
          fontSize:8, padding:'1px 5px', borderRadius:3, fontWeight:700,
          background: s.direction==='LONG' ? 'var(--os-green-glow)' : 'var(--os-red-glow)',
          color:      s.direction==='LONG' ? 'var(--os-green)' : 'var(--os-red)',
          border: `1px solid ${s.direction==='LONG'?'var(--os-green)':'var(--os-red)'}33`,
        }}>
          {s.direction==='LONG'?'↑':'↓'} {s.strategyId.replace('_',' ').toUpperCase()}
        </span>
      ))}
    </div>
  )
}

function ScanDetail({ row }: { row: ScanRow }) {
  return (
    <div style={{ padding:'14px 16px', borderTop:'1px solid var(--os-border)', background:'var(--os-surface2)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10, marginBottom:12 }}>
        {[
          { l:'RSI(14)',   v:row.rsi.toFixed(1),        c:rsiColor(row.rsi) },
          { l:'EMA9',     v:row.ema9.toFixed(2),        c:'var(--os-blue)' },
          { l:'EMA21',    v:row.ema21.toFixed(2),       c:'var(--os-cyan)' },
          { l:'EMA50',    v:row.ema50.toFixed(2),       c:'var(--os-purple)' },
          { l:'MACD Hist',v:row.macdHist.toFixed(4),    c:macdColor(row.macdHist) },
          { l:'ATR(14)',  v:row.atrValue.toFixed(4),    c:'var(--os-t2)' },
          { l:'Vol Ratio',v:`${row.volumeRatio.toFixed(2)}x`, c: row.volumeRatio>=1.5?'var(--os-amber)':'var(--os-t2)' },
          { l:'EMA Trend',v: row.ema9>row.ema21 && row.ema21>row.ema50?'BULL':'BEAR', c: row.ema9>row.ema21?'var(--os-green)':'var(--os-red)' },
        ].map(({l,v,c}) => (
          <div key={l} style={{ padding:'6px 8px', background:'var(--os-surface)', borderRadius:4, border:'1px solid var(--os-border)' }}>
            <div style={{ fontSize:8, color:'var(--os-t3)', marginBottom:2 }}>{l}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:11, fontWeight:700, color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {row.signals.length > 0 && (
        <div>
          <div style={{ fontSize:9, fontWeight:700, color:'var(--os-t2)', letterSpacing:'0.06em', marginBottom:6 }}>
            CONFIRMED SIGNALS ({row.signals.length})
          </div>
          {row.signals.map(s => (
            <div key={s.strategyId} style={{ marginBottom:4, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{
                fontSize:8, padding:'2px 6px', borderRadius:3, fontWeight:700,
                background: s.direction==='LONG' ? 'var(--os-green-glow)' : 'var(--os-red-glow)',
                color:      s.direction==='LONG' ? 'var(--os-green)' : 'var(--os-red)',
              }}>
                {s.direction}
              </span>
              <span style={{ fontSize:10, color:'var(--os-t2)' }}>{s.strategyName}</span>
              <span style={{ marginLeft:'auto', fontSize:9, color:'var(--os-t3)' }}>
                Confidence: <span style={{ color: s.confidence>=75?'var(--os-green)':s.confidence>=50?'var(--os-amber)':'var(--os-red)', fontWeight:700 }}>{s.confidence}%</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {row.error && (
        <div style={{ fontSize:10, color:'var(--os-red)' }}>⚠ {row.error}</div>
      )}
    </div>
  )
}

export default function ScannerView() {
  const [rows,        setRows]        = useState<ScanRow[]>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [scannedAt,   setScannedAt]   = useState<string | null>(null)
  const [interval,    setIntervalKey] = useState('1h')
  const [exchange,    setExchange]    = useState<ExchangeFilter>('ALL')
  const [signalOnly,  setSignalOnly]  = useState(false)
  const [minConf,     setMinConf]     = useState(0)
  const [sortKey,     setSortKey]     = useState<SortKey>('confidence')
  const [sortDir,     setSortDir]     = useState<SortDir>('desc')
  const [selected,    setSelected]    = useState<string | null>(null)
  const [failed,      setFailed]      = useState<{symbol:string;error:string}[]>([])

  const scan = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ interval, exchange: exchange === 'ALL' ? 'ALL' : exchange })
      const res = await fetch(`/api/strategy/scan?${params}`)
      if (!res.ok) throw new Error(`Scanner returned ${res.status}`)
      const data = await res.json()
      setRows(data.rows ?? [])
      setFailed(data.failed ?? [])
      setScannedAt(new Date(data.scannedAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed')
    } finally {
      setLoading(false)
    }
  }, [interval, exchange])

  // Auto-scan on mount and whenever interval/exchange changes
  useEffect(() => { scan() }, [scan])

  const sort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const filtered = useMemo(() => {
    let d = rows
    if (signalOnly) d = d.filter(r => r.signals.length > 0)
    if (minConf > 0) d = d.filter(r => (r.topSignal?.confidence ?? 0) >= minConf)
    return [...d].sort((a, b) => {
      let av: number, bv: number
      switch (sortKey) {
        case 'changePct':  av = a.changePct;   bv = b.changePct; break
        case 'rsi':        av = a.rsi;          bv = b.rsi; break
        case 'macdHist':   av = a.macdHist;     bv = b.macdHist; break
        case 'volumeRatio':av = a.volumeRatio;  bv = b.volumeRatio; break
        case 'confidence': av = a.topSignal?.confidence ?? 0; bv = b.topSignal?.confidence ?? 0; break
        default:           av = 0; bv = 0
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [rows, sortKey, sortDir, signalOnly, minConf])

  const bullCount = rows.filter(r => r.topSignal?.direction === 'LONG').length
  const bearCount = rows.filter(r => r.topSignal?.direction === 'SHORT').length
  const sigCount  = rows.filter(r => r.signals.length > 0).length

  const SortTh = ({ k, label }: { k: SortKey; label: string }) => (
    <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => sort(k)}>
      {label} {sortKey===k ? (sortDir==='desc'?'↓':'↑') : ''}
    </th>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--os-bg)' }}>
      {/* Header */}
      <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--os-border)', background:'var(--os-surface)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
          <span style={{ fontSize:13, fontWeight:800, color:'var(--os-t1)' }}>MARKET SCANNER</span>
          <span style={{ fontSize:9, color:'var(--os-t3)' }}>Real data · TwelveData / Yahoo Finance</span>
          {scannedAt && <span style={{ fontSize:9, color:'var(--os-t3)', marginLeft:4 }}>Last scan: {scannedAt}</span>}
          {loading && <span className="os-badge os-badge-blue" style={{ fontSize:8 }}><span style={{ display:'inline-block', animation:'os-pulse 1s ease infinite' }}>⟳</span> Scanning…</span>}
          <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
            <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, color:'var(--os-t2)', cursor:'pointer' }}>
              <input type="checkbox" checked={signalOnly} onChange={e => setSignalOnly(e.target.checked)} style={{ accentColor:'var(--os-blue)' }} />
              Signals only
            </label>
            <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'var(--os-t2)' }}>
              <span>Min confidence</span>
              <select
                value={minConf}
                onChange={e => setMinConf(Number(e.target.value))}
                style={{ background:'var(--os-surface2)', border:'1px solid var(--os-border2)', borderRadius:4,
                  color: minConf >= 73 ? 'var(--os-green)' : 'var(--os-t2)', fontSize:10, padding:'2px 5px', cursor:'pointer' }}
              >
                <option value={0}>All</option>
                <option value={50}>50%+</option>
                <option value={60}>60%+</option>
                <option value={73}>73%+ ✓</option>
                <option value={80}>80%+</option>
                <option value={90}>90%+</option>
              </select>
            </div>
            <button className="os-btn os-btn-primary" style={{ fontSize:10 }} onClick={scan} disabled={loading}>
              {loading ? '…' : '▶ Scan'}
            </button>
          </div>
        </div>

        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={{ display:'flex', gap:4 }}>
            {(['ALL','NSE','FOREX','MCX','CRYPTO'] as ExchangeFilter[]).map(ex => (
              <button key={ex} onClick={() => setExchange(ex)}
                className={`os-btn ${exchange===ex?'os-btn-primary':''}`}
                style={{ fontSize:9, padding:'2px 8px' }}>{ex}</button>
            ))}
          </div>
          <div style={{ display:'flex', gap:4 }}>
            {INTERVALS.map(iv => (
              <button key={iv} onClick={() => setIntervalKey(iv)}
                className={`os-btn ${interval===iv?'os-btn-primary':''}`}
                style={{ fontSize:9, padding:'2px 6px' }}>{iv}</button>
            ))}
          </div>
          {/* Stats */}
          <div style={{ display:'flex', gap:8, marginLeft:'auto', fontSize:10 }}>
            <span className="os-badge os-badge-green">{bullCount} ▲ LONG</span>
            <span className="os-badge os-badge-red">{bearCount} ▼ SHORT</span>
            <span className="os-badge os-badge-blue">{sigCount} signals</span>
            {minConf > 0 && <span className="os-badge os-badge-green">{filtered.length} passing {minConf}%+</span>}
            <span style={{ color:'var(--os-t3)' }}>{rows.length} symbols</span>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding:'8px 14px', background:'var(--os-red-glow)', borderBottom:'1px solid var(--os-border)', fontSize:10, color:'var(--os-red)' }}>
          ✕ {error}
        </div>
      )}

      {/* Failed symbols notice */}
      {failed.length > 0 && (
        <div style={{ padding:'4px 14px', background:'rgba(245,158,11,0.08)', borderBottom:'1px solid var(--os-border)', fontSize:9, color:'var(--os-amber)' }}>
          ⚠ {failed.length} symbol{failed.length>1?'s':''} failed to load: {failed.map(f => f.symbol).join(', ')}
        </div>
      )}

      {/* Empty state */}
      {!loading && rows.length === 0 && !error && (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
          <div style={{ fontSize:32, opacity:.25 }}>📡</div>
          <div style={{ fontSize:13, color:'var(--os-t2)' }}>No data yet — run a scan</div>
          <button className="os-btn os-btn-primary" onClick={scan}>▶ Scan Markets</button>
        </div>
      )}

      {/* Empty state after filtering */}
      {rows.length > 0 && filtered.length === 0 && !loading && (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10 }}>
          <div style={{ fontSize:28, opacity:.25 }}>🔍</div>
          <div style={{ fontSize:12, color:'var(--os-t2)' }}>No instruments match the current filters</div>
          <div style={{ fontSize:10, color:'var(--os-t3)' }}>
            {minConf > 0 ? `Try lowering the min confidence below ${minConf}%` : 'Try removing the "Signals only" filter'}
          </div>
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && filtered.length > 0 && (
        <div style={{ flex:1, overflowY:'auto' }}>
          <table className="os-table" style={{ width:'100%', minWidth:900 }}>
            <thead>
              <tr>
                <th>SYMBOL</th>
                <th>EXCH</th>
                <th style={{ cursor:'pointer' }} onClick={() => sort('changePct')}>PRICE / CHG {sortKey==='changePct'?(sortDir==='desc'?'↓':'↑'):''}</th>
                <SortTh k="volumeRatio" label="VOL RATIO" />
                <SortTh k="rsi" label="RSI" />
                <SortTh k="macdHist" label="MACD H" />
                <th>EMA TREND</th>
                <SortTh k="confidence" label="SIGNAL" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const isSelected = selected === row.symbol
                const emaTrend = row.ema9 > row.ema21 && row.ema21 > row.ema50 ? 'BULL'
                               : row.ema9 < row.ema21 && row.ema21 < row.ema50 ? 'BEAR' : 'MIX'
                const conf = row.topSignal?.confidence ?? 0
                return (
                  <Fragment key={row.symbol}>
                    <tr style={{ cursor:'pointer', background: isSelected ? 'var(--os-active)' : undefined }}
                      onClick={() => setSelected(s => s === row.symbol ? null : row.symbol)}>
                      <td style={{ fontWeight:700, fontSize:11 }}>{row.symbol}</td>
                      <td><span className="os-badge" style={{ fontSize:8 }}>{row.exchange}</span></td>
                      <td>
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>
                          <span>{row.price > 0 ? row.price.toLocaleString('en-IN', { maximumFractionDigits: 4 }) : '—'}</span>
                          <span style={{ marginLeft:6, fontSize:9,
                            color: row.changePct >= 0 ? 'var(--os-green)' : 'var(--os-red)' }}>
                            {row.changePct >= 0 ? '+' : ''}{row.changePct.toFixed(2)}%
                          </span>
                        </div>
                      </td>
                      <td><VolBar ratio={row.volumeRatio} /></td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11, color:rsiColor(row.rsi) }}>
                        {row.rsi > 0 ? row.rsi.toFixed(1) : '—'}
                      </td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:10, color:macdColor(row.macdHist) }}>
                        {row.macdHist !== 0 ? (row.macdHist > 0 ? '+' : '') + row.macdHist.toFixed(4) : '—'}
                      </td>
                      <td>
                        <span style={{ fontSize:9, fontWeight:700,
                          color: emaTrend==='BULL'?'var(--os-green)':emaTrend==='BEAR'?'var(--os-red)':'var(--os-t3)' }}>
                          {emaTrend}
                        </span>
                      </td>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <SignalPills signals={row.signals} />
                          {conf > 0 && (
                            <span style={{ fontSize:9, fontWeight:700, marginLeft:2,
                              color: conf >= 73 ? 'var(--os-green)' : conf >= 50 ? 'var(--os-amber)' : 'var(--os-red)' }}>
                              {conf}%
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isSelected && (
                      <tr>
                        <td colSpan={8} style={{ padding:0 }}>
                          <ScanDetail row={row} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
