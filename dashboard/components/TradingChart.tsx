'use client'
import { useEffect, useRef } from 'react'
import type { Candle } from '@/lib/indicators'

interface Props { candles: Candle[]; pair: string; pipSize?: number }

export default function TradingChart({ candles, pair }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return

    const init = async () => {
      const lc = await import('lightweight-charts')

      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }

      const chart = lc.createChart(containerRef.current!, {
        layout: {
          background: { color: '#070b14' },
          textColor: '#4a6a8a',
          fontSize: 10,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        },
        grid: {
          vertLines: { color: '#0d1525' },
          horzLines: { color: '#0d1525' },
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
          tickMarkFormatter: (time: number) => {
            const d = new Date(time * 1000)
            return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
          },
        },
        crosshair: {
          vertLine: { color: '#2d4060', width: 1, labelBackgroundColor: '#111827' },
          horzLine: { color: '#2d4060', width: 1, labelBackgroundColor: '#111827' },
        },
        width:  containerRef.current!.clientWidth,
        height: containerRef.current!.clientHeight,
      })

      chartRef.current = chart

      // Candlesticks
      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor:         '#00d48f',
        downColor:       '#ff4e6a',
        borderUpColor:   '#00d48f',
        borderDownColor: '#ff4e6a',
        wickUpColor:     '#00d48f88',
        wickDownColor:   '#ff4e6a88',
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      candleSeries.setData(candles.map(k => ({ time: k.time as any, open: k.open, high: k.high, low: k.low, close: k.close })))

      // EMA helper
      const calcEma = (arr: number[], p: number) => {
        const k = 2 / (p + 1); let prev = arr[0]
        return arr.map((v, i) => { prev = i === 0 ? v : v * k + prev * (1 - k); return prev })
      }
      const closes = candles.map(c => c.close)
      const times  = candles.map(c => c.time as number)

      // EMAs
      const lines: { p: number; c: string; w: 1 | 2 }[] = [
        { p: 20,  c: '#22d3ee',  w: 1 },  // cyan  — fast
        { p: 50,  c: '#f0a832',  w: 1 },  // amber — medium
        { p: 200, c: '#a78bfa',  w: 2 },  // purple — slow
      ]
      for (const { p, c, w } of lines) {
        const s = chart.addSeries(lc.LineSeries, {
          color: c, lineWidth: w,
          priceLineVisible: false, lastValueVisible: false,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        s.setData(calcEma(closes, p).map((v, i) => ({ time: times[i] as any, value: v })))
      }

      // VWAP
      let cumPV = 0, cumV = 0
      const vwapData = candles.map(k => {
        const tp = (k.high + k.low + k.close) / 3
        const v = k.volume ?? 1
        cumPV += tp * v; cumV += v
        return { time: k.time as unknown as import('lightweight-charts').UTCTimestamp, value: cumPV / cumV }
      })
      const vwapSeries = chart.addSeries(lc.LineSeries, {
        color: '#4d8fff', lineWidth: 2 as 2, lineStyle: 2,
        priceLineVisible: false, lastValueVisible: false,
      })
      vwapSeries.setData(vwapData)

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
  }, [candles])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Pair label overlay */}
      <div style={{
        position: 'absolute', top: 10, left: 14,
        display: 'flex', flexDirection: 'column', gap: 3,
        pointerEvents: 'none',
      }}>
        <span style={{
          fontSize: 16, fontWeight: 800, color: '#d4e2f8',
          letterSpacing: '-0.01em',
          textShadow: '0 2px 12px #070b1488',
        }}>{pair}</span>
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute', top: 12, right: 14,
        display: 'flex', gap: 10, alignItems: 'center',
        fontSize: 9, pointerEvents: 'none',
      }}>
        {[['EMA 20','#22d3ee'],['EMA 50','#f0a832'],['EMA 200','#a78bfa'],['VWAP','#4d8fff']].map(([l,c]) => (
          <span key={l} style={{ color: '#4a6a8a', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 14, height: 2, background: c, borderRadius: 1 }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  )
}
