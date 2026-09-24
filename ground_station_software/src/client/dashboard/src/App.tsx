import { PACKET_FIELDS } from './contract'
import { useWebSocket } from './hooks/useWebSocket'

function App() {
  const { status, latest, received, gaps, invalid } = useWebSocket()

  return (
    <main>
      <h1>Telemetry debug</h1>

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
    </main>
  )
}

export default App
