'use client'

import { useState, useEffect } from 'react'
import type { RiskSettings } from '@/lib/os/types'

const DEFAULT_RISK_SETTINGS: RiskSettings = {
  dailyLossLimit:   5000,
  weeklyLossLimit:  15000,
  maxDrawdownPct:   10,
  maxPositions:     5,
  riskPerTrade:     1,
  autoStopEnabled:  false,
  marginLimit:      500000,
  accountSize:      1000000,
}

type LimitStatus = 'SAFE' | 'WARNING' | 'DANGER'

function limitStatus(used: number, limit: number): LimitStatus {
  const pct = (used / limit) * 100
  if (pct < 50) return 'SAFE'
  if (pct < 75) return 'WARNING'
  return 'DANGER'
}

function statusColor(s: LimitStatus): string {
  if (s === 'SAFE')    return 'var(--os-green)'
  if (s === 'WARNING') return 'var(--os-amber)'
  return 'var(--os-red)'
}

function statusBadgeClass(s: LimitStatus): string {
  if (s === 'SAFE')    return 'os-badge-green'
  if (s === 'WARNING') return 'os-badge-amber'
  return 'os-badge-red'
}

function LimitBar({ label, used, limit, unit = '₹' }: { label: string; used: number; limit: number; unit?: string }) {
  const pct = Math.min((Math.abs(used) / limit) * 100, 100)
  const st  = limitStatus(Math.abs(used), limit)
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--os-t2)' }}>{label}</span>
        <span className={`os-badge ${statusBadgeClass(st)}`} style={{ fontSize: 9 }}>{st}</span>
      </div>
      <div className="os-progress" style={{ height: 6 }}>
        <div className="os-progress-fill" style={{ width: `${pct}%`, background: statusColor(st), transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 10, fontFamily: 'var(--font-mono)' }}>
        <span style={{ color: statusColor(st) }}>{unit}{Math.abs(used).toLocaleString('en-IN')} used</span>
        <span style={{ color: 'var(--os-t3)' }}>{unit}{limit.toLocaleString('en-IN')} limit · {pct.toFixed(0)}%</span>
      </div>
    </div>
  )
}

// ── Position Size Calculator ──────────────────────────────────────────────────
function PositionCalc({ accountSize }: { accountSize: number }) {
  const [riskPct,   setRiskPct]   = useState('1')
  const [entryPx,   setEntryPx]   = useState('')
  const [slPx,      setSlPx]      = useState('')
  const [targetPx,  setTargetPx]  = useState('')
  const [result,    setResult]    = useState<{ riskAmt: number; qty: number; lots: number; rr: number } | null>(null)

  const calculate = () => {
    const entry  = parseFloat(entryPx)
    const sl     = parseFloat(slPx)
    const target = parseFloat(targetPx)
    const rPct   = parseFloat(riskPct) / 100
    if (!entry || !sl || isNaN(sl)) return
    const riskAmt = accountSize * rPct
    const riskPip = Math.abs(entry - sl)
    if (riskPip === 0) return
    const qty  = Math.floor(riskAmt / riskPip)
    const lots = +(qty / 50).toFixed(2)
    const rr   = target ? +(Math.abs(target - entry) / riskPip).toFixed(2) : 0
    setResult({ riskAmt, qty, lots, rr })
  }

  return (
    <div className="os-card" style={{ padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--os-t1)', marginBottom: 10, letterSpacing: '0.04em' }}>POSITION SIZE CALCULATOR</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <div className="os-label" style={{ marginBottom: 3 }}>Risk %</div>
          <input value={riskPct} onChange={e => setRiskPct(e.target.value)} className="os-input" style={{ fontSize: 11, width: '100%' }} placeholder="1" />
        </div>
        <div>
          <div className="os-label" style={{ marginBottom: 3 }}>Entry Price</div>
          <input value={entryPx} onChange={e => setEntryPx(e.target.value)} className="os-input" style={{ fontSize: 11, width: '100%' }} placeholder="24500" />
        </div>
        <div>
          <div className="os-label" style={{ marginBottom: 3 }}>Stop Loss</div>
          <input value={slPx} onChange={e => setSlPx(e.target.value)} className="os-input" style={{ fontSize: 11, width: '100%' }} placeholder="24200" />
        </div>
        <div>
          <div className="os-label" style={{ marginBottom: 3 }}>Target</div>
          <input value={targetPx} onChange={e => setTargetPx(e.target.value)} className="os-input" style={{ fontSize: 11, width: '100%' }} placeholder="25100" />
        </div>
      </div>
      <button className="os-btn os-btn-primary" style={{ fontSize: 10, marginBottom: result ? 10 : 0 }} onClick={calculate}>CALCULATE</button>
      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 8 }}>
          <div className="os-card" style={{ padding: '6px 8px', background: 'var(--os-surface2)' }}>
            <div className="os-label" style={{ marginBottom: 2 }}>Risk Amount</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--os-red)' }}>₹{result.riskAmt.toLocaleString('en-IN')}</div>
          </div>
          <div className="os-card" style={{ padding: '6px 8px', background: 'var(--os-surface2)' }}>
            <div className="os-label" style={{ marginBottom: 2 }}>Qty (shares)</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--os-t1)' }}>{result.qty}</div>
          </div>
          <div className="os-card" style={{ padding: '6px 8px', background: 'var(--os-surface2)' }}>
            <div className="os-label" style={{ marginBottom: 2 }}>Lots (F&O)</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--os-blue)' }}>{result.lots}</div>
          </div>
          <div className="os-card" style={{ padding: '6px 8px', background: 'var(--os-surface2)' }}>
            <div className="os-label" style={{ marginBottom: 2 }}>R:R Ratio</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: result.rr >= 2 ? 'var(--os-green)' : result.rr >= 1.5 ? 'var(--os-amber)' : 'var(--os-red)' }}>{result.rr > 0 ? `1:${result.rr}` : '--'}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Settings form ─────────────────────────────────────────────────────────────
function SettingsForm({ settings, onSave, onCancel }: { settings: RiskSettings; onSave: (s: RiskSettings) => void; onCancel: () => void }) {
  const [form, setForm] = useState<RiskSettings>({ ...settings })
  const upd = (k: keyof RiskSettings, v: number | boolean) => setForm(f => ({ ...f, [k]: v }))

  const fields: [keyof RiskSettings, string, 'number' | 'boolean'][] = [
    ['dailyLossLimit',  'Daily Loss Limit (₹)',  'number'],
    ['weeklyLossLimit', 'Weekly Loss Limit (₹)', 'number'],
    ['maxDrawdownPct',  'Max Drawdown (%)',       'number'],
    ['maxPositions',    'Max Open Positions',     'number'],
    ['riskPerTrade',    'Risk Per Trade (%)',     'number'],
    ['marginLimit',     'Margin Limit (₹)',       'number'],
    ['accountSize',     'Account Size (₹)',       'number'],
  ]

  return (
    <div className="os-card" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--os-t1)', marginBottom: 10 }}>RISK SETTINGS</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {fields.map(([key, label]) => (
          <div key={key}>
            <div className="os-label" style={{ marginBottom: 3 }}>{label}</div>
            <input
              type="number"
              value={form[key] as number}
              onChange={e => upd(key, parseFloat(e.target.value))}
              className="os-input"
              style={{ fontSize: 11, width: '100%' }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="os-btn os-btn-primary" style={{ fontSize: 10 }} onClick={() => onSave(form)}>Save Settings</button>
        <button className="os-btn" style={{ fontSize: 10 }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function RiskView() {
  const [settings, setSettings] = useState<RiskSettings>(() => {
    try {
      const saved = localStorage.getItem('os_risk_settings')
      return saved ? JSON.parse(saved) : DEFAULT_RISK_SETTINGS
    } catch { return DEFAULT_RISK_SETTINGS }
  })
  const [editing,          setEditing]          = useState(false)
  const [autoStop,         setAutoStop]         = useState(settings.autoStopEnabled)
  const [autoStopWarn,     setAutoStopWarn]     = useState(false)

  const dailyPnL   = -2500
  const weeklyPnL  = -1200
  const drawdownPct = 1.2
  const positions  = 3
  const exposure   = 423617

  useEffect(() => {
    localStorage.setItem('os_risk_settings', JSON.stringify(settings))
  }, [settings])

  const handleSave = (s: RiskSettings) => { setSettings(s); setEditing(false) }

  const toggleAutoStop = () => {
    if (!autoStop) setAutoStopWarn(true)
    setAutoStop(p => !p)
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16, gap: 12, background: 'var(--os-bg)', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--os-t1)', letterSpacing: '0.06em' }}>RISK MANAGEMENT</span>
          <span className="os-badge os-badge-green" style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 3 }}>
            <span className="os-live-dot" style={{ width: 5, height: 5, background: 'var(--os-green)' }} /> Live
          </span>
        </div>
        <button className="os-btn" style={{ fontSize: 10 }} onClick={() => setEditing(e => !e)}>
          {editing ? '✕ Cancel Edit' : '⚙ Edit Settings'}
        </button>
      </div>

      {editing && <SettingsForm settings={settings} onSave={handleSave} onCancel={() => setEditing(false)} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Daily limits */}
        <div className="os-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--os-t1)', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span>DAILY LIMITS</span>
            <span style={{ fontSize: 10, color: 'var(--os-t3)', fontWeight: 400 }}>{new Date().toLocaleDateString('en-IN')}</span>
          </div>
          <LimitBar label="Daily Loss"   used={dailyPnL}   limit={settings.dailyLossLimit}   />
          <LimitBar label="Weekly Loss"  used={weeklyPnL}  limit={settings.weeklyLossLimit}  />
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--os-t2)' }}>Max Drawdown</span>
              <span className={`os-badge ${statusBadgeClass(limitStatus(drawdownPct, settings.maxDrawdownPct))}`} style={{ fontSize: 9 }}>
                {limitStatus(drawdownPct, settings.maxDrawdownPct)}
              </span>
            </div>
            <div className="os-progress" style={{ height: 6 }}>
              <div className="os-progress-fill" style={{ width: `${(drawdownPct / settings.maxDrawdownPct) * 100}%`, background: statusColor(limitStatus(drawdownPct, settings.maxDrawdownPct)) }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--os-t3)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>{drawdownPct}% / {settings.maxDrawdownPct}% max</div>
          </div>
        </div>

        {/* Position limits */}
        <div className="os-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--os-t1)', marginBottom: 12 }}>POSITION LIMITS</div>
          <LimitBar label="Open Positions" used={positions} limit={settings.maxPositions}  unit="" />
          <LimitBar label="Exposure"       used={exposure}  limit={settings.marginLimit}        />

          {/* Auto-stop */}
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 6, border: `1px solid ${autoStop ? 'var(--os-green)' : 'var(--os-border)'}`, background: autoStop ? 'rgba(34,197,94,0.06)' : 'var(--os-surface2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--os-t1)' }}>AUTO-STOP TRADING</span>
              <label className="os-toggle">
                <input type="checkbox" checked={autoStop} onChange={toggleAutoStop} />
                <span />
              </label>
            </div>
            {autoStop ? (
              <div style={{ fontSize: 10, color: 'var(--os-green)' }}>
                ✓ Auto-stop ACTIVE — will halt at ₹{settings.dailyLossLimit.toLocaleString('en-IN')} daily loss
              </div>
            ) : (
              <div style={{ fontSize: 10, color: 'var(--os-t3)' }}>
                Auto-stop disabled — trading allowed
              </div>
            )}
            {autoStopWarn && !autoStop && (
              <div style={{ fontSize: 10, color: 'var(--os-amber)', marginTop: 4 }}>
                ⚠ Enable auto-stop to protect against excessive losses
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Position calculator */}
      <PositionCalc accountSize={settings.accountSize} />

      {/* Risk metrics strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          { label: 'Sharpe Ratio',           value: '1.42',  color: 'var(--os-green)',  sub: 'Risk-adjusted return' },
          { label: 'Max Consec. Losses',     value: '3',     color: 'var(--os-amber)',  sub: 'All time record' },
          { label: 'Avg Risk Per Trade',     value: '0.8%',  color: 'var(--os-blue)',   sub: 'Last 30 trades' },
        ].map(c => (
          <div key={c.label} className="os-card" style={{ padding: '10px 14px', textAlign: 'center' }}>
            <div className="os-label" style={{ marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 9, color: 'var(--os-t3)', marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
