"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  Clock3,
  Database,
  GitBranch,
  LockKeyhole,
  Server,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { FluxoraMark } from "../../components/brand/fluxora-mark";
import { NodeIcon, type NodeIconName } from "../workflow/node-icon";
import { LandingReveal } from "./landing-motion";

const hubApps: NodeIconName[] = [
  "google",
  "github",
  "steam",
  "telegram",
  "google-drive",
  "discord",
];
export function LandingReliability() {
  return (
    <section
      className="landing-reliability landing-container"
      aria-labelledby="reliability-heading"
    >
      <div className="landing-split-heading">
        <div>
          <p className="landing-eyebrow">THE PARTS THAT DO THE HEAVY LIFTING</p>
          <h2 id="reliability-heading">
            <em>Calm</em> on the surface.
            <br />
            Considered underneath.
          </h2>
        </div>
        <p>
          Credentials, retries, pinned versions. The practical foundations that
          make a workflow easier to rely on.
        </p>
      </div>
      <div className="landing-reliability__grid">
        <article className="landing-reliability__card">
          <p className="landing-eyebrow">
            <LockKeyhole size={13} /> CONNECT ONCE. REUSE WITH INTENT.
          </p>
          <h3>Many apps. One clear pattern.</h3>
          <p>
            Keep encrypted connections separate from your workflow logic.
            Inspect each step through the same input and output view.
          </p>
          <div className="landing-runtime-hub" aria-hidden="true">
            <svg viewBox="0 0 360 210">
              <path d="M54 35L180 105L306 35M54 105H306M54 175L180 105L306 175" />
              <circle cx="180" cy="105" r="75" />
            </svg>
            <span className="landing-runtime-hub__center">
              <FluxoraMark size={57} />
            </span>
            {hubApps.map((icon, index) => (
              <span
                className={`landing-runtime-hub__app landing-runtime-hub__app--${index}`}
                key={icon}
              >
                <NodeIcon name={icon} size={22} />
              </span>
            ))}
          </div>
          <div className="landing-reliability__tags">
            <span>Encrypted secrets</span>
            <span>Reusable credentials</span>
          </div>
        </article>
        <article className="landing-reliability__card">
          <p className="landing-eyebrow">
            <Server size={13} /> YOUR INFRASTRUCTURE. YOUR CONTROL.
          </p>
          <h3>A place for every part.</h3>
          <p>
            The API receives the work. The queue carries it. Workers run it.
            Published versions keep the execution tied to its original graph.
          </p>
          <div
            className="landing-runtime-stack"
            aria-label="Fluxora runtime architecture"
          >
            {[
              {
                icon: GitBranch,
                label: "API",
                detail: "Receive & validate",
                tag: "NESTJS",
              },
              {
                icon: Clock3,
                label: "Queue",
                detail: "Schedule & dispatch",
                tag: "REDIS",
              },
              {
                icon: Server,
                label: "Worker",
                detail: "Execute each node",
                tag: "BULLMQ",
              },
              {
                icon: Database,
                label: "Database",
                detail: "Keep the execution trail",
                tag: "POSTGRES",
              },
            ].map((row) => (
              <div key={row.label}>
                <row.icon size={16} />
                <strong>{row.label}</strong>
                <span>{row.detail}</span>
                <small>{row.tag}</small>
              </div>
            ))}
          </div>
          <div className="landing-reliability__tags">
            <span>Self-host with Docker</span>
            <span>Pinned versions</span>
          </div>
        </article>
      </div>
    </section>
  );
}

const days = [
  { label: "Monday", short: "Mon", runs: [1, 2, 1, 0, 2], waiting: 1 },
  { label: "Tuesday", short: "Tue", runs: [2, 1, 2, 1, 2], waiting: 2 },
  { label: "Wednesday", short: "Wed", runs: [1, 3, 2, 1, 2], waiting: 1 },
  { label: "Thursday", short: "Thu", runs: [2, 2, 1, 2, 3], waiting: 0 },
  { label: "Friday", short: "Fri", runs: [1, 2, 1, 1, 2], waiting: 1 },
];
const hours = ["08", "10", "12", "14", "16"];

export function LandingDailyView() {
  const [selected, setSelected] = useState(1);
  const day = days[selected] ?? days[0]!;
  const total = day.runs.reduce((sum, value) => sum + value, 0);
  const completed = total - day.waiting;
  const percentage = Math.round((completed / total) * 100);
  return (
    <section
      className="landing-daily landing-container"
      id="daily-view"
      aria-labelledby="daily-heading"
    >
      <LandingReveal className="landing-split-heading">
        <div>
          <p className="landing-eyebrow">THE EVERYDAY VIEW</p>
          <h2 id="daily-heading">
            A Tuesday with
            <br />
            <em>fewer loose ends.</em>
          </h2>
        </div>
        <p>
          What ran. What is waiting. What needs you.
          <br />A sample week, with a clearer view of the work.
        </p>
      </LandingReveal>
      <LandingReveal className="landing-daily__grid">
        <div className="landing-daily__activity">
          <div className="landing-daily__top">
            <span>THIS WEEK, RUN BY RUN</span>
            <label>
              Preview day
              <select
                aria-label="Preview day"
                value={selected}
                onChange={(event) => setSelected(Number(event.target.value))}
              >
                {days.map((item, index) => (
                  <option value={index} key={item.label}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <table className="landing-heatmap">
            <caption className="visually-hidden">
              Illustrative execution counts by hour and weekday
            </caption>
            <thead>
              <tr>
                <th scope="col">Hour</th>
                {days.map((item, index) => (
                  <th
                    className={selected === index ? "is-selected" : ""}
                    scope="col"
                    key={item.label}
                  >
                    {item.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hours.map((hour, row) => (
                <tr key={hour}>
                  <th scope="row">{hour}:00</th>
                  {days.map((item, column) => (
                    <td
                      key={item.label}
                      className={selected === column ? "is-selected" : ""}
                      data-intensity={item.runs[row]}
                    >
                      <span
                        aria-label={`${item.label} ${hour}:00, ${item.runs[row]} sample runs`}
                      >
                        <span className="visually-hidden">
                          {item.runs[row]}
                        </span>
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="landing-heatmap__legend">
            <span>SAMPLE ACTIVITY</span>
            <span>
              Fewer
              <i />
              <i />
              <i />
              More
            </span>
          </div>
        </div>
        <div className="landing-daily__gauge">
          <span className="landing-eyebrow">SAMPLE COMPLETION</span>
          <div>
            <svg viewBox="0 0 140 140" aria-hidden="true">
              <circle cx="70" cy="70" r="58" />
              <circle
                cx="70"
                cy="70"
                r="58"
                pathLength="100"
                strokeDasharray={`${percentage} 100`}
              />
            </svg>
            <strong>
              {percentage}
              <small>%</small>
            </strong>
          </div>
          <p>
            <strong>
              {completed} of {total}
            </strong>{" "}
            sample runs completed
          </p>
        </div>
        <div className="landing-daily__approval">
          <p className="landing-eyebrow">
            <ShieldCheck size={13} /> HUMAN, WHEN IT MATTERS
          </p>
          <div>
            <strong>{day.waiting}</strong>
            <span>
              {day.waiting === 1 ? "sample run waiting" : "sample runs waiting"}
              <br />
              for approval
            </span>
          </div>
          <p>Pause at a decision. Resume with context.</p>
        </div>
        <div className="landing-daily__feed">
          <p className="landing-eyebrow">A CLEAR EXECUTION TRAIL</p>
          {[
            {
              icon: "steam" as const,
              label: "Steam daily report",
              result: "Completed",
            },
            {
              icon: "github" as const,
              label: "Repository update",
              result: "Completed",
            },
            {
              icon: "approval" as const,
              label: "Review before sending",
              result: day.waiting ? "Waiting" : "Completed",
            },
          ].map((item) => (
            <div key={item.label}>
              <NodeIcon name={item.icon} size={16} />
              <span>{item.label}</span>
              <small className={item.result === "Waiting" ? "is-waiting" : ""}>
                {item.result === "Completed" ? (
                  <Check size={11} />
                ) : (
                  <Clock3 size={11} />
                )}
                {item.result}
              </small>
            </div>
          ))}
        </div>
      </LandingReveal>
      <p className="landing-daily__disclaimer">
        Illustrative activity · choosing a day changes sample data only, not
        your workspace.
      </p>
    </section>
  );
}

const cases = [
  {
    number: "01",
    title: "A report that arrives on its own.",
    description:
      "Turn public Steam activity into a morning update, delivered to your team channel.",
    icons: ["schedule", "steam", "google-chat"] as NodeIconName[],
    category: "PERSONAL ROUTINES",
  },
  {
    number: "02",
    title: "Keep the team in the loop.",
    description:
      "Take a GitHub event, choose the useful details, and post an update to Discord.",
    icons: ["github", "if", "discord"] as NodeIconName[],
    category: "DEVELOPER UPDATES",
  },
  {
    number: "03",
    title: "Leave room for a human.",
    description:
      "Receive a webhook, pause for approval, then send the message when it is ready.",
    icons: ["webhook", "approval", "email"] as NodeIconName[],
    category: "CONSIDERED HAND-OFFS",
  },
];
export function LandingUseCases() {
  return (
    <section
      className="landing-cases landing-container"
      aria-labelledby="cases-heading"
    >
      <LandingReveal className="landing-split-heading">
        <div>
          <p className="landing-eyebrow">START WITH SOMETHING FAMILIAR</p>
          <h2 id="cases-heading">
            Real work.
            <br />
            <em>Clear starting points.</em>
          </h2>
        </div>
        <p>
          You do not need to automate everything.
          <br />
          Start with the task that keeps coming back.
        </p>
      </LandingReveal>
      <div className="landing-cases__grid">
        {cases.map((item) => (
          <LandingReveal
            as="article"
            className="landing-case"
            key={item.number}
          >
            <div className="landing-case__index">
              <span>{item.number}</span>
              <small>{item.category}</small>
            </div>
            <div className="landing-case__flow" aria-hidden="true">
              {item.icons.map((icon, index) => (
                <span key={icon}>
                  <NodeIcon name={icon} size={23} />
                  {index < 2 ? <ArrowRight size={14} /> : null}
                </span>
              ))}
            </div>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <Link href="/login">
              Build this flow <ArrowRight size={15} />
            </Link>
          </LandingReveal>
        ))}
      </div>
    </section>
  );
}
