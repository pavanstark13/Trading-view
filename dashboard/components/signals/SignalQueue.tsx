'use client'
/**
 * Signal Queue — human approval gate before ANY broker execution.
 *
 * Pipeline: Confirmed Signal → This Queue → Human Approves → Angel One Order
 *
 * Signals are only shown here if they passed all strategy conditions.
 * Humans can approve, skip (review later), or reject each signal.
 * Approved signals go directly to the broker API.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { TradingSignal } from '@/lib/strategies'

// ── Types ─────────────────────────────────────────────────────────────────────
type QueueItem = TradingSignal & {
  queueId:   string
  status:    'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTING' | 'DONE' | 'FAILED'
  orderId?:  string
  orderError?: string
  addedAt:   number
}

type PipelineStatus = 'idle' | 'scanning' | 'error'

const INTERVALS = ['15m', '1h', '4h', '1d']
const SCAN_SYMBOLS_DISPLAY = [
  'NIFTY50','BANKNIFTY','RELIANCE','HDFCBANK','ICICIBANK','SBIN','TCS','INFY',
  'AXISBANK','BHARTIARTL','EURUSD','GBPUSD','XAUUSD','BTCUSD',
]

// ── Direction badge ───────────────────────────────────────────────────────────
function DirBadge({ dir }: { dir: 'LONG' | 'SHORT' }) {
  return (
    <span style={{
      fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:3,
      background: dir==='LONG' ? 'var(--os-green-glow)' : 'var(--os-red-glow)',
      color:      dir==='LONG' ? 'var(--os-green)'     : 'var(--os-red)',
      border:     `1px solid ${dir==='LONG' ? 'var(--os-green)' : 'var(--os-red)'}44`,
    }}>
      {dir==='LONG' ? '▲ LONG' : '▼ SHORT'}
    </span>
  )
}

// ── Confidence bar ─────────────────────────────────────────────────────────────
function ConfBar({ value }: { value: number }) {
  const color = value >= 75 ? 'var(--os-green)' : value >= 50 ? 'var(--os-amber)' : 'var(--os-red)'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div style={{ flex:1, height:4, background:'var(--os-surface3)', borderRadius:2 }}>
        <div style={{ width:`${value}%`, height:'100%', background:color, borderRadius:2, transition:'width .4s' }} />
      </div>
      <span style={{ fontSize:9.5, fontFamily:'var(--font-mono)', color, minWidth:28 }}>{value}%</span>
    </div>
  )
}

// ── Single signal card ────────────────────────────────────────────────────────
function SignalCard({
  item, onApprove, onReject, onSkip,
}: {
  item: QueueItem
  onApprove: (id: string) => void
  onReject:  (id: string) => void
  onSkip:    (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const rr = item.riskReward
  const rrColor = rr >= 2 ? 'var(--os-green)' : rr >= 1.5 ? 'var(--os-amber)' : 'var(--os-red)'

  const statusStyle: Record<QueueItem['status'], { bg: string; color: string; label: string }> = {
    PENDING:   { bg:'var(--os-amber-glow)',  color:'var(--os-amber)',  label:'PENDING' },
    APPROVED:  { bg:'var(--os-green-glow)',  color:'var(--os-green)',  label:'APPROVED' },
    REJECTED:  { bg:'var(--os-red-glow)',    color:'var(--os-red)',    label:'REJECTED' },
    EXECUTING: { bg:'var(--os-blue-glow)',   color:'var(--os-blue)',   label:'EXECUTING…' },
    DONE:      { bg:'var(--os-green-glow)',  color:'var(--os-green)',  label:'ORDER SENT' },
    FAILED:    { bg:'var(--os-red-glow)',    color:'var(--os-red)',    label:'FAILED' },
  }
  const st = statusStyle[item.status]

  return (
    <div style={{
      background:'var(--os-surface)', border:'1px solid var(--os-border)',
      borderLeft:`3px solid ${item.direction==='LONG'?'var(--os-green)':'var(--os-red)'}`,
      borderRadius:6, marginBottom:8, overflow:'hidden',
      opacity: item.status === 'REJECTED' ? 0.45 : 1,
      transition:'opacity .2s',
    }}>
      {/* Header */}
      <div style={{ padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
            <span style={{ fontWeight:800, fontSize:13, color:'var(--os-t1)' }}>{item.symbol}</span>
            <DirBadge dir={item.direction} />
            <span className="os-badge" style={{ fontSize:8 }}>{item.interval}</span>
            <span style={{ fontSize:8, padding:'2px 6px', borderRadius:3, background:st.bg, color:st.color, border:`1px solid ${st.color}44`, fontWeight:700 }}>
              {st.label}
            </span>
            {item.orderId && <span style={{ fontSize:8, color:'var(--os-t3)', fontFamily:'var(--font-mono)' }}>#{item.orderId}</span>}
          </div>
          <div style={{ fontSize:9.5, color:'var(--os-t3)', marginBottom:4 }}>{item.strategyName}</div>
          <ConfBar value={item.confidence} />
        </div>

        {/* Price grid */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8, flexShrink:0, textAlign:'right' }}>
          {[
            { l:'ENTRY',  v:item.entry.toFixed(2),    c:'var(--os-t1)' },
            { l:'SL',     v:item.stopLoss.toFixed(2), c:'var(--os-red)' },
            { l:'TARGET', v:item.target.toFixed(2),   c:'var(--os-green)' },
            { l:'R:R',    v:`1:${rr}`,                c:rrColor },
          ].map(({l,v,c}) => (
            <div key={l}>
              <div style={{ fontSize:8, color:'var(--os-t3)', marginBottom:2 }}>{l}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:11, fontWeight:700, color:c }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Expand: reasons + warnings */}
      <div style={{ borderTop:'1px solid var(--os-border)', padding:'6px 14px', display:'flex', alignItems:'center', gap:8 }}>
        <button onClick={() => setExpanded(e => !e)}
          style={{ fontSize:9.5, color:'var(--os-blue)', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', padding:0 }}>
          {expanded ? '▲ Hide conditions' : `▼ ${item.reasons.length} confirmed conditions`}
        </button>
        {item.warnings.length > 0 && (
          <span style={{ fontSize:9, color:'var(--os-amber)' }}>⚠ {item.warnings.length} warning{item.warnings.length>1?'s':''}</span>
        )}
        <div style={{ flex:1 }} />
        <span style={{ fontSize:9, color:'var(--os-t3)', fontFamily:'var(--font-mono)' }}>
          ATR: {item.atrValue.toFixed(4)} · {new Date(item.confirmedAt * 1000).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}
        </span>
      </div>

      {expanded && (
        <div style={{ padding:'8px 14px 10px', borderTop:'1px solid var(--os-border)', background:'var(--os-surface2)' }}>
          <div style={{ fontSize:9.5, color:'var(--os-t3)', fontWeight:700, letterSpacing:'0.06em', marginBottom:6 }}>CONFIRMED CONDITIONS</div>
          {item.reasons.map((r, i) => (
            <div key={i} style={{ fontSize:10.5, color:'var(--os-green)', marginBottom:3, display:'flex', gap:6 }}>
              <span>✓</span><span style={{ color:'var(--os-t2)' }}>{r}</span>
            </div>
          ))}
          {item.warnings.length > 0 && (
            <>
              <div style={{ fontSize:9.5, color:'var(--os-t3)', fontWeight:700, letterSpacing:'0.06em', marginBottom:6, marginTop:8 }}>WARNINGS</div>
              {item.warnings.map((w, i) => (
                <div key={i} style={{ fontSize:10.5, color:'var(--os-amber)', marginBottom:3, display:'flex', gap:6 }}>
                  <span>⚠</span><span style={{ color:'var(--os-amber)', opacity:.8 }}>{w}</span>
                </div>
              ))}
            </>
          )}
          {/* Indicator snapshot */}
          <div style={{ marginTop:10, display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
            {[
              { l:'RSI',     v:item.indicators.rsi.toFixed(1) },
              { l:'MACD H',  v:item.indicators.macdHist.toFixed(4) },
              { l:'EMA9',    v:item.indicators.ema9.toFixed(2) },
              { l:'EMA21',   v:item.indicators.ema21.toFixed(2) },
              { l:'EMA50',   v:item.indicators.ema50.toFixed(2) },
              { l:'EMA200',  v:item.indicators.ema200.toFixed(2) },
              { l:'Stoch K', v:item.indicators.stochK.toFixed(1) },
              { l:'ATR',     v:item.indicators.atr.toFixed(4) },
            ].map(({l,v}) => (
              <div key={l} style={{ padding:'4px 6px', background:'var(--os-surface)', borderRadius:3, border:'1px solid var(--os-border)' }}>
                <div style={{ fontSize:8, color:'var(--os-t3)', marginBottom:1 }}>{l}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--os-t1)' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons — only for PENDING signals */}
      {item.status === 'PENDING' && (
        <div style={{ padding:'8px 14px 10px', display:'flex', gap:6, borderTop:'1px solid var(--os-border)' }}>
          <button className="os-btn os-btn-primary"
            style={{ flex:2, fontSize:10, fontWeight:700, background:item.direction==='LONG'?'var(--os-green)':'var(--os-red)',
              borderColor:item.direction==='LONG'?'var(--os-green)':'var(--os-red)' }}
            onClick={() => onApprove(item.queueId)}>
            ✓ APPROVE & SEND ORDER
          </button>
          <button className="os-btn" style={{ flex:1, fontSize:10 }} onClick={() => onSkip(item.queueId)}>
            ⏸ Skip
          </button>
          <button className="os-btn" style={{ flex:1, fontSize:10, color:'var(--os-red)', borderColor:'var(--os-red)44' }}
            onClick={() => onReject(item.queueId)}>
            ✕ Reject
          </button>
        </div>
      )}

      {item.status === 'FAILED' && item.orderError && (
        <div style={{ padding:'6px 14px 8px', fontSize:10, color:'var(--os-red)', borderTop:'1px solid var(--os-border)', background:'var(--os-red-glow)' }}>
          ✕ Order failed: {item.orderError}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SignalQueue() {
  const [queue,           setQueue]           = useState<QueueItem[]>([])
  const [scanStatus,      setScanStatus]      = useState<PipelineStatus>('idle')
  const [scanInterval,    setScanInterval]    = useState('1h')
  const [filter,          setFilter]          = useState<'ALL'|'PENDING'|'APPROVED'|'REJECTED'>('ALL')
  const [scanLog,         setScanLog]         = useState<string[]>([])
  const [lastScanned,     setLastScanned]     = useState<string | null>(null)
  const [autoScan,        setAutoScan]        = useState(false)
  const autoRef = useRef(autoScan)
  autoRef.current = autoScan

  // Load queue from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('os_signal_queue_v1')
      if (stored) setQueue(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  const saveQueue = (q: QueueItem[]) => {
    setQueue(q)
    try { localStorage.setItem('os_signal_queue_v1', JSON.stringify(q.slice(-50))) } catch { /* ignore */ }
  }

  const log = (msg: string) => setScanLog(prev => [`${new Date().toLocaleTimeString('en-IN')} — ${msg}`, ...prev.slice(0, 29)])

  // ── Scan market ──────────────────────────────────────────────────────────────
  const runScan = useCallback(async () => {
    setScanStatus('scanning')
    log(`Starting scan across ${SCAN_SYMBOLS_DISPLAY.length} symbols on ${scanInterval}…`)

    try {
      const res = await fetch(`/api/strategy/scan?interval=${scanInterval}`)
      if (!res.ok) throw new Error(`Scan API returned ${res.status}`)
      const data = await res.json()

      const newSignals: QueueItem[] = []
      for (const row of data.rows ?? []) {
        for (const sig of row.signals ?? []) {
          // Prevent duplicate signals (same symbol + strategy + direction within 1h)
          const isDupe = queue.some(q =>
            q.symbol === row.symbol &&
            q.strategyId === sig.strategyId &&
            q.direction === sig.direction &&
            Date.now() - q.addedAt < 60 * 60 * 1000
          )
          if (isDupe) continue

          newSignals.push({
            ...sig,
            symbol:   row.symbol,
            interval: scanInterval,
            queueId:  `${Date.now()}-${row.symbol}-${sig.strategyId}`,
            status:   'PENDING',
            addedAt:  Date.now(),
          } as QueueItem)
        }
      }

      if (newSignals.length > 0) {
        log(`✓ Found ${newSignals.length} new signal${newSignals.length>1?'s':''}`)
        saveQueue([...newSignals, ...queue])
      } else {
        log(`No new confirmed signals at this time`)
      }

      if (data.failed?.length) {
        log(`⚠ ${data.failed.length} symbols failed to load`)
      }

      setLastScanned(new Date().toLocaleTimeString('en-IN'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      log(`✕ Scan failed: ${msg}`)
      setScanStatus('error')
    } finally {
      setScanStatus('idle')
    }
  }, [scanInterval, queue])

  // Auto-scan every 5 minutes
  useEffect(() => {
    if (!autoScan) return
    const id = setInterval(() => { if (autoRef.current) runScan() }, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [autoScan, runScan])

  // ── Approve signal → send to broker ──────────────────────────────────────────
  const approveSignal = async (queueId: string) => {
    const item = queue.find(q => q.queueId === queueId)
    if (!item) return

    // Update status to EXECUTING
    saveQueue(queue.map(q => q.queueId === queueId ? { ...q, status: 'EXECUTING' } : q))
    log(`Sending order: ${item.direction} ${item.symbol} @ ₹${item.entry.toFixed(2)}`)

    try {
      const res = await fetch('/api/angelone/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol:          item.symbol,
          exchange:        item.symbol.includes('USD') || item.symbol.includes('EUR') || item.symbol.includes('GBP') ? 'NFO' : 'NSE',
          transactiontype: item.direction === 'LONG' ? 'BUY' : 'SELL',
          quantity:        1,  // User should override via risk engine; start with 1
          ordertype:       'MARKET',
          producttype:     'INTRADAY',
          price:           0,
          triggerprice:    0,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      const orderId = data.data?.orderid ?? data.orderid ?? 'sent'
      saveQueue(queue.map(q => q.queueId === queueId ? { ...q, status: 'DONE', orderId } : q))
      log(`✓ Order placed — ID: ${orderId}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed'
      saveQueue(queue.map(q => q.queueId === queueId ? { ...q, status: 'FAILED', orderError: msg } : q))
      log(`✕ Order failed: ${msg}`)
    }
  }

  const rejectSignal = (queueId: string) => {
    saveQueue(queue.map(q => q.queueId === queueId ? { ...q, status: 'REJECTED' } : q))
    log(`Signal rejected`)
  }

  const skipSignal = (queueId: string) => {
    // Move to bottom of queue (keep as PENDING)
    const item = queue.find(q => q.queueId === queueId)
    if (!item) return
    saveQueue([...queue.filter(q => q.queueId !== queueId), item])
    log(`Signal skipped — moved to end of queue`)
  }

  const clearDone = () => {
    saveQueue(queue.filter(q => q.status === 'PENDING'))
    log('Cleared processed signals')
  }

  const filtered = filter === 'ALL' ? queue : queue.filter(q => q.status === filter)
  const pending  = queue.filter(q => q.status === 'PENDING').length
  const done     = queue.filter(q => q.status === 'DONE').length

  return (
    <div style={{ display:'flex', height:'100%', background:'var(--os-bg)' }}>

      {/* Main queue */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        {/* Header */}
        <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--os-border)', background:'var(--os-surface)',
          display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <span style={{ fontSize:13, fontWeight:800, color:'var(--os-t1)' }}>SIGNAL QUEUE</span>
          {pending > 0 && (
            <span className="os-badge os-badge-amber os-pulse" style={{ fontSize:9 }}>
              {pending} PENDING
            </span>
          )}
          {done > 0 && <span className="os-badge os-badge-green" style={{ fontSize:9 }}>{done} executed</span>}
          <div style={{ marginLeft:'auto', display:'flex', gap:6, alignItems:'center' }}>
            {(['ALL','PENDING','APPROVED','REJECTED'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`os-btn ${filter===f?'os-btn-primary':''}`}
                style={{ fontSize:9, padding:'2px 8px' }}>{f}</button>
            ))}
            {queue.some(q => q.status !== 'PENDING') && (
              <button className="os-btn" style={{ fontSize:9 }} onClick={clearDone}>Clear done</button>
            )}
          </div>
        </div>

        {/* Pipeline info banner */}
        <div style={{ padding:'6px 14px', background:'rgba(59,130,246,0.06)', borderBottom:'1px solid var(--os-border)',
          fontSize:10, color:'var(--os-blue)', flexShrink:0 }}>
          Pipeline: <span style={{ color:'var(--os-t3)' }}>Market Data (Yahoo Finance)</span>
          <span style={{ margin:'0 6px', color:'var(--os-border3)' }}>→</span>
          <span style={{ color:'var(--os-t3)' }}>Strategy Rules Engine</span>
          <span style={{ margin:'0 6px', color:'var(--os-border3)' }}>→</span>
          <span style={{ color:'var(--os-t3)' }}>Risk Engine</span>
          <span style={{ margin:'0 6px', color:'var(--os-border3)' }}>→</span>
          <span style={{ color:'var(--os-t3)' }}>Backtest Validated</span>
          <span style={{ margin:'0 6px', color:'var(--os-border3)' }}>→</span>
          <span style={{ color:'var(--os-amber)', fontWeight:700 }}>Human Approval ← YOU ARE HERE</span>
          <span style={{ margin:'0 6px', color:'var(--os-border3)' }}>→</span>
          <span style={{ color:'var(--os-t3)' }}>Broker Execution</span>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:12 }}>
          {filtered.length === 0 && (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--os-t3)' }}>
              <div style={{ fontSize:40, opacity:.25, marginBottom:12 }}>🎯</div>
              <div style={{ fontSize:13, marginBottom:6 }}>
                {filter === 'PENDING' ? 'No pending signals' : 'No signals yet'}
              </div>
              <div style={{ fontSize:11, maxWidth:360, margin:'0 auto', lineHeight:1.7 }}>
                Run a market scan to find confirmed signals. Every signal shown here has passed all strategy
                conditions — no speculation, no assumptions.
              </div>
              <button className="os-btn os-btn-primary" style={{ marginTop:16, fontSize:11 }}
                onClick={runScan} disabled={scanStatus === 'scanning'}>
                {scanStatus === 'scanning' ? '⟳ Scanning…' : '▶ Scan Markets Now'}
              </button>
            </div>
          )}
          {filtered.map(item => (
            <SignalCard key={item.queueId} item={item}
              onApprove={approveSignal} onReject={rejectSignal} onSkip={skipSignal} />
          ))}
        </div>
      </div>

      {/* Right panel: scanner controls + log */}
      <div style={{ width:280, flexShrink:0, borderLeft:'1px solid var(--os-border)', display:'flex', flexDirection:'column', background:'var(--os-surface)' }}>
        {/* Scanner controls */}
        <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--os-border)' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--os-t2)', letterSpacing:'0.06em', marginBottom:8 }}>MARKET SCANNER</div>

          <div style={{ marginBottom:8 }}>
            <div style={{ fontSize:9, color:'var(--os-t3)', marginBottom:4 }}>TIMEFRAME</div>
            <div style={{ display:'flex', gap:4 }}>
              {INTERVALS.map(iv => (
                <button key={iv} onClick={() => setScanInterval(iv)}
                  className={`os-btn ${scanInterval===iv?'os-btn-primary':''}`}
                  style={{ flex:1, fontSize:9, padding:'3px 0' }}>{iv}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom:8 }}>
            <div style={{ fontSize:9, color:'var(--os-t3)', marginBottom:4 }}>SYMBOLS SCANNED ({SCAN_SYMBOLS_DISPLAY.length})</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
              {SCAN_SYMBOLS_DISPLAY.map(s => (
                <span key={s} style={{ fontSize:8, padding:'1px 5px', background:'var(--os-surface2)',
                  border:'1px solid var(--os-border)', borderRadius:3, color:'var(--os-t3)' }}>{s}</span>
              ))}
            </div>
          </div>

          <button className="os-btn os-btn-primary" style={{ width:'100%', marginBottom:6, fontSize:10 }}
            onClick={runScan} disabled={scanStatus === 'scanning'}>
            {scanStatus === 'scanning'
              ? <><span style={{ animation:'os-pulse 1s ease infinite', display:'inline-block' }}>⟳</span> Scanning {SCAN_SYMBOLS_DISPLAY.length} symbols…</>
              : '▶ Scan Now'}
          </button>

          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:10, color:'var(--os-t2)', cursor:'pointer' }}>
            <div className={`os-toggle ${autoScan ? 'on' : ''}`} onClick={() => setAutoScan(a => !a)} />
            Auto-scan every 5 min
          </label>

          {lastScanned && (
            <div style={{ fontSize:9, color:'var(--os-t3)', marginTop:5 }}>Last scan: {lastScanned}</div>
          )}
        </div>

        {/* Strategy legend */}
        <div style={{ padding:'8px 12px', borderBottom:'1px solid var(--os-border)' }}>
          <div style={{ fontSize:9, fontWeight:700, color:'var(--os-t2)', letterSpacing:'0.06em', marginBottom:6 }}>ACTIVE STRATEGIES</div>
          {[
            { id:'ema_cross',    label:'EMA 9/21 Cross',      desc:'Trend following' },
            { id:'rsi_reversal', label:'RSI Extreme Reversal', desc:'Counter-trend' },
            { id:'macd_cross',   label:'MACD Cross',           desc:'Momentum' },
            { id:'supertrend',   label:'Supertrend Flip',      desc:'ATR-based' },
            { id:'bb_squeeze',   label:'BB Squeeze Breakout',  desc:'Volatility' },
          ].map(s => (
            <div key={s.id} style={{ marginBottom:5, display:'flex', gap:6, alignItems:'flex-start' }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--os-green)', flexShrink:0, marginTop:2 }} />
              <div>
                <div style={{ fontSize:9.5, color:'var(--os-t1)', fontWeight:600 }}>{s.label}</div>
                <div style={{ fontSize:8.5, color:'var(--os-t3)' }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Activity log */}
        <div style={{ flex:1, overflowY:'auto', padding:'8px 12px' }}>
          <div style={{ fontSize:9, fontWeight:700, color:'var(--os-t2)', letterSpacing:'0.06em', marginBottom:6 }}>ACTIVITY LOG</div>
          {scanLog.length === 0 && (
            <div style={{ fontSize:9.5, color:'var(--os-t3)' }}>No activity yet. Run a scan.</div>
          )}
          {scanLog.map((entry, i) => (
            <div key={i} style={{ fontSize:9.5, color: entry.includes('✓') ? 'var(--os-green)' : entry.includes('✕') ? 'var(--os-red)' : entry.includes('⚠') ? 'var(--os-amber)' : 'var(--os-t3)',
              marginBottom:4, lineHeight:1.5, borderBottom:'1px solid var(--os-border)', paddingBottom:3 }}>
              {entry}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
