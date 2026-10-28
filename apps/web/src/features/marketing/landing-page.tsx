import Link from "next/link";
import { ArrowRight, Check, CirclePlay, Clock3, GitBranch, LockKeyhole, MessageSquareText, Workflow } from "lucide-react";
import { FluxoraMark } from "../../components/brand/fluxora-mark";

const workflowSteps = [
  { icon: <Clock3 size={16} />, label: "Schedule", detail: "Every weekday · 08:00", tone: "lime" },
  { icon: <Workflow size={16} />, label: "Steam account", detail: "Read public account activity", tone: "steam" },
  { icon: <MessageSquareText size={16} />, label: "Team update", detail: "Deliver a focused report", tone: "blue" },
];

const principles = [
  {
    eyebrow: "BUILD VISUALLY",
    title: "Keep the logic visible.",
    description: "Compose triggers, conditions, approvals, and app actions on one graph. Each node explains what it receives and what it returns.",
    icon: <GitBranch size={19} />,
  },
  {
    eyebrow: "RUN WITH CONTEXT",
    title: "Know what happened.",
    description: "Every run keeps its pinned workflow version, redacted input and output, retries, timing, and failure path together.",
    icon: <CirclePlay size={19} />,
  },
  {
    eyebrow: "KEEP CONTROL",
    title: "Connect without guessing.",
    description: "Connections stay encrypted server-side. Test safely, publish deliberately, and confirm every live external effect.",
    icon: <LockKeyhole size={19} />,
  },
];

export function LandingPage() {
  return (
    <main className="landing-page">
      <div className="landing-grid" aria-hidden="true" />
      <header className="landing-nav">
        <Link className="landing-brand" href="#top" aria-label="Fluxora home">
          <span><FluxoraMark size={26} /></span>
          <strong>Fluxora</strong>
        </Link>
        <nav aria-label="Landing navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#control">Why Fluxora</a>
          <a href="#workflow">Example workflow</a>
        </nav>
        <Link className="landing-nav__sign-in" href="/login">Sign in <ArrowRight size={15} /></Link>
      </header>

      <section className="landing-hero" id="top" aria-labelledby="landing-heading">
        <div className="landing-hero__copy">
          <p className="landing-kicker"><span /> WORKFLOW AUTOMATION, MADE LEGIBLE</p>
          <h1 id="landing-heading">Build the work that <em>keeps moving.</em></h1>
          <p className="landing-hero__lead">Fluxora turns repeatable tasks into visual workflows you can inspect, test, and run with confidence.</p>
          <div className="landing-hero__actions">
            <Link className="landing-button landing-button--primary" href="/login">Start in Fluxora <ArrowRight size={17} /></Link>
            <a className="landing-button landing-button--quiet" href="#workflow">See a real flow <span aria-hidden="true">↓</span></a>
          </div>
          <div className="landing-hero__note"><Check size={15} /> Draft safely. Publish deliberately. Run live only when you are ready.</div>
        </div>

        <div className="landing-workflow-window" aria-label="A sample automated daily report workflow">
          <div className="landing-workflow-window__topbar">
            <span className="landing-workflow-window__pulse" />
            <span>steam-daily-report.fluxora</span>
            <small>LIVE PREVIEW</small>
          </div>
          <div className="landing-workflow-window__canvas">
            <span className="landing-stream" aria-hidden="true" />
            <div className="landing-workflow-window__run"><span /> Scheduled run succeeded <time>08:00:04</time></div>
            <div className="landing-workflow-window__nodes">
              {workflowSteps.map((step, index) => <div className={`landing-workflow-node landing-workflow-node--${step.tone}`} key={step.label}>
                <span className="landing-workflow-node__index">0{index + 1}</span>
                <span className="landing-workflow-node__icon">{step.icon}</span>
                <div><strong>{step.label}</strong><small>{step.detail}</small></div>
                {index < workflowSteps.length - 1 ? <i aria-hidden="true" /> : <Check className="landing-workflow-node__check" size={15} aria-label="Succeeded" />}
              </div>)}
            </div>
            <div className="landing-workflow-window__footer"><span>3 nodes</span><span>0 retries</span><span>5.3 s total</span></div>
          </div>
        </div>
      </section>

      <section className="landing-marquee" aria-label="Fluxora capabilities">
        <span>TRIGGERS</span><i /> <span>CONDITIONS</span><i /> <span>APP ACTIONS</span><i /> <span>APPROVALS</span><i /> <span>OBSERVABILITY</span><i /> <span>CONTROL</span>
      </section>

      <section className="landing-principles" id="how-it-works" aria-labelledby="principles-heading">
        <div className="landing-section-heading">
          <p className="landing-kicker"><span /> A CLEARER AUTOMATION LOOP</p>
          <h2 id="principles-heading">The automation should never become the mystery.</h2>
        </div>
        <div className="landing-principles__grid">
          {principles.map((principle, index) => <article className="landing-principle" key={principle.title}>
            <div className="landing-principle__top"><span>0{index + 1}</span><i>{principle.icon}</i></div>
            <p>{principle.eyebrow}</p>
            <h3>{principle.title}</h3>
            <span>{principle.description}</span>
          </article>)}
        </div>
      </section>

      <section className="landing-control" id="control" aria-labelledby="control-heading">
        <div className="landing-control__copy">
          <p className="landing-kicker"><span /> ONE CONTROL PLANE</p>
          <h2 id="control-heading">From first idea to an accountable run.</h2>
          <p>Fluxora separates the work you are designing from the version you publish. That gives you a safe place to experiment without losing track of what actually ran.</p>
          <ul>
            <li><Check size={16} /> Test with deterministic mock data before touching a provider.</li>
            <li><Check size={16} /> Confirm live side effects against a published workflow version.</li>
            <li><Check size={16} /> Trace every node through an execution timeline.</li>
          </ul>
        </div>
        <div className="landing-control__panel" aria-label="Workflow lifecycle">
          <p>WORKFLOW LIFECYCLE</p>
          <ol>
            <li><span>01</span><div><strong>Design draft</strong><small>Configure nodes and connections.</small></div><em>Editable</em></li>
            <li><span>02</span><div><strong>Test run</strong><small>Validate logic with mock data.</small></div><em>Safe</em></li>
            <li><span>03</span><div><strong>Publish version</strong><small>Freeze an intentional graph.</small></div><em>Immutable</em></li>
            <li><span>04</span><div><strong>Run live</strong><small>Confirm the real-world effect.</small></div><em>Guarded</em></li>
          </ol>
        </div>
      </section>

      <section className="landing-example" id="workflow" aria-labelledby="example-heading">
        <div className="landing-example__label"><span>EXAMPLE / 01</span><span>PERSONAL AUTOMATION</span></div>
        <div className="landing-example__content">
          <h2 id="example-heading">A daily report that does not need chasing.</h2>
          <p>Schedule a Steam account snapshot, shape the result with conditions, then deliver the useful part to Google Chat, Discord, Telegram, or email.</p>
          <Link className="landing-text-link" href="/login">Build this workflow <ArrowRight size={16} /></Link>
        </div>
        <div className="landing-example__meter" aria-label="Example workflow success rate">
          <div><span>LAST 30 DAYS</span><strong>98.7%</strong><small>successful runs</small></div>
          <div className="landing-example__bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
        </div>
      </section>

      <section className="landing-cta" aria-labelledby="cta-heading">
        <span className="landing-cta__orb" aria-hidden="true" />
        <p className="landing-kicker"><span /> YOUR NEXT REPEATABLE TASK</p>
        <h2 id="cta-heading">Make it visible. Make it dependable.</h2>
        <p>Open your workspace and turn a recurring task into a workflow you can trust.</p>
        <Link className="landing-button landing-button--primary" href="/login">Open Fluxora <ArrowRight size={17} /></Link>
      </section>

      <footer className="landing-footer">
        <div className="landing-brand"><span><FluxoraMark size={23} /></span><strong>Fluxora</strong></div>
        <p>Workflow automation for work that deserves a clear trail.</p>
        <Link href="/login">Sign in</Link>
      </footer>
    </main>
  );
}
