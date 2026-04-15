import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { slides } from "./data/slides";
import { useCameraFeed } from "./hooks/useCameraFeed";
import { useHandGestures } from "./hooks/useHandGestures";
import { usePresenceMonitor } from "./hooks/usePresenceMonitor";
import { useSpeechCommands } from "./hooks/useSpeechCommands";
import { applyCommand, formatTimeLabel, initialDemoState } from "./lib/commandRouter";
import type { CommandEvent, EventLogEntry, NormalizedCommand } from "./types";

export default function App() {
  const [demoState, setDemoState] = useState(initialDemoState);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [lastIntent, setLastIntent] = useState("Waiting for the first command");
  const demoStateRef = useRef(initialDemoState);

  const { videoRef, cameraStatus, cameraError } = useCameraFeed();

  const onCommand = useEffectEvent((event: CommandEvent) => {
    const outcome = applyCommand(demoStateRef.current, event.command, slides.length);
    demoStateRef.current = outcome.nextState;
    setDemoState(outcome.nextState);
    setLastIntent(`${event.source.toUpperCase()} -> ${event.command}`);

    setEventLog((current) => [
      {
        ...event,
        action: outcome.action,
        timeLabel: formatTimeLabel(event.at)
      },
      ...current
    ].slice(0, 20));
  });

  const { voiceStatus, lastHeard } = useSpeechCommands({ onCommand });
  const { detectorStatus, gestureHint, gestureConfidence } = useHandGestures({
    enabled: cameraStatus === "ready",
    videoRef,
    onCommand
  });
  const { motionScore, presenceHint } = usePresenceMonitor({
    enabled: cameraStatus === "ready",
    videoRef,
    onCommand
  });

  useEffect(() => {
    demoStateRef.current = demoState;
  }, [demoState]);

  useEffect(() => {
    if (!demoState.isPlaying) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setTimerSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [demoState.isPlaying]);

  const statusCards = useMemo(
    () => [
      { label: "Camera", value: cameraStatus === "ready" ? "Live" : cameraStatus },
      { label: "Voice", value: voiceStatus },
      { label: "Gesture", value: detectorStatus },
      { label: "Presence", value: demoState.presence }
    ],
    [cameraStatus, demoState.presence, detectorStatus, voiceStatus]
  );

  function dispatchManual(command: NormalizedCommand, detail: string) {
    onCommand({
      source: "manual",
      command,
      confidence: 1,
      detail,
      at: Date.now()
    });
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Codex Hackathon Prototype</p>
          <h1>Touchless meeting control with TensorFlow.js gestures, voice commands, and a reusable command router.</h1>
          <p className="lede">
            Browser-first by design so the prototype is realistic on both Windows and macOS, while the reusable multimodal router
            stays portable across future domains.
          </p>
        </div>

        <aside className="hero-card">
          <span className="score-label">Open-Source Stack</span>
          <strong>React + Vite + TensorFlow.js</strong>
          <p>Chromium browsers on Windows and macOS for the MVP, with native packaging left for post-hackathon hardening.</p>
        </aside>
      </header>

      <section className="status-row">
        {statusCards.map((card) => (
          <div className="status-pill" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </div>
        ))}
      </section>

      <main className="dashboard">
        <section className="panel live-panel">
          <div className="panel-head">
            <div>
              <p className="panel-label">Live Input</p>
              <h2>Camera, gestures, and voice</h2>
            </div>
            <button className="ghost-button" onClick={() => dispatchManual("USER_AWAY", "Manual away-state fallback")}>
              Simulate away-state
            </button>
          </div>

          <div className="video-wrap">
            <video ref={videoRef} muted playsInline />
            <div className="video-overlay">
              <div>
                <span>Last intent</span>
                <strong>{lastIntent}</strong>
              </div>
              <div>
                <span>Last voice transcript</span>
                <strong>{lastHeard}</strong>
              </div>
            </div>
          </div>

          <div className="metrics-grid">
            <MetricCard label="Gesture confidence" value={`${Math.round(gestureConfidence * 100)}%`} />
            <MetricCard label="Motion score" value={`${Math.round(motionScore * 100)}%`} />
            <MetricCard label="Timer" value={formatTimer(timerSeconds)} />
            <MetricCard label="Platform" value="Windows + macOS" />
          </div>

          <div className="hint-grid">
            <div className="hint-card">
              <span>Gesture hint</span>
              <strong>{gestureHint}</strong>
            </div>
            <div className="hint-card">
              <span>Presence hint</span>
              <strong>{presenceHint}</strong>
            </div>
            {cameraError ? (
              <div className="hint-card warning">
                <span>Camera note</span>
                <strong>{cameraError}</strong>
              </div>
            ) : null}
          </div>

          <div className="manual-controls">
            <button onClick={() => dispatchManual("START", "Manual start fallback")}>Start</button>
            <button onClick={() => dispatchManual("BACK", "Manual previous fallback")}>Prev</button>
            <button onClick={() => dispatchManual("NEXT", "Manual next fallback")}>Next</button>
            <button onClick={() => dispatchManual("TOGGLE_PLAY", "Manual open palm fallback")}>Open Palm</button>
            <button onClick={() => dispatchManual("MUTE", "Manual mute fallback")}>Mute</button>
            <button onClick={() => dispatchManual("UNMUTE", "Manual unmute fallback")}>Unmute</button>
          </div>
        </section>

        <section className="panel demo-panel">
          <div className="panel-head">
            <div>
              <p className="panel-label">Demo Workspace</p>
              <h2>Presentation controller</h2>
            </div>
            <div className={`presence-indicator ${demoState.presence}`}>
              {demoState.presence === "present" ? "User present" : "User away"}
            </div>
          </div>

          <article className="slide-card">
            <span className="slide-number">
              Slide {demoState.slideIndex + 1} / {slides.length}
            </span>
            <h3>{slides[demoState.slideIndex].title}</h3>
            <p>{slides[demoState.slideIndex].subtitle}</p>
            <strong>{slides[demoState.slideIndex].accent}</strong>
          </article>

          <div className="demo-stats">
            <div>
              <span>Session</span>
              <strong>{demoState.sessionStarted ? "Started" : "Ready"}</strong>
            </div>
            <div>
              <span>Playback</span>
              <strong>{demoState.isPlaying ? "Running" : "Paused"}</strong>
            </div>
            <div>
              <span>Audio</span>
              <strong>{demoState.isMuted ? "Muted" : "Live"}</strong>
            </div>
          </div>

          <div className="last-action">
            <span>Last action</span>
            <strong>{demoState.lastActionLabel}</strong>
          </div>

          <div className="pitch-points">
            <div>
              <span>Partner impact</span>
              <p>Hands-free control for meetings today, accessibility and sterile workflows next.</p>
            </div>
            <div>
              <span>Reusable asset</span>
              <p>The multimodal command router is the reusable platform, not just the meeting UI.</p>
            </div>
          </div>
        </section>

        <section className="panel log-panel">
          <div className="panel-head">
            <div>
              <p className="panel-label">Evidence Log</p>
              <h2>Commands and actions</h2>
            </div>
          </div>

          <div className="log-list">
            {eventLog.length === 0 ? (
              <div className="empty-state">Issue a gesture or voice command to populate the evidence log.</div>
            ) : (
              eventLog.map((entry, index) => (
                <article className="log-item" key={`${entry.timeLabel}-${index}`}>
                  <div className="log-meta">
                    <span>{entry.timeLabel}</span>
                    <span>{entry.source}</span>
                    <span>{Math.round(entry.confidence * 100)}%</span>
                  </div>
                  <strong>{entry.command}</strong>
                  <p>{entry.action}</p>
                  <small>{entry.detail}</small>
                </article>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
