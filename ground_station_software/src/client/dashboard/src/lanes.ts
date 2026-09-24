import type { PacketField } from './contract'

// Lane contents provisional [confirm with team]
// Typed as PacketField so a field rename in contract.ts is a compile error here.

export const RESERVED_CHART_FIELDS: PacketField[] = ['altitude', 'velocity']

export const RESERVED_READOUT_FIELDS: PacketField[] = ['latitude', 'longitude']
