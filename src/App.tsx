import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { slides } from "./data/slides";
import { useCameraFeed } from "./hooks/useCameraFeed";
import { useHandGestures } from "./hooks/useHandGestures";
import { usePresenceMonitor } from "./hooks/usePresenceMonitor";
import { useSpeechCommands } from "./hooks/useSpeechCommands";
import { applyCommand, formatTimeLabel, initialDemoState } from "./lib/commandRouter";
import type { CommandEvent, EventLogEntry, NormalizedCommand } from "./types";

type StatusTone = "good" | "muted" | "warn";

export default function App() {
  const [demoState, setDemoState] = useState(initialDemoState);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [lastIntent, setLastIntent] = useState("Awaiting first command");
  const [gestureEnabled, setGestureEnabled] = useState(true);
  const demoStateRef = useRef(initialDemoState);

  const { videoRef, cameraStatus, cameraError } = useCameraFeed();

  const onCommand = useEffectEvent((event: CommandEvent) => {
    const outcome = applyCommand(demoStateRef.current, event.command, slides.length);
    demoStateRef.current = outcome.nextState;
    setDemoState(outcome.nextState);
    setLastIntent(`${event.source.toUpperCase()} - ${event.command}`);

    setEventLog((current) => [
      {
        ...event,
        action: outcome.action,
        timeLabel: formatTimeLabel(event.at)
      },
      ...current
    ].slice(0, 16));
  });

  const { voiceEnabled, voiceStatus, heardText, lastFinalTranscript, matchedCommandPreview, toggleVoice } = useSpeechCommands({ onCommand });
  const { detectorStatus, gestureHint, gestureConfidence } = useHandGestures({
    enabled: cameraStatus === "ready" && gestureEnabled,
    videoRef,
    onCommand
  });
  const { motionScore } = usePresenceMonitor({
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

  const statusItems = useMemo(
    () => [
      { label: "Camera", value: cameraStatus === "ready" ? "Live" : cameraStatus, tone: (cameraStatus === "ready" ? "good" : "muted") as StatusTone },
      { label: "Voice", value: voiceEnabled ? voiceStatus : "off", tone: (voiceEnabled ? "good" : "muted") as StatusTone },
      { label: "Gesture", value: gestureEnabled ? detectorStatus : "off", tone: (gestureEnabled ? "good" : "muted") as StatusTone },
      { label: "Presence", value: demoState.presence, tone: (demoState.presence === "present" ? "good" : "warn") as StatusTone }
    ],
    [cameraStatus, demoState.presence, detectorStatus, gestureEnabled, voiceEnabled, voiceStatus]
  );

  const latestEvent = eventLog[0];
  const gestureGuide = gestureEnabled
    ? "Show 1 finger for previous, 2 fingers for next, or an open palm for pause and resume."
    : "Turn gesture back on to use finger-count controls.";

  function dispatchManual(command: NormalizedCommand, detail: string) {
    onCommand({
      source: "manual",
      command,
      confidence: 1,
      detail,
      at: Date.now()
    });
  }

  function dispatchGestureDemo(command: NormalizedCommand, detail: string) {
    onCommand({
      source: "gesture",
      command,
      confidence: 1,
      detail,
      at: Date.now()
    });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">Codex Hackathon</p>
          <h1>Touchless Control</h1>
          <p className="subtitle">A browser-first control surface for voice, gesture, and presence.</p>
        </div>

        <div className="topbar-side">
          <div className="status-badges">
            {statusItems.map((item) => (
              <StatusBadge key={item.label} label={item.label} value={item.value} tone={item.tone} />
            ))}
          </div>

          <div className="toggle-row">
            <button className={`toggle-button ${gestureEnabled ? "active" : ""}`} onClick={() => setGestureEnabled((value) => !value)}>
              Gesture {gestureEnabled ? "On" : "Off"}
            </button>
            <button className={`toggle-button ${voiceEnabled ? "active" : ""}`} onClick={toggleVoice}>
              Voice {voiceEnabled ? "On" : "Off"}
            </button>
          </div>
        </div>
      </header>

      <main className="main-grid">
        <section className="panel live-panel">
          <div className="panel-bar">
            <span>Live feed</span>
            <strong>{lastIntent}</strong>
          </div>

          <div className="camera-shell">
            <video ref={videoRef} muted playsInline />
            <div className="camera-banner">
              <div className="banner-card">
                <span>Hearing</span>
                <strong>{heardText}</strong>
              </div>
              <div className="banner-card">
                <span>Gesture</span>
                <strong>{gestureHint}</strong>
              </div>
            </div>
          </div>

          <div className="gesture-guide">
            <span>Gesture guide</span>
            <div className="gesture-guide-steps">
              <strong>1 finger = Back</strong>
              <strong>2 fingers = Next</strong>
              <strong>Open palm = Pause</strong>
            </div>
            <p>{gestureGuide}</p>
            <div className="gesture-fallback-row">
              <button className="ghost-button" onClick={() => dispatchGestureDemo("BACK", "Gesture demo fallback: one finger")}>
                Demo 1 finger
              </button>
              <button className="ghost-button" onClick={() => dispatchGestureDemo("NEXT", "Gesture demo fallback: two fingers")}>
                Demo 2 fingers
              </button>
              <button className="ghost-button" onClick={() => dispatchGestureDemo("TOGGLE_PLAY", "Gesture demo fallback: open palm")}>
                Demo palm
              </button>
            </div>
          </div>

          <div className="metrics-row">
            <MetricChip label="Gesture" value={`${toPercent(gestureConfidence)}%`} />
            <MetricChip label="Motion" value={`${toPercent(motionScore)}%`} />
            <MetricChip label="Timer" value={formatTimer(timerSeconds)} />
            <MetricChip label="Platform" value="Win / Mac" />
          </div>

          <div className="support-row">
            <InfoCard label="How to gesture" value={gestureGuide} />
            <InfoCard label="Final phrase" value={lastFinalTranscript} />
            <InfoCard label="Matched" value={matchedCommandPreview} tone={matchedCommandPreview.includes("No command") ? "muted" : "good"} />
          </div>

          {cameraError ? <div className="inline-alert">{cameraError}</div> : null}
        </section>

        <section className="panel stage-panel">
          <div className="panel-bar">
            <span>Presentation mode</span>
            <strong className={`presence-text ${demoState.presence}`}>{demoState.presence}</strong>
          </div>

          <article className="slide-stage">
            <span className="slide-tag">
              {demoState.slideIndex + 1} / {slides.length}
            </span>
            <h2>{slides[demoState.slideIndex].title}</h2>
            <p>{slides[demoState.slideIndex].subtitle}</p>
            <strong>{slides[demoState.slideIndex].accent}</strong>
          </article>

          <div className="stage-stats">
            <StageStat label="Session" value={demoState.sessionStarted ? "Started" : "Ready"} />
            <StageStat label="Playback" value={demoState.isPlaying ? "Running" : "Paused"} />
            <StageStat label="Audio" value={demoState.isMuted ? "Muted" : "Live"} />
            <StageStat label="Last action" value={demoState.lastActionLabel} wide />
          </div>

          <div className="quick-actions">
            <button onClick={() => dispatchManual("START", "Manual start fallback")}>Start</button>
            <button onClick={() => dispatchManual("BACK", "Manual previous fallback")}>Prev</button>
            <button onClick={() => dispatchManual("NEXT", "Manual next fallback")}>Next</button>
            <button onClick={() => dispatchManual("TOGGLE_PLAY", "Manual open palm fallback")}>Pause</button>
            <button onClick={() => dispatchManual("MUTE", "Manual mute fallback")}>Mute</button>
            <button className="ghost-button" onClick={() => dispatchManual("USER_AWAY", "Manual away-state fallback")}>
              Away
            </button>
          </div>
        </section>

        <aside className="panel rail-panel">
          <div className="panel-bar">
            <span>Event log</span>
            <strong>{eventLog.length}</strong>
          </div>

          <div className="spotlight-card">
            <span>Latest</span>
            <strong>
              {latestEvent
                ? `${latestEvent.source.toUpperCase()} - ${latestEvent.command} - ${toPercent(latestEvent.confidence)}%`
                : "No command yet"}
            </strong>
          </div>

          <div className="log-list">
            {eventLog.length === 0 ? (
              <div className="empty-state">Commands will appear here.</div>
            ) : (
              eventLog.map((entry, index) => (
                <article className="log-item" key={`${entry.timeLabel}-${index}`}>
                  <div className="log-meta">
                    <span>{entry.timeLabel}</span>
                    <span>{entry.source}</span>
                    <span>{toPercent(entry.confidence)}%</span>
                  </div>
                  <strong>{entry.command}</strong>
                  <p>{entry.action}</p>
                </article>
              ))
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

function StatusBadge({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: StatusTone;
}) {
  return (
    <article className={`status-badge ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function InfoCard({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "muted" }) {
  return (
    <article className={`info-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function StageStat({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <article className={`stage-stat ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function toPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 100);
}
