import type { CommandOutcome, DemoState, NormalizedCommand } from "../types";

export const initialDemoState: DemoState = {
  slideIndex: 0,
  isPlaying: false,
  isMuted: false,
  sessionStarted: false,
  presence: "present",
  lastActionLabel: "Waiting for the first gesture or voice command"
};

export function applyCommand(current: DemoState, command: NormalizedCommand, slideCount: number): CommandOutcome {
  switch (command) {
    case "NEXT":
      return {
        action: "ADVANCE_SLIDE",
        nextState: {
          ...current,
          slideIndex: (current.slideIndex + 1) % slideCount,
          sessionStarted: true,
          presence: "present",
          lastActionLabel: "Moved to the next slide"
        }
      };
    case "BACK":
      return {
        action: "REWIND_SLIDE",
        nextState: {
          ...current,
          slideIndex: current.slideIndex === 0 ? slideCount - 1 : current.slideIndex - 1,
          sessionStarted: true,
          presence: "present",
          lastActionLabel: "Moved to the previous slide"
        }
      };
    case "START":
      return {
        action: "START_SESSION",
        nextState: {
          ...current,
          isPlaying: true,
          sessionStarted: true,
          presence: "present",
          lastActionLabel: "Session started"
        }
      };
    case "STOP":
      return {
        action: "STOP_SESSION",
        nextState: {
          ...current,
          isPlaying: false,
          lastActionLabel: "Session stopped"
        }
      };
    case "MUTE":
      return {
        action: "MUTE_AUDIO",
        nextState: {
          ...current,
          isMuted: true,
          sessionStarted: true,
          lastActionLabel: "Audio muted"
        }
      };
    case "UNMUTE":
      return {
        action: "UNMUTE_AUDIO",
        nextState: {
          ...current,
          isMuted: false,
          sessionStarted: true,
          lastActionLabel: "Audio restored"
        }
      };
    case "TOGGLE_PLAY":
      return {
        action: "TOGGLE_PLAYBACK",
        nextState: {
          ...current,
          isPlaying: !current.isPlaying,
          sessionStarted: true,
          presence: "present",
          lastActionLabel: current.isPlaying ? "Presentation paused by gesture" : "Presentation resumed by gesture"
        }
      };
    case "USER_AWAY":
      return {
        action: "MARK_AWAY",
        nextState: {
          ...current,
          isPlaying: false,
          presence: "away",
          lastActionLabel: "Session auto-paused because the user stepped away"
        }
      };
    case "USER_PRESENT":
      return {
        action: "MARK_PRESENT",
        nextState: {
          ...current,
          presence: "present",
          lastActionLabel: "User presence detected again"
        }
      };
    default:
      return {
        action: "MARK_PRESENT",
        nextState: current
      };
  }
}

const voicePhraseMap: Array<{ phrases: string[]; command: NormalizedCommand }> = [
  { phrases: ["next", "next slide", "forward"], command: "NEXT" },
  { phrases: ["back", "previous", "previous slide"], command: "BACK" },
  { phrases: ["start", "begin", "resume session"], command: "START" },
  { phrases: ["stop", "pause session", "halt"], command: "STOP" },
  { phrases: ["mute", "mute audio"], command: "MUTE" },
  { phrases: ["unmute", "restore audio"], command: "UNMUTE" }
];

export function mapSpeechToCommand(transcript: string): NormalizedCommand | null {
  const normalized = transcript.trim().toLowerCase();
  const match = voicePhraseMap.find((entry) => entry.phrases.some((phrase) => normalized.includes(phrase)));
  return match?.command ?? null;
}

export function formatTimeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
