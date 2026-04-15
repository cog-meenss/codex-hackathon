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
type PoseLabel = "ONE_FINGER" | "TWO_FINGERS" | "OPEN_PALM";
type GesturePose = {
  label: PoseLabel;
  command: NormalizedCommand;
  confidence: number;
  detail: string;
  preview: string;
};

const gestureCooldownMs = 1800;

export function useHandGestures({ enabled, videoRef, onCommand }: Options) {
  const detectorRef = useRef<handPoseDetection.HandDetector | null>(null);
  const trailRef = useRef<TrailPoint[]>([]);
  const lastTriggerAtRef = useRef(0);
  const loopTimerRef = useRef<number | null>(null);
  const poseLabelRef = useRef<PoseLabel | null>(null);
  const poseStreakRef = useRef(0);
  const [detectorStatus, setDetectorStatus] = useState<DetectorStatus>("off");
  const [gestureHint, setGestureHint] = useState("Gesture control is off");
  const [gestureConfidence, setGestureConfidence] = useState(0);

  useEffect(() => {
    return () => {
      detectorRef.current?.dispose();
      detectorRef.current = null;
      if (loopTimerRef.current) {
        window.clearTimeout(loopTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function prepareDetector() {
      if (!enabled) {
        setDetectorStatus("off");
        setGestureHint("Gesture control is off");
        setGestureConfidence(0);
        trailRef.current = [];
        poseLabelRef.current = null;
        poseStreakRef.current = 0;
        if (loopTimerRef.current) {
          window.clearTimeout(loopTimerRef.current);
        }
        return;
      }

      if (detectorRef.current) {
        setDetectorStatus("ready");
        setGestureHint("Show 1 finger, 2 fingers, or an open palm to the camera.");
        return;
      }

      try {
        setDetectorStatus("loading");
        setGestureHint("Loading TensorFlow.js hand detector");
        await tf.setBackend("webgl");
        await tf.ready();

        const detector = await handPoseDetection.createDetector(handPoseDetection.SupportedModels.MediaPipeHands, {
          runtime: "tfjs",
          modelType: "full",
          maxHands: 1
        });

        if (cancelled) {
          detector.dispose();
          return;
        }

        detectorRef.current = detector;
        setDetectorStatus("ready");
        setGestureHint("Show 1 finger, 2 fingers, or an open palm to the camera.");
      } catch (error) {
        console.error(error);
        setDetectorStatus("error");
        setGestureHint("TensorFlow.js hand detection failed to initialize");
      }
    }

    void prepareDetector();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || detectorStatus !== "ready") {
      if (loopTimerRef.current) {
        window.clearTimeout(loopTimerRef.current);
      }
      return;
    }

    let cancelled = false;

    const runInference = async () => {
      const detector = detectorRef.current;
      const video = videoRef.current;
      if (!detector || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        if (!cancelled) {
          loopTimerRef.current = window.setTimeout(runInference, 160);
        }
        return;
      }

      try {
        const hands = await detector.estimateHands(video, { flipHorizontal: true });
        const hand = hands[0];

        if (!hand || !hand.keypoints?.length) {
          setGestureHint("Show one hand clearly to the camera.");
          setGestureConfidence(0);
          trailRef.current = [];
          poseLabelRef.current = null;
          poseStreakRef.current = 0;
        } else {
          const keypoints = hand.keypoints as Point[];
          const palmCenter = getPalmCenter(keypoints);
          const handSpan = getHandSpan(keypoints);
          const now = Date.now();

          if (!Number.isFinite(palmCenter.x) || !Number.isFinite(palmCenter.y) || !Number.isFinite(handSpan) || handSpan <= 0) {
            setGestureHint("Hand landmarks are unstable. Re-center your open palm in the camera.");
            setGestureConfidence(0);
            trailRef.current = [];
            poseLabelRef.current = null;
            poseStreakRef.current = 0;
            if (!cancelled) {
              loopTimerRef.current = window.setTimeout(runInference, 160);
            }
            return;
          }

          trailRef.current.push({ x: palmCenter.x, y: palmCenter.y, at: now });
          trailRef.current = trailRef.current.filter((point) => now - point.at < 900);

          const pose = classifyGesturePose(keypoints, trailRef.current, handSpan);

          if (pose) {
            if (poseLabelRef.current === pose.label) {
              poseStreakRef.current += 1;
            } else {
              poseLabelRef.current = pose.label;
              poseStreakRef.current = 1;
            }

            if (poseStreakRef.current >= 3 && now - lastTriggerAtRef.current > gestureCooldownMs) {
              lastTriggerAtRef.current = now;
              emitGesture(onCommand, pose.command, pose.confidence, pose.detail, now);
              setGestureHint(pose.detail);
              setGestureConfidence(pose.confidence);
              trailRef.current = [];
              poseLabelRef.current = null;
              poseStreakRef.current = 0;
            } else {
              setGestureHint(pose.preview);
              setGestureConfidence(pose.confidence);
            }
          } else {
            poseLabelRef.current = null;
            poseStreakRef.current = 0;
            setGestureHint("Show 1 finger for back, 2 fingers for next, or open palm for pause.");
            setGestureConfidence(clamp(handSpan / 220, 0.28, 0.72));
          }
        }
      } catch (error) {
        console.error(error);
        setDetectorStatus("error");
        setGestureHint("Hand inference failed");
      }

      if (!cancelled) {
        loopTimerRef.current = window.setTimeout(runInference, 160);
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

function classifyGesturePose(keypoints: Point[], trail: TrailPoint[], handSpan: number): GesturePose | null {
  if (keypoints.length < 21) {
    return null;
  }

  const indexExtended = isFingerExtended(keypoints[5], keypoints[6], keypoints[8]);
  const middleExtended = isFingerExtended(keypoints[9], keypoints[10], keypoints[12]);
  const ringExtended = isFingerExtended(keypoints[13], keypoints[14], keypoints[16]);
  const pinkyExtended = isFingerExtended(keypoints[17], keypoints[18], keypoints[20]);
  const thumbOpen = isThumbOpen(keypoints);
  const stillness = averageMovement(trail.slice(-4));

  if (stillness > Math.max(handSpan * 0.22, 10)) {
    return null;
  }

  if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return {
      label: "ONE_FINGER",
      command: "BACK",
      confidence: 0.9,
      detail: "One finger detected - moving to the previous slide",
      preview: "One finger seen. Hold steady to go back."
    };
  }

  if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
    return {
      label: "TWO_FINGERS",
      command: "NEXT",
      confidence: 0.92,
      detail: "Two fingers detected - moving to the next slide",
      preview: "Two fingers seen. Hold steady to go next."
    };
  }

  if (indexExtended && middleExtended && ringExtended && pinkyExtended && thumbOpen) {
    return {
      label: "OPEN_PALM",
      command: "TOGGLE_PLAY",
      confidence: 0.94,
      detail: "Open palm detected - toggling pause or resume",
      preview: "Open palm seen. Hold steady to pause or resume."
    };
  }

  return null;
}

function getPalmCenter(keypoints: Point[]) {
  const anchors = [0, 5, 9, 13, 17].map((index) => keypoints[index]);
  if (anchors.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return { x: Number.NaN, y: Number.NaN };
  }
  const total = anchors.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y
    }),
    { x: 0, y: 0 }
  );

  return {
    x: total.x / anchors.length,
    y: total.y / anchors.length
  };
}

function getHandSpan(keypoints: Point[]) {
  if ([5, 17, 8, 20].some((index) => !keypoints[index] || !Number.isFinite(keypoints[index].x) || !Number.isFinite(keypoints[index].y))) {
    return Number.NaN;
  }

  const palmWidth = distance(keypoints[5], keypoints[17]);
  const fingertipSpread = distance(keypoints[8], keypoints[20]);
  return Math.max(palmWidth, fingertipSpread);
}

function averageMovement(trail: TrailPoint[]) {
  if (trail.length < 2) {
    return 0;
  }

  let total = 0;
  for (let index = 1; index < trail.length; index += 1) {
    total += distance(trail[index - 1], trail[index]);
  }

  return total / (trail.length - 1);
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isFingerExtended(mcp: Point, pip: Point, tip: Point) {
  return tip.y < pip.y - 8 && pip.y < mcp.y - 2;
}

function isThumbOpen(keypoints: Point[]) {
  const thumbTip = keypoints[4];
  const thumbIp = keypoints[3];
  const indexMcp = keypoints[5];
  const pinkyMcp = keypoints[17];
  const palmWidth = distance(indexMcp, pinkyMcp);

  if (!Number.isFinite(palmWidth) || palmWidth <= 0) {
    return false;
  }

  return Math.abs(thumbTip.x - indexMcp.x) > palmWidth * 0.38 && thumbTip.y < thumbIp.y + palmWidth * 0.2;
}
