"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Flashlight, FlashlightOff, AlertCircle, Loader2 } from "lucide-react";
import { parsePactQrPayload, type PactPaymentRequest } from "@/lib/pact-schema";

interface QrScannerProps {
  onScanSuccess: (data: PactPaymentRequest, rawText: string) => boolean | void | Promise<boolean | void>;
  onError?: (error: string) => void;
  active?: boolean;
}

export function QrScanner({ onScanSuccess, onError, active = true }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const callbacks = useRef({ onScanSuccess, onError });
  callbacks.current = { onScanSuccess, onError };
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [retry, setRetry] = useState(0);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      callbacks.current.onError?.("The flashlight could not be enabled on this camera.");
    }
  }, [torchOn]);

  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let detecting = false;
    let stream: MediaStream | null = null;
    let controls: IScannerControls | undefined;
    let lastInvalid = "";
    let lastInvalidAt = 0;
    const reader = new BrowserMultiFormatReader();
    setIsStarting(true);
    setCameraError(null);
    setTorchAvailable(false);
    setTorchOn(false);

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access requires HTTPS and a supported browser. You can still enter a wallet address manually.");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
        });
        if (disposed) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        setTorchAvailable(Boolean(capabilities?.torch));
        if (!videoRef.current) return;
        controls = await reader.decodeFromStream(stream, videoRef.current, async (result) => {
          if (disposed || detecting || !result) return;
          const raw = result.getText();
          let payload: PactPaymentRequest;
          try { payload = parsePactQrPayload(raw); }
          catch (error) {
            if (raw !== lastInvalid || Date.now() - lastInvalidAt > 5000) {
              lastInvalid = raw;
              lastInvalidAt = Date.now();
              callbacks.current.onError?.((error as Error).message);
            }
            return;
          }
          detecting = true;
          try {
            const accepted = await callbacks.current.onScanSuccess(payload, raw);
            if (accepted === false) detecting = false;
            else navigator.vibrate?.(50);
          } catch (error) {
            detecting = false;
            callbacks.current.onError?.((error as Error).message || "Could not open this payment request.");
          }
        });
        if (disposed) controls.stop();
      } catch (error) {
        if (disposed) return;
        const err = error as Error;
        const message = err.name === "NotAllowedError"
          ? "Camera permission was denied. Allow access in your browser settings, then retry, or enter a wallet address below."
          : err.name === "NotFoundError" ? "No camera was found. Enter a recipient wallet address below."
          : err.message || "Unable to start the camera. You can enter a wallet address below.";
        setCameraError(message);
        stream?.getTracks().forEach((track) => track.stop());
      } finally {
        if (!disposed) setIsStarting(false);
      }
    }
    void start();
    return () => {
      disposed = true;
      controls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (streamRef.current === stream) streamRef.current = null;
    };
  }, [active, retry]);

  return (
    <div className="relative w-full h-full min-h-[360px] bg-black overflow-hidden flex flex-col items-center justify-center">
      <video ref={videoRef} aria-label="Payment QR camera preview" className="absolute inset-0 w-full h-full object-cover" muted playsInline />
      {active && !cameraError && (
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center pt-24 pb-16">
          {isStarting ? <Loader2 className="w-10 h-10 text-white animate-spin" aria-label="Starting camera" /> : (
            <>
              <div className="relative w-56 h-56 sm:w-64 sm:h-64 border-2 border-transparent">
                <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />
              </div>
              <p className="text-xs text-white/90 font-medium mt-4 bg-black/60 px-3 py-2 rounded-full">Scan a Pact QR or recipient wallet address</p>
            </>
          )}
        </div>
      )}
      {active && torchAvailable && !cameraError && (
        <button onClick={toggleTorch} type="button" aria-label={torchOn ? "Turn flashlight off" : "Turn flashlight on"} aria-pressed={torchOn}
          className="absolute bottom-24 right-4 z-20 p-3 rounded-full bg-surface-card/90 border border-surface-border text-text-main">
          {torchOn ? <Flashlight className="w-5 h-5 text-primary" /> : <FlashlightOff className="w-5 h-5" />}
        </button>
      )}
      {active && cameraError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 pt-28 pb-24 bg-surface-base/95 text-center" role="status">
          <AlertCircle className="w-10 h-10 text-primary mb-3" />
          <h2 className="text-lg font-bold mb-2">Camera unavailable</h2>
          <p className="text-sm text-text-muted max-w-xs mb-4">{cameraError}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)} className="px-4 py-2 rounded-xl border border-surface-border text-sm">Retry camera</button>
        </div>
      )}
    </div>
  );
}
