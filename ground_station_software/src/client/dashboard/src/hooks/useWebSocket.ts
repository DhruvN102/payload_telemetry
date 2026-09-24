import { useCallback, useEffect, useRef, useState } from 'react'
import { parseMessage, type TelemetryMessage } from '../contract'
import {
  backoffDelay,
  INITIAL_GAP_STATE,
  nextGapState,
  readSince,
  wsUrl,
  type GapState,
  type ReadResult,
} from './streamLogic'

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting'

// Valid messages retained for getMessagesSince; oldest dropped beyond this.
const HISTORY_LIMIT = 2000

interface Snapshot {
  latest: TelemetryMessage | null
  received: number
  invalid: number
  gaps: number
}

const EMPTY_SNAPSHOT: Snapshot = { latest: null, received: 0, invalid: 0, gaps: 0 }

export interface WebSocketStream extends Snapshot {
  status: ConnectionStatus
  getMessagesSince: (cursor: number) => ReadResult<TelemetryMessage>
}

export function useWebSocket(): WebSocketStream {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT)

  const wsRef = useRef<WebSocket | null>(null)

  // Incoming messages land in refs, not React state, so a fast stream doesn't
  // re-render per message. A requestAnimationFrame loop publishes a snapshot
  // at most once per frame, and only when something changed.
  const historyRef = useRef<TelemetryMessage[]>([])
  const receivedRef = useRef(0) // monotonic; also the getMessagesSince cursor
  const invalidRef = useRef(0)
  const gapRef = useRef<GapState>(INITIAL_GAP_STATE)
  const attemptRef = useRef(0)
  const dirtyRef = useRef(false)

  useEffect(() => {
    // Effect-local so a StrictMode double mount can't leak handlers from the
    // first (already cleaned up) socket into the second mount's state.
    let disposed = false
    let reconnectTimer: number | undefined
    let rafId = 0

    historyRef.current = []
    receivedRef.current = 0
    invalidRef.current = 0
    gapRef.current = INITIAL_GAP_STATE
    attemptRef.current = 0
    dirtyRef.current = true

    function connect() {
      const ws = new WebSocket(wsUrl(window.location))
      wsRef.current = ws

      ws.onopen = () => {
        attemptRef.current = 0
        // New connection, new seq baseline: seqs missed while our socket was
        // down are not downlink gaps.
        gapRef.current = { ...gapRef.current, lastSeq: null }
        setStatus('open')
      }

      ws.onmessage = (event: MessageEvent) => {
        const msg = parseMessage(event.data)
        if (msg === null) {
          invalidRef.current += 1
        } else {
          const history = historyRef.current
          history.push(msg)
          if (history.length > HISTORY_LIMIT) {
            history.splice(0, history.length - HISTORY_LIMIT)
          }
          receivedRef.current += 1
          gapRef.current = nextGapState(gapRef.current, msg.seq)
        }
        dirtyRef.current = true
      }

      ws.onerror = () => {
        ws.close()
      }

      ws.onclose = () => {
        if (disposed) return
        setStatus('reconnecting')
        const delay = backoffDelay(attemptRef.current)
        attemptRef.current += 1
        reconnectTimer = window.setTimeout(connect, delay)
      }
    }

    function flush() {
      if (dirtyRef.current) {
        dirtyRef.current = false
        setSnapshot({
          latest: historyRef.current.at(-1) ?? null,
          received: receivedRef.current,
          invalid: invalidRef.current,
          gaps: gapRef.current.gaps,
        })
      }
      rafId = requestAnimationFrame(flush)
    }

    connect()
    rafId = requestAnimationFrame(flush)

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      window.clearTimeout(reconnectTimer)
      const ws = wsRef.current
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        ws.close()
        wsRef.current = null
      }
    }
  }, [])

  const getMessagesSince = useCallback(
    (cursor: number) => readSince(historyRef.current, receivedRef.current, cursor),
    [],
  )

  return { status, ...snapshot, getMessagesSince }
}
