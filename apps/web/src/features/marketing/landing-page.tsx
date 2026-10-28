import Link from "next/link";
import { ArrowRight, Check, CircleCheck, CirclePlay, Clock3, Database, GitBranch, Layers3, LockKeyhole, MessageSquareText, ShieldCheck, Workflow } from "lucide-react";
import { FluxoraMark } from "../../components/brand/fluxora-mark";
import { LandingFaq, LandingScrollCue, LandingUsageMeter } from "./landing-interactions";
import { LandingMotionProvider, LandingReveal } from "./landing-motion";
import { LandingHeroVisual, LandingLifecycleVisual } from "./landing-scenes";

const workflowSteps = [
  { icon: <Clock3 size={16} />, label: "Schedule", detail: "Every weekday · 08:00", tone: "lime" },
  { icon: <Workflow size={16} />, label: "Steam account", detail: "Read public account activity", tone: "steam" },
  { icon: <MessageSquareText size={16} />, label: "Team update", detail: "Deliver a focused report", tone: "blue" },
];

const principles = [
  { eyebrow: "BUILD VISUALLY", title: "Keep the logic visible.", description: "Compose triggers, conditions, approvals, and app actions on one graph.", icon: <GitBranch size={19} /> },
  { eyebrow: "RUN WITH CONTEXT", title: "Know what happened.", description: "Keep version, redacted I/O, retries, timing, and failure paths together.", icon: <CirclePlay size={19} /> },
  { eyebrow: "KEEP CONTROL", title: "Connect without guessing.", description: "Encrypt connections, test safely, and confirm every live effect.", icon: <LockKeyhole size={19} /> },
];

const productSignals = [
  { label: "Draft changed", meta: "steam-daily-report", time: "09:14", icon: <Layers3 size={15} /> },
  { label: "Version 14 published", meta: "3 nodes · 2 connections", time: "09:18", icon: <ShieldCheck size={15} /> },
  { label: "Run completed", meta: "5.3 s · no retries", time: "09:20", icon: <CircleCheck size={15} /> },
];

const chapters = [
  { number: "01", title: "Start with a signal.", copy: "A schedule, webhook, or manual test begins the path with deliberate context.", tag: "TRIGGER" },
  { number: "02", title: "Keep decisions inspectable.", copy: "Conditions, approvals, and transformation nodes stay in the graph rather than in somebody’s memory.", tag: "CONTROL" },
  { number: "03", title: "Leave a useful trail.", copy: "Every finished execution points back to its immutable version and redacted node results.", tag: "EVIDENCE" },
];

export function LandingPage() {
  return (
    <LandingMotionProvider>
      <main className="landing-page landing-page--v2">
        <div className="landing-grid" aria-hidden="true" />
        <header className="landing-nav landing-nav--v2">
          <Link className="landing-brand" href="#top" aria-label="Fluxora home"><span><FluxoraMark size={26} /></span><strong>Fluxora</strong></Link>
          <nav aria-label="Landing navigation"><a href="#product">Product</a><a href="#narrative">How it works</a><a href="#usage">Usage</a><a href="#faq">FAQ</a></nav>
          <div className="landing-nav__actions"><span className="landing-nav__status"><i /> Systems legible</span><Link className="landing-nav__sign-in" href="/login">Sign in <ArrowRight size={15} /></Link></div>
        </header>

        <section className="landing-hero landing-hero--v2" id="top" aria-labelledby="landing-heading">
          <LandingReveal className="landing-hero__copy">
            <p className="landing-kicker"><span /> WORKFLOW AUTOMATION, MADE LEGIBLE</p>
            <h1 id="landing-heading">Build the work that <em>keeps moving.</em></h1>
            <p className="landing-hero__lead">Fluxora turns repeatable tasks into visual workflows you can inspect, test, and run with confidence.</p>
            <div className="landing-hero__actions"><Link className="landing-button landing-button--primary landing-button--magnetic" href="/login">Start in Fluxora <ArrowRight size={17} /></Link><a className="landing-button landing-button--quiet" href="#product">See product proof <ArrowRight size={16} /></a></div>
            <div className="landing-hero__note"><Check size={15} /> Draft safely. Publish deliberately. Run live only when you are ready.</div>
            <LandingScrollCue />
          </LandingReveal>

          <LandingReveal className="landing-workflow-window" delay={0.12} ariaLabel="A sample automated daily report workflow">
            <div className="landing-workflow-window__topbar"><span className="landing-workflow-window__pulse" /><span>steam-daily-report.fluxora</span><small>LIVE PREVIEW</small></div>
            <div className="landing-workflow-window__canvas">
              <span className="landing-stream" aria-hidden="true" /><LandingHeroVisual />
              <div className="landing-workflow-window__run"><span /> Scheduled run succeeded <time>08:00:04</time></div>
              <div className="landing-workflow-window__nodes">{workflowSteps.map((step, index) => <div className={`landing-workflow-node landing-workflow-node--${step.tone}`} key={step.label}><span className="landing-workflow-node__index">0{index + 1}</span><span className="landing-workflow-node__icon">{step.icon}</span><div><strong>{step.label}</strong><small>{step.detail}</small></div>{index < workflowSteps.length - 1 ? <i aria-hidden="true" /> : <Check className="landing-workflow-node__check" size={15} aria-label="Succeeded" />}</div>)}</div>
              <div className="landing-workflow-window__footer"><span>3 nodes</span><span>0 retries</span><span>5.3 s total</span></div>
            </div>
          </LandingReveal>
        </section>

        <section className="landing-marquee" aria-label="Fluxora capabilities"><span>TRIGGERS</span><i /> <span>CONDITIONS</span><i /> <span>APP ACTIONS</span><i /> <span>APPROVALS</span><i /> <span>OBSERVABILITY</span><i /> <span>CONTROL</span></section>

        <section className="landing-proof" id="product" aria-labelledby="proof-heading">
          <LandingReveal className="landing-proof__intro"><p className="landing-kicker"><span /> PRODUCT PROOF, NOT PROMISES</p><h2 id="proof-heading">One workspace for the intent, the version, and the outcome.</h2><p>Fluxora is designed around the questions operators actually ask: what changed, which version ran, and what happened at each node?</p></LandingReveal>
          <LandingReveal className="landing-proof__console" delay={0.08} ariaLabel="Example Fluxora execution console">
            <div className="landing-proof__console-top"><span><i /> LIVE WORKFLOW</span><span>Execution #841</span></div>
            <div className="landing-proof__console-body"><div className="landing-proof__graph" aria-hidden="true"><span>Schedule</span><i /><span>Steam</span><i /><span>Google Chat</span></div><ol className="landing-proof__feed">{productSignals.map((signal) => <li key={signal.label}><i>{signal.icon}</i><div><strong>{signal.label}</strong><small>{signal.meta}</small></div><time>{signal.time}</time></li>)}</ol></div>
            <div className="landing-proof__console-footer"><span><Database size={14} /> Pinned to version 14</span><span>All inputs redacted where required</span></div>
          </LandingReveal>
        </section>

        <section className="landing-principles" aria-labelledby="principles-heading">
          <LandingReveal className="landing-section-heading"><p className="landing-kicker"><span /> A CLEARER AUTOMATION LOOP</p><h2 id="principles-heading">The automation should never become the mystery.</h2></LandingReveal>
          <div className="landing-principles__grid">{principles.map((principle, index) => <LandingReveal as="article" className="landing-principle" delay={index * 0.07} key={principle.title}><div className="landing-principle__top"><span>0{index + 1}</span><i>{principle.icon}</i></div><p>{principle.eyebrow}</p><h3>{principle.title}</h3><span>{principle.description}</span></LandingReveal>)}</div>
        </section>

        <section className="landing-narrative" id="narrative" aria-labelledby="narrative-heading">
          <LandingReveal className="landing-narrative__lead"><p className="landing-kicker"><span /> A DELIBERATE PATH</p><h2 id="narrative-heading">Make every hand-off explain itself.</h2><p>Workflow automation is useful when it reduces checking work—not when it creates another opaque system to babysit.</p></LandingReveal>
          <div className="landing-narrative__chapters">{chapters.map((chapter, index) => <LandingReveal as="article" className="landing-narrative__chapter" delay={index * 0.08} key={chapter.number}><span className="landing-narrative__number">{chapter.number}</span><span className="landing-narrative__tag">{chapter.tag}</span><h3>{chapter.title}</h3><p>{chapter.copy}</p></LandingReveal>)}</div>
        </section>

        <section className="landing-control" aria-labelledby="control-heading">
          <LandingReveal className="landing-control__copy"><p className="landing-kicker"><span /> ONE CONTROL PLANE</p><h2 id="control-heading">From first idea to an accountable run.</h2><p>Fluxora separates the work you are designing from the version you publish. That gives you a safe place to experiment without losing track of what actually ran.</p><ul><li><Check size={16} /> Test with deterministic mock data before touching a provider.</li><li><Check size={16} /> Confirm live side effects against a published workflow version.</li><li><Check size={16} /> Trace every node through an execution timeline.</li></ul></LandingReveal>
          <LandingReveal className="landing-control__panel" delay={0.1} ariaLabel="Workflow lifecycle"><LandingLifecycleVisual /><p>WORKFLOW LIFECYCLE</p><ol><li><span>01</span><div><strong>Design draft</strong><small>Configure nodes and connections.</small></div><em>Editable</em></li><li><span>02</span><div><strong>Test run</strong><small>Validate logic with mock data.</small></div><em>Safe</em></li><li><span>03</span><div><strong>Publish version</strong><small>Freeze an intentional graph.</small></div><em>Immutable</em></li><li><span>04</span><div><strong>Run live</strong><small>Confirm the real-world effect.</small></div><em>Guarded</em></li></ol></LandingReveal>
        </section>

        <LandingUsageMeter />

        <section className="landing-example" aria-labelledby="example-heading">
          <LandingReveal className="landing-example__label"><span>EXAMPLE / 01</span><span>PERSONAL AUTOMATION</span></LandingReveal>
          <LandingReveal className="landing-example__content" delay={0.07}><h2 id="example-heading">A daily report that does not need chasing.</h2><p>Schedule a Steam account snapshot, shape the result with conditions, then deliver the useful part to Google Chat, Discord, Telegram, or email.</p><Link className="landing-text-link" href="/login">Build this workflow <ArrowRight size={16} /></Link></LandingReveal>
          <LandingReveal className="landing-example__meter" delay={0.14} ariaLabel="Example workflow success rate"><div><span>LAST 30 DAYS</span><strong>98.7%</strong><small>successful runs</small></div><div className="landing-example__bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></LandingReveal>
        </section>

        <LandingFaq />

        <section className="landing-cta" aria-labelledby="cta-heading"><span className="landing-cta__orb" aria-hidden="true" /><p className="landing-kicker"><span /> YOUR NEXT REPEATABLE TASK</p><h2 id="cta-heading">Make it visible. Make it dependable.</h2><p>Open your workspace and turn a recurring task into a workflow you can trust.</p><Link className="landing-button landing-button--primary landing-button--magnetic" href="/login">Open Fluxora <ArrowRight size={17} /></Link></section>

        <footer className="landing-footer landing-footer--v2"><div className="landing-brand"><span><FluxoraMark size={23} /></span><strong>Fluxora</strong></div><p>Workflow automation for work that deserves a clear trail.</p><div><a href="#product">Product</a><a href="#faq">FAQ</a><Link href="/login">Sign in</Link></div></footer>
      </main>
    </LandingMotionProvider>
  );
}
