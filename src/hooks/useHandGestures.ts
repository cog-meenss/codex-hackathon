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

type DetectedGesture = {
  command: NormalizedCommand;
  confidence: number;
  detail: string;
  preview: string;
};

type DetectedPose = DetectedGesture & {
  key: "ONE_FINGER" | "TWO_FINGERS" | "OPEN_PALM";
  requiredFrames: number;
};

const gestureCooldownMs = 1500;

export function useHandGestures({ enabled, videoRef, onCommand }: Options) {
  const detectorRef = useRef<handPoseDetection.HandDetector | null>(null);
  const trailRef = useRef<TrailPoint[]>([]);
  const loopTimerRef = useRef<number | null>(null);
  const lastTriggerAtRef = useRef(0);
  const heldPoseRef = useRef<{ key: DetectedPose["key"] | null; frames: number }>({
    key: null,
    frames: 0
  });

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
        heldPoseRef.current = { key: null, frames: 0 };
        if (loopTimerRef.current) {
          window.clearTimeout(loopTimerRef.current);
        }
        return;
      }

      if (detectorRef.current) {
        setDetectorStatus("ready");
        setGestureHint("Hold 1 or 2 fingers steady, or show an open palm.");
        return;
      }

      try {
        setDetectorStatus("loading");
        setGestureHint("Loading hand detector");
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
        setGestureHint("Hold 1 or 2 fingers steady, or show an open palm.");
      } catch (error) {
        console.error(error);
        setDetectorStatus("error");
        setGestureHint("Hand detector could not initialize");
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
          loopTimerRef.current = window.setTimeout(runInference, 140);
        }
        return;
      }

      try {
        const hands = await detector.estimateHands(video, { flipHorizontal: true });
        const hand = hands[0];

        if (!hand || !hand.keypoints || hand.keypoints.length < 21) {
          setGestureHint("Show one open palm to the camera.");
          setGestureConfidence(0);
          trailRef.current = [];
          heldPoseRef.current = { key: null, frames: 0 };
        } else {
          const keypoints = hand.keypoints as Point[];
          const center = getStableCenter(keypoints);
          const handSpan = getHandSpan(keypoints);
          const now = Date.now();

          if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(handSpan) || handSpan <= 0) {
            setGestureHint("Move your palm closer to the camera.");
            setGestureConfidence(0);
            trailRef.current = [];
            heldPoseRef.current = { key: null, frames: 0 };
            if (!cancelled) {
              loopTimerRef.current = window.setTimeout(runInference, 140);
            }
            return;
          }

          trailRef.current.push({ x: center.x, y: center.y, at: now });
          trailRef.current = trailRef.current.filter((point) => now - point.at < 900);

          const swipe = detectSwipe(trailRef.current, video.videoWidth || 640, video.videoHeight || 480, handSpan);
          const pose = detectPose(keypoints, trailRef.current, handSpan);

          if (pose) {
            if (heldPoseRef.current.key === pose.key) {
              heldPoseRef.current.frames += 1;
            } else {
              heldPoseRef.current = { key: pose.key, frames: 1 };
            }
          } else {
            heldPoseRef.current = { key: null, frames: 0 };
          }

          if (swipe && now - lastTriggerAtRef.current > gestureCooldownMs) {
            lastTriggerAtRef.current = now;
            emitGesture(onCommand, swipe.command, swipe.confidence, swipe.detail, now);
            setGestureHint(swipe.detail);
            setGestureConfidence(swipe.confidence);
            trailRef.current = [];
            heldPoseRef.current = { key: null, frames: 0 };
          } else if (
            pose &&
            heldPoseRef.current.key === pose.key &&
            heldPoseRef.current.frames >= pose.requiredFrames &&
            now - lastTriggerAtRef.current > gestureCooldownMs
          ) {
            lastTriggerAtRef.current = now;
            emitGesture(onCommand, pose.command, pose.confidence, pose.detail, now);
            setGestureHint(pose.detail);
            setGestureConfidence(pose.confidence);
            trailRef.current = [];
            heldPoseRef.current = { key: null, frames: 0 };
          } else if (pose) {
            setGestureHint(pose.preview);
            setGestureConfidence(pose.confidence);
          } else {
            setGestureHint("Hand seen. Hold 1 finger, 2 fingers, or an open palm.");
            setGestureConfidence(clamp(handSpan / 190, 0.24, 0.82));
          }
        }
      } catch (error) {
        console.error(error);
        setDetectorStatus("error");
        setGestureHint("Hand tracking failed");
      }

      if (!cancelled) {
        loopTimerRef.current = window.setTimeout(runInference, 140);
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

function detectSwipe(trail: TrailPoint[], frameWidth: number, frameHeight: number, handSpan: number): DetectedGesture | null {
  const samples = trail.slice(-7);
  if (samples.length < 4) {
    return null;
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const netDx = last.x - first.x;
  const netDy = last.y - first.y;
  const duration = last.at - first.at;

  if (duration < 100 || duration > 850) {
    return null;
  }

  let horizontalTravel = 0;
  let verticalTravel = 0;
  let consistentHorizontalSteps = 0;

  const direction = Math.sign(netDx);
  for (let index = 1; index < samples.length; index += 1) {
    const dx = samples[index].x - samples[index - 1].x;
    const dy = samples[index].y - samples[index - 1].y;
    horizontalTravel += Math.abs(dx);
    verticalTravel += Math.abs(dy);

    if (Math.sign(dx) === direction && Math.abs(dx) > 2) {
      consistentHorizontalSteps += 1;
    }
  }

  const minDistance = Math.max(frameWidth * 0.06, handSpan * 0.55, 36);
  const consistency = consistentHorizontalSteps / Math.max(samples.length - 1, 1);
  const mostlyHorizontal = horizontalTravel > verticalTravel * 1.05;
  const limitedVerticalDrift = Math.abs(netDy) < Math.max(frameHeight * 0.18, handSpan);

  if (
    Math.abs(netDx) < minDistance ||
    horizontalTravel < minDistance * 1.05 ||
    !mostlyHorizontal ||
    !limitedVerticalDrift ||
    consistency < 0.34
  ) {
    return null;
  }

  const confidence = clamp(Math.abs(netDx) / (minDistance * 1.25) + consistency * 0.15, 0.68, 0.98);
  const command: NormalizedCommand = netDx > 0 ? "NEXT" : "BACK";

  return {
    command,
    confidence,
    detail: netDx > 0 ? "Right swipe detected - next slide" : "Left swipe detected - previous slide",
    preview: netDx > 0 ? "Right swipe in progress" : "Left swipe in progress"
  };
}

function detectPose(keypoints: Point[], trail: TrailPoint[], handSpan: number): DetectedPose | null {
  const wrist = keypoints[0];
  const indexExtended = isFingerExtended(wrist, keypoints[5], keypoints[6], keypoints[8]);
  const middleExtended = isFingerExtended(wrist, keypoints[9], keypoints[10], keypoints[12]);
  const ringExtended = isFingerExtended(wrist, keypoints[13], keypoints[14], keypoints[16]);
  const pinkyExtended = isFingerExtended(wrist, keypoints[17], keypoints[18], keypoints[20]);
  const thumbOpen = isThumbOpen(keypoints);
  const stillness = averageMovement(trail.slice(-4));

  if (stillness > Math.max(handSpan * 0.18, 9)) {
    return null;
  }

  if (indexExtended && middleExtended && ringExtended && pinkyExtended && thumbOpen) {
    return {
      key: "OPEN_PALM",
      command: "TOGGLE_PLAY",
      confidence: 0.92,
      detail: "Open palm detected - pause or resume",
      preview: "Open palm seen. Hold steady to pause or resume.",
      requiredFrames: 3
    };
  }

  if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return {
      key: "ONE_FINGER",
      command: "BACK",
      confidence: 0.84,
      detail: "One-finger hold detected - previous slide",
      preview: "One finger seen. Hold steady to go back.",
      requiredFrames: 2
    };
  }

  if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
    return {
      key: "TWO_FINGERS",
      command: "NEXT",
      confidence: 0.88,
      detail: "Two-finger hold detected - next slide",
      preview: "Two fingers seen. Hold steady to advance.",
      requiredFrames: 2
    };
  }

  return null;
}

function getStableCenter(keypoints: Point[]) {
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
  const left = keypoints[5];
  const right = keypoints[17];
  const top = keypoints[12];
  const base = keypoints[0];

  if ([left, right, top, base].some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return Number.NaN;
  }

  return Math.max(distance(left, right), distance(top, base));
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

function isFingerExtended(wrist: Point, mcp: Point, pip: Point, tip: Point) {
  const tipAbovePip = tip.y < pip.y - 4;
  const pipAboveBase = pip.y < mcp.y + 6;
  const wristReach = distance(wrist, tip) > distance(wrist, pip) * 1.08;
  return tipAbovePip && pipAboveBase && wristReach;
}

function isThumbOpen(keypoints: Point[]) {
  const thumbTip = keypoints[4];
  const indexMcp = keypoints[5];
  const pinkyMcp = keypoints[17];
  const palmWidth = distance(indexMcp, pinkyMcp);

  if (!Number.isFinite(palmWidth) || palmWidth <= 0) {
    return false;
  }

  return Math.abs(thumbTip.x - indexMcp.x) > palmWidth * 0.3;
}
