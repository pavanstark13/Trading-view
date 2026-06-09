'use client'

import { useState, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type RuleCondition =
  | 'RSI < 30' | 'RSI > 70'
  | 'MACD Cross Up' | 'MACD Cross Down'
  | 'Price > EMA20' | 'Price < EMA20'
  | 'Price > EMA50' | 'Price < EMA50'
  | 'Supertrend Bull' | 'Supertrend Bear'
  | 'BB Breakout' | 'Stoch Oversold' | 'Stoch Overbought'

interface Rule {
  id: string
  condition: RuleCondition
  logic: 'AND' | 'OR'
}

type Verdict = 'PASSED' | 'MARGINAL' | 'FAILED'

interface ValidationResult {
  verdict: Verdict
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  profitFactor: number
  expectancy: number
  maxDrawdownPct: number
  totalR: number
  candleCount: number
  symbol: string
  interval: string
}

interface SavedStrategy {
  id: string
  name: string
  description: string
  timeframe: string
  rr: number
  direction: 'LONG' | 'SHORT'
  rules: Rule[]
  verdict: Verdict
  winRate: number
  profitFactor: number
  totalTrades: number
  savedAt: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const CONDITIONS: RuleCondition[] = [
  'RSI < 30', 'RSI > 70',
  'MACD Cross Up', 'MACD Cross Down',
  'Price > EMA20', 'Price < EMA20',
  'Price > EMA50', 'Price < EMA50',
  'Supertrend Bull', 'Supertrend Bear',
  'BB Breakout', 'Stoch Oversold', 'Stoch Overbought',
]

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d']
const RR_OPTIONS = [1.5, 2, 2.5, 3]

const LS_KEY = 'custom_strategies'

function uid(): string {
  return Math.random().toString(36).slice(2, 8)
}

function loadSaved(): SavedStrategy[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
}

function saveToDB(s: SavedStrategy[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(s))
}

// ── Sub-components ────────────────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const color =
    verdict === 'PASSED'   ? 'var(--os-green)' :
    verdict === 'MARGINAL' ? 'var(--os-amber)' :
                             'var(--os-red)'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700,
      letterSpacing: '0.06em',
      background: `${color}18`, color, border: `1px solid ${color}40`,
    }}>
      {verdict === 'PASSED' ? '✓' : verdict === 'MARGINAL' ? '~' : '✕'} {verdict}
    </span>
  )
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--os-surface3)', border: '1px solid var(--os-border)',
      borderRadius: 6, padding: '10px 14px', minWidth: 100,
    }}>
      <div style={{ fontSize: 10, color: 'var(--os-t3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--os-t1)', fontFamily: 'var(--font-mono)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--os-t3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CustomStrategyBuilder() {
  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [timeframe, setTimeframe] = useState('1h')
  const [rr, setRr] = useState<number>(2)
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG')
  const [rules, setRules] = useState<Rule[]>([
    { id: uid(), condition: 'RSI < 30', logic: 'AND' },
    { id: uid(), condition: 'Supertrend Bull', logic: 'AND' },
  ])

  // Validation state
  const [validating, setValidating] = useState(false)
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Saved strategies
  const [saved, setSaved] = useState<SavedStrategy[]>(loadSaved)
  const [showSaved, setShowSaved] = useState(false)

  // ── Rule management ─────────────────────────────────────────────────────────

  const addRule = useCallback(() => {
    if (rules.length >= 5) return
    setRules(r => [...r, { id: uid(), condition: 'MACD Cross Up', logic: 'AND' }])
  }, [rules.length])

  const removeRule = useCallback((id: string) => {
    setRules(r => r.filter(x => x.id !== id))
  }, [])

  const updateRule = useCallback((id: string, patch: Partial<Rule>) => {
    setRules(r => r.map(x => x.id === id ? { ...x, ...patch } : x))
  }, [])

  // ── Validation ──────────────────────────────────────────────────────────────

  const validate = useCallback(async () => {
    if (rules.length < 2) { setError('Add at least 2 rules before validating.'); return }
    setValidating(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/backtest/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: rules.map(r => ({ condition: r.condition, logic: r.logic })),
          direction,
          rr,
          symbol: 'RELIANCE.NS',
          interval: timeframe,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error ?? 'Validation failed.'); return }
      setResult(data as ValidationResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setValidating(false)
    }
  }, [rules, direction, rr, timeframe])

  // ── Save ────────────────────────────────────────────────────────────────────

  const saveStrategy = useCallback(() => {
    if (!result || !name.trim()) return
    const entry: SavedStrategy = {
      id: uid(),
      name: name.trim(),
      description: description.trim(),
      timeframe, rr, direction, rules,
      verdict: result.verdict,
      winRate: result.winRate,
      profitFactor: result.profitFactor,
      totalTrades: result.totalTrades,
      savedAt: new Date().toISOString(),
    }
    const updated = [entry, ...saved]
    setSaved(updated)
    saveToDB(updated)
  }, [result, name, description, timeframe, rr, direction, rules, saved])

  const deleteStrategy = useCallback((id: string) => {
    const updated = saved.filter(s => s.id !== id)
    setSaved(updated)
    saveToDB(updated)
  }, [saved])

  // ── Render ──────────────────────────────────────────────────────────────────

  const canSave = result && (result.verdict === 'PASSED' || result.verdict === 'MARGINAL') && name.trim().length > 0

  const selectStyle: React.CSSProperties = {
    background: 'var(--os-surface3)', border: '1px solid var(--os-border2)',
    color: 'var(--os-t1)', borderRadius: 5, padding: '6px 10px', fontSize: 13,
    outline: 'none', cursor: 'pointer',
  }

  const inputStyle: React.CSSProperties = {
    ...selectStyle, width: '100%',
  }

  const btnPrimary: React.CSSProperties = {
    background: 'var(--os-blue)', color: '#fff', border: 'none',
    borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', letterSpacing: '0.03em',
  }

  const sectionHead: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
    color: 'var(--os-t3)', textTransform: 'uppercase', marginBottom: 10,
  }

  return (
    <div style={{ color: 'var(--os-t1)', fontFamily: 'var(--font-ui)', maxWidth: 780 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Custom Strategy Builder</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--os-t3)' }}>
            Define rules, validate via backtesting, then save your strategy.
          </p>
        </div>
        <button
          onClick={() => setShowSaved(v => !v)}
          style={{ ...selectStyle, fontSize: 12, padding: '5px 14px' }}
        >
          {showSaved ? 'Builder' : `Saved (${saved.length})`}
        </button>
      </div>

      {/* ── Saved Strategies View ── */}
      {showSaved ? (
        <div>
          <div style={sectionHead}>Saved Strategies</div>
          {saved.length === 0 ? (
            <div style={{ color: 'var(--os-t3)', fontSize: 13, padding: '20px 0' }}>
              No saved strategies yet. Build and validate one first.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {saved.map(s => (
                <div key={s.id} style={{
                  background: 'var(--os-surface2)', border: '1px solid var(--os-border)',
                  borderRadius: 8, padding: '12px 16px',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</span>
                      <VerdictBadge verdict={s.verdict} />
                      <span style={{ fontSize: 11, color: 'var(--os-t3)' }}>{s.timeframe} · {s.direction} · RR {s.rr}</span>
                    </div>
                    {s.description && (
                      <div style={{ fontSize: 12, color: 'var(--os-t2)', marginBottom: 6 }}>{s.description}</div>
                    )}
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--os-t3)' }}>
                      <span>WR <strong style={{ color: 'var(--os-t1)' }}>{s.winRate}%</strong></span>
                      <span>PF <strong style={{ color: 'var(--os-t1)' }}>{s.profitFactor}</strong></span>
                      <span>Trades <strong style={{ color: 'var(--os-t1)' }}>{s.totalTrades}</strong></span>
                      <span style={{ color: 'var(--os-t4)' }}>{new Date(s.savedAt).toLocaleDateString()}</span>
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {s.rules.map((r, i) => (
                        <span key={r.id} style={{
                          fontSize: 10, padding: '2px 7px', borderRadius: 3,
                          background: 'var(--os-surface3)', border: '1px solid var(--os-border)',
                          color: 'var(--os-t2)',
                        }}>
                          {i > 0 && <span style={{ color: 'var(--os-blue)', marginRight: 4 }}>{r.logic}</span>}
                          {r.condition}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteStrategy(s.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--os-t4)', cursor: 'pointer', fontSize: 16, padding: 4, flexShrink: 0 }}
                    title="Delete"
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── Builder View ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Metadata */}
          <div style={{ background: 'var(--os-surface2)', border: '1px solid var(--os-border)', borderRadius: 8, padding: 16 }}>
            <div style={sectionHead}>Strategy Metadata</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--os-t3)', display: 'block', marginBottom: 4 }}>NAME *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. RSI Reversal + Supertrend"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--os-t3)', display: 'block', marginBottom: 4 }}>DESCRIPTION</label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Brief description of the strategy"
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--os-t3)', display: 'block', marginBottom: 4 }}>TIMEFRAME</label>
                <select value={timeframe} onChange={e => setTimeframe(e.target.value)} style={selectStyle}>
                  {TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--os-t3)', display: 'block', marginBottom: 4 }}>RISK:REWARD</label>
                <select value={rr} onChange={e => setRr(Number(e.target.value))} style={selectStyle}>
                  {RR_OPTIONS.map(v => <option key={v} value={v}>1:{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--os-t3)', display: 'block', marginBottom: 4 }}>DIRECTION</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['LONG', 'SHORT'] as const).map(d => (
                    <button
                      key={d}
                      onClick={() => setDirection(d)}
                      style={{
                        padding: '6px 16px', borderRadius: 5, fontSize: 13, fontWeight: 600,
                        cursor: 'pointer',
                        background: direction === d
                          ? (d === 'LONG' ? 'var(--os-green)' : 'var(--os-red)')
                          : 'var(--os-surface3)',
                        color: direction === d ? '#fff' : 'var(--os-t2)',
                        border: `1px solid ${direction === d
                          ? (d === 'LONG' ? 'var(--os-green)' : 'var(--os-red)')
                          : 'var(--os-border2)'}`,
                      }}
                    >{d}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Rule Builder */}
          <div style={{ background: 'var(--os-surface2)', border: '1px solid var(--os-border)', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={sectionHead}>Entry Rules ({rules.length}/5 — min 2)</div>
              <button
                onClick={addRule}
                disabled={rules.length >= 5}
                style={{
                  ...btnPrimary, padding: '5px 12px', fontSize: 12,
                  opacity: rules.length >= 5 ? 0.4 : 1,
                  background: 'var(--os-surface3)', color: 'var(--os-t1)',
                  border: '1px solid var(--os-border2)',
                }}
              >+ Add Rule</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rules.map((rule, idx) => (
                <div key={rule.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--os-surface3)', border: '1px solid var(--os-border)',
                  borderRadius: 6, padding: '8px 12px',
                }}>
                  {idx === 0 ? (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--os-blue)', minWidth: 36, textAlign: 'center' }}>IF</span>
                  ) : (
                    <select
                      value={rule.logic}
                      onChange={e => updateRule(rule.id, { logic: e.target.value as 'AND' | 'OR' })}
                      style={{ ...selectStyle, padding: '4px 8px', fontSize: 11, fontWeight: 700, minWidth: 54, color: 'var(--os-blue)' }}
                    >
                      <option value="AND">AND</option>
                      <option value="OR">OR</option>
                    </select>
                  )}

                  <select
                    value={rule.condition}
                    onChange={e => updateRule(rule.id, { condition: e.target.value as RuleCondition })}
                    style={{ ...selectStyle, flex: 1 }}
                  >
                    {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  <button
                    onClick={() => removeRule(rule.id)}
                    disabled={rules.length <= 2}
                    style={{
                      background: 'none', border: 'none', cursor: rules.length <= 2 ? 'default' : 'pointer',
                      color: rules.length <= 2 ? 'var(--os-t4)' : 'var(--os-red)', fontSize: 15, padding: '0 4px',
                    }}
                    title="Remove rule"
                  >✕</button>
                </div>
              ))}
            </div>

            {rules.length < 2 && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--os-amber)' }}>
                At least 2 rules are required to validate.
              </div>
            )}
          </div>

          {/* Validate Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={validate}
              disabled={validating || rules.length < 2}
              style={{
                ...btnPrimary,
                opacity: validating || rules.length < 2 ? 0.6 : 1,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {validating ? (
                <>
                  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #fff4', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Running Backtest…
                </>
              ) : 'Validate Strategy'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--os-t3)' }}>Tests on RELIANCE.NS · {timeframe}</span>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: 'var(--os-red)18', border: '1px solid var(--os-red)40',
              borderRadius: 6, padding: '10px 14px', fontSize: 13, color: 'var(--os-red)',
            }}>
              {error}
            </div>
          )}

          {/* Validation Result */}
          {result && (
            <div style={{
              background: 'var(--os-surface2)', border: `1px solid ${
                result.verdict === 'PASSED' ? 'var(--os-green)' :
                result.verdict === 'MARGINAL' ? 'var(--os-amber)' : 'var(--os-red)'
              }40`,
              borderRadius: 8, padding: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Backtest Result</span>
                <VerdictBadge verdict={result.verdict} />
                <span style={{ fontSize: 11, color: 'var(--os-t3)', marginLeft: 'auto' }}>
                  {result.candleCount} candles · {result.symbol} · {result.interval}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <StatBox label="Win Rate" value={`${result.winRate}%`} sub="min 45% PASS" />
                <StatBox label="Profit Factor" value={result.profitFactor.toFixed(2)} sub="min 1.3 PASS" />
                <StatBox label="Total Trades" value={String(result.totalTrades)} sub="min 10 PASS" />
                <StatBox label="Expectancy" value={`${result.expectancy > 0 ? '+' : ''}${result.expectancy.toFixed(2)}R`} />
                <StatBox label="Max Drawdown" value={`${result.maxDrawdownPct.toFixed(1)}%`} />
              </div>

              {/* Criteria explanation */}
              <div style={{ fontSize: 11, color: 'var(--os-t3)', marginBottom: 14, lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--os-green)' }}>PASSED</strong>: WR≥45% AND PF≥1.3 AND Trades≥10 &nbsp;·&nbsp;
                <strong style={{ color: 'var(--os-amber)' }}>MARGINAL</strong>: WR≥35% AND PF≥1.0 AND Trades≥6 &nbsp;·&nbsp;
                <strong style={{ color: 'var(--os-red)' }}>FAILED</strong>: does not meet marginal criteria
              </div>

              {/* Save row */}
              {(result.verdict === 'PASSED' || result.verdict === 'MARGINAL') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    onClick={saveStrategy}
                    disabled={!canSave}
                    style={{
                      ...btnPrimary,
                      background: result.verdict === 'PASSED' ? 'var(--os-green)' : 'var(--os-amber)',
                      opacity: canSave ? 1 : 0.5,
                    }}
                  >
                    Save Strategy
                  </button>
                  {!name.trim() && (
                    <span style={{ fontSize: 12, color: 'var(--os-amber)' }}>Enter a strategy name above to save.</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Spinner keyframe injected inline */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
