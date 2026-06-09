'use client'
import { useEffect, useRef } from 'react'
import type { Candle } from '@/lib/indicators'
import {
  orderBlocks, fairValueGaps, structureBreaks,
  swingPoints as calcSwings, liquiditySweeps, supertrend as calcSupertrend,
} from '@/lib/indicators'

// ── Indicator config ──────────────────────────────────────────────────────────
export interface IndicatorConfig {
  ema20: boolean
  ema50: boolean
  ema200: boolean
  vwap: boolean
  orderBlocks: boolean
  fvgs: boolean
  bosChoch: boolean
  sweeps: boolean
  swingPoints: boolean
  supertrend: boolean
}

export const DEFAULT_INDICATORS: IndicatorConfig = {
  ema20: true, ema50: true, ema200: true, vwap: true,
  orderBlocks: true, fvgs: true, bosChoch: true, sweeps: true,
  swingPoints: false, supertrend: false,
}

// ── Chart colors ──────────────────────────────────────────────────────────────
const C = {
  bull:     '#00d48f',
  bear:     '#ff4e6a',
  cyan:     '#22d3ee',
  amber:    '#f0a832',
  purple:   '#a78bfa',
  blue:     '#4d8fff',
  orange:   '#ff9d00',
  bullDim:  '#00d48f55',
  bearDim:  '#ff4e6a55',
  cyanDim:  '#22d3ee55',
}

interface Props {
  candles: Candle[]
  pair: string
  pipSize?: number
  indicators: IndicatorConfig
}

export default function TradingChart({ candles, pair, indicators }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return

    const init = async () => {
      const lc = await import('lightweight-charts')
      const LineStyle = lc.LineStyle

      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }

      const chart = lc.createChart(containerRef.current!, {
        layout: {
          background: { color: '#070b14' },
          textColor: '#4a6a8a',
          fontSize: 10,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        },
        grid: {
          vertLines: { color: '#0c1422' },
          horzLines: { color: '#0c1422' },
        },
        rightPriceScale: {
          borderColor: '#1a2540',
          scaleMargins: { top: 0.08, bottom: 0.08 },
          textColor: '#4a6a8a',
        },
        timeScale: {
          borderColor: '#1a2540',
          timeVisible: true,
          secondsVisible: false,
        },
        crosshair: {
          vertLine: { color: '#2d4060', width: 1, labelBackgroundColor: '#111827' },
          horzLine: { color: '#2d4060', width: 1, labelBackgroundColor: '#111827' },
        },
        width:  containerRef.current!.clientWidth,
        height: containerRef.current!.clientHeight,
      })
      chartRef.current = chart

      // ── Candles ─────────────────────────────────────────────────────────────
      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor: C.bull, downColor: C.bear,
        borderUpColor: C.bull, borderDownColor: C.bear,
        wickUpColor: C.bullDim, wickDownColor: C.bearDim,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candleSeries.setData(candles.map(k => ({ time: k.time as any, open: k.open, high: k.high, low: k.low, close: k.close })))

      const closes = candles.map(c => c.close)
      const times  = candles.map(c => c.time as number)

      // EMA helper
      const calcEma = (arr: number[], p: number) => {
        const k = 2 / (p + 1); let prev = arr[0]
        return arr.map((v, i) => { prev = i === 0 ? v : v * k + prev * (1 - k); return prev })
      }

      // ── EMAs ────────────────────────────────────────────────────────────────
      const emaConf: { p: number; c: string; w: 1 | 2; key: keyof IndicatorConfig }[] = [
        { p: 20,  c: C.cyan,   w: 1, key: 'ema20'  },
        { p: 50,  c: C.amber,  w: 1, key: 'ema50'  },
        { p: 200, c: C.purple, w: 2, key: 'ema200' },
      ]
      for (const { p, c, w, key } of emaConf) {
        if (!indicators[key]) continue
        const s = chart.addSeries(lc.LineSeries, { color: c, lineWidth: w, priceLineVisible: false, lastValueVisible: false })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        s.setData(calcEma(closes, p).map((v, i) => ({ time: times[i] as any, value: v })))
      }

      // ── VWAP ────────────────────────────────────────────────────────────────
      if (indicators.vwap) {
        let cumPV = 0, cumV = 0
        const vwapData = candles.map(k => {
          const tp = (k.high + k.low + k.close) / 3
          const v = k.volume ?? 1
          cumPV += tp * v; cumV += v
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return { time: k.time as any, value: cumPV / cumV }
        })
        const vs = chart.addSeries(lc.LineSeries, { color: C.blue, lineWidth: 2 as 2, lineStyle: 2, priceLineVisible: false, lastValueVisible: false })
        vs.setData(vwapData)
      }

      // ── Supertrend ──────────────────────────────────────────────────────────
      if (indicators.supertrend) {
        const st = calcSupertrend(candles, 10, 3)
        // Bull (above candles = support line green) and Bear (below = resistance red)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bullData: any[] = []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bearData: any[] = []
        st.trend.forEach((t, i) => {
          const pt = { time: times[i] as unknown as import('lightweight-charts').UTCTimestamp, value: st.line[i] }
          if (t === 'bull') bullData.push(pt)
          else              bearData.push(pt)
        })
        if (bullData.length) {
          const bs = chart.addSeries(lc.LineSeries, { color: C.bull, lineWidth: 2 as 2, priceLineVisible: false, lastValueVisible: false })
          bs.setData(bullData)
        }
        if (bearData.length) {
          const rs = chart.addSeries(lc.LineSeries, { color: C.bear, lineWidth: 2 as 2, priceLineVisible: false, lastValueVisible: false })
          rs.setData(bearData)
        }
      }

      // ── SMC/ICT Calculations ────────────────────────────────────────────────
      const swings = calcSwings(candles, 10)
      const breaks = structureBreaks(candles, swings)
      const obs    = orderBlocks(candles)
      const fvgs   = fairValueGaps(candles)
      const sweeps = liquiditySweeps(candles)

      // ── Order Blocks ─────────────────────────────────────────────────────────
      if (indicators.orderBlocks) {
        const unmitigated = obs.filter(o => !o.mitigated).slice(-5) // last 5
        for (const ob of unmitigated) {
          const col = ob.type === 'bull' ? C.bull : C.bear
          // Top line (with label)
          candleSeries.createPriceLine({
            price: ob.high, color: col,
            lineWidth: 1, lineStyle: LineStyle.Solid,
            axisLabelVisible: false,
            title: ob.type === 'bull' ? '▷ BULL OB' : '▷ BEAR OB',
          })
          // Bottom line
          candleSeries.createPriceLine({
            price: ob.low, color: col + '99',
            lineWidth: 1, lineStyle: LineStyle.Dashed,
            axisLabelVisible: false, title: '',
          })
        }
      }

      // ── Fair Value Gaps ──────────────────────────────────────────────────────
      if (indicators.fvgs) {
        const unmitigated = fvgs.filter(f => !f.mitigated).slice(-6)
        for (const fvg of unmitigated) {
          const col = fvg.type === 'bull' ? C.cyan : C.bear
          candleSeries.createPriceLine({
            price: fvg.top, color: col,
            lineWidth: 1, lineStyle: LineStyle.Dashed,
            axisLabelVisible: false,
            title: fvg.type === 'bull' ? '◈ Bull FVG' : '◈ Bear FVG',
          })
          candleSeries.createPriceLine({
            price: fvg.bottom, color: col + '88',
            lineWidth: 1, lineStyle: LineStyle.Dotted,
            axisLabelVisible: false, title: '',
          })
        }
      }

      // ── BOS / CHoCH ──────────────────────────────────────────────────────────
      if (indicators.bosChoch) {
        const recent = breaks.slice(-8)
        for (const b of recent) {
          const isBOS   = b.type === 'BOS'
          const isBull  = b.direction === 'bull'
          const col = isBOS
            ? (isBull ? C.bull : C.bear)
            : (isBull ? C.cyan : C.orange)
          candleSeries.createPriceLine({
            price: b.level, color: col,
            lineWidth: 1, lineStyle: isBOS ? LineStyle.LargeDashed : LineStyle.Dashed,
            axisLabelVisible: false,
            title: `${b.type} ${isBull ? '▲' : '▼'}`,
          })
        }
      }

      // ── Liquidity Sweeps (as price lines at swept level) ─────────────────────
      if (indicators.sweeps) {
        for (const sw of sweeps.slice(-10)) {
          candleSeries.createPriceLine({
            price: sw.level,
            color: sw.type === 'BSL' ? C.bear : C.bull,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
            title: sw.type === 'BSL' ? '↓ BSL Swept' : '↑ SSL Swept',
          })
        }
      }

      // ── Swing Points (as subtle price lines) ──────────────────────────────────
      if (indicators.swingPoints) {
        for (const sp of swings.slice(-16)) {
          const isHigh = sp.type === 'H'
          candleSeries.createPriceLine({
            price: sp.price,
            color: isHigh ? C.purple + '88' : C.orange + '88',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
            title: sp.label,
          })
        }
      }

      chart.timeScale().fitContent()

      const ro = new ResizeObserver(() => {
        if (containerRef.current)
          chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight })
      })
      containerRef.current && ro.observe(containerRef.current)
      return () => ro.disconnect()
    }

    init()
    return () => { if (chartRef.current) { chartRef.current.remove(); chartRef.current = null } }
  }, [candles, indicators])  // re-render when indicators toggle

  // ── Legend entries (only show active ones) ─────────────────────────────────
  const legendItems = [
    indicators.ema20    && { label: 'EMA 20',    color: C.cyan   },
    indicators.ema50    && { label: 'EMA 50',    color: C.amber  },
    indicators.ema200   && { label: 'EMA 200',   color: C.purple },
    indicators.vwap     && { label: 'VWAP',      color: C.blue   },
    indicators.supertrend && { label: 'Supertrend', color: C.bull },
    indicators.orderBlocks && { label: 'OB',      color: C.bull   },
    indicators.fvgs     && { label: 'FVG',       color: C.cyan   },
    indicators.bosChoch && { label: 'BOS/CHoCH', color: C.amber  },
    indicators.sweeps   && { label: 'Sweeps',    color: C.bear   },
  ].filter(Boolean) as { label: string; color: string }[]

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Pair label */}
      <div style={{
        position: 'absolute', top: 10, left: 14,
        pointerEvents: 'none',
      }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#d4e2f8', letterSpacing: '-0.01em',
          textShadow: '0 2px 12px #070b1488' }}>{pair}</span>
      </div>

      {/* Dynamic legend */}
      {legendItems.length > 0 && (
        <div style={{
          position: 'absolute', top: 12, right: 14,
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
          fontSize: 8.5, pointerEvents: 'none', maxWidth: '55%', justifyContent: 'flex-end',
        }}>
          {legendItems.map(({ label, color }) => (
            <span key={label} style={{ color: '#4a6a8a', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ display: 'inline-block', width: 12, height: 2, background: color, borderRadius: 1 }} />
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
