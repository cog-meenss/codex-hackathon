import { useEffect, useRef, useState, type RefObject } from "react";
import * as handPoseDetection from "@tensorflow-models/hand-pose-detection";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import { clamp } from "../lib/commandRouter";
import type { CommandEvent, DetectorStatus, NormalizedCommand } from "../types";

type Options = {
  enabled: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  onCommand: (event: CommandEvent) => void;
};

type Point = { x: number; y: number };
type TrailPoint = Point & { at: number };

const gestureCooldownMs = 1700;

export function useHandGestures({ enabled, videoRef, onCommand }: Options) {
  const detectorRef = useRef<handPoseDetection.HandDetector | null>(null);
  const trailRef = useRef<TrailPoint[]>([]);
  const lastTriggerAtRef = useRef(0);
  const loopTimerRef = useRef<number | null>(null);
  const [detectorStatus, setDetectorStatus] = useState<DetectorStatus>("loading");
  const [gestureHint, setGestureHint] = useState("Loading TensorFlow.js hand detector");
  const [gestureConfidence, setGestureConfidence] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadDetector() {
      try {
        setDetectorStatus("loading");
        await tf.setBackend("webgl");
        await tf.ready();

        const detector = await handPoseDetection.createDetector(handPoseDetection.SupportedModels.MediaPipeHands, {
          runtime: "tfjs",
          modelType: "lite",
          maxHands: 1
        });

        if (cancelled) {
          detector.dispose();
          return;
        }

        detectorRef.current = detector;
        setDetectorStatus("ready");
        setGestureHint("Show one hand and swipe left, swipe right, or open your palm");
      } catch (error) {
        console.error(error);
        setDetectorStatus("error");
        setGestureHint("TensorFlow.js hand detection failed to initialize");
      }
    }

    loadDetector();

    return () => {
      cancelled = true;
      detectorRef.current?.dispose();
      detectorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled || detectorStatus !== "ready") {
      return;
    }

    let cancelled = false;

    const runInference = async () => {
      const detector = detectorRef.current;
      const video = videoRef.current;
      if (!detector || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        if (!cancelled) {
          loopTimerRef.current = window.setTimeout(runInference, 220);
        }
        return;
      }

      try {
        const hands = await detector.estimateHands(video, { flipHorizontal: true });
        const hand = hands[0];

        if (!hand || !hand.keypoints?.length) {
          setGestureHint("Hand not detected. Raise one hand in front of the camera.");
          setGestureConfidence(0);
          trailRef.current = [];
        } else {
          const keypoints = hand.keypoints as Point[];
          const wrist = keypoints[0];
          const now = Date.now();

          trailRef.current.push({ x: wrist.x, y: wrist.y, at: now });
          trailRef.current = trailRef.current.filter((point) => now - point.at < 800);

          const swipe = detectSwipe(trailRef.current, video.videoWidth || 640);
          const openPalm = detectOpenPalm(keypoints);

          if (swipe && now - lastTriggerAtRef.current > gestureCooldownMs) {
            lastTriggerAtRef.current = now;
            emitGesture(onCommand, swipe.command, swipe.confidence, swipe.detail, now);
            setGestureHint(swipe.detail);
            setGestureConfidence(swipe.confidence);
            trailRef.current = [];
          } else if (openPalm && now - lastTriggerAtRef.current > gestureCooldownMs) {
            lastTriggerAtRef.current = now;
            emitGesture(onCommand, "TOGGLE_PLAY", openPalm.confidence, openPalm.detail, now);
            setGestureHint(openPalm.detail);
            setGestureConfidence(openPalm.confidence);
            trailRef.current = [];
          } else {
            setGestureHint(openPalm ? openPalm.detail : "Tracking hand landmarks");
            setGestureConfidence(openPalm ? openPalm.confidence : 0.32);
          }
        }
      } catch (error) {
        console.error(error);
        setDetectorStatus("error");
        setGestureHint("Hand inference failed");
      }

      if (!cancelled) {
        loopTimerRef.current = window.setTimeout(runInference, 220);
      }
    };

    void runInference();

    return () => {
      cancelled = true;
      if (loopTimerRef.current) {
        window.clearTimeout(loopTimerRef.current);
      }
    };
  }, [detectorStatus, enabled, onCommand, videoRef]);

  return {
    detectorStatus,
    gestureHint,
    gestureConfidence
  };
}

function emitGesture(
  onCommand: (event: CommandEvent) => void,
  command: NormalizedCommand,
  confidence: number,
  detail: string,
  at: number
) {
  onCommand({
    source: "gesture",
    command,
    confidence,
    detail,
    at
  });
}

function detectSwipe(trail: TrailPoint[], frameWidth: number) {
  if (trail.length < 3) {
    return null;
  }

  const first = trail[0];
  const last = trail[trail.length - 1];
  const deltaX = last.x - first.x;
  const deltaY = last.y - first.y;

  if (Math.abs(deltaX) < frameWidth * 0.16 || Math.abs(deltaY) > frameWidth * 0.09) {
    return null;
  }

  const confidence = clamp(Math.abs(deltaX) / (frameWidth * 0.32), 0.68, 0.97);
  const command: NormalizedCommand = deltaX > 0 ? "NEXT" : "BACK";
  return {
    command,
    confidence,
    detail: deltaX > 0 ? "Detected right swipe gesture" : "Detected left swipe gesture"
  };
}

function detectOpenPalm(keypoints: Point[]) {
  if (keypoints.length < 21) {
    return null;
  }

  const thumbTip = keypoints[4];
  const indexMcp = keypoints[5];
  const indexTip = keypoints[8];
  const middleMcp = keypoints[9];
  const middleTip = keypoints[12];
  const ringMcp = keypoints[13];
  const ringTip = keypoints[16];
  const pinkyMcp = keypoints[17];
  const pinkyTip = keypoints[20];

  const extendedCount = [indexTip.y < indexMcp.y, middleTip.y < middleMcp.y, ringTip.y < ringMcp.y, pinkyTip.y < pinkyMcp.y].filter(Boolean)
    .length;
  const palmWidth = distance(indexMcp, pinkyMcp);
  const tipSpread = distance(indexTip, pinkyTip);
  const thumbOpen = Math.abs(thumbTip.x - indexMcp.x) > palmWidth * 0.45;

  if (extendedCount < 4 || !thumbOpen || palmWidth === 0) {
    return null;
  }

  const opennessScore = tipSpread / palmWidth;
  if (opennessScore < 1.45) {
    return null;
  }

  return {
    confidence: clamp(opennessScore / 2.1, 0.7, 0.95),
    detail: "Detected open palm gesture"
  };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
