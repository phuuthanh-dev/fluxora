"use client";

import { ChevronDown, Minus, Plus } from "lucide-react";
import { useId, useState, type CSSProperties } from "react";

const faqItems = [
  {
    question: "Can I start with a manual or mock run?",
    answer: "Yes. Build the graph, inspect deterministic mock data, then publish and explicitly confirm a live run only when the workflow is ready.",
  },
  {
    question: "Where do my connection secrets live?",
    answer: "Connections are encrypted server-side. Fluxora shows a safe summary after saving, never the original secret value.",
  },
  {
    question: "Is Fluxora only for teams?",
    answer: "No. The product starts with personal workspaces and a focused control plane, while preserving a workspace model that can grow with a team.",
  },
];

export function LandingUsageMeter() {
  const [runs, setRuns] = useState(240);
  const usage = Math.min(100, Math.round((runs / 1000) * 100));
  const style = { "--landing-usage": `${usage}%` } as CSSProperties;

  return (
    <section className="landing-usage" id="usage" aria-labelledby="usage-heading">
      <div className="landing-usage__intro">
        <p className="landing-kicker"><span /> USAGE, MADE VISIBLE</p>
        <h2 id="usage-heading">A clear view of the work your workflows carry.</h2>
        <p>This is an illustrative planning meter, not a public pricing promise. It exists to make workload and run history tangible before commercial plans are defined.</p>
      </div>
      <div className="landing-usage__panel">
        <div className="landing-usage__reading"><span>MONTHLY RUNS</span><strong>{runs.toLocaleString("en-US")}</strong><small>illustrative workspace volume</small></div>
        <label className="landing-usage__slider" htmlFor="landing-usage-runs">
          <span>Estimate recurring work</span>
          <input
            id="landing-usage-runs"
            type="range"
            min="50"
            max="1000"
            step="10"
            value={runs}
            onChange={(event) => setRuns(Number(event.target.value))}
            aria-valuetext={`${runs.toLocaleString("en-US")} illustrative monthly workflow runs`}
          />
        </label>
        <div className="landing-usage__track" style={style} aria-label={`${usage}% of the illustrative planning scale`}>
          <span />
        </div>
        <div className="landing-usage__facts">
          <span><i /> Draft and test safely</span>
          <span><i /> Publish intentional versions</span>
          <span><i /> Trace every finished run</span>
        </div>
      </div>
    </section>
  );
}

export function LandingFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const baseId = useId();

  return (
    <section className="landing-faq" id="faq" aria-labelledby="faq-heading">
      <div>
        <p className="landing-kicker"><span /> QUESTIONS, ANSWERED</p>
        <h2 id="faq-heading">Less mystery, before the first workflow.</h2>
      </div>
      <div className="landing-faq__items">
        {faqItems.map((item, index) => {
          const isOpen = openIndex === index;
          const contentId = `${baseId}-${index}`;
          return (
            <article className={`landing-faq__item${isOpen ? " is-open" : ""}`} key={item.question}>
              <h3>
                <button aria-controls={contentId} aria-expanded={isOpen} onClick={() => setOpenIndex(isOpen ? null : index)}>
                  <span>{item.question}</span>
                  {isOpen ? <Minus aria-hidden="true" size={18} /> : <Plus aria-hidden="true" size={18} />}
                </button>
              </h3>
              <div id={contentId} className="landing-faq__answer" hidden={!isOpen}>
                <p>{item.answer}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function LandingScrollCue() {
  return <span className="landing-scroll-cue" aria-hidden="true"><ChevronDown size={16} /> Scroll to inspect</span>;
}
