import type { WebSocketStream } from '../hooks/useWebSocket'
import { lossPercent } from '../hooks/streamLogic'
import { RESERVED_CHART_FIELDS, RESERVED_READOUT_FIELDS } from '../lanes'
import LiveChart from './LiveChart'

interface ReservedPanelProps {
  stream: WebSocketStream
}

function ReservedPanel({ stream }: ReservedPanelProps) {
  const { status, latest, received, gaps, rate, getMessagesSince } = stream

  return (
    <section>
      <h2>Reserved</h2>

      {RESERVED_CHART_FIELDS.map((field) => (
        <LiveChart key={field} field={field} getMessagesSince={getMessagesSince} />
      ))}

      <dl>
        {RESERVED_READOUT_FIELDS.map((field) => (
          <div key={field}>
            <dt>{field}</dt>
            <dd>{latest ? latest.data[field].toFixed(6) : '--'}</dd>
          </div>
        ))}
        <dt>Status</dt>
        <dd>{status}</dd>
        <dt>Rate</dt>
        <dd>{rate.toFixed(1)} msgs/s</dd>
        <dt>Packet loss</dt>
        <dd>{lossPercent(received, gaps).toFixed(1)} %</dd>
      </dl>
    </section>
  )
}

export default ReservedPanel
