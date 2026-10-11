import { Icon, SectionHeading, StatusBadge } from './Primitives.jsx'

export default function Evaluation({ evaluation }) {
  return <div className="page-stack">
    <SectionHeading eyebrow="OFFLINE QUALITY / FIXTURE EVALUATION" title="Evaluation" description="Fixture metrics are produced by a local command and are not served by the current API." action={<StatusBadge tone="neutral">NOT LIVE DATA</StatusBadge>}/>
    {evaluation?.available === true ? <section className="surface-card evaluation-card"><div className="card-heading"><div><p className="eyebrow">FIXTURE RESULTS</p><h2>Evaluation data available</h2></div><StatusBadge tone="green">From backend response</StatusBadge></div><p>The observability service reports an evaluation result. No live traffic interpretation is inferred.</p><pre>{JSON.stringify(evaluation, null, 2)}</pre></section> : <section className="surface-card evaluation-unavailable"><span className="evaluation-icon"><Icon name="chart" size={23}/></span><p className="eyebrow">SOURCE NOT EXPOSED TO UI</p><h2>Evaluation results unavailable here</h2><p>The backend does not expose fixture reports through an API endpoint. This panel will not substitute historical metrics or fabricate a run.</p><div className="command-card"><span>Run locally from the project directory</span><code>npm run evaluate</code></div><div className="evaluation-note"><Icon name="info" size={15}/><span>The command uses synthetic adversarial fixtures. Its results describe that fixture set, not real-world detection accuracy.</span></div></section>}
  </div>
}
