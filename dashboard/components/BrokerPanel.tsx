'use client'
import { useState, useEffect, useCallback } from 'react'
import { CollapsiblePanel } from './AIPanel'
import { SIGNAL_MAP } from '@/lib/signalMap'
import type { AIAnalysis } from '@/lib/indicators'

interface BrokerPanelProps {
  pair:      string
  analysis:  AIAnalysis | null
  pipSize:   number
  account:   number
  riskPct:   number
}

interface AccountData {
  funds: {
    net: string
    availablecash: string
    utiliseddebits: string
    utilisedmargin: string
    m2mUnrealised: string
    m2mRealised: string
  }
  positions: Array<{
    tradingsymbol: string
    netqty: string
    unrealised: string
    realised: string
    ltp: string
    producttype: string
  }>
  orders: Array<{
    orderid: string
    tradingsymbol: string
    transactiontype: string
    quantity: string
    status: string
    orderstatus: string
    ordertype: string
    price: string
    updatetime: string
  }>
}

interface ScripResult {
  symboltoken: string
  tradingsymbol: string
  name: string
  expiry: string
}

type Tab = 'account' | 'trade' | 'orders'

const RED   = '#ff4e6a'
const GREEN = '#00d48f'
const AMBER = '#f0a832'
const BLUE  = '#4d8fff'
const MUTED = '#4a6a8a'

export default function BrokerPanel({ pair, analysis, pipSize, account, riskPct }: BrokerPanelProps) {
  const [connected,  setConnected]  = useState(false)
  const [userName,   setUserName]   = useState('')
  const [tab,        setTab]        = useState<Tab>('account')
  const [accData,    setAccData]    = useState<AccountData | null>(null)
  const [accLoading, setAccLoading] = useState(false)
  const [accError,   setAccError]   = useState('')

  // Auth form
  const [apiKey,     setApiKey]     = useState('')
  const [clientId,   setClientId]   = useState('')
  const [password,   setPassword]   = useState('')
  const [totpSecret, setTotpSecret] = useState('')
  const [totpCode,   setTotpCode]   = useState('')
  const [useSecret,  setUseSecret]  = useState(true)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError,  setAuthError]  = useState('')

  // Trade form
  const [scrips,     setScrips]     = useState<ScripResult[]>([])
  const [selScrip,   setSelScrip]   = useState<ScripResult | null>(null)
  const [qty,        setQty]        = useState('1')
  const [variety,    setVariety]    = useState<'NORMAL' | 'STOPLOSS'>('NORMAL')
  const [orderLoading, setOrderLoading] = useState(false)
  const [orderMsg,   setOrderMsg]   = useState('')
  const [autoTrade,  setAutoTrade]  = useState(false)
  const [autoConfirm, setAutoConfirm] = useState(false)

  const signalInfo = SIGNAL_MAP[pair]
  const canTrade   = signalInfo?.available ?? false

  // ── Load account data ─────────────────────────────────────────────────────
  const loadAccount = useCallback(async () => {
    if (!connected) return
    setAccLoading(true); setAccError('')
    try {
      const r = await fetch('/api/angelone/account')
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setAccData(d)
    } catch (e) {
      setAccError(e instanceof Error ? e.message : 'Failed to load account')
    } finally { setAccLoading(false) }
  }, [connected])

  useEffect(() => { if (connected) loadAccount() }, [connected, loadAccount])

  // ── Search for scrip token when pair / connected changes ──────────────────
  useEffect(() => {
    if (!connected || !canTrade || !signalInfo) return
    setScrips([]); setSelScrip(null)
    fetch(`/api/angelone/search?exchange=${signalInfo.exchange}&q=${signalInfo.searchQuery}`)
      .then(r => r.json())
      .then(d => {
        if (d.results?.length) { setScrips(d.results); setSelScrip(d.results[0]) }
      })
      .catch(() => {})
  }, [connected, pair, canTrade, signalInfo])

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setAuthLoading(true); setAuthError('')
    try {
      const body: Record<string, string> = { apiKey, clientId, password }
      if (useSecret) body.totpSecret = totpSecret
      else           body.totpCode   = totpCode
      const r = await fetch('/api/angelone/auth', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setConnected(true); setUserName(d.name ?? clientId)
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Login failed')
    } finally { setAuthLoading(false) }
  }

  const handleLogout = async () => {
    await fetch('/api/angelone/auth', { method: 'DELETE' })
    setConnected(false); setUserName(''); setAccData(null)
  }

  // ── Place order ───────────────────────────────────────────────────────────
  const handlePlaceOrder = async (side: 'BUY' | 'SELL') => {
    if (!selScrip || !signalInfo || !canTrade) return
    setOrderLoading(true); setOrderMsg('')
    try {
      const isBull = analysis?.bias === 'BULLISH'
      const entry  = analysis?.entry   ?? 0
      const sl     = isBull ? (analysis?.longSL  ?? 0) : (analysis?.shortSL  ?? 0)
      const tp1    = isBull ? (analysis?.longTP1  ?? 0) : (analysis?.shortTP1 ?? 0)
      const body = {
        variety,
        tradingsymbol:   selScrip.tradingsymbol,
        symboltoken:     selScrip.symboltoken,
        transactiontype: side,
        exchange:        signalInfo.exchange,
        ordertype:       'MARKET' as const,
        producttype:     'INTRADAY' as const,
        duration:        'DAY' as const,
        price:           '0',
        quantity:        qty,
        stoploss:        sl  > 0 ? Math.abs(entry - sl).toFixed(2)  : undefined,
        squareoff:       tp1 > 0 ? Math.abs(tp1 - entry).toFixed(2) : undefined,
      }
      const r = await fetch('/api/angelone/order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setOrderMsg(`✓ Order placed: ${d.orderid}`)
      loadAccount()
    } catch (e) {
      setOrderMsg(`✗ ${e instanceof Error ? e.message : 'Failed'}`)
    } finally { setOrderLoading(false) }
  }

  const handleCancelOrder = async (orderid: string) => {
    await fetch('/api/angelone/order', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variety: 'NORMAL', orderid }),
    })
    loadAccount()
  }

  // ── Bias → side ───────────────────────────────────────────────────────────
  const biasSide = analysis?.bias === 'BULLISH' ? 'BUY'
    : analysis?.bias === 'BEARISH' ? 'SELL' : null

  // ── Render: not connected ─────────────────────────────────────────────────
  if (!connected) {
    return (
      <CollapsiblePanel title="Angel One Broker" defaultOpen={false}>
        <div style={{ fontSize: 9.5, color: MUTED, marginBottom: 10, lineHeight: 1.6,
          padding: '6px 8px', background: '#f0a83212', borderRadius: 4,
          border: '1px solid #f0a83230' }}>
          ⚠ Angel One only supports Indian markets. This terminal maps signals to MCX (Gold/Silver) and NSE CDS (currency derivatives). Forex &amp; Crypto are NOT directly available.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <InputRow label="API Key"   value={apiKey}    onChange={setApiKey}    placeholder="Your API key" />
          <InputRow label="Client ID" value={clientId}  onChange={setClientId}  placeholder="Your client code" />
          <InputRow label="Password"  value={password}  onChange={setPassword}  placeholder="Trading password" type="password" />

          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <TabBtn active={useSecret}  onClick={() => setUseSecret(true)}  label="Auto TOTP" />
            <TabBtn active={!useSecret} onClick={() => setUseSecret(false)} label="Manual TOTP" />
          </div>

          {useSecret
            ? <InputRow label="TOTP Secret" value={totpSecret} onChange={setTotpSecret}
                placeholder="Base32 secret from QR" type="password"
                hint="Found in Angel One → Profile → Enable TOTP" />
            : <InputRow label="TOTP Code" value={totpCode} onChange={setTotpCode}
                placeholder="6-digit code" hint="Enter current 6-digit code from authenticator" />
          }

          {authError && (
            <div style={{ fontSize: 9, color: RED, padding: '4px 6px',
              background: '#ff4e6a18', borderRadius: 3 }}>{authError}</div>
          )}

          <button
            onClick={handleLogin} disabled={authLoading}
            style={{
              padding: '6px 0', borderRadius: 5, fontSize: 10, fontWeight: 800,
              background: authLoading ? '#1a2540' : '#f0a83218',
              border: `1px solid ${authLoading ? '#1a2540' : '#f0a83244'}`,
              color: authLoading ? MUTED : AMBER,
              cursor: authLoading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', letterSpacing: '0.06em',
              transition: 'all .15s',
            }}>
            {authLoading ? '⟳ Connecting…' : '⚡ Connect Angel One'}
          </button>
        </div>
      </CollapsiblePanel>
    )
  }

  // ── Render: connected ─────────────────────────────────────────────────────
  return (
    <CollapsiblePanel title="Angel One Broker" defaultOpen>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN,
            boxShadow: `0 0 8px ${GREEN}`, display: 'inline-block' }} />
          <span style={{ fontSize: 10, color: GREEN, fontWeight: 700 }}>{userName}</span>
        </div>
        <button onClick={handleLogout}
          style={{ fontSize: 8.5, color: MUTED, background: 'none', border: '1px solid #1a2540',
            borderRadius: 3, padding: '2px 7px', cursor: 'pointer', fontFamily: 'inherit' }}>
          Disconnect
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {(['account', 'trade', 'orders'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 700, borderRadius: 4,
              background: tab === t ? '#1b2a45' : 'transparent',
              border: `1px solid ${tab === t ? '#2d4a7a' : '#1a2540'}`,
              color: tab === t ? '#7ab8ff' : MUTED,
              cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
            }}>{t}</button>
        ))}
      </div>

      {/* ── ACCOUNT tab ───────────────────────────────────────────────────── */}
      {tab === 'account' && (
        <div>
          {accLoading && <div style={{ fontSize: 9, color: MUTED, textAlign: 'center', padding: 10 }}>Loading…</div>}
          {accError   && <div style={{ fontSize: 9, color: RED }}>{accError}</div>}
          {accData && (
            <>
              {/* Funds grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
                <FundCell label="Net Value"     value={`₹ ${fmt2(accData.funds.net)}`}          color={GREEN} />
                <FundCell label="Available Cash" value={`₹ ${fmt2(accData.funds.availablecash)}`} color={BLUE}  />
                <FundCell label="Used Margin"    value={`₹ ${fmt2(accData.funds.utilisedmargin)}`} color={AMBER} />
                <FundCell label="M2M Unrealised" value={`₹ ${fmt2(accData.funds.m2mUnrealised)}`}
                  color={parseFloat(accData.funds.m2mUnrealised) >= 0 ? GREEN : RED} />
              </div>

              <button onClick={loadAccount}
                style={{ width: '100%', padding: '4px 0', fontSize: 9, fontWeight: 700,
                  borderRadius: 4, cursor: 'pointer', border: '1px solid #1a2540',
                  background: 'transparent', color: MUTED, fontFamily: 'inherit' }}>
                ⟳ Refresh
              </button>

              {/* Positions */}
              {accData.positions.filter(p => p.netqty !== '0').length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <SectionLabel text="Open Positions" />
                  {accData.positions.filter(p => p.netqty !== '0').map((pos, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '4px 6px', borderRadius: 3, background: '#0f1a2a', marginBottom: 3 }}>
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#d4e2f8' }}>{pos.tradingsymbol}</div>
                        <div style={{ fontSize: 8, color: MUTED }}>Qty: {pos.netqty} · {pos.producttype}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 9, color: parseFloat(pos.unrealised) >= 0 ? GREEN : RED, fontWeight: 700 }}>
                          {parseFloat(pos.unrealised) >= 0 ? '+' : ''}₹{fmt2(pos.unrealised)}
                        </div>
                        <div style={{ fontSize: 8, color: MUTED }}>LTP: {pos.ltp}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TRADE tab ─────────────────────────────────────────────────────── */}
      {tab === 'trade' && (
        <div>
          {/* Signal mapping info */}
          <div style={{ padding: '6px 8px', borderRadius: 4, marginBottom: 8,
            background: canTrade ? '#00d48f0d' : '#ff4e6a0d',
            border: `1px solid ${canTrade ? '#00d48f22' : '#ff4e6a22'}` }}>
            <div style={{ fontSize: 9, color: canTrade ? GREEN : RED, fontWeight: 700, marginBottom: 2 }}>
              {pair} → {signalInfo?.label ?? 'Not available'}
            </div>
            <div style={{ fontSize: 8, color: MUTED, lineHeight: 1.5 }}>
              {signalInfo?.note}
            </div>
          </div>

          {!canTrade ? (
            <div style={{ fontSize: 9, color: MUTED, textAlign: 'center', padding: '12px 0' }}>
              No Angel One equivalent for {pair}.<br/>
              <span style={{ color: '#3d506a' }}>Try XAUUSD, XAGUSD, EURUSD, GBPUSD, or USDJPY.</span>
            </div>
          ) : (
            <>
              {/* AI signal summary */}
              {analysis && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, marginBottom: 8 }}>
                  {(() => {
                    const bull = analysis.bias === 'BULLISH'
                    const sl2  = bull ? analysis.longSL  : analysis.shortSL
                    const tp1a = bull ? analysis.longTP1 : analysis.shortTP1
                    const tp2a = bull ? analysis.longTP2 : analysis.shortTP2
                    return <>
                      <PriceCell label="Entry" value={analysis.entry?.toFixed(2) ?? '—'} color='#d4e2f8' />
                      <PriceCell label="Stop"  value={sl2?.toFixed(2)  ?? '—'} color={RED}   />
                      <PriceCell label="TP 1"  value={tp1a?.toFixed(2) ?? '—'} color={GREEN} />
                      <PriceCell label="TP 2"  value={tp2a?.toFixed(2) ?? '—'} color={GREEN} />
                    </>
                  })()}
                </div>
              )}

              {/* Instrument picker */}
              {scrips.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <SectionLabel text="Instrument (select expiry)" />
                  <select value={selScrip?.symboltoken ?? ''} onChange={e => {
                      const s = scrips.find(x => x.symboltoken === e.target.value)
                      if (s) setSelScrip(s)
                    }}
                    style={{ width: '100%', padding: '4px 6px', fontSize: 9, background: '#0c1525',
                      border: '1px solid #1a2540', color: '#d4e2f8', borderRadius: 3,
                      fontFamily: 'inherit' }}>
                    {scrips.map(s => (
                      <option key={s.symboltoken} value={s.symboltoken}>
                        {s.tradingsymbol} {s.expiry ? `(exp: ${s.expiry})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Qty + variety */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                <div>
                  <SectionLabel text={`Lots (1 lot = ${signalInfo?.lotSize ?? '?'} units)`} />
                  <input type="number" value={qty} onChange={e => setQty(e.target.value)} min="1"
                    className="fx-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <SectionLabel text="Variety" />
                  <select value={variety} onChange={e => setVariety(e.target.value as 'NORMAL' | 'STOPLOSS')}
                    style={{ width: '100%', padding: '4px 6px', fontSize: 9, background: '#0c1525',
                      border: '1px solid #1a2540', color: '#d4e2f8', borderRadius: 3,
                      fontFamily: 'inherit' }}>
                    <option value="NORMAL">Normal</option>
                    <option value="STOPLOSS">Bracket (SL+TP)</option>
                  </select>
                </div>
              </div>

              {/* Buy / Sell buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                <TradeBtn side="BUY"  bias={biasSide} loading={orderLoading} onClick={() => handlePlaceOrder('BUY')}  />
                <TradeBtn side="SELL" bias={biasSide} loading={orderLoading} onClick={() => handlePlaceOrder('SELL')} />
              </div>

              {orderMsg && (
                <div style={{ fontSize: 9, padding: '4px 7px', borderRadius: 3, marginBottom: 6,
                  background: orderMsg.startsWith('✓') ? '#00d48f0f' : '#ff4e6a0f',
                  color: orderMsg.startsWith('✓') ? GREEN : RED,
                  border: `1px solid ${orderMsg.startsWith('✓') ? '#00d48f22' : '#ff4e6a22'}` }}>
                  {orderMsg}
                </div>
              )}

              {/* Auto-trade toggle */}
              <div style={{ padding: '6px 8px', borderRadius: 4,
                background: '#ff4e6a08', border: '1px solid #ff4e6a22', marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: RED, fontWeight: 700 }}>⚠ Auto-Trade (EXPERIMENTAL)</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                    <div style={{
                      width: 28, height: 15, borderRadius: 8,
                      background: autoTrade ? RED : '#1a2540',
                      border: `1px solid ${autoTrade ? '#ff4e6a88' : '#1a2540'}`,
                      position: 'relative', transition: 'all .2s', cursor: 'pointer',
                    }} onClick={() => {
                      if (!autoConfirm && !autoTrade) {
                        setAutoConfirm(true); return
                      }
                      setAutoTrade(v => !v); setAutoConfirm(false)
                    }}>
                      <div style={{ position: 'absolute', top: 2, left: autoTrade ? 14 : 2, width: 9, height: 9,
                        borderRadius: '50%', background: autoTrade ? '#fff' : MUTED, transition: 'all .2s' }} />
                    </div>
                  </label>
                </div>
                {autoConfirm && (
                  <div style={{ fontSize: 8.5, color: RED, lineHeight: 1.5, marginBottom: 4 }}>
                    Auto-trade will place REAL ORDERS automatically on every AI signal change.
                    You can lose real money. Confirm you understand the risk?
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button onClick={() => { setAutoTrade(true); setAutoConfirm(false) }}
                        style={{ flex: 1, padding: '3px 0', fontSize: 8.5, fontWeight: 700,
                          background: '#ff4e6a18', border: '1px solid #ff4e6a44', color: RED,
                          borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Yes, I understand
                      </button>
                      <button onClick={() => setAutoConfirm(false)}
                        style={{ flex: 1, padding: '3px 0', fontSize: 8.5, fontWeight: 700,
                          background: 'transparent', border: '1px solid #1a2540', color: MUTED,
                          borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {autoTrade && (
                  <div style={{ fontSize: 8.5, color: AMBER, lineHeight: 1.5 }}>
                    Auto-trade ON — will execute {biasSide ?? 'no signal'} on next bias change.
                    Monitoring bias: <strong style={{ color: '#d4e2f8' }}>{analysis?.bias ?? '—'}</strong>
                  </div>
                )}
                {!autoTrade && !autoConfirm && (
                  <div style={{ fontSize: 8, color: '#3d506a', lineHeight: 1.4 }}>
                    Disabled by default. Enable to auto-execute orders on AI signal changes.
                    Use at own risk — educational only.
                  </div>
                )}
              </div>

              <div style={{ marginTop: 6, fontSize: 8, color: '#3d506a', lineHeight: 1.5,
                padding: '5px 7px', background: '#0c1220', borderRadius: 3,
                border: '1px solid #1a2540' }}>
                ⚙ Bracket orders require STOPLOSS variety. ROBO variety enables GTT-like execution. Entry/SL/TP are pre-filled from AI analysis but verify before placing. Intraday orders auto-square-off at 3:20 PM IST.
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ORDERS tab ────────────────────────────────────────────────────── */}
      {tab === 'orders' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <SectionLabel text="Today's Orders" />
            <button onClick={loadAccount}
              style={{ fontSize: 8, color: MUTED, background: 'none', border: '1px solid #1a2540',
                borderRadius: 3, padding: '2px 6px', cursor: 'pointer', fontFamily: 'inherit' }}>
              ⟳
            </button>
          </div>

          {!accData?.orders?.length
            ? <div style={{ fontSize: 9, color: MUTED, textAlign: 'center', padding: 12 }}>No orders today</div>
            : accData.orders.map((o, i) => (
              <div key={i} style={{ padding: '5px 7px', borderRadius: 4, background: '#0c1220',
                marginBottom: 4, border: '1px solid #1a2540' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#d4e2f8' }}>{o.tradingsymbol}</span>
                    {' '}
                    <span style={{ fontSize: 8.5, color: o.transactiontype === 'BUY' ? GREEN : RED, fontWeight: 700 }}>
                      {o.transactiontype}
                    </span>
                    <span style={{ fontSize: 8, color: MUTED }}> ×{o.quantity}</span>
                  </div>
                  <StatusBadge status={o.orderstatus || o.status} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span style={{ fontSize: 8, color: MUTED }}>{o.ordertype} @ {o.price || 'MKT'}</span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: 7.5, color: '#3d506a' }}>{o.updatetime}</span>
                    {(o.orderstatus === 'open' || o.status === 'open') && (
                      <button onClick={() => handleCancelOrder(o.orderid)}
                        style={{ fontSize: 7.5, color: RED, background: 'none', border: '1px solid #ff4e6a33',
                          borderRadius: 2, padding: '1px 5px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          }
        </div>
      )}
    </CollapsiblePanel>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────
function InputRow({ label, value, onChange, placeholder, type = 'text', hint }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder: string; type?: string; hint?: string
}) {
  return (
    <div>
      <div style={{ fontSize: 8.5, color: MUTED, marginBottom: 2, letterSpacing: '0.05em' }}>{label}</div>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="fx-input"
        style={{ width: '100%' }}
      />
      {hint && <div style={{ fontSize: 7.5, color: '#3d506a', marginTop: 2, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  )
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      style={{
        flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 700, borderRadius: 4,
        background: active ? '#1b2a45' : 'transparent',
        border: `1px solid ${active ? '#2d4a7a' : '#1a2540'}`,
        color: active ? '#7ab8ff' : MUTED,
        cursor: 'pointer', fontFamily: 'inherit',
      }}>{label}</button>
  )
}

function FundCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: '5px 7px', borderRadius: 4, background: '#0c1220', border: '1px solid #1a2540' }}>
      <div style={{ fontSize: 7.5, color: MUTED, marginBottom: 2, letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 10, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function PriceCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: '4px 5px', borderRadius: 3, background: '#0c1220', border: '1px solid #1a2540', textAlign: 'center' }}>
      <div style={{ fontSize: 7, color: MUTED, marginBottom: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 9, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 8, color: MUTED, fontWeight: 700, letterSpacing: '0.08em',
      textTransform: 'uppercase', marginBottom: 4 }}>{text}</div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = (status ?? '').toLowerCase()
  const [bg, col] = s === 'complete' ? ['#00d48f12', GREEN]
    : s === 'rejected' || s === 'cancelled' ? ['#ff4e6a12', RED]
    : ['#f0a83212', AMBER]
  return (
    <span style={{ fontSize: 7.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
      background: bg, color: col, border: `1px solid ${col}33`,
      letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {status}
    </span>
  )
}

function TradeBtn({ side, bias, loading, onClick }: {
  side: 'BUY' | 'SELL'; bias: 'BUY' | 'SELL' | null
  loading: boolean; onClick: () => void
}) {
  const isBuy  = side === 'BUY'
  const col    = isBuy ? GREEN : RED
  const active = bias === side
  return (
    <button onClick={onClick} disabled={loading}
      style={{
        padding: '7px 0', borderRadius: 5, fontSize: 10, fontWeight: 800,
        background: active ? `${col}22` : 'transparent',
        border: `1px solid ${active ? `${col}66` : '#1a2540'}`,
        color: active ? col : MUTED,
        cursor: loading ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', letterSpacing: '0.06em',
        boxShadow: active ? `0 0 12px ${col}22` : 'none',
        transition: 'all .15s',
      }}>
      {isBuy ? '▲ BUY' : '▼ SELL'}
      {active && <span style={{ fontSize: 7.5, marginLeft: 4, opacity: 0.7 }}>★ AI</span>}
    </button>
  )
}

function fmt2(v: string): string {
  const n = parseFloat(v)
  if (isNaN(n)) return v || '0'
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
