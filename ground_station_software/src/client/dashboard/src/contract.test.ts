import { describe, expect, it } from 'vitest'
import { PACKET_FIELDS, parseMessage } from './contract'

function validEnvelope(): Record<string, unknown> {
  return {
    type: 'telemetry',
    seq: 7,
    t_ms: 700,
    data: Object.fromEntries(PACKET_FIELDS.map((field, i) => [field, i + 0.5])),
  }
}

const encode = (value: unknown) => JSON.stringify(value)

describe('parseMessage', () => {
  it('accepts a valid message and strips unknown keys', () => {
    const env = validEnvelope()
    env.extra = 'ignored'
    ;(env.data as Record<string, unknown>).unknown_field = 1

    const msg = parseMessage(encode(env))

    expect(msg).not.toBeNull()
    expect(msg).toEqual({
      type: 'telemetry',
      seq: 7,
      t_ms: 700,
      data: Object.fromEntries(PACKET_FIELDS.map((field, i) => [field, i + 0.5])),
    })
  })

  it('rejects a message missing a data field', () => {
    const env = validEnvelope()
    delete (env.data as Record<string, unknown>)[PACKET_FIELDS[0]]
    expect(parseMessage(encode(env))).toBeNull()
  })

  it('rejects a message missing an envelope field', () => {
    const env = validEnvelope()
    delete env.seq
    expect(parseMessage(encode(env))).toBeNull()
  })

  it('rejects wrong types', () => {
    const badData = validEnvelope()
    ;(badData.data as Record<string, unknown>)[PACKET_FIELDS[0]] = '1.0'
    expect(parseMessage(encode(badData))).toBeNull()

    expect(parseMessage(encode({ ...validEnvelope(), seq: '7' }))).toBeNull()
    expect(parseMessage(encode({ ...validEnvelope(), seq: 7.5 }))).toBeNull()
    expect(parseMessage(encode({ ...validEnvelope(), type: 'status' }))).toBeNull()
    expect(parseMessage(encode({ ...validEnvelope(), data: [] }))).toBeNull()
  })

  it('rejects non-JSON and non-object input without throwing', () => {
    expect(parseMessage('not json')).toBeNull()
    expect(parseMessage('{"type":')).toBeNull()
    expect(parseMessage('42')).toBeNull()
    expect(parseMessage('null')).toBeNull()
    expect(parseMessage('[]')).toBeNull()
    expect(parseMessage(new ArrayBuffer(4))).toBeNull()
    expect(parseMessage(undefined)).toBeNull()
  })
})
