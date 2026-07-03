"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { formatPickupTimestamp } from "@/lib/format";

type ScanClientProps = {
  displayName: string;
  orgId: string;
  orgMemberId: string;
  orgName: string;
  userEmail: string;
};

type ScannerStatus = "idle" | "starting" | "scanning" | "paused" | "error";
type OcrStatus = "idle" | "running" | "done" | "failed";

type PendingItem = {
  trackingNumber: string;
  rawPayload: string;
  duplicateWarning: string;
};

type GeminiOcrResult = {
  name: string;
  phone: string;
};

const readerId = "parcel-scanner-reader";

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function timeout<T>(promise: Promise<T>, milliseconds: number) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("OCR timed out."));
    }, milliseconds);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeoutId));
  });
}

function waitForVideoReady(video: HTMLVideoElement, maxAttempts = 10) {
  return new Promise<boolean>((resolve) => {
    let attempts = 0;
    const check = () => {
      if (
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        resolve(true);
        return;
      }

      if (attempts >= maxAttempts) {
        resolve(false);
        return;
      }

      attempts += 1;
      window.setTimeout(check, 50);
    };

    check();
  });
}

function isIOSBrowser() {
  return (
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))
  );
}

async function captureCurrentVideoFrame() {
  const video = document.querySelector<HTMLVideoElement>(`#${readerId} video`);
  console.info("[ParcelLog OCR] capture video frame", {
    hasVideo: Boolean(video),
    readyState: video?.readyState,
    paused: video?.paused,
    ended: video?.ended,
    videoWidth: video?.videoWidth,
    videoHeight: video?.videoHeight,
  });

  if (!video) {
    console.info("[ParcelLog OCR] capture failed: no video element");
    return null;
  }

  const videoReady = await waitForVideoReady(video);
  console.info("[ParcelLog OCR] video ready check", {
    videoReady,
    readyState: video.readyState,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
  });

  if (!videoReady || !video.videoWidth || !video.videoHeight) {
    console.info("[ParcelLog OCR] capture failed: video frame not ready");
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  console.info("[ParcelLog OCR] captured video frame", {
    width: canvas.width,
    height: canvas.height,
  });

  return canvas;
}

function canvasToJpegBase64(sourceCanvas: HTMLCanvasElement) {
  const longEdge = Math.max(sourceCanvas.width, sourceCanvas.height);
  const scale = Math.min(1000 / longEdge, 1);
  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
  targetCanvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));

  const context = targetCanvas.getContext("2d");
  if (!context) {
    return "";
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);

  return targetCanvas.toDataURL("image/jpeg", 0.78).split(",")[1] || "";
}

function normalizePhone(rawPhone: string) {
  return rawPhone.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

function cleanGeminiResult(result: GeminiOcrResult): GeminiOcrResult {
  return {
    name: result.name.trim(),
    phone: normalizePhone(result.phone),
  };
}

export function ScanClient({
  displayName,
  orgId,
  orgMemberId,
  orgName,
  userEmail,
}: ScanClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const startingRef = useRef(false);
  const decodeLockedRef = useRef(false);
  const pendingItemsRef = useRef<PendingItem[]>([]);
  const decodeLoopTickRef = useRef(0);
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [isScannerHealthy, setIsScannerHealthy] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientNameTouched, setRecipientNameTouched] = useState(false);
  const [recipientPhoneTouched, setRecipientPhoneTouched] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>("idle");
  const [ocrNote, setOcrNote] = useState("");
  const [ocrNamePendingVerify, setOcrNamePendingVerify] = useState(false);
  const [ocrPhonePendingVerify, setOcrPhonePendingVerify] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveJustSucceeded, setSaveJustSucceeded] = useState(false);
  const [receivedStamp, setReceivedStamp] = useState(false);
  const stampTimeoutRef = useRef<number | null>(null);

  function setPendingItemsSynced(
    next:
      | PendingItem[]
      | ((currentItems: PendingItem[]) => PendingItem[]),
  ) {
    setPendingItems((currentItems) => {
      const resolved =
        typeof next === "function" ? next(currentItems) : next;
      pendingItemsRef.current = resolved;
      return resolved;
    });
  }

  const checkDuplicate = useCallback(
    async (nextTrackingNumber: string) => {
      if (!nextTrackingNumber) {
        return "";
      }

      const { data } = await supabase
        .from("pickups")
        .select("tracking_number, scanned_at")
        .eq("org_id", orgId)
        .eq("tracking_number", nextTrackingNumber)
        .order("scanned_at", { ascending: false })
        .limit(1);

      if (!data?.[0]) {
        return "";
      }

      return `Already logged at ${formatPickupTimestamp(data[0].scanned_at)}.`;
    },
    [orgId, supabase],
  );

  const runOcr = useCallback(
    async (sourceCanvas: HTMLCanvasElement | null) => {
      if (!sourceCanvas) {
        setOcrStatus("failed");
        setOcrNote("OCR could not read the frame. Type details manually.");
        return;
      }

      const imageBase64 = canvasToJpegBase64(sourceCanvas);
      if (!imageBase64) {
        setOcrStatus("failed");
        setOcrNote("OCR could not prepare the frame. Type details manually.");
        return;
      }

      setOcrStatus("running");
      setOcrNote("Reading label...");

      try {
        const response = await timeout(
          fetch("/api/ocr-label", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64 }),
          }),
          6000,
        );

        if (!response.ok) {
          throw new Error("OCR request failed.");
        }

        const parsed = cleanGeminiResult(
          (await response.json()) as GeminiOcrResult,
        );

        if (!parsed.name && !parsed.phone) {
          setOcrStatus("failed");
          setOcrNote("OCR did not find a clear To line. Type details manually.");
          return;
        }

        setRecipientPhone((currentValue) => {
          if (recipientPhoneTouched || currentValue.trim() || !parsed.phone) {
            return currentValue;
          }

          setOcrPhonePendingVerify(true);
          return parsed.phone;
        });

        setRecipientName((currentValue) => {
          if (recipientNameTouched || currentValue.trim() || !parsed.name) {
            return currentValue;
          }

          setOcrNamePendingVerify(true);
          return parsed.name;
        });

        setOcrStatus("done");
        setOcrNote("Auto-filled from OCR. Please verify before confirming.");
      } catch {
        setOcrStatus("failed");
        setOcrNote("OCR failed. Type recipient details manually.");
      }
    },
    [recipientNameTouched, recipientPhoneTouched],
  );

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) {
      return;
    }

    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
    } catch {
      // Camera cleanup is best-effort; the next start will recreate if needed.
    }
  }, []);

  const resetBatch = useCallback(() => {
    setMessage("Ready for the next parcel.");
    setSaveJustSucceeded(false);
    setReceivedStamp(false);
    setPendingItemsSynced([]);
    setRecipientName("");
    setRecipientPhone("");
    setRecipientNameTouched(false);
    setRecipientPhoneTouched(false);
    setOcrStatus("idle");
    setOcrNote("");
    setOcrNamePendingVerify(false);
    setOcrPhonePendingVerify(false);
    decodeLockedRef.current = false;
  }, []);

  const startScanner = useCallback(async () => {
    if (startingRef.current) {
      return;
    }

    startingRef.current = true;
    setStatus("starting");
    setMessage("");
    decodeLockedRef.current = false;
    if (!pendingItemsRef.current.length) {
      setOcrStatus("idle");
      setOcrNote("");
      setOcrNamePendingVerify(false);
      setOcrPhonePendingVerify(false);
    }

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import(
        "html5-qrcode"
      );

      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(readerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.CODABAR,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.PDF_417,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
          ],
          useBarCodeDetectorIfSupported: false,
          verbose: false,
        });
      }

      await scannerRef.current.start(
        { facingMode: "environment" },
        isIOSBrowser()
          ? {
              fps: 10,
              qrbox: (viewfinderWidth, viewfinderHeight) => ({
                width: Math.floor(Math.min(viewfinderWidth * 0.94, 560)),
                height: Math.floor(Math.min(viewfinderHeight * 0.82, 760)),
              }),
            }
          : {
              fps: 12,
              qrbox: (viewfinderWidth, viewfinderHeight) => ({
                width: Math.floor(Math.min(viewfinderWidth * 0.94, 560)),
                height: Math.floor(Math.min(viewfinderHeight * 0.82, 760)),
              }),
              aspectRatio: 0.75,
              videoConstraints: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 1920 },
              },
            },
        async (decodedText) => {
          decodeLoopTickRef.current = Date.now();
          if (decodeLockedRef.current) {
            return;
          }

          const decodedValue = decodedText.trim();
          if (!decodedValue) {
            return;
          }

          decodeLockedRef.current = true;
          const existingBatchItem = pendingItemsRef.current.find(
            (item) => item.trackingNumber === decodedValue,
          );

          if (existingBatchItem) {
            setStatus("paused");
            setMessage("Already scanned in this pickup.");
            return;
          }

          const shouldReadOcr = pendingItemsRef.current.length === 0;
          const frozenFrame = shouldReadOcr
            ? await captureCurrentVideoFrame()
            : null;
          const duplicateWarning = await checkDuplicate(decodedValue);

          setPendingItemsSynced((currentItems) => [
            ...currentItems,
            {
              trackingNumber: decodedValue,
              rawPayload: decodedValue,
              duplicateWarning,
            },
          ]);
          setStatus("paused");
          setMessage("Barcode captured. Review the pickup details.");

          if (shouldReadOcr) {
            void runOcr(frozenFrame);
          }
        },
        () => {
          decodeLoopTickRef.current = Date.now();
        },
      );

      decodeLoopTickRef.current = Date.now();
      setIsScannerHealthy(true);
      setStatus("scanning");
    } catch (error) {
      setIsScannerHealthy(false);
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Camera could not be started on this device.",
      );
    } finally {
      startingRef.current = false;
    }
  }, [checkDuplicate, runOcr]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void startScanner();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      if (stampTimeoutRef.current) {
        window.clearTimeout(stampTimeoutRef.current);
      }
      void stopScanner();
    };
  }, [startScanner, stopScanner]);

  useEffect(() => {
    const checkScannerHealth = () => {
      if (status !== "scanning") {
        setIsScannerHealthy(false);
        return;
      }

      const video = document.querySelector<HTMLVideoElement>(
        `#${readerId} video`,
      );
      const hasLiveTrack =
        video?.srcObject instanceof MediaStream
          ? video.srcObject
              .getVideoTracks()
              .some((track) => track.readyState === "live" && track.enabled)
          : false;
      const hasVideoFrame = Boolean(
        video &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          video.videoWidth > 0 &&
          video.videoHeight > 0,
      );
      const decodeLoopActive =
        Date.now() - decodeLoopTickRef.current < 2500;

      setIsScannerHealthy(
        Boolean(scannerRef.current?.isScanning) &&
          hasLiveTrack &&
          hasVideoFrame &&
          decodeLoopActive,
      );
    };

    checkScannerHealth();
    const intervalId = window.setInterval(checkScannerHealth, 1000);

    return () => window.clearInterval(intervalId);
  }, [status]);

  async function savePickup() {
    if (isSaving || saveJustSucceeded) {
      return;
    }

    if (!pendingItems.length) {
      setMessage("Scan at least one parcel before confirming.");
      return;
    }

    setIsSaving(true);
    setMessage("");

    const { error } = await supabase.from("pickups").insert(
      pendingItems.map((item) => ({
        org_id: orgId,
        tracking_number: item.trackingNumber,
        recipient_name: recipientName.trim() || null,
        recipient_phone: recipientPhone.trim() || null,
        scanned_by: orgMemberId,
        raw_barcode_payload: item.rawPayload,
      })),
    );

    setIsSaving(false);

    if (error) {
      setMessage(error.message);
      setStatus("paused");
      return;
    }

    setMessage("Saved. Ready for the next parcel.");
    setSaveJustSucceeded(true);
    setReceivedStamp(true);
    if (stampTimeoutRef.current) {
      window.clearTimeout(stampTimeoutRef.current);
    }
    stampTimeoutRef.current = window.setTimeout(() => {
      setReceivedStamp(false);
    }, 900);
    await delay(450);
    resetBatch();
    if (scannerRef.current?.isScanning) {
      setStatus("scanning");
      return;
    }

    await startScanner();
  }

  function scanNext() {
    setMessage("Ready for the next parcel.");
    decodeLockedRef.current = false;

    if (scannerRef.current?.isScanning) {
      setStatus("scanning");
      return;
    }

    void startScanner();
  }

  async function rescanNow() {
    if (startingRef.current) {
      return;
    }

    setMessage("Restarting scanner.");
    setIsScannerHealthy(false);
    decodeLockedRef.current = false;
    await stopScanner();

    try {
      await scannerRef.current?.clear();
    } catch {
      // Recreating the scanner below is enough if clear is unavailable.
    }

    scannerRef.current = null;
    await startScanner();
  }

  function removePendingItem(trackingNumber: string) {
    const currentItemCount = pendingItemsRef.current.length;

    setPendingItemsSynced((currentItems) =>
      currentItems.filter((item) => item.trackingNumber !== trackingNumber),
    );
    if (currentItemCount <= 1) {
      resetBatch();
    }
  }

  return (
    <main className="min-h-screen bg-kraft-paper text-ledger-ink">
      <svg aria-hidden="true" className="absolute h-0 w-0">
        <filter id="stamp-bleed">
          <feTurbulence
            baseFrequency="0.9"
            numOctaves="2"
            result="noise"
            seed="7"
            type="fractalNoise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="0.7"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-4">
        <header className="border-b border-perforation-grey pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link
                className="font-mono text-xs font-medium uppercase text-manifest-green underline-offset-4 focus-visible:outline-2"
                href="/"
              >
                ParcelLog
              </Link>
              <h1 className="mt-1 font-display text-3xl font-extrabold uppercase leading-none text-ledger-ink">
                {orgName}
              </h1>
              <p className="mt-1 text-sm text-ledger-ink/70">
                {displayName || userEmail}
              </p>
            </div>
            <Link
              className="rounded-[6px] border border-ledger-ink px-3 py-2 text-sm font-semibold text-ledger-ink transition hover:bg-ledger-ink hover:text-kraft-paper active:translate-y-px active:bg-manifest-amber active:text-ledger-ink active:shadow-inner focus-visible:outline-2 focus-visible:outline-offset-2"
              href="/dashboard"
            >
              Dashboard
            </Link>
          </div>
        </header>

        <div className="scan-viewfinder relative mt-4 overflow-hidden border-2 border-ledger-ink bg-ledger-ink shadow-[0_8px_0_rgba(20,32,43,0.18)]">
          <div
            className="h-[min(48vh,420px)] min-h-[260px] w-full sm:h-[430px]"
            id={readerId}
          />
          <span className="scan-viewfinder__corner left-4 top-4 border-l-4 border-t-4" />
          <span className="scan-viewfinder__corner right-4 top-4 border-r-4 border-t-4" />
          <span className="scan-viewfinder__corner bottom-4 left-4 border-b-4 border-l-4" />
          <span className="scan-viewfinder__corner bottom-4 right-4 border-b-4 border-r-4" />
          <div className="pointer-events-none absolute inset-x-5 top-1/2 border-t border-dashed border-manifest-amber/80" />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div
            aria-live="polite"
            className={`inline-flex items-center gap-2 rounded-[6px] border bg-paper-light px-3 py-2 font-mono text-xs font-semibold uppercase ${
              status === "scanning" && isScannerHealthy
                ? "border-manifest-green text-manifest-green"
                : "border-stamp-red text-stamp-red"
            }`}
          >
            <span className="relative flex h-3 w-3">
              {status === "scanning" && isScannerHealthy ? (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-manifest-green opacity-70" />
              ) : null}
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${
                  status === "scanning" && isScannerHealthy
                    ? "bg-manifest-green"
                    : "bg-stamp-red"
                }`}
              />
            </span>
            {status === "scanning" && isScannerHealthy
              ? "Scanning..."
              : "Not scanning"}
          </div>
          <div className="flex items-center gap-2">
            {status === "scanning" ? (
              <button
                className="rounded-[6px] border border-ledger-ink bg-paper-light px-3 py-2 font-semibold text-ledger-ink transition hover:bg-manifest-amber active:translate-y-px active:bg-[#b96f17] active:shadow-inner focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                onClick={() => void rescanNow()}
                type="button"
              >
                Rescan
              </button>
            ) : null}
            <button
              className="rounded-[6px] border border-ledger-ink bg-paper-light px-3 py-2 font-semibold text-ledger-ink transition hover:bg-manifest-amber active:translate-y-px active:bg-[#b96f17] active:shadow-inner focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
              disabled={status === "starting"}
              onClick={scanNext}
              type="button"
            >
              Scan next
            </button>
          </div>
        </div>

        {message ? (
          <p
            className={`mt-3 border p-3 text-sm ${
              status === "error" || message.toLowerCase().includes("required")
                ? "border-stamp-red bg-paper-light text-stamp-red"
                : "border-perforation-grey bg-paper-light text-ledger-ink"
            }`}
          >
            {message}
          </p>
        ) : null}

        {ocrNote ? (
          <p
            className={`mt-3 border p-3 text-sm ${
              ocrStatus === "done"
                ? "border-manifest-green bg-paper-light text-manifest-green"
                : ocrStatus === "running"
                  ? "border-perforation-grey bg-paper-light text-ledger-ink"
                  : "border-stamp-red bg-paper-light text-stamp-red"
            }`}
          >
            {ocrNote}
          </p>
        ) : null}

        <section className="mt-4 border-y border-dashed border-perforation-grey py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs font-medium uppercase text-ledger-ink/70">
              Scanned this pickup ({pendingItems.length})
            </p>
            {pendingItems.length ? (
              <button
                className="rounded-[6px] border border-stamp-red px-2 py-1 text-xs font-semibold text-stamp-red transition hover:bg-stamp-red hover:text-kraft-paper active:translate-y-px active:shadow-inner"
                onClick={resetBatch}
                type="button"
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="mt-2 space-y-2">
            {pendingItems.map((item) => (
              <div
                className="flex items-start justify-between gap-3 bg-paper-light px-3 py-2"
                key={item.trackingNumber}
              >
                <div className="min-w-0">
                  <p className="break-all font-mono text-sm font-medium">
                    {item.trackingNumber}
                  </p>
                  {item.duplicateWarning ? (
                    <p className="mt-1 text-xs text-stamp-red">
                      {item.duplicateWarning}
                    </p>
                  ) : null}
                </div>
                <button
                  aria-label={`Remove ${item.trackingNumber}`}
                  className="rounded-[6px] border border-ledger-ink px-2 py-1 font-mono text-xs font-semibold transition hover:bg-ledger-ink hover:text-kraft-paper active:translate-y-px active:bg-stamp-red active:text-kraft-paper"
                  onClick={() => removePendingItem(item.trackingNumber)}
                  type="button"
                >
                  x
                </button>
              </div>
            ))}
            {!pendingItems.length ? (
              <p className="text-sm text-ledger-ink/70">
                No parcels scanned for this pickup yet.
              </p>
            ) : null}
          </div>
        </section>

        <form
          className="relative mt-4 border-x-2 border-b-2 border-dashed border-perforation-grey bg-paper-light px-4 pb-4 pt-5 shadow-[0_8px_0_rgba(20,32,43,0.12)] before:absolute before:inset-x-0 before:top-0 before:border-t-2 before:border-dashed before:border-ledger-ink"
          onSubmit={(event) => {
            event.preventDefault();
            void savePickup();
          }}
        >
          {receivedStamp ? (
            <div className="stamp-mark pointer-events-none absolute right-5 top-16 z-10 rounded-[3px] px-4 py-2 font-display text-4xl font-extrabold uppercase leading-none">
              Received
            </div>
          ) : null}

          <div className="space-y-2.5">
            <label className="block">
              <span className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs font-medium uppercase text-ledger-ink/70">
                  Recipient
                </span>
                {ocrNamePendingVerify ? (
                  <span className="font-mono text-xs text-manifest-green">
                    Auto-filled, verify
                  </span>
                ) : null}
              </span>
              <input
                className={`mt-0.5 w-full border-0 border-b border-dashed bg-transparent px-0 py-2 text-lg text-ledger-ink outline-none focus:border-manifest-amber focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  ocrNamePendingVerify
                    ? "border-manifest-green"
                    : "border-perforation-grey"
                }`}
                onChange={(event) => {
                  setRecipientNameTouched(true);
                  setOcrNamePendingVerify(false);
                  setRecipientName(event.target.value);
                }}
                value={recipientName}
              />
            </label>

            <label className="block">
              <span className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs font-medium uppercase text-ledger-ink/70">
                  Phone
                </span>
                {ocrPhonePendingVerify ? (
                  <span className="font-mono text-xs text-manifest-green">
                    Auto-filled, verify
                  </span>
                ) : null}
              </span>
              <input
                className={`mt-0.5 w-full border-0 border-b border-dashed bg-transparent px-0 py-2 font-mono text-lg text-ledger-ink outline-none focus:border-manifest-amber focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  ocrPhonePendingVerify
                    ? "border-manifest-green"
                    : "border-perforation-grey"
                }`}
                inputMode="tel"
                onChange={(event) => {
                  setRecipientPhoneTouched(true);
                  setOcrPhonePendingVerify(false);
                  setRecipientPhone(event.target.value);
                }}
                value={recipientPhone}
              />
            </label>
          </div>

          <button
            className="mt-4 w-full rounded-[6px] bg-manifest-amber px-4 py-4 text-base font-bold text-ledger-ink transition hover:bg-[#c87d1d] active:translate-y-px active:bg-[#a76312] active:shadow-inner focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-70"
            disabled={isSaving || saveJustSucceeded}
            type="submit"
          >
            {isSaving
              ? "Saving..."
              : saveJustSucceeded
                ? "Received"
                : pendingItems.length > 1
                  ? `Confirm Pickup (${pendingItems.length} items)`
                  : "Confirm Pickup"}
          </button>
        </form>
      </section>
    </main>
  );
}
