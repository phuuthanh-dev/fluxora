import Link from "next/link";
import { LandingFooter } from "./landing-footer";
import {
  ArrowDown,
  ArrowRight,
  Check,
  GitBranch,
  LockKeyhole,
  ScanLine,
  Sparkles,
} from "lucide-react";
import { FluxoraMark } from "../../components/brand/fluxora-mark";
import { LandingDemo } from "./landing-demo";
import { LandingHandoff } from "./landing-handoff";
import { LandingIntegrations } from "./landing-integrations";
import { LandingFaq, LandingNavigation } from "./landing-interactions";
import { LandingRunMeter } from "./landing-run-meter";
import { LandingMotionProvider, LandingReveal } from "./landing-motion";
import { LandingLightStream } from "./landing-scenes";
import { LandingDailyView, LandingUseCases } from "./landing-sections";
import { LandingShowcase } from "./landing-showcase";
import "./landing.css";
import "./landing-template.css";

const chapters = [
  {
    title: "Follow every step.",
    text: "See the input, the action, and the output in one clear execution trace.",
    tag: "01 / TRACE",
    icon: <Sparkles size={20} />,
  },
  {
    title: "Make the hand-off clear.",
    text: "Connect your apps. Add a condition. Bring a person in when a decision needs one.",
    tag: "02 / ORCHESTRATE",
    icon: <GitBranch size={20} />,
  },
  {
    title: "See the work as it happens.",
    text: "Follow each execution and find the details when a workflow needs your attention.",
    tag: "03 / ACTIVITY",
    icon: <ScanLine size={20} />,
  },
];

export function LandingPage() {
  return (
    <LandingMotionProvider>
      <main className="landing-page" id="top">
        <div className="landing-backdrop" aria-hidden="true" />
        <LandingLightStream />
        <a className="landing-skip" href="#product">
          Skip to product
        </a>
        <LandingNavigation />
        <section
          className="landing-hero landing-container"
          aria-labelledby="landing-heading"
        >
          <div className="landing-hero__copy">
            <p className="landing-eyebrow">
              <span className="landing-status-dot" /> LESS REPETITION. MORE
              MOMENTUM.
            </p>
            <h1 id="landing-heading">
              Good work.
              <br />
              On <em>autopilot.</em>
            </h1>
            <p className="landing-hero__lead">
              Connect the apps you use. Give the busywork a clear path. Stay in
              control of every hand-off.
            </p>
            <div className="landing-actions">
              <Link
                className="landing-button landing-button--primary"
                href="/login"
              >
                Start in Fluxora <ArrowRight size={17} />
              </Link>
              <a
                className="landing-button landing-button--quiet"
                href="#product"
              >
                Explore the product <ArrowDown size={15} />
              </a>
            </div>
            <p className="landing-hero__note">
              <Check size={14} /> Your workflows. Your infrastructure. Your
              call.
            </p>
          </div>
          <div className="landing-hero__stage">
            <LandingDemo />
          </div>
          <div className="landing-hero__caption">
            <span>BUILT FOR THE WORK BETWEEN YOUR APPS</span>
            <a href="#integrations" aria-label="Explore integrations">
              <ArrowDown size={17} />
            </a>
            <span>VISUAL BY DESIGN. OPEN BY NATURE.</span>
          </div>
        </section>
        <LandingIntegrations />
        <div className="landing-frosted-slab">
          <section
            className="landing-narrative landing-container"
            id="product"
            aria-labelledby="narrative-heading"
          >
            <LandingReveal className="landing-narrative__lead">
              <p className="landing-eyebrow">
                A LITTLE STRUCTURE. A LOT OF FLOW.
              </p>
              <h2 id="narrative-heading">
                From “I do this{" "}
                <br />
                every day” to
                <br />
                <em>already done.</em>
              </h2>
              <div className="landing-narrative__aside">
                <p>Turn a recurring task into a clear sequence you can inspect, adjust, and run again.</p>
                <p>Choose a trigger, connect your apps, and follow each result in the execution history.</p>
              </div>
              <a className="landing-text-link" href="/login">
                Build your first workflow <ArrowRight size={17} />
              </a>
              <div className="landing-signal-mark" aria-hidden="true">
                <span />
                <span />
                <FluxoraMark size={60} />
                <span />
              </div>
            </LandingReveal>
            <div className="landing-narrative__chapters" id="narrative">
              {chapters.map((chapter) => (
                <LandingReveal
                  as="article"
                  className="landing-chapter"
                  key={chapter.tag}
                >
                  <div className="landing-chapter__copy">
                    <div className="landing-chapter__top">
                      <span>{chapter.tag}</span>
                      {chapter.icon}
                    </div>
                    <h3>{chapter.title}</h3>
                    <p>{chapter.text}</p>
                  </div>
                  <div className="landing-chapter__visual">
                  {chapter.tag.startsWith("01") ? (
                    <div className="landing-chapter__trace" aria-label="Illustrative execution trace">
                      <p><span className="landing-chapter__trace-title">EXAMPLE RUN · COMPLETED</span></p>
                      {[
                        { label: "Input", width: "76%", time: "120 ms" },
                        { label: "Action", width: "54%", time: "8 ms" },
                        { label: "Condition", width: "32%", time: "1 ms" },
                        { label: "Output", width: "44%", time: "Ready" },
                      ].map((item) => (
                        <div className="landing-chapter__trace-row" key={item.label}>
                          <span><Check size={13} /> {item.label}</span>
                          <i aria-hidden="true"><b style={{ width: item.width }} /></i>
                          <small>{item.time.endsWith(" ms") ? <><span data-trace-count={parseInt(item.time, 10)}>{parseInt(item.time, 10)}</span> ms</> : item.time}</small>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {chapter.tag.startsWith("02") ? (
                    <div className="landing-chapter__example">
                    <p>EXAMPLE · ROUTE A DECISION</p>
                    <div className="landing-chapter__route" aria-hidden="true">
                      <span>IF</span>
                      <i />
                      <span className="is-accent">YES → Continue</span>
                      <span>NO → Review</span>
                    </div>
                    <div className="landing-chapter__approval" aria-label="Illustrative approval request">
                      <div className="landing-chapter__typing" aria-hidden="true"><span /><span /><span /></div>
                      <div className="landing-chapter__approval-head"><span>F</span><strong>Fluxora</strong><small>APPROVAL REQUEST · SAMPLE</small></div>
                      <p>Ready to send this update? Review the details before the workflow continues.</p>
                      <dl className="landing-chapter__approval-details">
                        <div><dt>workflow</dt><dd>Steam daily report</dd></div>
                        <div><dt>destination</dt><dd>Google Chat</dd></div>
                        <div><dt>decision</dt><dd>Review before sending</dd></div>
                      </dl>
                      <div aria-hidden="true"><span>Approve</span><span>Hold</span><small>Waiting for review</small></div>
                    </div>
                    </div>
                  ) : null}
                  {chapter.tag.startsWith("03") ? (
                    <div className="landing-volume__chart" aria-label="Illustrative runs by day">
                      <p className="landing-volume__caption">SAMPLE ACTIVITY · RUNS BY DAY</p>
                      <div className="landing-volume__bars" aria-hidden="true">
                        {[42, 50, 59, 68, 77, 86].map((height, index) => (
                          <div className="landing-volume__column" key={index}>
                            <span className="landing-volume__bar" style={{ height: `${height}%` }}>
                              <img className="landing-volume__cube" src={`/relay/product/product-cube-${index + 1}.svg`} alt="" loading="lazy" />
                              {index === 5 ? <img className="landing-volume__glow" src="/relay/product/product-cap-glow.svg" alt="" loading="lazy" /> : null}
                              <img className="landing-volume__cap" src={`/relay/product/product-cap-${index + 1}.svg`} alt="" loading="lazy" />
                            </span>
                            <small>{["MON", "TUE", "WED", "THU", "FRI", "SAT"][index]}</small>
                          </div>
                        ))}
                      </div>
                      <p className="landing-volume__note">Illustrative data, not live usage.</p>
                    </div>
                  ) : null}
                  </div>
                  <span className="landing-chapter__rule" aria-hidden="true" />
                </LandingReveal>
              ))}
            </div>
          </section>
          <LandingHandoff />
          <LandingDailyView />
          <section
            className="landing-product landing-container"
            id="workspace-preview"
            aria-labelledby="product-heading"
          >
            <LandingReveal className="landing-section-intro">
              <p className="landing-eyebrow">THE BIG PICTURE</p>
              <h2 id="product-heading">
                Less tab switching.
                <br />
                <span>More things clicking.</span>
              </h2>
              <p>
                One place to build the workflow, understand the run,
                <br className="landing-desktop-break" /> and keep the next step
                moving.
              </p>
            </LandingReveal>
            <LandingReveal>
              <LandingShowcase />
            </LandingReveal>
            <div className="landing-product__footnotes">
              <span>
                <GitBranch size={15} /> Visual, connected logic
              </span>
              <span>
                <ScanLine size={15} /> Inspectable input & output
              </span>
              <span>
                <LockKeyhole size={15} /> Encrypted connections
              </span>
            </div>
          </section>
          <LandingUseCases />
          <section
            className="landing-safety landing-container"
            aria-labelledby="safety-heading"
          >
            <LandingReveal className="landing-safety__copy">
              <p className="landing-eyebrow">CONFIDENCE IS BUILT IN</p>
              <h2 id="safety-heading">
                Test the idea.
                <br />
                <span>Then trust the process.</span>
              </h2>
              <p>
                A place to experiment. A clear moment to publish. A record of
                what actually ran.
              </p>
            </LandingReveal>
            <LandingReveal
              className="landing-safety__steps"
              ariaLabel="Workflow lifecycle"
            >
              {[
                [
                  "01",
                  "Build & test",
                  "Try your logic with sample data.",
                  "DRAFT",
                ],
                [
                  "02",
                  "Publish a version",
                  "Keep the running version intact.",
                  "PINNED",
                ],
                [
                  "03",
                  "Go live, deliberately",
                  "Confirm before making real changes.",
                  "LIVE",
                ],
              ].map(([number, title, copy, tag]) => (
                <div key={number}>
                  <span>{number}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </div>
                  <small>{tag}</small>
                </div>
              ))}
            </LandingReveal>
          </section>
        </div>
        <LandingRunMeter />
        <LandingFaq />
        <LandingFooter />
      </main>
    </LandingMotionProvider>
  );
}
