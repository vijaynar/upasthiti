'use client';

// Shared face-api.js camera capture (Phase 8, Doc 07 §8). Reuses the
// archived V1 build's already-working integration wholesale: same model
// weight files (apps/web/public/models/), same descriptor extraction call
// (detectSingleFace().withFaceLandmarks().withFaceDescriptor()), same
// 128-float output — migration 0010's embedding column and this project's
// locked 128-dim scope decision both assume exactly this model. Simplified
// from V1's decorative HUD overlay down to a plain functional capture
// widget, matching this codebase's plain-fetch console style elsewhere
// (/scheduling, /people).

import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, RefreshCw } from 'lucide-react';

let faceapi: any = null;
const MODELS_URL = '/models';

export interface FaceCaptureMeta {
  qualityScore: number;
  frameDataUrl: string;
  webglBackend: string | null;
}

// onCapture's 2nd param, frameClassName, and captureLabel are all additive —
// existing callers (attendance check-in/enrollment, which only pass
// onCapture/busy) keep their current small frame and default label
// unchanged; the Students "Register Face Key" page uses the wider options.
export function FaceScanner({
  onCapture,
  busy,
  frameClassName = 'max-w-xs',
  captureLabel = 'Capture face',
}: {
  onCapture: (embedding: number[], meta: FaceCaptureMeta) => void;
  busy?: boolean;
  frameClassName?: string;
  captureLabel?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        faceapi = await import('face-api.js');
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
        ]);
        if (active) setLoadingModels(false);
      } catch (err) {
        if (active) {
          setModelError(err instanceof Error ? err.message : 'Failed to load face detection models.');
          setLoadingModels(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (loadingModels || modelError) return;
    let currentStream: MediaStream | null = null;
    (async () => {
      try {
        setCameraError(null);
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: false });
        if (videoRef.current) videoRef.current.srcObject = stream;
        currentStream = stream;
        setStreamActive(true);
      } catch (err) {
        setCameraError(err instanceof Error ? err.message : 'Camera permission denied or unavailable.');
      }
    })();
    return () => {
      currentStream?.getTracks().forEach((t) => t.stop());
      setStreamActive(false);
    };
  }, [loadingModels, modelError]);

  async function capture() {
    if (!videoRef.current || !faceapi) return;
    setScanning(true);
    setCaptureError(null);
    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (!detection) {
        setCaptureError('No face detected — align the face inside the frame and try again.');
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
      const webglBackend = typeof faceapi.tf?.getBackend === 'function' ? faceapi.tf.getBackend() : null;
      onCapture(Array.from(detection.descriptor) as number[], {
        qualityScore: detection.detection.score,
        frameDataUrl: canvas.toDataURL('image/jpeg', 0.85),
        webglBackend,
      });
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : 'Face capture failed.');
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className={`relative flex aspect-[4/3] w-full ${frameClassName} items-center justify-center overflow-hidden rounded-lg bg-neutral-900`}>
        {loadingModels && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-neutral-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-[10px]">Loading face model…</span>
          </div>
        )}
        {modelError && <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-[11px] text-red-400">{modelError}</div>}
        {cameraError && !loadingModels && !modelError && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-[11px] text-red-400">{cameraError}</div>
        )}
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
      </div>
      {captureError && <p className="text-xs text-red-400">{captureError}</p>}
      <button
        onClick={capture}
        disabled={!streamActive || scanning || busy || loadingModels}
        className="btn-premium flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        {scanning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        {scanning ? 'Capturing…' : captureLabel}
      </button>
    </div>
  );
}
