import type { Layout } from 'plotly.js-dist-min'
import { memo, useEffect, useRef } from 'react'
import type { PacketField, TelemetryMessage } from '../contract'
import { HISTORY_LIMIT } from '../hooks/useWebSocket'
import type { ReadResult } from '../hooks/streamLogic'
import { PAD_FRAC, toXY, visibleYRange } from './chartLogic'
import { loadPlotly, type PlotlyApi } from './plotly'

const WINDOW_SECONDS = 30 // [confirm display window]

// Memory cap per trace only; the visible window is set by xaxis.range.
const MAX_POINTS = HISTORY_LIMIT

type Range = [number, number]

/**
 * The single source of every axis setting. relayout replaces whole axis
 * objects (the bundled types don't allow 'xaxis.range' paths), so newPlot and
 * every relayout build their axes here and nothing gets dropped. A null
 * yRange omits yaxis entirely, leaving that axis as it is.
 */
function axesLayout(xRange?: Range, yRange?: Range | null): Partial<Layout> {
  const layout: Partial<Layout> = {
    xaxis: { title: { text: 't (s)' }, ...(xRange && { range: xRange }) },
  }
  if (yRange !== null) {
    layout.yaxis = { ...(yRange && { range: yRange }) }
  }
  return layout
}

interface LiveChartProps {
  field: PacketField
  getMessagesSince: (cursor: number) => ReadResult<TelemetryMessage>
}

/**
 * One live line chart for one packet field. Data flows from the stream's ref
 * buffer straight into Plotly on its own rAF loop; React never re-renders
 * this component on new data.
 */
function LiveChart({ field, getMessagesSince }: LiveChartProps) {
  const divRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const div = divRef.current
    if (!div) return

    let disposed = false
    let rafId = 0
    let plotly: PlotlyApi | null = null
    let cursor = 0
    let lastX: number | null = null
    // Mirror of the plotted trace (including null break points), kept in step
    // with extendTraces' MAX_POINTS trimming, so the y range can be computed
    // without reading Plotly's internal data.
    let xs: number[] = []
    let ys: (number | null)[] = []

    function tick() {
      if (disposed || !plotly || !div) return
      const { messages, cursor: next } = getMessagesSince(cursor)
      cursor = next

      if (messages.length > 0) {
        const { x, y, reset } = toXY(messages, field, lastX)
        if (x.length > 0) {
          if (reset) {
            plotly.restyle(div, { x: [x], y: [y] }, [0])
            xs = [...x]
            ys = [...y]
          } else {
            plotly.extendTraces(div, { x: [x], y: [y] }, [0], MAX_POINTS)
            xs.push(...x)
            ys.push(...y)
            if (xs.length > MAX_POINTS) {
              xs.splice(0, xs.length - MAX_POINTS)
              ys.splice(0, ys.length - MAX_POINTS)
            }
          }
          // Last point is always a real sample (breaks are only inserted before one).
          lastX = x[x.length - 1]
          const xRange: Range = [lastX - WINDOW_SECONDS, lastX]
          const yRange = visibleYRange(xs, ys, xRange[0], xRange[1], PAD_FRAC)
          plotly.relayout(div, axesLayout(xRange, yRange))
        }
      }

      rafId = requestAnimationFrame(tick)
    }

    loadPlotly().then(async (P) => {
      if (disposed) return
      await P.newPlot(
        div,
        [{ x: [], y: [], mode: 'lines', type: 'scatter' }],
        {
          title: { text: field },
          height: 260,
          margin: { t: 40, r: 20, b: 40, l: 60 },
          ...axesLayout(),
        },
        { responsive: true, displayModeBar: false },
      )
      if (disposed) {
        P.purge(div)
        return
      }
      plotly = P
      rafId = requestAnimationFrame(tick)
    })

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      if (plotly) plotly.purge(div)
    }
  }, [field, getMessagesSince])

  return <div ref={divRef} />
}

export default memo(LiveChart)
