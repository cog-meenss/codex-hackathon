import { useEffect, useRef, useState, type RefObject } from "react";
import { clamp } from "../lib/commandRouter";
import type { CommandEvent } from "../types";

type Options = {
  enabled: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onCommand: (event: CommandEvent) => void;
};

const awayThresholdMs = 10000;

export function usePresenceMonitor({ enabled, videoRef, onCommand }: Options) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastFrameRef = useRef<Uint8ClampedArray | null>(null);
  const lastActiveAtRef = useRef(Date.now());
  const awayRef = useRef(false);
  const [motionScore, setMotionScore] = useState(0);
  const [presenceHint, setPresenceHint] = useState("Watching for user activity");

  useEffect(() => {
    if (!enabled || !videoRef.current) {
      return;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return;
    }

    canvasRef.current = canvas;
    canvas.width = 192;
    canvas.height = 108;

    const intervalId = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      const grayscale = new Uint8ClampedArray(canvas.width * canvas.height);

      for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
        grayscale[pixel] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      }

      const previousFrame = lastFrameRef.current;
      let totalMotion = 0;

      if (previousFrame) {
        for (let i = 0; i < grayscale.length; i += 1) {
          const diff = Math.abs(grayscale[i] - previousFrame[i]);
          if (diff > 28) {
            totalMotion += diff;
          }
        }
      }

      lastFrameRef.current = grayscale;
      const now = Date.now();
      const nextMotionScore = clamp(totalMotion / 20000, 0, 1);
      setMotionScore(nextMotionScore);

      if (totalMotion > 7000) {
        lastActiveAtRef.current = now;
        setPresenceHint("Activity detected in frame");

        if (awayRef.current) {
          awayRef.current = false;
          onCommand({
            source: "vision",
            command: "USER_PRESENT",
            confidence: 0.84,
            detail: "Motion resumed in camera frame",
            at: now
          });
        }

        return;
      }

      if (!awayRef.current && now - lastActiveAtRef.current > awayThresholdMs) {
        awayRef.current = true;
        setPresenceHint("No motion detected for 10 seconds");
        onCommand({
          source: "vision",
          command: "USER_AWAY",
          confidence: 0.8,
          detail: "No meaningful motion detected for 10 seconds",
          at: now
        });
      }
    }, 350);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, onCommand, videoRef]);

  return {
    motionScore,
    presenceHint
  };
}
