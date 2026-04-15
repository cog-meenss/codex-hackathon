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

const gestureCooldownMs = 1800;

export function useHandGestures({ enabled, videoRef, onCommand }: Options) {
  const detectorRef = useRef<handPoseDetection.HandDetector | null>(null);
  const trailRef = useRef<TrailPoint[]>([]);
  const lastTriggerAtRef = useRef(0);
  const loopTimerRef = useRef<number | null>(null);
  const openPalmStreakRef = useRef(0);
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
        openPalmStreakRef.current = 0;
        if (loopTimerRef.current) {
          window.clearTimeout(loopTimerRef.current);
        }
        return;
      }

      if (detectorRef.current) {
        setDetectorStatus("ready");
        setGestureHint("Open your palm to the camera, then move your whole hand left or right.");
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
        setGestureHint("Open your palm to the camera, then move your whole hand left or right.");
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
          setGestureHint("Show one open palm facing the camera.");
          setGestureConfidence(0);
          trailRef.current = [];
          openPalmStreakRef.current = 0;
        } else {
          const keypoints = hand.keypoints as Point[];
          const palmCenter = getPalmCenter(keypoints);
          const handSpan = getHandSpan(keypoints);
          const now = Date.now();

          trailRef.current.push({ x: palmCenter.x, y: palmCenter.y, at: now });
          trailRef.current = trailRef.current.filter((point) => now - point.at < 900);

          const swipe = detectSwipe(trailRef.current, video.videoWidth || 640, video.videoHeight || 480, handSpan);
          const openPalm = detectOpenPalm(keypoints, trailRef.current);
          openPalmStreakRef.current = openPalm ? openPalmStreakRef.current + 1 : 0;

          if (swipe && now - lastTriggerAtRef.current > gestureCooldownMs) {
            lastTriggerAtRef.current = now;
            emitGesture(onCommand, swipe.command, swipe.confidence, swipe.detail, now);
            setGestureHint(swipe.detail);
            setGestureConfidence(swipe.confidence);
            trailRef.current = [];
            openPalmStreakRef.current = 0;
          } else if (openPalm && openPalmStreakRef.current >= 3 && now - lastTriggerAtRef.current > gestureCooldownMs) {
            lastTriggerAtRef.current = now;
            emitGesture(onCommand, "TOGGLE_PLAY", openPalm.confidence, openPalm.detail, now);
            setGestureHint(openPalm.detail);
            setGestureConfidence(openPalm.confidence);
            trailRef.current = [];
            openPalmStreakRef.current = 0;
          } else if (openPalm) {
            setGestureHint("Palm seen. Hold it steady for pause, or move left/right to swipe.");
            setGestureConfidence(openPalm.confidence);
          } else {
            setGestureHint("Hand seen. Open your palm more clearly, then move left or right.");
            setGestureConfidence(clamp(handSpan / 220, 0.35, 0.88));
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

function detectSwipe(trail: TrailPoint[], frameWidth: number, frameHeight: number, handSpan: number) {
  const samples = trail.slice(-8);
  if (samples.length < 4) {
    return null;
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const duration = last.at - first.at;
  if (duration < 120 || duration > 950) {
    return null;
  }

  let totalHorizontalTravel = 0;
  let totalVerticalTravel = 0;
  let alignedHorizontalSteps = 0;
  let stepCount = 0;

  const netDx = last.x - first.x;
  const netDy = last.y - first.y;
  const overallDirection = Math.sign(netDx);

  for (let index = 1; index < samples.length; index += 1) {
    const dx = samples[index].x - samples[index - 1].x;
    const dy = samples[index].y - samples[index - 1].y;
    totalHorizontalTravel += Math.abs(dx);
    totalVerticalTravel += Math.abs(dy);
    stepCount += 1;

    if (Math.sign(dx) === overallDirection && Math.abs(dx) > 1.5) {
      alignedHorizontalSteps += 1;
    }
  }

  const minDistance = Math.max(frameWidth * 0.1, handSpan * 0.85);
  const horizontalDominance = totalHorizontalTravel > totalVerticalTravel * 1.35;
  const directionConsistency = stepCount > 0 ? alignedHorizontalSteps / stepCount : 0;
  const verticalDrift = Math.abs(netDy) / frameHeight;

  if (
    Math.abs(netDx) < minDistance ||
    !horizontalDominance ||
    directionConsistency < 0.55 ||
    verticalDrift > 0.22 ||
    totalHorizontalTravel < minDistance * 1.05
  ) {
    return null;
  }

  const confidence = clamp(Math.abs(netDx) / (minDistance * 1.28) + directionConsistency * 0.25, 0.7, 0.98);
  const command: NormalizedCommand = netDx > 0 ? "NEXT" : "BACK";
  return {
    command,
    confidence,
    detail: netDx > 0 ? "Right swipe detected" : "Left swipe detected"
  };
}

function detectOpenPalm(keypoints: Point[], trail: TrailPoint[]) {
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

  const recentSamples = trail.slice(-4);
  const stillness = recentSamples.length < 2 ? 0 : averageMovement(recentSamples);
  const opennessScore = palmWidth === 0 ? 0 : tipSpread / palmWidth;

  if (extendedCount < 4 || !thumbOpen || palmWidth === 0 || opennessScore < 1.45 || stillness > palmWidth * 0.28) {
    return null;
  }

  return {
    confidence: clamp(opennessScore / 2.05, 0.72, 0.96),
    detail: "Steady open palm detected"
  };
}

function getPalmCenter(keypoints: Point[]) {
  const anchors = [0, 5, 9, 13, 17].map((index) => keypoints[index]);
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
