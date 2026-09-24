import ReservedPanel from './components/ReservedPanel'
import { PACKET_FIELDS } from './contract'
import { useWebSocket } from './hooks/useWebSocket'

function App() {
  const stream = useWebSocket()
  const { status, latest, received, gaps, invalid, rate } = stream

  return (
    <main>
      <h1>Telemetry</h1>

      <ReservedPanel stream={stream} />

      <details>
        <summary>Debug</summary>

        <dl>
          <dt>Status</dt>
          <dd>{status}</dd>
          <dt>Last seq</dt>
          <dd>{latest?.seq ?? '--'}</dd>
          <dt>Received</dt>
          <dd>{received}</dd>
          <dt>Seq gaps</dt>
          <dd>{gaps}</dd>
          <dt>Invalid</dt>
          <dd>{invalid}</dd>
          <dt>Rate</dt>
          <dd>{rate.toFixed(1)} msgs/s</dd>
        </dl>

        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Latest value</th>
            </tr>
          </thead>
          <tbody>
            {PACKET_FIELDS.map((field) => (
              <tr key={field}>
                <td>{field}</td>
                <td>{latest ? latest.data[field] : '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </main>
  )
}

export default App
