"use client";

import gsap from "gsap";
import {
  Check,
  ChevronRight,
  Play,
  RotateCcw,
  Square,
  Workflow,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePointerTilt } from "../../components/ui/ui-motion";
import { useLandingEffects } from "./landing-motion";
import { NodeIcon, type NodeIconName } from "../workflow/node-icon";

const nodes: {
  title: string;
  detail: string;
  icon: NodeIconName;
  kind: string;
}[] = [
  {
    title: "Every morning",
    detail: "08:00",
    icon: "schedule",
    kind: "TRIGGER",
  },
  {
    title: "Steam snapshot",
    detail: "Public activity",
    icon: "steam",
    kind: "FRESH ACTIVITY",
  },
  {
    title: "Saved summary",
    detail: "Sample sheet",
    icon: "google-sheets",
    kind: "SAVED REPORT",
  },
  {
    title: "Team update",
    detail: "Google Chat",
    icon: "google-chat",
    kind: "ACTION",
  },
];
const edges = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 3],
] as const;
const feed = [
  ["08:00:00", "Steam daily report", "134 ms"],
  ["07:45:00", "Repository digest", "388 ms"],
  ["07:30:00", "Sheet summary", "1.9 s"],
  ["07:15:00", "Team update", "142 ms"],
];

export function LandingDemo() {
  const [step, setStep] = useState(0);
  const [cached, setCached] = useState(false);
  const [ready, setReady] = useState(false);
  const [feedOffset, setFeedOffset] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState({
    width: 640,
    height: 350,
    paths: ["", "", "", ""],
  });
  const { paused, introReady, introRevealing } = useLandingEffects();
  const bootTimeline = useRef<gsap.core.Timeline | null>(null);
  usePointerTilt(root, paused);
  const route = [0, cached ? 2 : 1, 3];
  const running = step > 0 && step < 4;
  useEffect(() => setReady(true), []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const elements = [
      ...canvas.querySelectorAll<HTMLElement>(".landing-demo-node"),
    ];
    const measure = () => {
      const vertical = matchMedia("(max-width: 600px)").matches;
      const paths = edges.map(([a, b]) => {
        const node = elements[a]!,
          next = elements[b]!;
        const x = node.offsetLeft + node.offsetWidth * (vertical ? 0.5 : 1);
        const y = node.offsetTop + node.offsetHeight * (vertical ? 1 : 0.5);
        const nx = next.offsetLeft + next.offsetWidth * (vertical ? 0.5 : 0);
        const ny = next.offsetTop + next.offsetHeight * (vertical ? 0 : 0.5);
        return vertical
          ? `M${x} ${y}C${x} ${(y + ny) / 2} ${nx} ${(y + ny) / 2} ${nx} ${ny}`
          : `M${x} ${y}C${(x + nx) / 2} ${y} ${(x + nx) / 2} ${ny} ${nx} ${ny}`;
      });
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      // ResizeObserver may report the same sizes repeatedly as fonts, layout
      // and effects settle. Preserve the object identity unless geometry has
      // actually changed so the running packet timeline is not restarted.
      setConnections((previous) =>
        previous.width === width && previous.height === height &&
        previous.paths.every((path, index) => path === paths[index])
          ? previous
          : { width, height, paths },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    elements.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!running) return;
    if (paused) {
      setStep(4);
      return;
    }
    // Hold the first active node long enough for both a person and assistive
    // technology to register that a run started. The following steps remain
    // brisk so the illustrative sequence completes without becoming a demo.
    const dwell = step === 1 ? 1800 : 900;
    const timer = setTimeout(() => setStep((value) => value + 1), dwell);
    return () => clearTimeout(timer);
  }, [step, running, paused]);

  useLayoutEffect(() => {
    const host = root.current;
    if (!host || paused) return;
    const media = gsap.matchMedia();
    media.add(
      "(prefers-reduced-motion: no-preference)",
      () => {
        const hero = host.closest(".landing-hero")!;
        host.dataset.boot = "booting";
        const boot = gsap.timeline({
          paused: true,
          defaults: { ease: "power2.out", duration: 0.65 },
          onComplete: () => {
            host.dataset.boot = "ready";
          },
        });
        boot
          .fromTo(
            hero.querySelectorAll(".landing-hero__copy > *"),
            { y: 24, opacity: 0, filter: "blur(8px)" },
            {
              y: 0,
              opacity: 1,
              filter: "blur(0px)",
              stagger: 0.07,
              clearProps: "transform,opacity,filter",
            },
            0,
          )
          .fromTo(
            hero.querySelector(".landing-hero__copy h1"),
            { "--hero-focus": "0%", maskImage: "linear-gradient(90deg, black calc(var(--hero-focus) - 40%), transparent var(--hero-focus))" },
            { "--hero-focus": "140%", duration: 0.9, ease: "power2.out", clearProps: "maskImage,--hero-focus" },
            0.07,
          )
          .fromTo(
            hero.querySelector(".landing-hero__copy > .landing-eyebrow"),
            { clipPath: "inset(0 100% 0 0)" },
            { clipPath: "inset(0 0% 0 0)", duration: 0.9, ease: "steps(28)", clearProps: "clipPath" },
            0.12,
          )
          .fromTo(
            host.querySelector(".landing-demo__canvas"),
            { clipPath: "circle(0% at 50% 50%)" },
            { clipPath: "circle(100% at 50% 50%)", clearProps: "clipPath" },
            0.192,
          )
          .fromTo(
            host.querySelectorAll(
              ".landing-demo__chrome, .landing-demo__heading, .landing-demo__feed-label",
            ),
            { opacity: 0 },
            { opacity: 1, clearProps: "opacity" },
            0.288,
          )
          .fromTo(
            host.querySelectorAll(".landing-demo-node"),
            { y: 8, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              stagger: 0.056,
              clearProps: "transform,opacity",
            },
            0.416,
          )
          .fromTo(
            host.querySelectorAll(".landing-demo__paths path"),
            { strokeDasharray: 1, strokeDashoffset: 1 },
            {
              strokeDashoffset: 0,
              stagger: 0.04,
              clearProps: "strokeDasharray,strokeDashoffset",
            },
            0.608,
          )
          .fromTo(
            host.querySelectorAll(".landing-demo__feed-row"),
            { opacity: 0 },
            { opacity: 1, stagger: 0.07, clearProps: "opacity" },
            0.8,
          );
        boot.progress(0);
        bootTimeline.current = boot;
        if (introRevealing) boot.play();
        return () => {
          bootTimeline.current = null;
          boot.kill();
          delete host.dataset.boot;
        };
      },
      host.closest(".landing-hero")!,
    );
    return () => media.revert();
  }, [paused]);

  useEffect(() => {
    if (introRevealing) bootTimeline.current?.play();
  }, [introRevealing]);

  useEffect(() => {
    const host = root.current;
    if (!host || paused || !introReady || !connections.paths[0]) return;
    const media = gsap.matchMedia();
    media.add(
      "(prefers-reduced-motion: no-preference)",
      () => {
        const paths = [
          ...host.querySelectorAll<SVGPathElement>(".landing-demo__paths path"),
        ];
        const packet = host.querySelector<SVGGElement>(
          ".landing-demo__packet",
        )!;
        let trip = 0,
          visible = false;
        const play = { t: 0 };
        const lengths = paths.map((path) => path.getTotalLength());
        const flashes = [...host.querySelectorAll<HTMLElement>(".landing-demo-node__flash")];
        const cycle = gsap.timeline({
          repeat: -1,
          repeatDelay: 0.784,
          paused: true,
          onUpdate: () => {
            const branch = trip % 3 === 2 ? 1 : 0;
            const fraction = lengths[branch]! / (lengths[branch]! + lengths[branch + 2]!);
            const branchTime = Math.acos(1 - 2 * fraction) / Math.PI * 0.72;
            const times = [0, branch === 0 ? branchTime : -1, branch === 1 ? branchTime : -1, 0.72];
            const elapsed = cycle.time();
            flashes.forEach((flash, index) => {
              const since = elapsed - times[index]!;
              const strength = times[index]! >= 0 && since >= 0 && since <= 0.416
                ? (1 - since / 0.416) ** 2 : 0;
              flash.style.opacity = String(strength * 0.85);
              flash.style.transform = `scale(${1 + (1 - strength) * 1.4})`;
            });
          },
          onRepeat: () => {
            trip++;
            if (trip % 2 === 0) setFeedOffset((value) => value + 1);
          },
        });
        cycle.fromTo(play, { t: 0 }, {
          t: 1,
          duration: 0.72,
          ease: "sine.inOut",
          onUpdate: () => {
            const branch = trip % 3 === 2 ? 1 : 0;
            const first = branch,
              second = branch + 2;
            const total = lengths[first]! + lengths[second]!;
            const travel = play.t * total;
            const index = travel <= lengths[first]! ? first : second;
            const point = paths[index]!.getPointAtLength(
              travel <= lengths[first]! ? travel : travel - lengths[first]!,
            );
            packet.setAttribute(
              "transform",
              `translate(${point.x} ${point.y})`,
            );
            packet.style.opacity = String(
              Math.min(1, play.t / 0.08, (1 - play.t) / 0.04),
            );
            packet.style.color = branch ? "#9ba0a6" : "#c8f751";
          },
        });
        // Keep the playhead alive for the last port's halo, without changing
        // the reference's 1.92-second trip cadence.
        cycle.to({}, { duration: 0.416 });
        const sync = () => {
          const playing = visible && !document.hidden;
          host.dataset.flow = playing ? "playing" : "paused";
          if (playing) cycle.play();
          else cycle.pause();
        };
        const observer = new IntersectionObserver((entries) => {
          visible = entries[0]?.isIntersecting ?? false;
          sync();
        });
        observer.observe(host);
        document.addEventListener("visibilitychange", sync);
        return () => {
          cycle.kill();
          observer.disconnect();
          document.removeEventListener("visibilitychange", sync);
          packet.style.opacity = "0";
          flashes.forEach((flash) => { flash.style.opacity = "0"; flash.style.transform = ""; });
          delete host.dataset.flow;
        };
      },
      host,
    );
    return () => media.revert();
  }, [paused, introReady, connections]);

  useEffect(() => {
    if (!feedOffset || paused) return;
    const host = root.current;
    if (!host) return;
    const media = gsap.matchMedia();
    media.add(
      "(prefers-reduced-motion: no-preference)",
      () => {
        const rows = host.querySelectorAll<HTMLElement>(".landing-demo__feed-row");
        const pitch = rows[0]?.offsetHeight ?? 28;
        const shift = gsap.timeline({ defaults: { duration: 0.6, ease: "power2.out" } });
        shift.fromTo(rows, { y: -pitch }, { y: 0, clearProps: "transform" }, 0)
          .fromTo(rows[0]!, { opacity: 0 }, { opacity: 1, clearProps: "opacity" }, 0);
        const previousDot = rows[1]?.querySelector("i");
        if (previousDot) shift.fromTo(previousDot, { backgroundColor: "#c8f751" }, {
          backgroundColor: "#9ba0a6", clearProps: "backgroundColor",
        }, 0);
      },
      host,
    );
    return () => media.revert();
  }, [feedOffset, paused]);

  const messages = [
    "A small workflow. A little time back.",
    "Schedule received. Starting the workflow…",
    cached
      ? "Reading the saved sample summary…"
      : "Reading the sample Steam profile…",
    "Preparing the sample team update…",
    "Sample complete. Three steps, one clear trail.",
  ];
  return (
    <div
      className="landing-demo"
      ref={root}
      aria-label="Interactive sample workflow"
      data-demo-step={step}
    >
      <div className="landing-demo__chrome">
        <span className="landing-window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>
          Personal workspace <ChevronRight size={11} /> Daily report
        </span>
        <span className="landing-demo__sample">SAMPLE</span>
      </div>
      <div className="landing-demo__heading">
        <div>
          <Workflow size={17} />
          <strong>Good morning, on repeat.</strong>
        </div>
        <span>
          <i />
          {running ? "Running" : step === 4 ? "Completed" : "Ready to run"}
        </span>
      </div>
      <div className="landing-demo__canvas" ref={canvasRef}>
        <div className="landing-demo__tools" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <span className="landing-demo__zoom" aria-hidden="true">
          100%
        </span>
        <svg
          className="landing-demo__paths"
          viewBox={`0 0 ${connections.width} ${connections.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {connections.paths.map((path, index) => (
            <path
              key={index}
              pathLength="1"
              className={index % 2 === 0 ? "is-primary" : "is-secondary"}
              d={path}
            />
          ))}
          <g className="landing-demo__packet">
            <circle r="7" fill="currentColor" opacity=".22" />
            <circle r="2.5" fill="currentColor" />
          </g>
        </svg>
        {nodes.map((node, index) => {
          const stage = route.indexOf(index) + 1;
          return (
            <div
              className={`landing-demo-node landing-demo-node--${index} ${stage && step === stage ? "is-running" : stage && step > stage ? "is-done" : ""}`}
              key={node.title}
            >
              <span className="landing-demo-node__port landing-demo-node__port--in">{index !== 0 ? <i className="landing-demo-node__flash" /> : null}</span>
              <div className="landing-demo-node__icon">
                <NodeIcon name={node.icon} size={22} />
                {stage && step > stage ? (
                  <span>
                    <Check size={10} />
                  </span>
                ) : null}
              </div>
              <small>{node.kind}</small>
              <strong>{node.title}</strong>
              <p>{node.detail}</p>
              <span className="landing-demo-node__port landing-demo-node__port--out">{index === 0 ? <i className="landing-demo-node__flash" /> : null}</span>
            </div>
          );
        })}
        <div className="landing-demo__annotation">
          <span /> Fresh activity, or a saved report.
        </div>
      </div>
      <div
        className="landing-demo__feed"
        aria-label="Illustrative sample run history"
      >
        <span className="landing-demo__feed-label">
          LAST RUNS · SAMPLE DATA
        </span>
        <div className="landing-demo__feed-list">
        {[0, 1, 2, 3].map((i) => {
          const item = feed[((i - feedOffset) % feed.length + feed.length) % feed.length]!;
          return (
            <div className="landing-demo__feed-row" key={`${feedOffset}-${i}`} aria-hidden={i === 3 ? true : undefined}>
              <i />
              <span>{item[0]}</span>
              <span>{item[1]}</span>
              <span>{item[2]}</span>
            </div>
          );
        })}
        </div>
      </div>
      <div className="landing-demo__console">
        <p role="status" aria-live="polite">
          {messages[step]}
        </p>
      </div>
      <div className="landing-demo__toolbar">
        <label className="landing-demo__branch">
          <input
            type="checkbox"
            checked={cached}
            disabled={running}
            onChange={(event) => setCached(event.target.checked)}
          />
          Use saved sample
        </label>
        <button
          className="landing-button landing-button--small"
          disabled={!ready || !introReady}
          onClick={() =>
            setStep(
              running
                ? 0
                : paused ||
                    matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? 4
                  : 1,
            )
          }
        >
          {running ? (
            <Square size={12} />
          ) : step === 4 ? (
            <RotateCcw size={13} />
          ) : (
            <Play size={13} fill="currentColor" />
          )}
          {running
            ? "Stop sample"
            : step === 4
              ? "Replay sample"
              : "Run sample"}
        </button>
      </div>
      <p className="landing-demo__disclaimer">
        Illustration only. No accounts connected. No messages sent.
      </p>
      <noscript>
        <p className="landing-demo__noscript">
          Schedule → Steam or saved report → Google Chat. Enable JavaScript to
          play the sample.
        </p>
      </noscript>
    </div>
  );
}
