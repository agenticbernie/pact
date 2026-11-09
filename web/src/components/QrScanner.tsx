"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Flashlight, FlashlightOff, Camera, AlertCircle } from "lucide-react";
import { parsePactQrPayload, type PactPaymentRequest } from "@/lib/pact-schema";

interface QrScannerProps {
  onScanSuccess: (data: PactPaymentRequest, rawText: string) => void;
  onError?: (error: string) => void;
  active?: boolean;
}

export function QrScanner({ onScanSuccess, onError, active = true }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const isScanningRef = useRef(false);

  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextState = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextState }],
      });
      setTorchOn(nextState);
    } catch (e) {
      console.warn("Failed to toggle flashlight", e);
    }
  }, [torchOn]);

  useEffect(() => {
    if (!active) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      return;
    }

    let isMounted = true;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    async function startScanner() {
      try {
        setCameraError(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        setHasPermission(true);

        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = (track as any).getCapabilities?.() || {};
          if (capabilities.torch) {
            setTorchAvailable(true);
          }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          await videoRef.current.play();

          reader.decodeFromVideoElement(videoRef.current, (result, error) => {
            if (!isMounted || !result || isScanningRef.current) return;
            const text = result.getText();
            try {
              const payload = parsePactQrPayload(text);
              isScanningRef.current = true;
              onScanSuccess(payload, text);
            } catch (err) {
              // Not a valid pact payload yet, keep scanning
            }
          });
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error("Camera access error:", err);
        setHasPermission(false);
        const msg = err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access."
          : "Unable to access camera device.";
        setCameraError(msg);
        onError?.(msg);
      }
    }

    startScanner();

    return () => {
      isMounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [active, onScanSuccess, onError]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col items-center justify-center">
      {/* Video Viewport */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        playsInline
      />

      {/* Dark overlay with viewport cutout reticle */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
        {/* Reticle Scanner Area */}
        <div className="relative w-64 h-64 sm:w-72 sm:h-72 border-2 border-transparent">
          {/* Pulsing Corner Indicators (Avalanche Flame Red) */}
          <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg animate-pulse" />
          <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg animate-pulse" />
          <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg animate-pulse" />
          <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg animate-pulse" />

          {/* Center scan line animation */}
          <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-bounce opacity-75 top-1/2" />
        </div>
        <p className="text-xs text-white/80 font-medium mt-4 tracking-wide bg-black/40 px-3 py-1 rounded-full backdrop-blur-md">
          Align merchant Pact QR inside the frame
        </p>
      </div>

      {/* Torch Toggle Button */}
      {torchAvailable && (
        <button
          onClick={toggleTorch}
          type="button"
          aria-label="Toggle Flashlight"
          className="absolute top-4 right-4 z-20 p-3 rounded-full bg-surface-card/80 backdrop-blur-md border border-surface-border text-text-main hover:bg-surface-card active:scale-95 transition-all shadow-lg"
        >
          {torchOn ? (
            <Flashlight className="w-5 h-5 text-primary fill-primary" />
          ) : (
            <FlashlightOff className="w-5 h-5 text-text-muted" />
          )}
        </button>
      )}

      {/* Camera permission / error fallback */}
      {cameraError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-surface-base/95 text-center">
          <AlertCircle className="w-12 h-12 text-primary mb-3" />
          <h3 className="text-lg font-bold text-text-main mb-1">Camera Inactive</h3>
          <p className="text-sm text-text-muted max-w-xs mb-4">{cameraError}</p>
        </div>
      )}
    </div>
  );
}
