"use client";

import {
  Check,
  ChevronRight,
  Play,
  RotateCcw,
  Square,
  Workflow,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { NodeIcon, type NodeIconName } from "../workflow/node-icon";

const steps: {
  title: string;
  detail: string;
  icon: NodeIconName;
  kind: string;
}[] = [
  {
    title: "Every morning",
    detail: "08:00 · Asia/Ho_Chi_Minh",
    icon: "schedule",
    kind: "TRIGGER",
  },
  {
    title: "Steam snapshot",
    detail: "Read public activity",
    icon: "steam",
    kind: "ACTION",
  },
  {
    title: "Team update",
    detail: "Send to Google Chat",
    icon: "google-chat",
    kind: "ACTION",
  },
];
const messages = [
  "A small workflow. A little time back.",
  "Schedule received. Starting the workflow…",
  "Reading the sample Steam profile…",
  "Preparing the sample team update…",
  "Sample complete. Three steps, one clear trail.",
];

export function LandingDemo() {
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState({
    width: 640,
    height: 300,
    paths: [
      "M205 185C218 185 218 113 230 113",
      "M410 113C422 113 422 185 435 185",
    ],
  });
  const reduceMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateY = useSpring(pointerX, { stiffness: 100, damping: 24 });
  const rotateX = useSpring(pointerY, { stiffness: 100, damping: 24 });
  const running = step > 0 && step < 4;

  useEffect(() => setReady(true), []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nodes = Array.from(
      canvas.querySelectorAll<HTMLElement>(".landing-demo-node"),
    );
    const measure = () => {
      const paths = nodes.slice(0, -1).flatMap((node, index) => {
        const next = nodes[index + 1];
        if (!next) return [];
        const x = node.offsetLeft + node.offsetWidth;
        const y = node.offsetTop + node.offsetHeight * 0.42;
        const nextX = next.offsetLeft;
        const nextY = next.offsetTop + next.offsetHeight * 0.42;
        const mid = (x + nextX) / 2;
        return [`M${x} ${y}C${mid} ${y} ${mid} ${nextY} ${nextX} ${nextY}`];
      });
      setConnections({
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        paths,
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setStep((value) => value + 1), 900);
    return () => window.clearTimeout(timer);
  }, [step, running]);

  return (
    <motion.div
      className="landing-demo"
      style={
        !ready || reduceMotion
          ? undefined
          : { rotateX, rotateY, transformPerspective: 1400 }
      }
      onPointerMove={(event) => {
        if (reduceMotion || event.pointerType !== "mouse") return;
        // Keep interactive controls still; decorative tilt must not chase a click.
        if (event.target instanceof Element && event.target.closest(".landing-demo__toolbar")) {
          pointerX.set(0);
          pointerY.set(0);
          return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        pointerX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 5);
        pointerY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * -4);
      }}
      onPointerLeave={() => {
        pointerX.set(0);
        pointerY.set(0);
      }}
      onFocusCapture={() => {
        pointerX.set(0);
        pointerY.set(0);
      }}
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
          <i />{" "}
          {running ? "Running" : step === 4 ? "Completed" : "Ready to run"}
        </span>
      </div>
      <div className="landing-demo__canvas" ref={canvasRef}>
        <div className="landing-demo__coordinates" aria-hidden="true">
          <span>FLOW / 001</span>
          <span>3 NODES · 2 CONNECTIONS</span>
        </div>
        <svg
          className="landing-demo__paths"
          viewBox={`0 0 ${connections.width} ${connections.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {connections.paths.map((path, index) => (
            <path
              key={index}
              className={step >= index + 2 ? "is-done" : ""}
              d={path}
            />
          ))}
        </svg>
        {steps.map((node, index) => (
          <div
            className={`landing-demo-node landing-demo-node--${index} ${step === index + 1 ? "is-running" : step > index + 1 ? "is-done" : ""}`}
            key={node.title}
          >
            <span className="landing-demo-node__port landing-demo-node__port--in" />
            <div className="landing-demo-node__icon">
              <NodeIcon name={node.icon} size={22} />
              {step > index + 1 ? (
                <span>
                  <Check size={10} />
                </span>
              ) : null}
            </div>
            <small>{node.kind}</small>
            <strong>{node.title}</strong>
            <p>{node.detail}</p>
            <span className="landing-demo-node__port landing-demo-node__port--out" />
          </div>
        ))}
        <div className="landing-demo__annotation">
          <span /> A daily report, without the daily reminder.
        </div>
      </div>
      <div className="landing-demo__console">
        <span className="landing-demo__console-label">
          <span /> EXECUTION PREVIEW
        </span>
        <p role="status" aria-live="polite">
          {messages[step]}
        </p>
        <div className="landing-demo__progress" aria-hidden="true">
          {steps.map((item, index) => (
            <span
              className={
                step > index + 1
                  ? "is-done"
                  : step === index + 1
                    ? "is-running"
                    : ""
              }
              key={item.title}
            />
          ))}
        </div>
      </div>
      <div className="landing-demo__toolbar">
        <span>No accounts connected. No messages sent.</span>
        <button
          className="landing-button landing-button--small"
          disabled={!ready}
          onClick={() => setStep(running ? 0 : reduceMotion ? 4 : 1)}
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
      <noscript>
        <p className="landing-demo__noscript">
          This example shows Schedule → Steam snapshot → Google Chat. Enable
          JavaScript to play the sample.
        </p>
      </noscript>
    </motion.div>
  );
}
