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

function logEntry(
  type: AutoTraderLogEntry['type'],
  message: string,
  data?: unknown
): AutoTraderLogEntry { return { ts: ts(), type, message, data } }

// ── status badge ─────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<AutoTraderState['status'], string> = {
  IDLE:         'var(--os-t3)',
  SCANNING:     'var(--os-blue)',
  SIGNAL_FOUND: 'var(--os-amber)',
  RISK_CHECK:   'var(--os-amber)',
  BLOCKED:      'var(--os-red)',
  PLACING_ORDER:'var(--os-blue)',
  ACTIVE:       'var(--os-green)',
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

function RiskBar({ label, value, limit, redThreshold }: {
  label: string; value: number; limit: number; redThreshold?: number
}) {
  const pct    = limit > 0 ? Math.min(Math.abs(value) / limit * 100, 100) : 0
  const isNeg  = value < 0
  const isWarn = redThreshold != null ? pct >= redThreshold : pct >= 80
  const barClr = isWarn ? 'var(--os-red)' : isNeg ? 'var(--os-red)' : 'var(--os-green)'

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--os-t3)', marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color: isNeg ? 'var(--os-red)' : 'var(--os-green)' }}>
          {value >= 0 ? '+' : ''}₹{value.toFixed(0)} / ₹{limit}
        </span>
      </div>
      <div style={{ background: 'var(--os-bg)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barClr, transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

function CountBar({ label, used, max }: { label: string; used: number; max: number }) {
  const pct  = max > 0 ? Math.min(used / max * 100, 100) : 0
  const warn = pct >= 80
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
      <span style={{ color: 'var(--os-t3)', minWidth: 140 }}>{label}</span>
      <div style={{ flex: 1, background: 'var(--os-bg)', borderRadius: 3, height: 6 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: warn ? 'var(--os-red)' : 'var(--os-blue)', transition: 'width 0.3s' }} />
      </div>
      <span style={{ color: warn ? 'var(--os-red)' : 'var(--os-t1)', minWidth: 40, textAlign: 'right' }}>{used}/{max}</span>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function AutoTraderPanel() {
  const [cfg,   setCfg]   = useState<AutoTraderConfig>(createDefaultConfig)
  const [state, setState] = useState<AutoTraderState>(() => createDefaultState(createDefaultConfig()))
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // hydrate from localStorage on mount
  useEffect(() => {
    const c = loadConfig()
    const s = loadState(c)
    setCfg(c)
    setState(s)
  }, [])

  // persist state
  useEffect(() => {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
  }, [state])

  // ── scan loop ──────────────────────────────────────────────────────────────

  const runScan = useCallback(async (currentState: AutoTraderState) => {
    setState(prev => ({ ...prev, status: 'SCANNING', lastScanAt: ts() }))

    const riskCheck = checkRiskLimits(currentState)
    if (!riskCheck.allowed) {
      setState(prev =>
        addLog(
          { ...prev, status: 'BLOCKED', blockedReason: riskCheck.reason },
          logEntry('RISK_BLOCK', riskCheck.reason!)
        )
      )
      return
    }

    try {
      const params = new URLSearchParams({ interval: currentState.config.interval })
      const res = await fetch(`/api/strategy/scan?${params}`)

      if (!res.ok) throw new Error(`Scan failed: ${res.status}`)
      const data = await res.json()
      // Extract only rows that have signals
      const signals = (data.rows ?? []).filter((r: { signals?: unknown[] }) => (r.signals?.length ?? 0) > 0)

      if (!signals?.length) {
        setState(prev =>
          addLog({ ...prev, status: 'ACTIVE' }, logEntry('INFO', 'Scan complete — no signals'))
        )
        return
      }

      for (const signal of signals) {
        setState(prev =>
          addLog({ ...prev, status: 'SIGNAL_FOUND' }, logEntry('SIGNAL', `Signal: ${signal.symbol} ${signal.direction}`, signal))
        )

        setState(prev => {
          const check = checkRiskLimits(prev)
          if (!check.allowed) {
            return addLog(
              { ...prev, status: 'BLOCKED', blockedReason: check.reason },
              logEntry('RISK_BLOCK', check.reason!)
            )
          }

          if (prev.config.autoApprove && prev.config.broker !== 'paper') {
            // fire-and-forget order placement
            placeBrokerOrder(signal, prev.config)
              .then(result => {
                setState(s =>
                  addLog(
                    { ...s, tradesToday: s.tradesToday + 1, status: 'ACTIVE' },
                    logEntry('ORDER', `Order placed: ${signal.symbol}`, result)
                  )
                )
              })
              .catch(err => {
                setState(s =>
                  addLog({ ...s, status: 'ACTIVE' }, logEntry('ERROR', err.message))
                )
              })
            return addLog({ ...prev, status: 'PLACING_ORDER' }, logEntry('INFO', `Placing order for ${signal.symbol}…`))
          }

          // manual approval — emit event for signal queue
          window.dispatchEvent(new CustomEvent('autotrader:signal', { detail: signal }))
          return addLog({ ...prev, status: 'ACTIVE' }, logEntry('SIGNAL', `Signal queued for approval: ${signal.symbol}`))
        })
      }
    } catch (err) {
      setState(prev =>
        addLog({ ...prev, status: 'ACTIVE' }, logEntry('ERROR', err instanceof Error ? err.message : 'Scan error'))
      )
    }
  }, [])

  async function placeBrokerOrder(signal: unknown, config: AutoTraderConfig) {
    const endpoint =
      config.broker === 'angelone' ? '/api/angelone/order' :
      config.broker === 'oanda'    ? '/api/oanda/order'    :
      config.broker === 'binance'  ? '/api/binance/order'  : null

    if (!endpoint) return { paper: true }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signal),
    })
    if (!res.ok) throw new Error(`Order API error: ${res.status}`)
    return res.json()
  }

  // start / stop
  function handleStartStop() {
    if (state.running) {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
      setState(prev =>
        addLog({ ...prev, running: false, status: 'IDLE' }, logEntry('INFO', 'Auto-trader stopped'))
      )
    } else {
      setState(prev => {
        const next = addLog(
          { ...prev, running: true, status: 'SCANNING' },
          logEntry('INFO', `Auto-trader started — scanning every 5 min`)
        )
        // run first scan immediately using next state
        runScan(next)
        return next
      })
      timerRef.current = setInterval(() => {
        setState(current => { runScan(current); return current })
      }, SCAN_INTERVAL_MS)
    }
  }

  // cleanup on unmount
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  // ── config helpers ─────────────────────────────────────────────────────────

  function saveConfig() {
    const updated = { ...state, config: cfg }
    setState(addLog(updated, logEntry('INFO', 'Config saved')))
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)) } catch { /* ignore */ }
  }

  function toggleStrategy(id: string) {
    setCfg(c => ({
      ...c,
      strategies: c.strategies.includes(id)
        ? c.strategies.filter(s => s !== id)
        : [...c.strategies, id],
    }))
  }

  const num = (val: string, fallback: number) => { const n = parseFloat(val); return isNaN(n) ? fallback : n }

  // ── render ─────────────────────────────────────────────────────────────────

  const panelStyle: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
    padding: 16, background: 'var(--os-bg)', color: 'var(--os-t1)',
    fontFamily: 'monospace', fontSize: 12, height: '100%',
  }
  const card: React.CSSProperties = {
    background: 'var(--os-surface)', border: '1px solid var(--os-border)',
    borderRadius: 6, padding: 14, overflowY: 'auto',
  }
  const sectionTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 1, color: 'var(--os-t3)', marginBottom: 10, marginTop: 14,
  }
  const inputStyle: React.CSSProperties = {
    background: 'var(--os-bg)', border: '1px solid var(--os-border)', borderRadius: 4,
    color: 'var(--os-t1)', padding: '4px 8px', fontSize: 12, width: '100%',
  }
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }

  return (
    <div style={panelStyle}>

      {/* ── LEFT: Config ── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Auto-Trader Config</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <span style={{ color: cfg.enabled ? 'var(--os-green)' : 'var(--os-t3)' }}>
              {cfg.enabled ? 'ENABLED' : 'DISABLED'}
            </span>
            <input type="checkbox" checked={cfg.enabled}
              onChange={e => setCfg(c => ({ ...c, enabled: e.target.checked }))} />
          </label>
        </div>

        {cfg.enabled && cfg.autoApprove && (
          <div style={{ background: '#3a0000', border: '1px solid var(--os-red)', borderRadius: 4, padding: '6px 10px', marginTop: 8, fontSize: 11, color: 'var(--os-red)' }}>
            ⚠ AUTO-APPROVE ON — AI places real trades without confirmation
          </div>
        )}

        <div style={sectionTitle}>Risk Controls</div>

        {([
          ['Daily Loss Limit (₹)',  'dailyLossLimit',   1,      999999],
          ['Weekly Loss Limit (₹)', 'weeklyLossLimit',  1,      999999],
          ['Max Drawdown %',        'maxDrawdownPct',   1,      20],
          ['Max Trades/Day',        'maxTradesPerDay',  1,      20],
          ['Max Open Positions',    'maxOpenPositions', 1,      10],
          ['Risk Per Trade %',      'riskPerTrade',     0.5,    5],
          ['Account Size (₹)',      'accountSize',      10000,  99999999],
        ] as [string, keyof AutoTraderConfig, number, number][]).map(([label, key, min, max]) => (
          <div key={key} style={row}>
            <label style={{ color: 'var(--os-t3)', minWidth: 160 }}>{label}</label>
            <input type="number" style={{ ...inputStyle, maxWidth: 120 }}
              min={min} max={max} step={key === 'riskPerTrade' ? 0.5 : 1}
              value={cfg[key] as number}
              onChange={e => setCfg(c => ({ ...c, [key]: num(e.target.value, c[key] as number) }))}
            />
          </div>
        ))}

        <div style={sectionTitle}>Strategies</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {AVAILABLE_STRATEGIES.map(s => (
            <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
              color: cfg.strategies.includes(s.id) ? 'var(--os-blue)' : 'var(--os-t3)' }}>
              <input type="checkbox" checked={cfg.strategies.includes(s.id)}
                onChange={() => toggleStrategy(s.id)} />
              {s.label}
            </label>
          ))}
        </div>

        <div style={sectionTitle}>Symbols (one per line)</div>
        <textarea style={{ ...inputStyle, height: 70, resize: 'vertical' }}
          value={cfg.symbols.join('\n')}
          onChange={e => setCfg(c => ({
            ...c,
            symbols: e.target.value.split('\n').map(s => s.trim()).filter(Boolean),
          }))}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <div>
            <div style={{ color: 'var(--os-t3)', marginBottom: 4, fontSize: 11 }}>Interval</div>
            <select style={inputStyle} value={cfg.interval}
              onChange={e => setCfg(c => ({ ...c, interval: e.target.value }))}>
              {['1m','5m','15m','30m','1h','4h','1d'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <div style={{ color: 'var(--os-t3)', marginBottom: 4, fontSize: 11 }}>Broker</div>
            <select style={inputStyle} value={cfg.broker}
              onChange={e => setCfg(c => ({ ...c, broker: e.target.value as AutoTraderConfig['broker'] }))}>
              <option value="paper">Paper Trading</option>
              <option value="angelone">Angel One</option>
              <option value="oanda">OANDA</option>
              <option value="binance">Binance</option>
            </select>
          </div>
        </div>

        <div style={{ ...sectionTitle, marginTop: 14 }}>Auto-Approve</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={cfg.autoApprove}
            onChange={e => setCfg(c => ({ ...c, autoApprove: e.target.checked }))} />
          <span style={{ color: cfg.autoApprove ? 'var(--os-red)' : 'var(--os-t3)' }}>
            {cfg.autoApprove ? 'ON' : 'OFF'}
          </span>
        </label>
        {cfg.autoApprove && (
          <div style={{ color: 'var(--os-red)', fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
            WARNING: AI will place real trades without your approval. Use only with proven strategies.
          </div>
        )}

        <button onClick={saveConfig} style={{
          marginTop: 14, width: '100%', padding: '8px 0', borderRadius: 4,
          background: 'var(--os-blue)', color: '#fff', border: 'none',
          fontFamily: 'monospace', fontSize: 12, cursor: 'pointer',
        }}>
          Save Config
        </button>
      </div>

      {/* ── RIGHT: Status ── */}
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Live Status</span>
          <span style={{
            padding: '3px 10px', borderRadius: 3, fontSize: 11, fontWeight: 700,
            background: STATUS_COLOR[state.status] + '22',
            color: STATUS_COLOR[state.status],
            border: `1px solid ${STATUS_COLOR[state.status]}44`,
          }}>
            {state.status}
          </span>
        </div>

        {state.blockedReason && (
          <div style={{ background: '#3a0000', border: '1px solid var(--os-red)', borderRadius: 4,
            padding: '6px 10px', fontSize: 11, color: 'var(--os-red)' }}>
            {state.blockedReason}
          </div>
        )}

        {/* risk dashboard */}
        <div>
          <div style={sectionTitle}>Risk Dashboard</div>
          <RiskBar label="Today's P&L" value={state.dailyPnL}  limit={state.config.dailyLossLimit} />
          <RiskBar label="Weekly P&L"  value={state.weeklyPnL} limit={state.config.weeklyLossLimit} />

          {/* drawdown bar */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--os-t3)', marginBottom: 3 }}>
              <span>Drawdown %</span>
              <span style={{ color: state.drawdownPct >= 3 ? 'var(--os-red)' : 'var(--os-t1)' }}>
                {state.drawdownPct.toFixed(2)}% / {state.config.maxDrawdownPct}%
              </span>
            </div>
            <div style={{ background: 'var(--os-bg)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(state.drawdownPct / state.config.maxDrawdownPct * 100, 100)}%`,
                height: '100%',
                background: state.drawdownPct >= 3 ? 'var(--os-red)' : 'var(--os-blue)',
                transition: 'width 0.3s',
              }} />
            </div>
          </div>

          <CountBar label="Trades Today"    used={state.tradesToday}    max={state.config.maxTradesPerDay} />
          <CountBar label="Open Positions"  used={state.openPositions}  max={state.config.maxOpenPositions} />

          {state.lastScanAt && (
            <div style={{ fontSize: 11, color: 'var(--os-t3)', marginTop: 4 }}>
              Last scan: {new Date(state.lastScanAt).toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* start/stop */}
        <button onClick={handleStartStop} style={{
          padding: '8px 0', borderRadius: 4, border: 'none',
          background: state.running ? 'var(--os-red)' : 'var(--os-green)',
          color: '#fff', fontFamily: 'monospace', fontSize: 12,
          fontWeight: 700, cursor: 'pointer', letterSpacing: 1,
        }}>
          {state.running ? 'STOP AUTO-TRADER' : 'START AUTO-TRADER'}
        </button>

        {/* activity log */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={sectionTitle}>Activity Log</div>
          <div style={{
            flex: 1, overflowY: 'auto', background: 'var(--os-bg)',
            borderRadius: 4, border: '1px solid var(--os-border)',
            padding: 8, maxHeight: 220,
          }}>
            {state.log.length === 0 && (
              <div style={{ color: 'var(--os-t3)', fontSize: 11 }}>No activity yet.</div>
            )}
            {[...state.log].reverse().map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 11, lineHeight: 1.4 }}>
                <span style={{ color: 'var(--os-t3)', whiteSpace: 'nowrap' }}>
                  {new Date(entry.ts).toLocaleTimeString()}
                </span>
                <span style={{ color: LOG_COLOR[entry.type], fontWeight: 700, minWidth: 70 }}>[{entry.type}]</span>
                <span style={{ color: 'var(--os-t1)' }}>{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
