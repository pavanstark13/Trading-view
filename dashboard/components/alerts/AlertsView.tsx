'use client'
import { useState, useEffect } from 'react'
import { INITIAL_ALERTS } from '@/lib/os/mockData'
import type { AlertRule } from '@/lib/os/types'

const LS_KEY  = 'os_alerts_v1'
const TYPES: AlertRule['type'][] = ['PRICE_ABOVE','PRICE_BELOW','PCT_CHANGE','VOLUME_SPIKE','RSI_OVERBOUGHT','RSI_OVERSOLD','MACD_CROSS','EMA_CROSS']
const TYPE_LABELS: Record<AlertRule['type'],string> = {
  PRICE_ABOVE:'Price ≥', PRICE_BELOW:'Price ≤', PCT_CHANGE:'% Change ≥',
  VOLUME_SPIKE:'Volume ≥ Nx avg', RSI_OVERBOUGHT:'RSI ≥', RSI_OVERSOLD:'RSI ≤',
  MACD_CROSS:'MACD Cross', EMA_CROSS:'EMA Cross',
}
const TYPE_ICONS: Record<AlertRule['type'],string> = {
  PRICE_ABOVE:'↑', PRICE_BELOW:'↓', PCT_CHANGE:'%', VOLUME_SPIKE:'⚡',
  RSI_OVERBOUGHT:'RSI↑', RSI_OVERSOLD:'RSI↓', MACD_CROSS:'MACD', EMA_CROSS:'EMA',
}

export default function AlertsView() {
  const [alerts,   setAlerts]   = useState<AlertRule[]>(INITIAL_ALERTS)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name:'', symbol:'', exchange:'NSE', type:'PRICE_ABOVE' as AlertRule['type'], value:0, notifySound:true })

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY)
    if (stored) setAlerts(JSON.parse(stored))
    else { setAlerts(INITIAL_ALERTS); localStorage.setItem(LS_KEY, JSON.stringify(INITIAL_ALERTS)) }
  }, [])

  const save = (data: AlertRule[]) => { setAlerts(data); localStorage.setItem(LS_KEY, JSON.stringify(data)) }
  const toggle = (id:string) => save(alerts.map(a => a.id===id ? {...a, enabled:!a.enabled} : a))
  const deleteAlert = (id:string) => save(alerts.filter(a => a.id!==id))

  const createAlert = () => {
    if (!form.symbol || !form.name) return
    const a: AlertRule = {
      id: 'alert-'+Date.now(), ...form, enabled:true, triggered:false,
      createdAt: new Date().toISOString(),
    }
    const updated = [...alerts, a]
    save(updated)
    setForm({ name:'', symbol:'', exchange:'NSE', type:'PRICE_ABOVE', value:0, notifySound:true })
    setShowForm(false)
  }

  const active    = alerts.filter(a => a.enabled && !a.triggered).length
  const triggered = alerts.filter(a => a.triggered).length
  const disabled  = alerts.filter(a => !a.enabled).length

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--os-bg)' }}>
      {/* Header */}
      <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--os-border)', background:'var(--os-surface)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:13, fontWeight:800, color:'var(--os-t1)' }}>ALERTS</span>
          <span className="os-badge os-badge-blue">{alerts.length} total</span>
          <div style={{ display:'flex', gap:6, marginLeft:8 }}>
            <span className="os-badge os-badge-green">{active} active</span>
            {triggered > 0 && <span className="os-badge os-badge-amber os-pulse">{triggered} triggered</span>}
            {disabled > 0 && <span style={{ fontSize:9.5, color:'var(--os-t3)' }}>{disabled} off</span>}
          </div>
          <button className="os-btn os-btn-primary" style={{ marginLeft:'auto', padding:'4px 12px', fontSize:10 }}
            onClick={() => setShowForm(s => !s)}>
            {showForm ? '✕ Cancel' : '+ New Alert'}
          </button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{ padding:'12px 14px', background:'var(--os-surface2)', borderBottom:'1px solid var(--os-border)', flexShrink:0 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr auto', gap:8, alignItems:'flex-end' }}>
            <div>
              <div style={{ fontSize:9.5, color:'var(--os-t3)', marginBottom:3 }}>Alert Name</div>
              <input className="os-input" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. HDFCBANK 52W High" />
            </div>
            <div>
              <div style={{ fontSize:9.5, color:'var(--os-t3)', marginBottom:3 }}>Symbol</div>
              <input className="os-input" value={form.symbol} onChange={e => setForm(f=>({...f,symbol:e.target.value.toUpperCase()}))} placeholder="NIFTY" />
            </div>
            <div>
              <div style={{ fontSize:9.5, color:'var(--os-t3)', marginBottom:3 }}>Exchange</div>
              <select className="os-input" value={form.exchange} onChange={e => setForm(f=>({...f,exchange:e.target.value}))}>
                {['NSE','BSE','NFO','MCX','CDS'].map(e => <option key={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:9.5, color:'var(--os-t3)', marginBottom:3 }}>Value</div>
              <input className="os-input" type="number" value={form.value} onChange={e => setForm(f=>({...f,value:+e.target.value}))} placeholder="0" />
            </div>
            <button className="os-btn os-btn-primary" onClick={createAlert}>Create</button>
          </div>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:8 }}>
            {TYPES.map(t => (
              <button key={t} onClick={() => setForm(f=>({...f,type:t}))} className="os-btn"
                style={{ padding:'3px 8px', fontSize:9,
                  background: form.type===t ? 'var(--os-blue-glow)' : undefined,
                  borderColor: form.type===t ? 'var(--os-blue)' : undefined,
                  color: form.type===t ? 'var(--os-blue)' : undefined }}>
                {TYPE_ICONS[t]} {t.replace(/_/g,' ')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Alert list */}
      <div style={{ flex:1, overflowY:'auto', padding:12, display:'flex', flexDirection:'column', gap:6 }}>
        {alerts.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--os-t3)' }}>
            <div style={{ fontSize:32, marginBottom:8, opacity:.3 }}>🔔</div>
            <div style={{ fontSize:11 }}>No alerts. Create one to get notified about market events.</div>
          </div>
        )}
        {alerts.map(alert => {
          const isTriggered = alert.triggered
          const borderCol = isTriggered ? 'var(--os-amber)' : alert.enabled ? 'var(--os-border)' : 'var(--os-border)'
          const dotCol    = isTriggered ? 'var(--os-amber)' : alert.enabled ? 'var(--os-green)' : 'var(--os-t3)'
          return (
            <div key={alert.id} style={{
              display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
              background:'var(--os-surface)', border:`1px solid ${borderCol}`,
              borderLeft: `3px solid ${dotCol}`, borderRadius:6,
              opacity: alert.enabled ? 1 : 0.55, transition:'all .15s',
            }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:dotCol, flexShrink:0,
                boxShadow: alert.enabled && !isTriggered ? `0 0 6px ${dotCol}` : 'none',
                animation: isTriggered ? 'os-pulse 1.5s ease infinite' : 'none' }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                  <span style={{ fontWeight:700, fontSize:12, color:'var(--os-t1)' }}>{alert.name}</span>
                  {isTriggered && <span className="os-badge os-badge-amber" style={{ fontSize:8 }}>TRIGGERED</span>}
                </div>
                <div style={{ fontSize:10, color:'var(--os-t3)', display:'flex', gap:6, alignItems:'center' }}>
                  <span className="os-badge os-badge-blue" style={{ fontSize:8 }}>{alert.exchange}</span>
                  <span style={{ fontWeight:600, color:'var(--os-t2)' }}>{alert.symbol}</span>
                  <span>·</span>
                  <span>{TYPE_LABELS[alert.type]} {alert.value > 0 ? alert.value : ''}</span>
                  {alert.notifySound && <span title="Sound alert">🔊</span>}
                </div>
                {isTriggered && alert.triggeredAt && (
                  <div style={{ fontSize:9, color:'var(--os-amber)', marginTop:2 }}>
                    Triggered: {new Date(alert.triggeredAt).toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
                  </div>
                )}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                <div className={`os-toggle ${alert.enabled ? 'on' : ''}`} onClick={() => toggle(alert.id)} />
                <button className="os-btn-icon" style={{ color:'var(--os-red)', fontSize:15 }} onClick={() => deleteAlert(alert.id)}>×</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
