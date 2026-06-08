'use client'
import { CollapsiblePanel } from './AIPanel'

interface Props { strength: Record<string, number> }

const CUR_META: Record<string, { color: string; flag: string }> = {
  USD: { color: '#f0a832', flag: '🇺🇸' },
  EUR: { color: '#4d8fff', flag: '🇪🇺' },
  GBP: { color: '#a78bfa', flag: '🇬🇧' },
  JPY: { color: '#ff9d00', flag: '🇯🇵' },
  CHF: { color: '#22d3ee', flag: '🇨🇭' },
  AUD: { color: '#00d48f', flag: '🇦🇺' },
  NZD: { color: '#34d399', flag: '🇳🇿' },
  CAD: { color: '#ff4e6a', flag: '🇨🇦' },
}

const csLabel = (v: number) =>
  v >= 78 ? 'STRONG' : v >= 62 ? 'BULL'   :
  v <= 22 ? 'WEAK'   : v <= 38 ? 'BEAR'   : 'NEUTRAL'

const csColor = (v: number) =>
  v >= 62 ? 'var(--bull)' : v <= 38 ? 'var(--bear)' : 'var(--text-dim)'

export default function StrengthMeter({ strength }: Props) {
  const sorted = Object.entries(strength).sort((a, b) => b[1] - a[1])
  const best  = sorted[0]?.[0]
  const worst = sorted[sorted.length - 1]?.[0]

  const badge = (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 9 }}>
      <span style={{ color: 'var(--bull)', fontWeight: 700 }}>{best}</span>
      <span style={{ color: 'var(--text-muted)' }}>›</span>
      <span style={{ color: 'var(--bear)', fontWeight: 700 }}>{worst}</span>
    </div>
  )

  return (
    <CollapsiblePanel title="💱 Currency Strength" defaultOpen={false} badge={badge}>
      <div style={{ padding: '8px 14px 10px' }}>
        {sorted.map(([cur, val]) => {
          const meta = CUR_META[cur] ?? { color: '#666', flag: '' }
          return (
            <div key={cur} style={{ marginBottom: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 10 }}>{meta.flag}</span>
                  <span style={{ color: meta.color, fontWeight: 800, fontSize: 11 }}>{cur}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: csColor(val), fontSize: 8.5, fontWeight: 700 }}>{csLabel(val)}</span>
                  <span style={{ color: csColor(val), fontSize: 10, fontWeight: 800, width: 24, textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums' }}>{val}</span>
                </div>
              </div>
              <div className="score-bar">
                <div className="score-bar-fill" style={{ width: `${val}%`, background: csColor(val) }} />
              </div>
            </div>
          )
        })}

        <div style={{
          marginTop: 10, padding: '7px 10px',
          background: 'var(--bg-raised)', borderRadius: 5,
          border: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between',
          fontSize: 9.5,
        }}>
          <span style={{ color: 'var(--text-muted)' }}>Best pair</span>
          <span style={{ color: 'var(--amber)', fontWeight: 800 }}>{best}{worst}</span>
        </div>
      </div>
    </CollapsiblePanel>
  )
}
