import { useEffect, useRef, useState } from "react";
import { mapSpeechToCommand } from "../lib/commandRouter";
import type { CommandEvent, VoiceStatus } from "../types";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
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
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [lastHeard, setLastHeard] = useState("Waiting for a voice command");

  useEffect(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setVoiceStatus("unsupported");
      setLastHeard("SpeechRecognition is not available in this browser");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    stopRequestedRef.current = false;

    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex];
      if (!result || !result.isFinal) {
        return;
      }

      const transcript = result[0]?.transcript ?? "";
      const confidence = result[0]?.confidence ?? 0.72;
      setLastHeard(transcript);

      const command = mapSpeechToCommand(transcript);
      if (!command) {
        return;
      }

      onCommand({
        source: "voice",
        command,
        confidence,
        detail: transcript,
        at: Date.now()
      });
    };

    recognition.onerror = () => {
      setVoiceStatus("error");
      setLastHeard("Voice recognition hit an error");
    };

    recognition.onend = () => {
      if (stopRequestedRef.current) {
        return;
      }

      try {
        recognition.start();
        setVoiceStatus("listening");
      } catch (error) {
        console.error(error);
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setVoiceStatus("listening");
    } catch (error) {
      console.error(error);
      setVoiceStatus("error");
    }

    return () => {
      stopRequestedRef.current = true;
      recognition.stop();
    };
  }, [onCommand]);

  return {
    voiceStatus,
    lastHeard
  };
}
