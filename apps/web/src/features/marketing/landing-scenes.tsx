"use client";

import dynamic from "next/dynamic";
import { useLandingEffects } from "./landing-motion";
import { Pause, Play } from "lucide-react";
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const LightStreamScene = dynamic(
  () =>
    import("./landing-three-scenes").then((module) => module.LightStreamScene),
  { ssr: false, loading: () => null },
);

class SceneBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onFailure();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function supportsWebGl() {
  try {
    const context = document.createElement("canvas").getContext("webgl2");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** A single decorative stage for the whole public page; never an input target. */
export function LandingLightStream() {
  const [supported, setSupported] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const { paused, togglePaused } = useLandingEffects();
  const hasStarted = useRef(false);
  const onReady = useCallback(() => {
    hasStarted.current = true;
    setReady(true);
  }, []);
  const onFailure = useCallback(() => setFailed(true), []);

  useEffect(() => {
    setInteractive(true);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let capability: boolean | undefined;
    const update = () => {
      if (media.matches) {
        setSupported(false);
        return;
      }
      capability ??= supportsWebGl();
      setSupported(capability);
    };
    const onVisibility = () =>
      setDocumentVisible(document.visibilityState === "visible");
    update();
    onVisibility();
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const enabled = supported && documentVisible && !failed && !paused;
  useEffect(() => {
    if (!enabled) setReady(false);
  }, [enabled]);
  return (
    <>
      <div
        className="landing-light-stream landing-scene"
        aria-hidden="true"
        data-scene-state={
          failed || !supported
            ? "fallback"
            : enabled && ready
              ? "running"
              : "paused"
        }
      >
        <svg
          className="landing-stream-fallback"
          viewBox="0 0 1440 1000"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient id="stream-fallback-edge">
              <stop stopColor="#d6ff32" stopOpacity="0" />
              <stop offset=".5" stopColor="#d6ff32" stopOpacity=".35" />
              <stop offset="1" stopColor="#90d9c0" stopOpacity=".05" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3, 4].map((index) => (
            <path
              key={index}
              d={`M${640 + index * 12} -100C1300 130 200 390 960 630S1100 1030 200 1100`}
              fill="none"
              stroke="url(#stream-fallback-edge)"
              strokeWidth={index === 2 ? 2 : 0.6}
            />
          ))}
        </svg>
        {enabled ? (
          <SceneBoundary onFailure={onFailure}>
            <LightStreamScene
              onReady={onReady}
              onFailure={onFailure}
              playIntro={!hasStarted.current}
            />
          </SceneBoundary>
        ) : null}
      </div>
      {interactive ? (
        <button
          type="button"
          className="landing-effects-toggle"
          aria-pressed={paused}
          aria-label={paused ? "Resume visual effects" : "Pause visual effects"}
          onClick={togglePaused}
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
          <span>{paused ? "Motion paused" : "Pause motion"}</span>
        </button>
      ) : null}
    </>
  );
}
