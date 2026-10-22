const capabilities = [
  "Visual editor with versioned workflows",
  "Reliable background execution",
  "Steam → Google Chat daily reports",
];

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">OPEN-SOURCE WORKFLOW AUTOMATION</p>
        <h1>Build dependable automations, visually.</h1>
        <p className="lede">
          A self-host-ready platform for connecting triggers, conditions, approvals, and real-world actions.
        </p>
        <div className="actions">
          <button type="button">Create workflow</button>
          <button className="secondary" type="button">View executions</button>
        </div>
      </section>
      <section className="canvas-preview" aria-label="Example workflow">
        <div className="node trigger">Cron · Daily at 08:00</div>
        <span className="connector" aria-hidden="true">→</span>
        <div className="node action">Steam · Account snapshot</div>
        <span className="connector" aria-hidden="true">→</span>
        <div className="node action">Google Chat · Daily report</div>
      </section>
      <section className="capabilities">
        {capabilities.map((capability) => <p key={capability}>✓ {capability}</p>)}
      </section>
    </main>
  );
}
