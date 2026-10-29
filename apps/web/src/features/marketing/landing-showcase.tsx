"use client";

import {
  Check,
  ChevronRight,
  FileJson,
  GitBranch,
  History,
  KeyRound,
  LayoutGrid,
  LockKeyhole,
  Plus,
  Search,
} from "lucide-react";
import { useRef, useState } from "react";
import { FluxoraMark } from "../../components/brand/fluxora-mark";
import { NodeIcon } from "../workflow/node-icon";

const views = [
  {
    label: "Build visually",
    icon: GitBranch,
    description: "Give every step a purpose. Keep the whole workflow in view.",
  },
  {
    label: "Inspect every run",
    icon: History,
    description:
      "A clear execution trail, down to the input and output of each node.",
  },
  {
    label: "Connect securely",
    icon: KeyRound,
    description:
      "Reusable connections for your apps. Secrets stay on the server.",
  },
];

export function LandingShowcase() {
  const [view, setView] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="landing-showcase">
      <div
        className="landing-showcase__tabs"
        role="tablist"
        aria-label="Explore Fluxora"
      >
        {views.map((item, index) => (
          <button
            key={item.label}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            role="tab"
            id={`landing-tab-${index}`}
            aria-selected={view === index}
            aria-controls="landing-product-panel"
            tabIndex={view === index ? 0 : -1}
            onClick={() => setView(index)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (view + 1) % views.length
                  : event.key === "ArrowLeft"
                    ? (view + views.length - 1) % views.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? views.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              setView(next);
              tabs.current[next]?.focus();
            }}
          >
            <item.icon size={16} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div
        className="landing-showcase__window"
        id="landing-product-panel"
        role="tabpanel"
        aria-labelledby={`landing-tab-${view}`}
        tabIndex={0}
      >
        <aside className="landing-showcase__sidebar" aria-hidden="true">
          <FluxoraMark size={25} />
          <i />
          <LayoutGrid size={18} />
          <GitBranch size={18} />
          <History size={18} />
          <KeyRound size={18} />
          <span>F</span>
        </aside>
        <div className="landing-showcase__main">
          <div className="landing-showcase__bar">
            <span>
              My workspace <ChevronRight size={12} />
              <strong>
                {["Workflows", "Executions", "Connections"][view]}
              </strong>
            </span>
            <span className="landing-showcase__badge">PRODUCT PREVIEW</span>
          </div>
          <div className="landing-showcase__content" key={view}>
            <div className="landing-showcase__title">
              <div>
                <p>YOUR WORK, CONNECTED</p>
                <h3>
                  {
                    [
                      "A little order for your everyday.",
                      "Every step tells a story.",
                      "All your tools. One place.",
                    ][view]
                  }
                </h3>
              </div>
              <span className="landing-showcase__utility" aria-hidden="true">
                {view === 0 ? (
                  <Plus size={17} />
                ) : view === 1 ? (
                  <Search size={17} />
                ) : (
                  <LockKeyhole size={17} />
                )}
              </span>
            </div>
            {view === 0 ? (
              <div className="landing-showcase__workflows">
                <article>
                  <div>
                    <NodeIcon name="steam" size={24} />
                    <span>DAILY ROUTINE</span>
                  </div>
                  <h4>Steam daily report</h4>
                  <p>Your account activity, delivered to your team.</p>
                  <div className="landing-showcase__mini-flow">
                    <NodeIcon name="schedule" />
                    <i />
                    <NodeIcon name="steam" />
                    <i />
                    <NodeIcon name="google-chat" />
                  </div>
                  <footer>
                    <span>3 nodes</span>
                    <span>
                      Published <Check size={12} />
                    </span>
                  </footer>
                </article>
                <article>
                  <div>
                    <NodeIcon name="github" size={24} />
                    <span>DEVELOPER WORKFLOW</span>
                  </div>
                  <h4>Keep the team in the loop</h4>
                  <p>A GitHub event becomes a useful channel update.</p>
                  <div className="landing-showcase__mini-flow">
                    <NodeIcon name="github" />
                    <i />
                    <NodeIcon name="if" />
                    <i />
                    <NodeIcon name="discord" />
                  </div>
                  <footer>
                    <span>3 nodes</span>
                    <span>
                      Draft <span className="landing-tiny-dot" />
                    </span>
                  </footer>
                </article>
              </div>
            ) : view === 1 ? (
              <div className="landing-showcase__execution">
                <div className="landing-showcase__timeline">
                  {["Schedule", "Steam snapshot", "Google Chat"].map(
                    (name, index) => (
                      <div key={name}>
                        <span>
                          <Check size={14} />
                        </span>
                        <div>
                          <strong>{name}</strong>
                          <small>
                            {index === 0
                              ? "Trigger received"
                              : index === 1
                                ? "Public profile read"
                                : "Report delivered"}
                          </small>
                        </div>
                        <em>Succeeded</em>
                      </div>
                    ),
                  )}
                </div>
                <div className="landing-showcase__json">
                  <p>
                    <FileJson size={14} /> OUTPUT <span>SAMPLE DATA</span>
                  </p>
                  <pre>
                    {
                      '{\n  "profile": {\n    "name": "Alex",\n    "visibility": "public"\n  },\n  "recentGames": 3\n}'
                    }
                  </pre>
                </div>
              </div>
            ) : (
              <div className="landing-showcase__connections">
                {[
                  {
                    name: "Google workspace",
                    icon: "google" as const,
                    method: "OAuth 2.0",
                  },
                  {
                    name: "GitHub connector",
                    icon: "github" as const,
                    method: "Access token",
                  },
                  {
                    name: "Discord notifications",
                    icon: "discord" as const,
                    method: "Webhook",
                  },
                ].map((item) => (
                  <div key={item.name}>
                    <NodeIcon name={item.icon} size={24} />
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.method}</small>
                    </div>
                    <span>
                      <LockKeyhole size={12} /> Encrypted
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="landing-showcase__description">
            <span className="landing-status-dot" />
            {views[view]?.description}
          </div>
        </div>
      </div>
      <p className="landing-showcase__disclaimer">
        Illustrative workspace · sample workflows and data
      </p>
    </div>
  );
}
