'use client'
import { useState, useEffect, useCallback } from 'react'
import { CollapsiblePanel } from './AIPanel'
import { SIGNAL_MAP } from '@/lib/signalMap'
import { INDIA_MAP } from '@/lib/indianMarket'
import type { AIAnalysis } from '@/lib/indicators'

interface BrokerPanelProps {
  pair?:     string
  analysis?: AIAnalysis | null
  pipSize?:  number
  account?:  number
  riskPct?:  number
}

interface AccountData {
  funds: { net: string; availablecash: string; utiliseddebits: string; utilisedmargin: string; m2mUnrealised: string; m2mRealised: string }
  positions: Array<{ tradingsymbol: string; netqty: string; unrealised: string; realised: string; ltp: string; producttype: string }>
  orders: Array<{ orderid: string; tradingsymbol: string; transactiontype: string; quantity: string; status: string; orderstatus: string; ordertype: string; price: string; updatetime: string }>
}

interface ScripResult { symboltoken: string; tradingsymbol: string; name: string; expiry: string }

type Tab      = 'account' | 'trade' | 'orders'
type TradeMode = 'equity' | 'futures' | 'options'
type OptionType = 'CE' | 'PE'
type ProductType = 'INTRADAY' | 'DELIVERY' | 'CARRYFORWARD' | 'MARGIN'

const RED   = '#ff4e6a'
const GREEN = '#00d48f'
const AMBER = '#f0a832'
const BLUE  = '#4d8fff'
const CYAN  = '#22d3ee'
const MUTED = '#4a6a8a'

// ── Detect instrument category ────────────────────────────────────────────────
function instrType(pair: string): 'india' | 'forex' {
  return INDIA_MAP[pair] ? 'india' : 'forex'
}

export default function BrokerPanel({ pair = 'NIFTY', analysis = null, pipSize: _pipSize = 0.05, account: _account = 500000, riskPct: _riskPct = 1 }: BrokerPanelProps) {
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

  // Trade form — shared
  const [qty,        setQty]        = useState('1')
  const [productType, setProductType] = useState<ProductType>('INTRADAY')
  const [orderLoading, setOrderLoading] = useState(false)
  const [orderMsg,   setOrderMsg]   = useState('')
  const [autoTrade,  setAutoTrade]  = useState(false)
  const [autoConfirm, setAutoConfirm] = useState(false)

  // Trade form — India specific
  const [tradeMode,  setTradeMode]  = useState<TradeMode>('equity')
  const [scrips,     setScrips]     = useState<ScripResult[]>([])
  const [selScrip,   setSelScrip]   = useState<ScripResult | null>(null)
  const [optType,    setOptType]    = useState<OptionType>('CE')
  const [strike,     setStrike]     = useState('')
  const [optScrips,  setOptScrips]  = useState<ScripResult[]>([])
  const [selOpt,     setSelOpt]     = useState<ScripResult | null>(null)
  const [scripSearch, setScripSearch] = useState('')
  const [scripSearchRes, setScripSearchRes] = useState<ScripResult[]>([])

  // Trade form — Forex specific
  const [fxScrips,   setFxScrips]   = useState<ScripResult[]>([])
  const [selFxScrip, setSelFxScrip] = useState<ScripResult | null>(null)
  const [fxVariety,  setFxVariety]  = useState<'NORMAL' | 'STOPLOSS'>('NORMAL')

  const isIndia   = instrType(pair) === 'india'
  const indiaInfo = INDIA_MAP[pair]
  const fxInfo    = SIGNAL_MAP[pair]
  const canTrade  = isIndia || (fxInfo?.available ?? false)

  // ── Load account ──────────────────────────────────────────────────────────
  const loadAccount = useCallback(async () => {
    if (!connected) return
    setAccLoading(true); setAccError('')
    try {
      const r = await fetch('/api/angelone/account')
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setAccData(d)
    } catch (e) { setAccError(e instanceof Error ? e.message : 'Failed') }
    finally { setAccLoading(false) }
  }, [connected])

  useEffect(() => { if (connected) loadAccount() }, [connected, loadAccount])

  // ── Load instruments when pair/mode changes ───────────────────────────────
  useEffect(() => {
    if (!connected) return
    setScrips([]); setSelScrip(null); setFxScrips([]); setSelFxScrip(null)
    setOptScrips([]); setSelOpt(null)

    if (isIndia && indiaInfo) {
      // Equity: search NSE by symbol
      if (tradeMode === 'equity') {
        fetch(`/api/angelone/search?exchange=NSE&q=${indiaInfo.nfoSearch}`)
          .then(r => r.json()).then(d => {
            const equityOnly = (d.results ?? []).filter((s: ScripResult) =>
              !s.tradingsymbol.includes('FUT') && !s.tradingsymbol.match(/\d{2}[A-Z]{3}\d{2}/) && s.expiry === '')
            if (equityOnly.length) { setScrips(equityOnly); setSelScrip(equityOnly[0]) }
            else if (d.results?.length) { setScrips(d.results); setSelScrip(d.results[0]) }
          }).catch(() => {})
      }
      // Futures: search NFO
      if (tradeMode === 'futures') {
        fetch(`/api/angelone/search?exchange=NFO&q=${indiaInfo.nfoSearch}FUT`)
          .then(r => r.json()).then(d => {
            const futs = (d.results ?? []).filter((s: ScripResult) => s.tradingsymbol.includes('FUT'))
            if (futs.length) { setScrips(futs); setSelScrip(futs[0]) }
          }).catch(() => {})
      }
      // Options: load CE/PE list
      if (tradeMode === 'options') {
        loadOptions(indiaInfo.nfoSearch, optType)
      }
    } else if (!isIndia && fxInfo?.available && fxInfo.exchange) {
      fetch(`/api/angelone/search?exchange=${fxInfo.exchange}&q=${fxInfo.searchQuery}`)
        .then(r => r.json()).then(d => {
          if (d.results?.length) { setFxScrips(d.results); setSelFxScrip(d.results[0]) }
        }).catch(() => {})
    }
  }, [connected, pair, tradeMode]) // eslint-disable-line

  const loadOptions = (query: string, type: OptionType) => {
    fetch(`/api/angelone/search?exchange=NFO&q=${query}${type}`)
      .then(r => r.json()).then(d => {
        const opts = (d.results ?? []).filter((s: ScripResult) =>
          s.tradingsymbol.endsWith(type))
        setOptScrips(opts)
        if (opts.length) setSelOpt(opts[0])
      }).catch(() => {})
  }

  useEffect(() => {
    if (!connected || !isIndia || tradeMode !== 'options') return
    loadOptions(indiaInfo?.nfoSearch ?? '', optType)
  }, [optType]) // eslint-disable-line

  // Filter options by strike input
  const filteredOpts = strike
    ? optScrips.filter(s => s.tradingsymbol.includes(strike))
    : optScrips

  // Script search (manual)
  const handleScripSearch = async () => {
    if (!scripSearch.trim()) return
    const exch = isIndia ? (tradeMode === 'equity' ? 'NSE' : 'NFO') : (fxInfo?.exchange ?? 'NSE')
    const r = await fetch(`/api/angelone/search?exchange=${exch}&q=${encodeURIComponent(scripSearch)}`)
    const d = await r.json()
    setScripSearchRes(d.results ?? [])
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setAuthLoading(true); setAuthError('')
    try {
      const body: Record<string, string> = { apiKey, clientId, password }
      if (useSecret) body.totpSecret = totpSecret
      else           body.totpCode   = totpCode
      const r = await fetch('/api/angelone/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error)
      setConnected(true); setUserName(d.name ?? clientId)
    } catch (e) { setAuthError(e instanceof Error ? e.message : 'Login failed') }
    finally { setAuthLoading(false) }
  }

  const handleLogout = async () => {
    await fetch('/api/angelone/auth', { method: 'DELETE' })
    setConnected(false); setUserName(''); setAccData(null)
  }

  // ── Place order ───────────────────────────────────────────────────────────
  const handleOrder = async (side: 'BUY' | 'SELL') => {
    setOrderLoading(true); setOrderMsg('')
    try {
      let scrip: ScripResult | null = null
      let exchange = 'NSE'
      const isBull = analysis?.bias === 'BULLISH'
      const entry  = analysis?.entry   ?? 0
      const sl     = isBull ? (analysis?.longSL   ?? 0) : (analysis?.shortSL   ?? 0)
      const tp1    = isBull ? (analysis?.longTP1   ?? 0) : (analysis?.shortTP1  ?? 0)

      if (isIndia) {
        if (tradeMode === 'options') { scrip = selOpt; exchange = 'NFO' }
        else if (tradeMode === 'futures') { scrip = selScrip; exchange = 'NFO' }
        else { scrip = selScrip; exchange = 'NSE' }
      } else {
        scrip    = selFxScrip
        exchange = fxInfo?.exchange ?? 'CDS'
      }

      if (!scrip) throw new Error('No instrument selected')

      const body = {
        variety:         fxVariety === 'STOPLOSS' ? 'STOPLOSS' : 'NORMAL',
        tradingsymbol:   scrip.tradingsymbol,
        symboltoken:     scrip.symboltoken,
        transactiontype: side,
        exchange,
        ordertype:       'MARKET',
        producttype:     productType,
        duration:        'DAY',
        price:           '0',
        quantity:        qty,
        stoploss:        sl  > 0 ? Math.abs(entry - sl).toFixed(2)  : undefined,
        squareoff:       tp1 > 0 ? Math.abs(tp1 - entry).toFixed(2) : undefined,
      }

      const r = await fetch('/api/angelone/order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
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

  const biasSide = analysis?.bias === 'BULLISH' ? 'BUY'
    : analysis?.bias === 'BEARISH' ? 'SELL' : null

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!connected) {
    return (
      <CollapsiblePanel title="Angel One Broker" defaultOpen={false}>
        <div style={{ fontSize: 9.5, color: MUTED, marginBottom: 10, lineHeight: 1.6,
          padding: '6px 8px', background: '#f0a83212', borderRadius: 4, border: '1px solid #f0a83230' }}>
          ⚡ Connect Angel One to trade NSE stocks, futures &amp; options, MCX, and CDS — all from this terminal.
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
                hint="Angel One → Profile → Enable TOTP → copy secret" />
            : <InputRow label="TOTP Code" value={totpCode} onChange={setTotpCode}
                placeholder="6-digit code" hint="Current code from authenticator app" />
          }
          {authError && (
            <div style={{ fontSize: 9, color: RED, padding: '4px 6px', background: '#ff4e6a18', borderRadius: 3 }}>
              {authError}
            </div>
          )}
          <button onClick={handleLogin} disabled={authLoading} style={{
            padding: '6px 0', borderRadius: 5, fontSize: 10, fontWeight: 800,
            background: authLoading ? '#1a2540' : '#f0a83218',
            border: `1px solid ${authLoading ? '#1a2540' : '#f0a83244'}`,
            color: authLoading ? MUTED : AMBER,
            cursor: authLoading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', letterSpacing: '0.06em', transition: 'all .15s',
          }}>
            {authLoading ? '⟳ Connecting…' : '⚡ Connect Angel One'}
          </button>
        </div>
      </CollapsiblePanel>
    )
  }

  // ── Connected ─────────────────────────────────────────────────────────────
  return (
    <CollapsiblePanel title="Angel One Broker" defaultOpen>
      {/* Status bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN,
            boxShadow: `0 0 8px ${GREEN}`, display: 'inline-block' }} />
          <span style={{ fontSize: 10, color: GREEN, fontWeight: 700 }}>{userName}</span>
          {accData && (
            <span style={{ fontSize: 8.5, color: BLUE, fontWeight: 700 }}>
              ₹{fmt2(accData.funds.availablecash)} avail
            </span>
          )}
        </div>
        <button onClick={handleLogout} style={{ fontSize: 8.5, color: MUTED, background: 'none',
          border: '1px solid #1a2540', borderRadius: 3, padding: '2px 7px', cursor: 'pointer',
          fontFamily: 'inherit' }}>
          Disconnect
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {(['account', 'trade', 'orders'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 700, borderRadius: 4,
            background: tab === t ? '#1b2a45' : 'transparent',
            border: `1px solid ${tab === t ? '#2d4a7a' : '#1a2540'}`,
            color: tab === t ? '#7ab8ff' : MUTED,
            cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
          }}>{t}</button>
        ))}
      </div>

      {/* ══ ACCOUNT tab ════════════════════════════════════════════════════════ */}
      {tab === 'account' && (
        <div>
          {accLoading && <div style={{ fontSize: 9, color: MUTED, textAlign: 'center', padding: 10 }}>Loading…</div>}
          {accError   && <div style={{ fontSize: 9, color: RED }}>{accError}</div>}
          {accData && <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
              <FundCell label="Net Value"       value={`₹ ${fmt2(accData.funds.net)}`}             color={GREEN} />
              <FundCell label="Available Cash"  value={`₹ ${fmt2(accData.funds.availablecash)}`}   color={BLUE}  />
              <FundCell label="Used Margin"     value={`₹ ${fmt2(accData.funds.utilisedmargin)}`}  color={AMBER} />
              <FundCell label="M2M Unrealised"  value={`₹ ${fmt2(accData.funds.m2mUnrealised)}`}
                color={parseFloat(accData.funds.m2mUnrealised) >= 0 ? GREEN : RED} />
            </div>
            <button onClick={loadAccount} style={{ width: '100%', padding: '4px 0', fontSize: 9,
              fontWeight: 700, borderRadius: 4, cursor: 'pointer', border: '1px solid #1a2540',
              background: 'transparent', color: MUTED, fontFamily: 'inherit' }}>
              ⟳ Refresh
            </button>
            {/* Open positions */}
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
          </>}
        </div>
      )}

      {/* ══ TRADE tab ══════════════════════════════════════════════════════════ */}
      {tab === 'trade' && (
        <div>
          {/* India instruments */}
          {isIndia && indiaInfo && (
            <>
              {/* Instrument info */}
              <div style={{ padding: '5px 8px', borderRadius: 4, marginBottom: 8,
                background: '#22d3ee0c', border: '1px solid #22d3ee22' }}>
                <div style={{ fontSize: 9, color: CYAN, fontWeight: 700, marginBottom: 1 }}>
                  {indiaInfo.label}
                </div>
                <div style={{ fontSize: 8, color: MUTED }}>
                  Lot: {indiaInfo.lotSize} units · NSE/NFO · Tick: ₹{indiaInfo.pipSize}
                </div>
              </div>

              {/* Trade mode tabs */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {(['equity', 'futures', 'options'] as TradeMode[]).map(m => (
                  <button key={m} onClick={() => setTradeMode(m)} style={{
                    flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 700, borderRadius: 4,
                    background: tradeMode === m ? '#1b2a45' : 'transparent',
                    border: `1px solid ${tradeMode === m ? CYAN + '88' : '#1a2540'}`,
                    color: tradeMode === m ? CYAN : MUTED,
                    cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                  }}>{m}</button>
                ))}
              </div>

              {/* AI entry/SL/TP */}
              {analysis && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, marginBottom: 8 }}>
                  {(() => {
                    const bull = analysis.bias === 'BULLISH'
                    const sl2  = bull ? analysis.longSL   : analysis.shortSL
                    const tp1a = bull ? analysis.longTP1  : analysis.shortTP1
                    const tp2a = bull ? analysis.longTP2  : analysis.shortTP2
                    return <>
                      <PriceCell label="Entry" value={analysis.entry?.toFixed(2) ?? '—'} color='#d4e2f8' />
                      <PriceCell label="Stop"  value={sl2?.toFixed(2)  ?? '—'} color={RED}   />
                      <PriceCell label="TP 1"  value={tp1a?.toFixed(2) ?? '—'} color={GREEN} />
                      <PriceCell label="TP 2"  value={tp2a?.toFixed(2) ?? '—'} color={GREEN} />
                    </>
                  })()}
                </div>
              )}

              {/* ── Equity ── */}
              {tradeMode === 'equity' && (
                <>
                  <SectionLabel text="NSE Equity — Delivery or Intraday" />
                  {scrips.length > 0 && (
                    <select value={selScrip?.symboltoken ?? ''} onChange={e => {
                        const s = scrips.find(x => x.symboltoken === e.target.value)
                        if (s) setSelScrip(s)
                      }} style={selectStyle}>
                      {scrips.map(s => <option key={s.symboltoken} value={s.symboltoken}>{s.tradingsymbol}</option>)}
                    </select>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                    <div>
                      <SectionLabel text="Qty (shares)" />
                      <input type="number" value={qty} onChange={e => setQty(e.target.value)} min="1" className="fx-input" style={{ width: '100%' }} />
                    </div>
                    <div>
                      <SectionLabel text="Product" />
                      <select value={productType} onChange={e => setProductType(e.target.value as ProductType)} style={selectStyle}>
                        <option value="INTRADAY">Intraday (MIS)</option>
                        <option value="DELIVERY">Delivery (CNC)</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* ── Futures ── */}
              {tradeMode === 'futures' && (
                <>
                  <SectionLabel text="NFO Futures — select expiry" />
                  {scrips.length > 0
                    ? <select value={selScrip?.symboltoken ?? ''} onChange={e => {
                        const s = scrips.find(x => x.symboltoken === e.target.value)
                        if (s) setSelScrip(s)
                      }} style={selectStyle}>
                        {scrips.map(s => <option key={s.symboltoken} value={s.symboltoken}>
                          {s.tradingsymbol} {s.expiry ? `[${s.expiry}]` : ''}
                        </option>)}
                      </select>
                    : <div style={{ fontSize: 9, color: MUTED, padding: '6px 0' }}>Searching futures…</div>
                  }
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                    <div>
                      <SectionLabel text={`Lots (1 = ${indiaInfo.lotSize} units)`} />
                      <input type="number" value={qty} onChange={e => setQty(e.target.value)} min="1" className="fx-input" style={{ width: '100%' }} />
                    </div>
                    <div>
                      <SectionLabel text="Product" />
                      <select value={productType} onChange={e => setProductType(e.target.value as ProductType)} style={selectStyle}>
                        <option value="CARRYFORWARD">Carry Forward</option>
                        <option value="INTRADAY">Intraday (MIS)</option>
                        <option value="MARGIN">Margin</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* ── Options ── */}
              {tradeMode === 'options' && (
                <>
                  {/* CE / PE toggle */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <button onClick={() => setOptType('CE')} style={{
                      flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 800, borderRadius: 4,
                      background: optType === 'CE' ? '#00d48f18' : 'transparent',
                      border: `1px solid ${optType === 'CE' ? GREEN + '66' : '#1a2540'}`,
                      color: optType === 'CE' ? GREEN : MUTED, cursor: 'pointer', fontFamily: 'inherit',
                    }}>CALL (CE)</button>
                    <button onClick={() => setOptType('PE')} style={{
                      flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 800, borderRadius: 4,
                      background: optType === 'PE' ? '#ff4e6a18' : 'transparent',
                      border: `1px solid ${optType === 'PE' ? RED + '66' : '#1a2540'}`,
                      color: optType === 'PE' ? RED : MUTED, cursor: 'pointer', fontFamily: 'inherit',
                    }}>PUT (PE)</button>
                  </div>

                  {/* Strike filter */}
                  <div style={{ marginBottom: 6 }}>
                    <SectionLabel text="Filter by strike price" />
                    <input value={strike} onChange={e => setStrike(e.target.value)}
                      placeholder="e.g. 24000" className="fx-input" style={{ width: '100%' }} />
                  </div>

                  {/* Options list */}
                  {filteredOpts.length > 0 ? (
                    <div style={{ marginBottom: 6 }}>
                      <SectionLabel text={`${optType} contracts (${filteredOpts.length})`} />
                      <select value={selOpt?.symboltoken ?? ''} onChange={e => {
                          const s = filteredOpts.find(x => x.symboltoken === e.target.value)
                          if (s) setSelOpt(s)
                        }} style={{ ...selectStyle, maxHeight: 120 }} size={Math.min(5, filteredOpts.length)}>
                        {filteredOpts.map(s => (
                          <option key={s.symboltoken} value={s.symboltoken}>
                            {s.tradingsymbol} {s.expiry ? `[${s.expiry}]` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div style={{ fontSize: 9, color: MUTED, padding: '6px 0' }}>
                      {optScrips.length > 0 ? 'No strikes match filter' : 'Loading options…'}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <SectionLabel text={`Lots (1 = ${indiaInfo.lotSize})`} />
                      <input type="number" value={qty} onChange={e => setQty(e.target.value)} min="1" className="fx-input" style={{ width: '100%' }} />
                    </div>
                    <div>
                      <SectionLabel text="Product" />
                      <select value={productType} onChange={e => setProductType(e.target.value as ProductType)} style={selectStyle}>
                        <option value="CARRYFORWARD">Carry Forward</option>
                        <option value="INTRADAY">Intraday (MIS)</option>
                      </select>
                    </div>
                  </div>

                  {/* Options hint */}
                  <div style={{ marginTop: 6, fontSize: 8, color: '#3d506a', lineHeight: 1.5,
                    padding: '5px 7px', background: '#0c1220', borderRadius: 3, border: '1px solid #1a2540' }}>
                    💡 Buy CE when BULLISH, Buy PE when BEARISH. AI bias: <strong style={{ color: biasSide === 'BUY' ? GREEN : biasSide === 'SELL' ? RED : AMBER }}>{analysis?.bias ?? '—'}</strong>
                    <br/>Suggested: {analysis?.bias === 'BULLISH' ? '▲ Buy CALL (CE)' : analysis?.bias === 'BEARISH' ? '▼ Buy PUT (PE)' : '⟳ Wait for signal'}
                  </div>
                </>
              )}
            </>
          )}

          {/* Forex instruments */}
          {!isIndia && (
            <>
              {fxInfo?.available ? (
                <>
                  <div style={{ padding: '5px 8px', borderRadius: 4, marginBottom: 8,
                    background: '#00d48f0d', border: '1px solid #00d48f22' }}>
                    <div style={{ fontSize: 9, color: GREEN, fontWeight: 700, marginBottom: 1 }}>
                      {pair} → {fxInfo.label}
                    </div>
                    <div style={{ fontSize: 8, color: MUTED }}>{fxInfo.note}</div>
                  </div>

                  {analysis && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, marginBottom: 8 }}>
                      {(() => {
                        const bull = analysis.bias === 'BULLISH'
                        const sl2  = bull ? analysis.longSL  : analysis.shortSL
                        const tp1a = bull ? analysis.longTP1 : analysis.shortTP1
                        const tp2a = bull ? analysis.longTP2 : analysis.shortTP2
                        return <>
                          <PriceCell label="Entry" value={analysis.entry?.toFixed(4) ?? '—'} color='#d4e2f8' />
                          <PriceCell label="Stop"  value={sl2?.toFixed(4)  ?? '—'} color={RED}   />
                          <PriceCell label="TP 1"  value={tp1a?.toFixed(4) ?? '—'} color={GREEN} />
                          <PriceCell label="TP 2"  value={tp2a?.toFixed(4) ?? '—'} color={GREEN} />
                        </>
                      })()}
                    </div>
                  )}

                  {fxScrips.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <SectionLabel text="Instrument (select expiry)" />
                      <select value={selFxScrip?.symboltoken ?? ''} onChange={e => {
                          const s = fxScrips.find(x => x.symboltoken === e.target.value)
                          if (s) setSelFxScrip(s)
                        }} style={selectStyle}>
                        {fxScrips.map(s => (
                          <option key={s.symboltoken} value={s.symboltoken}>
                            {s.tradingsymbol} {s.expiry ? `(${s.expiry})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                    <div>
                      <SectionLabel text={`Lots (1 = ${fxInfo.lotSize} units)`} />
                      <input type="number" value={qty} onChange={e => setQty(e.target.value)} min="1" className="fx-input" style={{ width: '100%' }} />
                    </div>
                    <div>
                      <SectionLabel text="Variety" />
                      <select value={fxVariety} onChange={e => setFxVariety(e.target.value as 'NORMAL' | 'STOPLOSS')} style={selectStyle}>
                        <option value="NORMAL">Normal</option>
                        <option value="STOPLOSS">Bracket (SL+TP)</option>
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 9, color: MUTED, textAlign: 'center', padding: '12px 0' }}>
                  No Angel One equivalent for {pair}.<br/>
                  <span style={{ color: '#3d506a' }}>
                    {fxInfo?.note ?? 'Switch to XAUUSD, NIFTY, BANKNIFTY, or NSE stocks.'}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Manual scrip search */}
          {canTrade && (
            <div style={{ marginTop: 8, padding: '6px 8px', background: '#0c1220',
              border: '1px solid #1a2540', borderRadius: 4 }}>
              <SectionLabel text="Manual instrument search" />
              <div style={{ display: 'flex', gap: 4 }}>
                <input value={scripSearch} onChange={e => setScripSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleScripSearch()}
                  placeholder="Symbol name…" className="fx-input" style={{ flex: 1 }} />
                <button onClick={handleScripSearch} style={{
                  padding: '4px 9px', fontSize: 9, borderRadius: 4, cursor: 'pointer',
                  background: '#1b2a45', border: '1px solid #2d4a7a', color: '#7ab8ff',
                  fontFamily: 'inherit', fontWeight: 700,
                }}>Search</button>
              </div>
              {scripSearchRes.length > 0 && (
                <div style={{ marginTop: 4, maxHeight: 100, overflowY: 'auto' }}>
                  {scripSearchRes.map(s => (
                    <div key={s.symboltoken} onClick={() => {
                        if (isIndia && tradeMode === 'options') setSelOpt(s)
                        else if (isIndia) setSelScrip(s)
                        else setSelFxScrip(s)
                        setScripSearchRes([])
                      }}
                      style={{ padding: '3px 5px', fontSize: 8.5, cursor: 'pointer', borderRadius: 2,
                        color: '#7ab8ff', background: 'transparent' }}
                      onMouseEnter={e => { (e.target as HTMLDivElement).style.background = '#1b2a45' }}
                      onMouseLeave={e => { (e.target as HTMLDivElement).style.background = 'transparent' }}>
                      {s.tradingsymbol} {s.expiry ? `[${s.expiry}]` : ''} — {s.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* BUY / SELL */}
          {canTrade && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
                <TradeBtn side="BUY"  bias={biasSide} loading={orderLoading} onClick={() => handleOrder('BUY')} />
                <TradeBtn side="SELL" bias={biasSide} loading={orderLoading} onClick={() => handleOrder('SELL')} />
              </div>

              {orderMsg && (
                <div style={{ fontSize: 9, padding: '4px 7px', borderRadius: 3, marginTop: 6,
                  background: orderMsg.startsWith('✓') ? '#00d48f0f' : '#ff4e6a0f',
                  color: orderMsg.startsWith('✓') ? GREEN : RED,
                  border: `1px solid ${orderMsg.startsWith('✓') ? '#00d48f22' : '#ff4e6a22'}` }}>
                  {orderMsg}
                </div>
              )}

              {/* Auto-trade */}
              <div style={{ padding: '6px 8px', borderRadius: 4, background: '#ff4e6a08',
                border: '1px solid #ff4e6a22', marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 9, color: RED, fontWeight: 700 }}>⚠ Auto-Trade</span>
                  <div style={{ width: 28, height: 15, borderRadius: 8,
                    background: autoTrade ? RED : '#1a2540',
                    border: `1px solid ${autoTrade ? '#ff4e6a88' : '#1a2540'}`,
                    position: 'relative', transition: 'all .2s', cursor: 'pointer' }}
                    onClick={() => {
                      if (!autoConfirm && !autoTrade) { setAutoConfirm(true); return }
                      setAutoTrade(v => !v); setAutoConfirm(false)
                    }}>
                    <div style={{ position: 'absolute', top: 2, left: autoTrade ? 14 : 2, width: 9, height: 9,
                      borderRadius: '50%', background: autoTrade ? '#fff' : MUTED, transition: 'all .2s' }} />
                  </div>
                </div>
                {autoConfirm && (
                  <div style={{ fontSize: 8.5, color: RED, lineHeight: 1.5 }}>
                    This places REAL ORDERS on every AI signal change. Real money at risk. Confirm?
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button onClick={() => { setAutoTrade(true); setAutoConfirm(false) }} style={dangerBtnStyle}>Yes, enable</button>
                      <button onClick={() => setAutoConfirm(false)} style={cancelBtnStyle}>Cancel</button>
                    </div>
                  </div>
                )}
                {!autoConfirm && (
                  <div style={{ fontSize: 8, color: autoTrade ? AMBER : '#3d506a' }}>
                    {autoTrade ? `ON — watching for bias change (now: ${analysis?.bias ?? '—'})` : 'Off — manual trading only'}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 6, fontSize: 8, color: '#3d506a', lineHeight: 1.5,
                padding: '5px 7px', background: '#0c1220', borderRadius: 3, border: '1px solid #1a2540' }}>
                ⚙ NSE intraday positions square-off at 3:20 PM IST. NFO options expire worthless if OTM at expiry. SL/TP values are from AI analysis — verify before placing. Educational use only.
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ ORDERS tab ═════════════════════════════════════════════════════════ */}
      {tab === 'orders' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <SectionLabel text="Today's Orders" />
            <button onClick={loadAccount} style={{ fontSize: 8, color: MUTED, background: 'none',
              border: '1px solid #1a2540', borderRadius: 3, padding: '2px 6px', cursor: 'pointer',
              fontFamily: 'inherit' }}>⟳</button>
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
                      <button onClick={() => handleCancelOrder(o.orderid)} style={{ fontSize: 7.5, color: RED,
                        background: 'none', border: '1px solid #ff4e6a33', borderRadius: 2, padding: '1px 5px',
                        cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
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

// ── Shared styles ─────────────────────────────────────────────────────────────
const selectStyle: React.CSSProperties = {
  width: '100%', padding: '4px 6px', fontSize: 9, background: '#0c1525',
  border: '1px solid #1a2540', color: '#d4e2f8', borderRadius: 3, fontFamily: 'inherit',
}
const dangerBtnStyle: React.CSSProperties = {
  flex: 1, padding: '3px 0', fontSize: 8.5, fontWeight: 700,
  background: '#ff4e6a18', border: '1px solid #ff4e6a44', color: RED,
  borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
}
const cancelBtnStyle: React.CSSProperties = {
  flex: 1, padding: '3px 0', fontSize: 8.5, fontWeight: 700,
  background: 'transparent', border: '1px solid #1a2540', color: MUTED,
  borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
}

// ── Sub-components ────────────────────────────────────────────────────────────
function InputRow({ label, value, onChange, placeholder, type = 'text', hint }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder: string; type?: string; hint?: string
}) {
  return (
    <div>
      <div style={{ fontSize: 8.5, color: MUTED, marginBottom: 2, letterSpacing: '0.05em' }}>{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} className="fx-input" style={{ width: '100%' }} />
      {hint && <div style={{ fontSize: 7.5, color: '#3d506a', marginTop: 2, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  )
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '4px 0', fontSize: 9, fontWeight: 700, borderRadius: 4,
      background: active ? '#1b2a45' : 'transparent',
      border: `1px solid ${active ? '#2d4a7a' : '#1a2540'}`,
      color: active ? '#7ab8ff' : MUTED, cursor: 'pointer', fontFamily: 'inherit',
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
  side: 'BUY' | 'SELL'; bias: 'BUY' | 'SELL' | null; loading: boolean; onClick: () => void
}) {
  const isBuy = side === 'BUY'
  const col   = isBuy ? GREEN : RED
  const active = bias === side
  return (
    <button onClick={onClick} disabled={loading} style={{
      padding: '7px 0', borderRadius: 5, fontSize: 10, fontWeight: 800,
      background: active ? `${col}22` : 'transparent',
      border: `1px solid ${active ? `${col}66` : '#1a2540'}`,
      color: active ? col : MUTED,
      cursor: loading ? 'not-allowed' : 'pointer',
      fontFamily: 'inherit', letterSpacing: '0.06em',
      boxShadow: active ? `0 0 12px ${col}22` : 'none', transition: 'all .15s',
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
