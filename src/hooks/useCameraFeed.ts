import { useEffect, useRef, useState } from "react";
import type { CameraStatus } from "../types";

export function useCameraFeed() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("requesting");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function startFeed() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 960 },
            height: { ideal: 540 },
            facingMode: "user"
          },
          audio: false
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setStatus("ready");
        setErrorMessage("");
      } catch (error) {
        console.error(error);
        setStatus("error");
        setErrorMessage("Camera access is required for gesture and presence detection.");
      }
    }

    startFeed();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return {
    videoRef,
    cameraStatus: status,
    cameraError: errorMessage
  };
}
