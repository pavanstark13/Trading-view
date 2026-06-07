'use client'

interface Props { strength: Record<string, number> }

const csColor = (v: number) =>
  v >= 65 ? '#00c853' : v >= 50 ? '#66bb6a' : v <= 35 ? '#ff1744' : v <= 50 ? '#ef9a9a' : '#9e9e9e'

const csLabel = (v: number) =>
  v >= 75 ? 'V.STRONG' : v >= 60 ? 'STRONG' : v <= 25 ? 'V.WEAK' : v <= 40 ? 'WEAK' : 'NEUTRAL'

const CURRENCY_COLORS: Record<string, string> = {
  USD: '#ffd600', EUR: '#1565c0', GBP: '#7b1fa2',
  JPY: '#ff6d00', CHF: '#00e5ff', AUD: '#00c853',
  NZD: '#4caf50', CAD: '#ff1744',
}

export default function StrengthMeter({ strength }: Props) {
  const sorted = Object.entries(strength).sort((a, b) => b[1] - a[1])

  return (
    <div className="panel">
      <div className="panel-header">Currency Strength</div>
      <div style={{ padding: '6px 12px 8px' }}>
        {sorted.map(([cur, val]) => (
          <div key={cur} style={{ marginBottom: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: CURRENCY_COLORS[cur] ?? '#fff', fontWeight: 700, fontSize: 11 }}>{cur}</span>
              <span style={{ color: csColor(val), fontSize: 10 }}>{csLabel(val)} ({val})</span>
            </div>
            <div className="score-bar">
              <div className="score-bar-fill" style={{
                width: `${val}%`,
                background: csColor(val),
                opacity: 0.9,
              }} />
            </div>
          </div>
        ))}
        <div style={{ marginTop: 8, fontSize: 10, color: '#8b949e' }}>
          Best pair: <span style={{ color: '#ffd600' }}>
            {sorted[0]?.[0]}{sorted[sorted.length - 1]?.[0]}
          </span> &nbsp;|&nbsp; Avoid: <span style={{ color: '#ff1744' }}>
            {sorted[0]?.[0] === sorted[sorted.length - 1]?.[0] ? '–' : `${sorted[sorted.length - 1]?.[0]} pairs`}
          </span>
        </div>
      </div>
    </div>
  )
}
