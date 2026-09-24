// Pure stream logic used by useWebSocket. No React, no DOM, no sockets, so it
// can be unit tested directly.

// Exponential backoff for reconnect attempts: 1s, 2s, 4s, capped at 8s, with
// jitter. The 8s cap is deliberately short so a reconnect can be watched
// end-to-end during development; revisit for flight ops.
export const BACKOFF_BASE_MS = 1000
export const BACKOFF_CAP_MS = 8000

/**
 * Reconnect delay for the given attempt (0-based), using "equal jitter": a
 * random value in [exp/2, exp], where exp is the capped exponential delay.
 * Never exceeds BACKOFF_CAP_MS.
 */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const exp = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt)
  return exp / 2 + random() * (exp / 2)
}

export interface GapState {
  lastSeq: number | null
  gaps: number
}

export const INITIAL_GAP_STATE: GapState = { lastSeq: null, gaps: 0 }

/**
 * Advance gap tracking by one received seq. Counts missing seq values. A seq
 * that goes backwards (or repeats) is treated as a server restart: the
 * baseline resets and no gap is counted.
 */
export function nextGapState(state: GapState, seq: number): GapState {
  const { lastSeq, gaps } = state
  if (lastSeq !== null && seq > lastSeq + 1) {
    return { lastSeq: seq, gaps: gaps + (seq - lastSeq - 1) }
  }
  return { lastSeq: seq, gaps }
}

export interface ReadResult<T> {
  messages: readonly T[]
  cursor: number
}

/**
 * Return the messages received after `cursor`.
 *
 * `total` is the monotonic count of messages ever received (not reset by
 * trimming), so history[i] has cursor position `total - history.length + i`.
 * If `cursor` is older than the oldest retained message, everything retained
 * is returned. A cursor ahead of `total` (stale, e.g. from before a remount)
 * is treated as a reset and also gets everything retained.
 */
export function readSince<T>(history: readonly T[], total: number, cursor: number): ReadResult<T> {
  const oldest = total - history.length
  const start = cursor > total ? oldest : Math.max(cursor, oldest)
  return { messages: history.slice(start - oldest), cursor: total }
}

export function wsUrl(loc: Pick<Location, 'protocol' | 'host'>): string {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`
}
