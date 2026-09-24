// Wire contract for telemetry messages from the ground-station WebSocket.
// This is the only TS file that names packet fields. Everything else iterates
// PACKET_FIELDS or goes through parseMessage.
//
// Mirrors ground_station_software/src/testing/mock_ws_server.py (envelope) and
// the Packet dataclass in ground_station_software/src/constants.py (data).
// Kept in sync by hand -- update both sides together.

export const PACKET_FIELDS = [
  'packet_id',
  'temp',
  'latitude',
  'longitude',
  'altitude',
  'utc_time',
  'velocity',
] as const

export type PacketField = (typeof PACKET_FIELDS)[number]

export type PacketData = Record<PacketField, number>

export interface TelemetryMessage {
  type: 'telemetry' // PROVISIONAL: pending backend contract
  seq: number // PROVISIONAL: pending backend contract
  t_ms: number // PROVISIONAL: pending backend contract
  data: PacketData
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Validate a raw WebSocket frame. Returns a typed message, or null for anything
 * malformed. Never throws -- callers count and drop nulls.
 */
export function parseMessage(raw: unknown): TelemetryMessage | null {
  if (typeof raw !== 'string') return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(parsed)) return null
  const { type, seq, t_ms, data } = parsed
  if (type !== 'telemetry') return null
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0) return null
  if (!isFiniteNumber(t_ms)) return null
  if (!isRecord(data)) return null

  const out = {} as PacketData
  for (const field of PACKET_FIELDS) {
    const value = data[field]
    if (!isFiniteNumber(value)) return null
    out[field] = value
  }

  return { type, seq, t_ms, data: out }
}
