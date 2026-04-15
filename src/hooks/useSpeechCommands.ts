import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { mapSpeechToCommand } from "../lib/commandRouter";
import type { CommandEvent, VoiceStatus } from "../types";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onaudiostart?: (() => void) | null;
  onspeechstart?: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<{
    isFinal: boolean;
    0: {
      transcript: string;
      confidence: number;
    };
  }>;
  resultIndex: number;
};

type SpeechRecognitionErrorEventLike = {
  error: string;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

type Options = {
  onCommand: (event: CommandEvent) => void;
};

export function useSpeechCommands({ onCommand }: Options) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const stopRequestedRef = useRef(false);
  const voiceEnabledRef = useRef(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("off");
  const [heardText, setHeardText] = useState("Voice control is off");
  const [lastFinalTranscript, setLastFinalTranscript] = useState("No final transcript yet");
  const [matchedCommandPreview, setMatchedCommandPreview] = useState("No command matched yet");

  useEffect(() => {
    return () => {
      stopRequestedRef.current = true;
      voiceEnabledRef.current = false;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  function startVoice() {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setVoiceStatus("unsupported");
      setHeardText("SpeechRecognition is not available in this browser");
      return;
    }

    if (!recognitionRef.current) {
      recognitionRef.current = createRecognition(SpeechRecognitionCtor, {
        onCommand,
        setVoiceStatus,
        setVoiceEnabled,
        setHeardText,
        setLastFinalTranscript,
        setMatchedCommandPreview,
        stopRequestedRef,
        voiceEnabledRef
      });
    }

    try {
      stopRequestedRef.current = false;
      voiceEnabledRef.current = true;
      setVoiceEnabled(true);
      setVoiceStatus("listening");
      setHeardText("Listening for voice commands");
      recognitionRef.current.start();
    } catch (error) {
      console.error(error);
      setVoiceStatus("error");
      setHeardText("Voice recognition could not start. Try toggling voice on again in Chrome or Edge.");
    }
  }

  function stopVoice() {
    stopRequestedRef.current = true;
    voiceEnabledRef.current = false;
    setVoiceEnabled(false);
    setVoiceStatus("off");
    setHeardText("Voice control is off");
    recognitionRef.current?.stop();
  }

  function toggleVoice() {
    if (voiceEnabledRef.current) {
      stopVoice();
      return;
    }

    startVoice();
  }

  return {
    voiceEnabled,
    voiceStatus,
    heardText,
    lastFinalTranscript,
    matchedCommandPreview,
    startVoice,
    stopVoice,
    toggleVoice
  };
}

function createRecognition(
  SpeechRecognitionCtor: new () => SpeechRecognitionLike,
  context: {
    onCommand: (event: CommandEvent) => void;
    setVoiceStatus: (status: VoiceStatus) => void;
    setVoiceEnabled: (enabled: boolean) => void;
    setHeardText: (message: string) => void;
    setLastFinalTranscript: (message: string) => void;
    setMatchedCommandPreview: (message: string) => void;
    stopRequestedRef: MutableRefObject<boolean>;
    voiceEnabledRef: MutableRefObject<boolean>;
  }
) {
  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";

  recognition.onaudiostart = () => {
    context.setHeardText("Microphone is active. Speak a short command like start or next.");
  };

  recognition.onspeechstart = () => {
    context.setHeardText("Speech detected. Processing...");
  };

  recognition.onresult = (event) => {
    let interimTranscript = "";
    let finalTranscript = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result?.[0]?.transcript?.trim() ?? "";
      if (!transcript) {
        continue;
      }

      if (result.isFinal) {
        finalTranscript += `${transcript} `;
      } else {
        interimTranscript += `${transcript} `;
      }
    }

    const interimText = interimTranscript.trim();
    const finalText = finalTranscript.trim();

    if (interimText) {
      context.setHeardText(interimText);
    }

    if (!finalText) {
      return;
    }

    const result = event.results[event.resultIndex];
    const confidence = result?.[0]?.confidence ?? 0.72;
    context.setHeardText(finalText);
    context.setLastFinalTranscript(finalText);

    const command = mapSpeechToCommand(finalText);
    if (!command) {
      context.setMatchedCommandPreview("No command match from the latest phrase");
      return;
    }

    context.setMatchedCommandPreview(command);
    context.onCommand({
      source: "voice",
      command,
      confidence,
      detail: finalText,
      at: Date.now()
    });
  };

  recognition.onerror = (event) => {
    const { nextStatus, message, turnOff } = mapSpeechError(event.error, context.stopRequestedRef.current);
    context.setVoiceStatus(nextStatus);
    context.setHeardText(message);
    if (turnOff) {
      context.voiceEnabledRef.current = false;
      context.setVoiceEnabled(false);
    }
  };

  recognition.onend = () => {
    if (context.stopRequestedRef.current || !context.voiceEnabledRef.current) {
      return;
    }

    try {
      recognition.start();
      context.setVoiceStatus("listening");
    } catch (error) {
      console.error(error);
      context.setVoiceStatus("error");
      context.setHeardText("Voice recognition could not restart. Toggle voice off and on to retry.");
    }
  };

  return recognition;
}

function mapSpeechError(error: string, stopRequested: boolean) {
  if (stopRequested || error === "aborted") {
    return {
      nextStatus: "off" as const,
      message: "Voice control is off",
      turnOff: true
    };
  }

  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return {
        nextStatus: "error" as const,
        message: "Microphone permission blocked. Allow mic access in the browser and try Voice ON again.",
        turnOff: true
      };
    case "audio-capture":
      return {
        nextStatus: "error" as const,
        message: "No microphone was found or it is being used by another app.",
        turnOff: true
      };
    case "network":
      return {
        nextStatus: "error" as const,
        message: "Speech recognition hit a network error. Chrome speech recognition may need network access.",
        turnOff: false
      };
    case "no-speech":
      return {
        nextStatus: "listening" as const,
        message: "No speech detected yet. Try a short command like start or next.",
        turnOff: false
      };
    default:
      return {
        nextStatus: "error" as const,
        message: `Voice recognition error: ${error}`,
        turnOff: false
      };
  }
}
