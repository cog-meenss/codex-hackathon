export type CommandSource = "gesture" | "voice" | "vision" | "manual";

export type NormalizedCommand =
  | "NEXT"
  | "BACK"
  | "START"
  | "STOP"
  | "MUTE"
  | "UNMUTE"
  | "TOGGLE_PLAY"
  | "USER_PRESENT"
  | "USER_AWAY";

export type DemoAction =
  | "ADVANCE_SLIDE"
  | "REWIND_SLIDE"
  | "START_SESSION"
  | "STOP_SESSION"
  | "MUTE_AUDIO"
  | "UNMUTE_AUDIO"
  | "TOGGLE_PLAYBACK"
  | "MARK_PRESENT"
  | "MARK_AWAY";

export type PresenceState = "present" | "away";
export type DetectorStatus = "idle" | "loading" | "ready" | "unsupported" | "error";
export type CameraStatus = "requesting" | "ready" | "error";
export type VoiceStatus = "listening" | "unsupported" | "error" | "idle";

export type CommandEvent = {
  source: CommandSource;
  command: NormalizedCommand;
  confidence: number;
  detail: string;
  at: number;
};

export type EventLogEntry = CommandEvent & {
  action: DemoAction;
  timeLabel: string;
};

export type DemoState = {
  slideIndex: number;
  isPlaying: boolean;
  isMuted: boolean;
  sessionStarted: boolean;
  presence: PresenceState;
  lastActionLabel: string;
};

export type CommandOutcome = {
  action: DemoAction;
  nextState: DemoState;
};
