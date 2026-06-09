'use client'

import { useState, useMemo } from 'react'
import type { ScanResult } from '@/lib/os/types'
import { SCAN_DATA } from '@/lib/os/mockData'

type ExchangeFilter = 'ALL' | 'NSE' | 'BSE' | 'MCX' | 'NFO' | 'FOREX'
type SignalFilter   = 'ALL' | 'BULLISH' | 'BEARISH' | 'NEUTRAL'
type StrengthFilter = 'ANY' | 'STRONG' | 'VERY_STRONG'
type SortKey        = 'changePct' | 'volume' | 'rsi' | 'strength' | 'signal'

const SIGNAL_ORDER: Record<string, number> = { STRONG_BUY: 5, BUY: 4, NEUTRAL: 3, SELL: 2, STRONG_SELL: 1 }

function rsiColor(rsi: number): string {
  if (rsi < 30) return 'var(--os-green)'
  if (rsi < 45) return 'var(--os-cyan)'
  if (rsi < 55) return 'var(--os-t2)'
  if (rsi < 70) return 'var(--os-amber)'
  return 'var(--os-red)'
}

function macdLabel(m: ScanResult['macd']): { text: string; cls: string } {
  switch (m) {
    case 'BULL_CROSS': return { text: 'BULL X',  cls: 'os-badge-green' }
    case 'BEAR_CROSS': return { text: 'BEAR X',  cls: 'os-badge-red'   }
    case 'BULL':       return { text: 'BULL',    cls: 'os-badge-cyan'  }
    case 'BEAR':       return { text: 'BEAR',    cls: 'os-badge-red'   }
    default:           return { text: 'NEUTRAL', cls: ''               }
  }
}

function signalLabel(s: ScanResult['signal']): { text: string; cls: string } {
  switch (s) {
    case 'STRONG_BUY':  return { text: 'STRONG BUY',  cls: 'os-badge-green'  }
    case 'BUY':         return { text: 'BUY',          cls: 'os-badge-cyan'   }
    case 'NEUTRAL':     return { text: 'NEUTRAL',      cls: ''                }
    case 'SELL':        return { text: 'SELL',         cls: 'os-badge-red'    }
    case 'STRONG_SELL': return { text: 'STRONG SELL',  cls: 'os-badge-red'    }
  }
}

function fmtVol(v: number): string {
  if (v >= 1e7) return (v / 1e7).toFixed(1) + 'Cr'
  if (v >= 1e5) return (v / 1e5).toFixed(1) + 'L'
  return v.toLocaleString('en-IN')
}

const SECTORS = ['ALL','BANKING','IT','OIL&GAS','AUTO','PHARMA','INFRA','FMCG','METALS','REALTY']

export default function ScannerView() {
  const [exchange, setExchange] = useState<ExchangeFilter>('ALL')
  const [signal,   setSignal]   = useState<SignalFilter>('ALL')
  const [strength, setStrength] = useState<StrengthFilter>('ANY')
  const [sector,   setSector]   = useState('ALL')
  const [highVol,  setHighVol]  = useState(false)
  const [sortKey,  setSortKey]  = useState<SortKey>('strength')
  const [sortDesc, setSortDesc] = useState(true)
  const [loading,  setLoading]  = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let d = [...SCAN_DATA]
    if (exchange !== 'ALL') d = d.filter(r => r.exchange === exchange)
    if (sector   !== 'ALL') d = d.filter(r => r.sector === sector)
    if (signal === 'BULLISH') d = d.filter(r => r.signal === 'BUY' || r.signal === 'STRONG_BUY')
    if (signal === 'BEARISH') d = d.filter(r => r.signal === 'SELL' || r.signal === 'STRONG_SELL')
    if (signal === 'NEUTRAL') d = d.filter(r => r.signal === 'NEUTRAL')
    if (strength === 'STRONG')      d = d.filter(r => r.strength >= 70)
    if (strength === 'VERY_STRONG') d = d.filter(r => r.strength >= 85)
    if (highVol) d = d.filter(r => r.volumeRatio >= 1.5)
    d.sort((a, b) => {
      let va = 0, vb = 0
      if (sortKey === 'changePct') { va = a.changePct; vb = b.changePct }
      if (sortKey === 'volume')    { va = a.volume;    vb = b.volume    }
      if (sortKey === 'rsi')       { va = a.rsi;       vb = b.rsi      }
      if (sortKey === 'strength')  { va = a.strength;  vb = b.strength  }
      if (sortKey === 'signal')    { va = SIGNAL_ORDER[a.signal] ?? 0; vb = SIGNAL_ORDER[b.signal] ?? 0 }
      return sortDesc ? vb - va : va - vb
    })
    return d
  }, [exchange, signal, strength, sector, highVol, sortKey, sortDesc])

  const bullCount   = filtered.filter(r => r.signal === 'BUY'  || r.signal === 'STRONG_BUY').length
  const bearCount   = filtered.filter(r => r.signal === 'SELL' || r.signal === 'STRONG_SELL').length
  const neutCount   = filtered.filter(r => r.signal === 'NEUTRAL').length
  const nearHighCnt = filtered.filter(r => r.nearHigh).length
  const nearLowCnt  = filtered.filter(r => r.nearLow).length
  const volLeaders  = filtered.filter(r => r.volumeRatio > 1.5).length

  const handleRefresh = () => { setLoading(true); setTimeout(() => setLoading(false), 800) }
  const toggleSort = (k: SortKey) => { if (sortKey === k) setSortDesc(d => !d); else { setSortKey(k); setSortDesc(true) } }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--os-bg)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '0 12px', borderBottom: '1px solid var(--os-border)', background: 'var(--os-surface)' }}>
        <div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--os-t1)', letterSpacing: '0.06em' }}>MARKET SCANNER</span>
          <span className="os-badge os-badge-blue" style={{ fontSize: 10 }}>{filtered.length} results</span>
          <div style={{ flex: 1 }} />
          <button className="os-btn" style={{ fontSize: 10 }} onClick={handleRefresh} disabled={loading}>
            {loading ? '↻ Refreshing…' : '↻ Refresh'}
          </button>
          <button className="os-btn" style={{ fontSize: 10 }}>⬇ Export CSV</button>
        </div>
        {/* Filters */}
        <div style={{ paddingBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 3 }}>
            {(['ALL','NSE','BSE','MCX','NFO','FOREX'] as ExchangeFilter[]).map(ex => (
              <button key={ex} onClick={() => setExchange(ex)} className={exchange === ex ? 'os-btn os-btn-primary' : 'os-btn'} style={{ fontSize: 9, padding: '2px 7px' }}>{ex}</button>
            ))}
          </div>
          <span style={{ width: 1, height: 16, background: 'var(--os-border)', display: 'inline-block' }} />
          <div style={{ display: 'flex', gap: 3 }}>
            {(['ALL','BULLISH','BEARISH','NEUTRAL'] as SignalFilter[]).map(s => (
              <button key={s} onClick={() => setSignal(s)} className={signal === s ? 'os-btn os-btn-primary' : 'os-btn'} style={{ fontSize: 9, padding: '2px 7px' }}>{s}</button>
            ))}
          </div>
          <span style={{ width: 1, height: 16, background: 'var(--os-border)', display: 'inline-block' }} />
          <div style={{ display: 'flex', gap: 3 }}>
            <button onClick={() => setStrength('ANY')}       className={strength === 'ANY'       ? 'os-btn os-btn-primary' : 'os-btn'} style={{ fontSize: 9, padding: '2px 7px' }}>ANY</button>
            <button onClick={() => setStrength('STRONG')}    className={strength === 'STRONG'    ? 'os-btn os-btn-primary' : 'os-btn'} style={{ fontSize: 9, padding: '2px 7px' }}>STRONG 70+</button>
            <button onClick={() => setStrength('VERY_STRONG')} className={strength === 'VERY_STRONG' ? 'os-btn os-btn-primary' : 'os-btn'} style={{ fontSize: 9, padding: '2px 7px' }}>VERY STRONG 85+</button>
          </div>
          <span style={{ width: 1, height: 16, background: 'var(--os-border)', display: 'inline-block' }} />
          <select value={sector} onChange={e => setSector(e.target.value)} className="os-input" style={{ fontSize: 10, padding: '2px 6px', height: 24 }}>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--os-t2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={highVol} onChange={e => setHighVol(e.target.checked)} style={{ accentColor: 'var(--os-blue)' }} />
            High Volume (&gt;1.5x)
          </label>
          <span style={{ width: 1, height: 16, background: 'var(--os-border)', display: 'inline-block' }} />
          <span style={{ fontSize: 9, color: 'var(--os-t3)' }}>SORT:</span>
          {(['changePct','volume','rsi','strength','signal'] as SortKey[]).map(k => (
            <button key={k} onClick={() => toggleSort(k)} className={sortKey === k ? 'os-btn os-btn-primary' : 'os-btn'} style={{ fontSize: 9, padding: '2px 7px' }}>
              {k.toUpperCase()} {sortKey === k ? (sortDesc ? '↓' : '↑') : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ flexShrink: 0, height: 40, display: 'flex', alignItems: 'center', gap: 16, padding: '0 14px', borderBottom: '1px solid var(--os-border)', background: 'var(--os-surface)', fontSize: 11 }}>
        <span style={{ color: 'var(--os-green)' }}>▲ {bullCount} Bullish</span>
        <span style={{ color: 'var(--os-red)' }}>▼ {bearCount} Bearish</span>
        <span style={{ color: 'var(--os-t3)' }}>● {neutCount} Neutral</span>
        <span style={{ width: 1, height: 16, background: 'var(--os-border)', display: 'inline-block' }} />
        <span style={{ color: 'var(--os-amber)' }}>⚡ {volLeaders} Vol leaders</span>
        <span style={{ color: 'var(--os-cyan)' }}>↑ {nearHighCnt} Near 52W high</span>
        <span style={{ color: 'var(--os-t3)' }}>↓ {nearLowCnt} Near 52W low</span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--os-t3)', fontSize: 13 }}>
            No results match your filters. Try relaxing the criteria.
          </div>
        ) : (
          <table className="os-table" style={{ width: '100%', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th style={{ width: 110 }}>SYMBOL</th>
                <th style={{ width: 160 }}>NAME</th>
                <th style={{ width: 90, textAlign: 'right' }}>PRICE</th>
                <th style={{ width: 80, textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('changePct')}>CHG% {sortKey === 'changePct' ? (sortDesc ? '↓' : '↑') : ''}</th>
                <th style={{ width: 100, cursor: 'pointer' }} onClick={() => toggleSort('volume')}>VOLUME {sortKey === 'volume' ? (sortDesc ? '↓' : '↑') : ''}</th>
                <th style={{ width: 60, textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleSort('rsi')}>RSI {sortKey === 'rsi' ? (sortDesc ? '↓' : '↑') : ''}</th>
                <th style={{ width: 90 }}>MACD</th>
                <th style={{ width: 110 }}>SIGNAL</th>
                <th style={{ width: 140 }}>SETUP</th>
                <th style={{ width: 100, cursor: 'pointer' }} onClick={() => toggleSort('strength')}>STRENGTH {sortKey === 'strength' ? (sortDesc ? '↓' : '↑') : ''}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const macd  = macdLabel(r.macd)
                const sig   = signalLabel(r.signal)
                const isExp = expanded === r.symbol
                return (
                  <>
                    <tr key={r.symbol} onClick={() => setExpanded(isExp ? null : r.symbol)} style={{ cursor: 'pointer', background: isExp ? 'var(--os-active)' : undefined }}>
                      <td style={{ color: 'var(--os-t3)', fontSize: 10 }}>{i + 1}</td>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: 11 }}>{r.symbol}</span>
                        <span className="os-badge" style={{ fontSize: 8, marginLeft: 4 }}>{r.exchange}</span>
                        {r.nearHigh && <span className="os-badge os-badge-amber" style={{ fontSize: 8, marginLeft: 3 }}>52H</span>}
                      </td>
                      <td style={{ fontSize: 10, color: 'var(--os-t2)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`os-badge ${r.changePct >= 0 ? 'os-badge-green' : 'os-badge-red'}`} style={{ fontSize: 10 }}>
                          {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}>{fmtVol(r.volume)}</div>
                        <div style={{ height: 3, background: 'var(--os-surface2)', borderRadius: 2, marginTop: 2, width: 60 }}>
                          <div style={{ height: '100%', borderRadius: 2, background: r.volumeRatio > 1.5 ? 'var(--os-amber)' : r.volumeRatio > 1 ? 'var(--os-blue)' : 'var(--os-t3)', width: `${Math.min(r.volumeRatio * 50, 100)}%` }} />
                        </div>
                        <div style={{ fontSize: 8, color: 'var(--os-t3)' }}>{r.volumeRatio.toFixed(2)}x avg</div>
                      </td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: rsiColor(r.rsi) }}>{r.rsi.toFixed(1)}</td>
                      <td><span className={`os-badge ${macd.cls}`} style={{ fontSize: 9 }}>{macd.text}</span></td>
                      <td><span className={`os-badge ${sig.cls}`} style={{ fontSize: 9 }}>{sig.text}</span></td>
                      <td style={{ fontSize: 10, color: 'var(--os-t2)', fontStyle: 'italic', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.setup}{r.pattern && <span style={{ color: 'var(--os-t3)', marginLeft: 4 }}>· {r.pattern}</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ flex: 1, height: 4, background: 'var(--os-surface2)', borderRadius: 2, minWidth: 40 }}>
                            <div style={{ height: '100%', borderRadius: 2, background: r.strength >= 80 ? 'var(--os-green)' : r.strength >= 60 ? 'var(--os-blue)' : r.strength >= 40 ? 'var(--os-amber)' : 'var(--os-red)', width: `${r.strength}%` }} />
                          </div>
                          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--os-t2)', minWidth: 24 }}>{r.strength}</span>
                        </div>
                      </td>
                    </tr>
                    {isExp && (
                      <tr key={`${r.symbol}-exp`} style={{ background: 'var(--os-surface)' }}>
                        <td colSpan={11} style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', gap: 24, fontSize: 11, flexWrap: 'wrap' }}>
                            <span><span style={{ color: 'var(--os-t3)' }}>52W High: </span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--os-green)' }}>{r.high52w.toLocaleString('en-IN')}</span></span>
                            <span><span style={{ color: 'var(--os-t3)' }}>52W Low: </span><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--os-red)' }}>{r.low52w.toLocaleString('en-IN')}</span></span>
                            {r.lotSize && <span><span style={{ color: 'var(--os-t3)' }}>Lot: </span><span style={{ fontFamily: 'var(--font-mono)' }}>{r.lotSize}</span></span>}
                            <span><span style={{ color: 'var(--os-t3)' }}>Sector: </span>{r.sector}</span>
                            <span><span style={{ color: 'var(--os-t3)' }}>Cap: </span>{r.marketCap}</span>
                            <span><span style={{ color: 'var(--os-t3)' }}>EMA Pos: </span><span className={`os-badge ${r.emaPosition === 'ABOVE_ALL' ? 'os-badge-green' : r.emaPosition === 'BELOW_ALL' ? 'os-badge-red' : ''}`} style={{ fontSize: 9 }}>{r.emaPosition.replace(/_/g, ' ')}</span></span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
