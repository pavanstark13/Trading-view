'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  AutoTraderConfig,
  AutoTraderState,
  AutoTraderLogEntry,
  AVAILABLE_STRATEGIES,
  createDefaultConfig,
  createDefaultState,
  checkRiskLimits,
  addLog,
} from '@/lib/autotrader'

const CONFIG_KEY = 'autotrader_config'
const STATE_KEY  = 'autotrader_state'
const SCAN_INTERVAL_MS = 5 * 60 * 1000

// Pre-defined instrument list — same as what the scan API covers
const ALL_INSTRUMENTS = [
  // NSE Indices
  { symbol: 'NIFTY50',    exchange: 'NSE',    sector: 'Index' },
  { symbol: 'BANKNIFTY',  exchange: 'NSE',    sector: 'Index' },
  // NSE Stocks
  { symbol: 'RELIANCE',   exchange: 'NSE',    sector: 'Oil & Gas' },
  { symbol: 'HDFCBANK',   exchange: 'NSE',    sector: 'Banking' },
  { symbol: 'ICICIBANK',  exchange: 'NSE',    sector: 'Banking' },
  { symbol: 'SBIN',       exchange: 'NSE',    sector: 'Banking' },
  { symbol: 'TCS',        exchange: 'NSE',    sector: 'IT' },
  { symbol: 'INFY',       exchange: 'NSE',    sector: 'IT' },
  { symbol: 'AXISBANK',   exchange: 'NSE',    sector: 'Banking' },
  { symbol: 'BHARTIARTL', exchange: 'NSE',    sector: 'Telecom' },
  { symbol: 'WIPRO',      exchange: 'NSE',    sector: 'IT' },
  { symbol: 'KOTAKBANK',  exchange: 'NSE',    sector: 'Banking' },
  // Forex
  { symbol: 'EURUSD',     exchange: 'FOREX',  sector: 'FX' },
  { symbol: 'GBPUSD',     exchange: 'FOREX',  sector: 'FX' },
  { symbol: 'USDJPY',     exchange: 'FOREX',  sector: 'FX' },
  // Metals / Crypto
  { symbol: 'XAUUSD',     exchange: 'MCX',    sector: 'Metal' },
  { symbol: 'BTCUSD',     exchange: 'CRYPTO', sector: 'Crypto' },
]

// ── helpers ─────────────────────────────────────────────────────────────────

function loadConfig(): AutoTraderConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) return { ...createDefaultConfig(), ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return createDefaultConfig()
}

function loadState(config: AutoTraderConfig): AutoTraderState {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (raw) return { ...createDefaultState(config), ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return createDefaultState(config)
}

function ts() { return new Date().toISOString() }
function logEntry(type: AutoTraderLogEntry['type'], message: string, data?: unknown): AutoTraderLogEntry {
  return { ts: ts(), type, message, data }
}

// ── scan result row type ──────────────────────────────────────────────────────
interface ScanRow {
  symbol: string
  exchange: string
  price: number
  changePct: number
  rsi: number
  signals: { direction: 'LONG' | 'SHORT'; strategyName: string; confidence: number }[]
  topSignal: { direction: 'LONG' | 'SHORT'; confidence: number } | null
  error?: string
}

// ── status/log colors ─────────────────────────────────────────────────────────
const STATUS_COLOR: Record<AutoTraderState['status'], string> = {
  IDLE:          'var(--os-t3)',
  SCANNING:      'var(--os-blue)',
  SIGNAL_FOUND:  'var(--os-amber)',
  RISK_CHECK:    'var(--os-amber)',
  BLOCKED:       'var(--os-red)',
  PLACING_ORDER: 'var(--os-blue)',
  ACTIVE:        'var(--os-green)',
}
const LOG_COLOR: Record<AutoTraderLogEntry['type'], string> = {
  INFO:       'var(--os-t3)',
  SIGNAL:     'var(--os-amber)',
  RISK_BLOCK: 'var(--os-red)',
  ORDER:      'var(--os-blue)',
  FILL:       'var(--os-green)',
  ERROR:      'var(--os-red)',
  RESET:      'var(--os-t3)',
}

// ── sub-components ────────────────────────────────────────────────────────────
function RiskBar({ label, value, limit }: { label: string; value: number; limit: number }) {
  const pct  = limit > 0 ? Math.min(Math.abs(value) / limit * 100, 100) : 0
  const warn = pct >= 80
  const neg  = value < 0
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--os-t3)', marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color: neg ? 'var(--os-red)' : 'var(--os-green)' }}>
          {value >= 0 ? '+' : ''}₹{value.toFixed(0)} / ₹{limit}
        </span>
      </div>
      <div style={{ background: 'var(--os-bg)', borderRadius: 3, height: 5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', transition: 'width 0.3s',
          background: warn || neg ? 'var(--os-red)' : 'var(--os-green)' }} />
      </div>
    </div>
  )
}

function CountBar({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max > 0 ? Math.min(used / max * 100, 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, fontSize: 11 }}>
      <span style={{ color: 'var(--os-t3)', minWidth: 130 }}>{label}</span>
      <div style={{ flex: 1, background: 'var(--os-bg)', borderRadius: 3, height: 5 }}>
        <div style={{ width: `${pct}%`, height: '100%', transition: 'width 0.3s',
          background: pct >= 80 ? 'var(--os-red)' : 'var(--os-blue)' }} />
      </div>
      <span style={{ color: pct >= 80 ? 'var(--os-red)' : 'var(--os-t1)', minWidth: 36, textAlign: 'right' }}>
        {used}/{max}
      </span>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────
export default function AutoTraderPanel() {
  const [cfg,      setCfg]      = useState<AutoTraderConfig>(createDefaultConfig)
  const [state,    setState]    = useState<AutoTraderState>(() => createDefaultState(createDefaultConfig()))
  const [scanRows, setScanRows] = useState<ScanRow[]>([])
  const [scanning, setScanning] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const c = loadConfig(); const s = loadState(c)
    setCfg(c); setState(s)
  }, [])

  useEffect(() => {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
  }, [state])

  // ── scan loop ──────────────────────────────────────────────────────────────
  const runScan = useCallback(async (currentState: AutoTraderState) => {
    setState(prev => ({ ...prev, status: 'SCANNING', lastScanAt: ts() }))
    setScanning(true)

    const riskCheck = checkRiskLimits(currentState)
    if (!riskCheck.allowed) {
      setState(prev => addLog(
        { ...prev, status: 'BLOCKED', blockedReason: riskCheck.reason },
        logEntry('RISK_BLOCK', riskCheck.reason!)
      ))
      setScanning(false)
      return
    }

    try {
      const params = new URLSearchParams({ interval: currentState.config.interval })
      const res = await fetch(`/api/strategy/scan?${params}`)
      if (!res.ok) throw new Error(`Scan HTTP ${res.status}`)
      const data = await res.json()
      const rows: ScanRow[] = data.rows ?? []
      setScanRows(rows)

      const withSignals = rows.filter(r => (r.signals?.length ?? 0) > 0)

      if (!withSignals.length) {
        setState(prev => addLog(
          { ...prev, status: 'ACTIVE' },
          logEntry('INFO', `Scan complete — ${rows.length} instruments scanned, 0 signals`)
        ))
        setScanning(false)
        return
      }

      setState(prev => addLog(
        { ...prev, status: 'SIGNAL_FOUND' },
        logEntry('SIGNAL', `${withSignals.length} signal(s) found: ${withSignals.map(r => r.symbol).join(', ')}`)
      ))

      for (const row of withSignals) {
        const topSig = row.topSignal
        if (!topSig) continue

        setState(prev => {
          const check = checkRiskLimits(prev)
          if (!check.allowed) {
            return addLog(
              { ...prev, status: 'BLOCKED', blockedReason: check.reason },
              logEntry('RISK_BLOCK', check.reason!)
            )
          }

          if (prev.config.autoApprove && prev.config.broker !== 'paper') {
            placeBrokerOrder(row, prev.config)
              .then(result => setState(s => addLog(
                { ...s, tradesToday: s.tradesToday + 1, status: 'ACTIVE' },
                logEntry('FILL', `Order filled: ${row.symbol} ${topSig.direction}`, result)
              )))
              .catch(err => setState(s => addLog(
                { ...s, status: 'ACTIVE' },
                logEntry('ERROR', `${row.symbol}: ${err.message}`)
              )))
            return addLog({ ...prev, status: 'PLACING_ORDER' },
              logEntry('ORDER', `Placing ${topSig.direction} order: ${row.symbol} @ ₹${row.price}`)
            )
          }

          window.dispatchEvent(new CustomEvent('autotrader:signal', { detail: row }))
          return addLog({ ...prev, status: 'ACTIVE' },
            logEntry('SIGNAL', `Queued for approval: ${row.symbol} ${topSig.direction}`)
          )
        })
      }
    } catch (err) {
      setState(prev => addLog({ ...prev, status: 'ACTIVE' },
        logEntry('ERROR', err instanceof Error ? err.message : 'Scan error')
      ))
    } finally {
      setScanning(false)
    }
  }, [])

  async function placeBrokerOrder(row: ScanRow, config: AutoTraderConfig) {
    const ep =
      config.broker === 'angelone' ? '/api/angelone/order' :
      config.broker === 'oanda'    ? '/api/oanda/order'    :
      config.broker === 'binance'  ? '/api/binance/order'  : null
    if (!ep) return { paper: true }
    const res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) })
    if (!res.ok) throw new Error(`Order API ${res.status}`)
    return res.json()
  }

  function handleStartStop() {
    if (state.running) {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
      setState(prev => addLog({ ...prev, running: false, status: 'IDLE' }, logEntry('INFO', 'Auto-trader stopped')))
    } else {
      setState(prev => {
        const next = addLog({ ...prev, running: true, status: 'SCANNING' },
          logEntry('INFO', `Started — scanning ${ALL_INSTRUMENTS.length} instruments every 5 min`))
        runScan(next)
        return next
      })
      timerRef.current = setInterval(() => {
        setState(cur => { runScan(cur); return cur })
      }, SCAN_INTERVAL_MS)
    }
  }

  function handleManualScan() {
    setState(cur => { runScan(cur); return cur })
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  function saveConfig() {
    setState(prev => addLog({ ...prev, config: cfg }, logEntry('INFO', 'Config saved')))
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)) } catch { /* ignore */ }
  }

  function toggleStrategy(id: string) {
    setCfg(c => ({ ...c, strategies: c.strategies.includes(id) ? c.strategies.filter(s => s !== id) : [...c.strategies, id] }))
  }

  const num = (v: string, fb: number) => { const n = parseFloat(v); return isNaN(n) ? fb : n }

  // ── styles ────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: 'var(--os-surface)', border: '1px solid var(--os-border)',
    borderRadius: 6, padding: 14, overflowY: 'auto',
  }
  const secTitle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
    color: 'var(--os-t3)', marginBottom: 8, marginTop: 12,
  }
  const inp: React.CSSProperties = {
    background: 'var(--os-bg)', border: '1px solid var(--os-border)', borderRadius: 4,
    color: 'var(--os-t1)', padding: '4px 8px', fontSize: 12, width: '100%',
  }
  const rowS: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 0, height: '100%', background: 'var(--os-bg)', overflow: 'hidden' }}>

      {/* ── LEFT: Config ── */}
      <div style={{ ...card, borderRadius: 0, borderTop: 'none', borderBottom: 'none', borderLeft: 'none', overflowY: 'auto' }}>

        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--os-t1)' }}>AUTO-TRADER</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: cfg.enabled ? 'var(--os-green)' : 'var(--os-t3)' }}>
              {cfg.enabled ? 'ENABLED' : 'DISABLED'}
            </span>
            <input type="checkbox" checked={cfg.enabled} onChange={e => setCfg(c => ({ ...c, enabled: e.target.checked }))} />
          </label>
        </div>

        {/* auto-approve warning */}
        {cfg.autoApprove && (
          <div style={{ background: 'rgba(255,78,106,0.1)', border: '1px solid var(--os-red)', borderRadius: 4, padding: '5px 9px', fontSize: 10, color: 'var(--os-red)', marginBottom: 8 }}>
            ⚠ AUTO-APPROVE ON — AI places real trades without confirmation
          </div>
        )}

        {/* scan info */}
        <div style={{ background: 'rgba(77,143,255,0.06)', border: '1px solid var(--os-border)', borderRadius: 4, padding: '6px 10px', fontSize: 10, color: 'var(--os-t3)', marginBottom: 2 }}>
          Automatically scanning <span style={{ color: 'var(--os-blue)', fontWeight: 700 }}>{ALL_INSTRUMENTS.length} instruments</span> — NSE stocks, indices, Forex, MCX metals, Crypto. No manual input needed.
        </div>

        <div style={secTitle}>Risk Controls</div>
        {([
          ['Daily Loss Limit (₹)',  'dailyLossLimit',   1,     999999],
          ['Weekly Loss Limit (₹)', 'weeklyLossLimit',  1,     999999],
          ['Max Drawdown %',        'maxDrawdownPct',   1,     20],
          ['Max Trades/Day',        'maxTradesPerDay',  1,     20],
          ['Max Open Positions',    'maxOpenPositions', 1,     10],
          ['Risk Per Trade %',      'riskPerTrade',     0.5,   5],
          ['Account Size (₹)',      'accountSize',      10000, 99999999],
        ] as [string, keyof AutoTraderConfig, number, number][]).map(([label, key, min, max]) => (
          <div key={key} style={rowS}>
            <label style={{ color: 'var(--os-t3)', fontSize: 11 }}>{label}</label>
            <input type="number" style={{ ...inp, maxWidth: 110, fontSize: 11 }}
              min={min} max={max} step={key === 'riskPerTrade' ? 0.5 : 1}
              value={cfg[key] as number}
              onChange={e => setCfg(c => ({ ...c, [key]: num(e.target.value, c[key] as number) }))}
            />
          </div>
        ))}

        <div style={secTitle}>Active Strategies</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {AVAILABLE_STRATEGIES.map(s => (
            <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11,
              color: cfg.strategies.includes(s.id) ? 'var(--os-blue)' : 'var(--os-t3)' }}>
              <input type="checkbox" checked={cfg.strategies.includes(s.id)} onChange={() => toggleStrategy(s.id)} />
              {s.label}
            </label>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <div>
            <div style={{ color: 'var(--os-t3)', marginBottom: 3, fontSize: 10 }}>Timeframe</div>
            <select style={{ ...inp, fontSize: 11 }} value={cfg.interval} onChange={e => setCfg(c => ({ ...c, interval: e.target.value }))}>
              {['1m','5m','15m','30m','1h','4h','1d'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <div style={{ color: 'var(--os-t3)', marginBottom: 3, fontSize: 10 }}>Broker</div>
            <select style={{ ...inp, fontSize: 11 }} value={cfg.broker} onChange={e => setCfg(c => ({ ...c, broker: e.target.value as AutoTraderConfig['broker'] }))}>
              <option value="paper">Paper Trading</option>
              <option value="angelone">Angel One</option>
              <option value="oanda">OANDA</option>
              <option value="binance">Binance</option>
            </select>
          </div>
        </div>

        <div style={{ ...secTitle, marginTop: 12 }}>Auto-Approve Trades</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 11 }}>
          <input type="checkbox" checked={cfg.autoApprove} onChange={e => setCfg(c => ({ ...c, autoApprove: e.target.checked }))} />
          <span style={{ color: cfg.autoApprove ? 'var(--os-red)' : 'var(--os-t3)' }}>
            {cfg.autoApprove ? 'ON — AI trades automatically' : 'OFF — requires manual approval'}
          </span>
        </label>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={saveConfig} style={{ flex: 1, padding: '7px 0', borderRadius: 4, background: 'var(--os-surface2)', color: 'var(--os-t1)', border: '1px solid var(--os-border)', fontSize: 11, cursor: 'pointer' }}>
            Save Config
          </button>
          <button onClick={handleStartStop} style={{
            flex: 2, padding: '7px 0', borderRadius: 4, border: 'none',
            background: state.running ? 'var(--os-red)' : 'var(--os-green)',
            color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', letterSpacing: 1,
          }}>
            {state.running ? '■ STOP' : '▶ START AUTO-TRADER'}
          </button>
        </div>
      </div>

      {/* ── RIGHT: Live panel ── */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>

        {/* status bar */}
        <div style={{ flexShrink: 0, padding: '8px 14px', background: 'var(--os-surface)', borderBottom: '1px solid var(--os-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ padding: '3px 10px', borderRadius: 3, fontSize: 11, fontWeight: 700,
            background: STATUS_COLOR[state.status] + '22', color: STATUS_COLOR[state.status],
            border: `1px solid ${STATUS_COLOR[state.status]}44` }}>
            {state.status}
          </span>
          {state.lastScanAt && (
            <span style={{ fontSize: 10, color: 'var(--os-t3)' }}>
              Last scan: {new Date(state.lastScanAt).toLocaleTimeString()}
            </span>
          )}
          {scanning && <span style={{ fontSize: 10, color: 'var(--os-blue)' }}>⟳ Scanning…</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={handleManualScan} disabled={scanning}
              style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid var(--os-border)', background: 'var(--os-surface2)', color: 'var(--os-t2)', fontSize: 10, cursor: 'pointer' }}>
              {scanning ? '⟳ Scanning…' : '▶ Scan Now'}
            </button>
          </div>
        </div>

        {state.blockedReason && (
          <div style={{ flexShrink: 0, padding: '5px 14px', background: 'rgba(255,78,106,0.1)', borderBottom: '1px solid var(--os-border)', fontSize: 10, color: 'var(--os-red)' }}>
            🛑 BLOCKED: {state.blockedReason}
          </div>
        )}

        <div style={{ flex: 1, display: 'grid', gridTemplateRows: 'auto 1fr auto', overflow: 'hidden' }}>

          {/* risk meters */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--os-border)', flexShrink: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
              <RiskBar label="Today P&L" value={state.dailyPnL}  limit={state.config.dailyLossLimit} />
              <RiskBar label="Week P&L"  value={state.weeklyPnL} limit={state.config.weeklyLossLimit} />
              <CountBar label="Trades Today"   used={state.tradesToday}   max={state.config.maxTradesPerDay} />
              <CountBar label="Open Positions" used={state.openPositions} max={state.config.maxOpenPositions} />
            </div>
          </div>

          {/* instruments table */}
          <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '6px 14px 4px', borderBottom: '1px solid var(--os-border)', fontSize: 10, fontWeight: 700, color: 'var(--os-t3)', letterSpacing: '0.06em', flexShrink: 0 }}>
              SCANNED INSTRUMENTS ({ALL_INSTRUMENTS.length} total — click "Scan Now" to refresh)
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'var(--os-surface)', position: 'sticky', top: 0, zIndex: 1 }}>
                    {['SYMBOL','EXCH','PRICE','CHG%','RSI','SIGNAL','CONFIDENCE','ACTION'].map(h => (
                      <th key={h} style={{ padding: '5px 10px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: 'var(--os-t3)', letterSpacing: '0.06em', borderBottom: '1px solid var(--os-border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scanRows.length === 0 ? (
                    // show all instruments in waiting state before first scan
                    ALL_INSTRUMENTS.map(inst => (
                      <tr key={inst.symbol} style={{ borderBottom: '1px solid var(--os-border)' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 700, color: 'var(--os-t1)' }}>{inst.symbol}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--os-t3)' }}>{inst.exchange}</td>
                        <td colSpan={5} style={{ padding: '6px 10px', color: 'var(--os-t3)', fontSize: 10 }}>
                          {scanning ? <span style={{ color: 'var(--os-blue)' }}>⟳ fetching…</span> : '— awaiting scan'}
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={{ fontSize: 9, color: 'var(--os-t3)' }}>WAITING</span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    // show actual scan results
                    scanRows.map(row => {
                      const hasSig = (row.signals?.length ?? 0) > 0
                      const top = row.topSignal
                      const isLong = top?.direction === 'LONG'
                      const riskOk = checkRiskLimits(state).allowed
                      const willTrade = hasSig && riskOk && cfg.enabled

                      return (
                        <tr key={row.symbol} style={{ borderBottom: '1px solid var(--os-border)', background: hasSig ? (isLong ? 'rgba(0,212,143,0.04)' : 'rgba(255,78,106,0.04)') : 'transparent' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 700, color: 'var(--os-t1)' }}>{row.symbol}</td>
                          <td style={{ padding: '6px 10px' }}>
                            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--os-surface2)', color: 'var(--os-t3)' }}>{row.exchange}</span>
                          </td>
                          <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: 'var(--os-t1)' }}>
                            {row.price > 0 ? row.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—'}
                          </td>
                          <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: (row.changePct ?? 0) >= 0 ? 'var(--os-green)' : 'var(--os-red)' }}>
                            {row.changePct != null ? `${row.changePct >= 0 ? '+' : ''}${row.changePct.toFixed(2)}%` : '—'}
                          </td>
                          <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: (row.rsi ?? 50) <= 30 ? 'var(--os-green)' : (row.rsi ?? 50) >= 70 ? 'var(--os-red)' : 'var(--os-t2)' }}>
                            {row.rsi > 0 ? row.rsi.toFixed(1) : '—'}
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            {top ? (
                              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, fontWeight: 700,
                                background: isLong ? 'rgba(0,212,143,0.15)' : 'rgba(255,78,106,0.15)',
                                color: isLong ? 'var(--os-green)' : 'var(--os-red)',
                                border: `1px solid ${isLong ? 'var(--os-green)' : 'var(--os-red)'}44` }}>
                                {isLong ? '▲ LONG' : '▼ SHORT'}
                              </span>
                            ) : (
                              <span style={{ fontSize: 9, color: 'var(--os-t3)' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', color: (top?.confidence ?? 0) >= 75 ? 'var(--os-green)' : 'var(--os-amber)' }}>
                            {top ? `${top.confidence}%` : '—'}
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            {hasSig ? (
                              willTrade ? (
                                cfg.autoApprove ? (
                                  <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: 'rgba(0,212,143,0.15)', color: 'var(--os-green)', fontWeight: 700 }}>TRADING</span>
                                ) : (
                                  <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: 'rgba(77,143,255,0.15)', color: 'var(--os-blue)', fontWeight: 700 }}>QUEUED</span>
                                )
                              ) : (
                                <span style={{ fontSize: 9, color: 'var(--os-red)' }}>BLOCKED</span>
                              )
                            ) : (
                              <span style={{ fontSize: 9, color: 'var(--os-t3)' }}>NO SIGNAL</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* activity log */}
          <div style={{ height: 160, borderTop: '1px solid var(--os-border)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '4px 14px', borderBottom: '1px solid var(--os-border)', fontSize: 10, fontWeight: 700, color: 'var(--os-t3)', letterSpacing: '0.06em', flexShrink: 0 }}>ACTIVITY LOG</div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
              {state.log.length === 0 ? (
                <div style={{ fontSize: 10, color: 'var(--os-t3)' }}>No activity yet. Click Start to begin.</div>
              ) : (
                [...state.log].reverse().map((entry, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3, fontSize: 10, lineHeight: 1.4 }}>
                    <span style={{ color: 'var(--os-t3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {new Date(entry.ts).toLocaleTimeString()}
                    </span>
                    <span style={{ color: LOG_COLOR[entry.type], fontWeight: 700, flexShrink: 0, minWidth: 65 }}>
                      [{entry.type}]
                    </span>
                    <span style={{ color: 'var(--os-t1)' }}>{entry.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
