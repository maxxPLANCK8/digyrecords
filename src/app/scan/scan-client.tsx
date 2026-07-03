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

const readerId = "parcel-scanner-reader";

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function isIOSBrowser() {
  return (
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent)
  );
}

function captureScannerCanvasFrame() {
  const scannerCanvas = document.querySelector<HTMLCanvasElement>(
    `#${readerId} canvas`,
  );
  if (!scannerCanvas?.width || !scannerCanvas.height) {
    return null;
  }

  const fallbackCanvas = document.createElement("canvas");
  fallbackCanvas.width = scannerCanvas.width;
  fallbackCanvas.height = scannerCanvas.height;
  fallbackCanvas.getContext("2d")?.drawImage(scannerCanvas, 0, 0);
  console.info("[ParcelLog OCR] captured scanner canvas frame", {
    width: fallbackCanvas.width,
    height: fallbackCanvas.height,
  });

  return fallbackCanvas;
}

function prepareFrameForOcr(sourceCanvas: HTMLCanvasElement) {
  const ocrCanvas = document.createElement("canvas");
  const sourceWidth = sourceCanvas.width;
  const sourceHeight = sourceCanvas.height;
  const scale = Math.min(Math.max(1800 / sourceWidth, 1.4), 2.2);

  ocrCanvas.width = Math.floor(sourceWidth * scale);
  ocrCanvas.height = Math.floor(sourceHeight * scale);

  const context = ocrCanvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.filter = "grayscale(1) contrast(1.45)";
  context.fillStyle = "white";
  context.fillRect(0, 0, ocrCanvas.width, ocrCanvas.height);
  context.drawImage(sourceCanvas, 0, 0, ocrCanvas.width, ocrCanvas.height);

  return ocrCanvas;
}

function captureCurrentVideoFrame() {
  if (isIOSBrowser()) {
    const scannerFrame = captureScannerCanvasFrame();
    if (scannerFrame) {
      return scannerFrame;
    }
  }

  const video = document.querySelector<HTMLVideoElement>(`#${readerId} video`);
  console.info("[ParcelLog OCR] capture before stop", {
    hasVideo: Boolean(video),
    readyState: video?.readyState,
    paused: video?.paused,
    ended: video?.ended,
    videoWidth: video?.videoWidth,
    videoHeight: video?.videoHeight,
    tracks:
      video?.srcObject instanceof MediaStream
        ? video.srcObject.getVideoTracks().map((track) => ({
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
          }))
        : [],
  });

  if (!video?.videoWidth || !video.videoHeight) {
    const scannerFrame = captureScannerCanvasFrame();
    if (!scannerFrame) {
      console.info("[ParcelLog OCR] capture failed: no video or canvas frame");
      return null;
    }

    return scannerFrame;
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

function normalizePhone(rawPhone: string) {
  return rawPhone.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

function normalizeOcrLine(line: string) {
  return line
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findRecipientLine(lines: string[]) {
  return lines
    .map(normalizeOcrLine)
    .find((line) => /(?:^|\b)(?:to|t0|tot)\s*[:：]?\s+/i.test(line));
}

function parseRecipientOcr(rawText: string) {
  const lines = rawText.split(/\r?\n/);
  const recipientLine = findRecipientLine(lines);

  if (!recipientLine) {
    console.info("[ParcelLog OCR] no recipient line found", { lines });
    return { name: "", phone: "" };
  }

  const lineWithoutPrefix = recipientLine
    .replace(/^(.*?\b(?:to|t0|tot)\s*[:：]?\s*)/i, "")
    .trim();
  const phoneMatch = lineWithoutPrefix.match(
    /(?:\+?254[\s-]?\d[\d\s-]{7,11}|0\d[\d\s-]{7,10}|\d[\d\s-]{8,9})/,
  );

  if (!phoneMatch) {
    console.info("[ParcelLog OCR] recipient line had no phone", {
      recipientLine,
      lineWithoutPrefix,
    });
    return { name: "", phone: "" };
  }

  const phone = normalizePhone(phoneMatch[0]);
  const name = lineWithoutPrefix
    .replace(phoneMatch[0], " ")
    .replace(/\b(to|t0|tot|tel|phone|mobile)\b/gi, "")
    .replace(/[^a-zA-Z\s.'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  console.info("[ParcelLog OCR] parsed recipient line", {
    recipientLine,
    name,
    phone,
  });

  return { name, phone };
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
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [message, setMessage] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [rawPayload, setRawPayload] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientNameTouched, setRecipientNameTouched] = useState(false);
  const [recipientPhoneTouched, setRecipientPhoneTouched] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>("idle");
  const [ocrNote, setOcrNote] = useState("");
  const [ocrNamePendingVerify, setOcrNamePendingVerify] = useState(false);
  const [ocrPhonePendingVerify, setOcrPhonePendingVerify] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveJustSucceeded, setSaveJustSucceeded] = useState(false);
  const [receivedStamp, setReceivedStamp] = useState(false);
  const stampTimeoutRef = useRef<number | null>(null);

  const runOcr = useCallback(
    async (sourceCanvas: HTMLCanvasElement | null) => {
      if (!sourceCanvas) {
        setOcrStatus("failed");
        setOcrNote("OCR could not read the frozen frame.");
        return;
      }

      const ocrCanvas = prepareFrameForOcr(sourceCanvas);
      if (!ocrCanvas) {
        setOcrStatus("failed");
        setOcrNote("OCR could not prepare the frozen frame.");
        return;
      }

      setOcrStatus("running");
      setOcrNote("Reading label text...");

      try {
        const { recognize } = await import("tesseract.js");
        const {
          data: { text },
        } = await recognize(ocrCanvas, "eng", {
          logger: () => {},
          // Tesseract supports this runtime parameter, but the convenience
          // wrapper types only expose WorkerOptions.
          tessedit_pageseg_mode: "6",
        } as Parameters<typeof recognize>[2] & {
          tessedit_pageseg_mode: string;
        });
        console.info("[ParcelLog OCR] raw text", text);
        const parsed = parseRecipientOcr(text);

        if (!parsed.phone) {
          setOcrStatus("failed");
          setOcrNote(
            "OCR did not find a phone on the To line. Type details manually.",
          );
          return;
        }

        setRecipientPhone((currentValue) => {
          if (recipientPhoneTouched || currentValue.trim()) {
            return currentValue;
          }

          setOcrPhonePendingVerify(true);
          return parsed.phone;
        });

        if (parsed.name) {
          setRecipientName((currentValue) => {
            if (recipientNameTouched || currentValue.trim()) {
              return currentValue;
            }

            setOcrNamePendingVerify(true);
            return parsed.name;
          });
        }

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

  const startScanner = useCallback(async () => {
    if (startingRef.current) {
      return;
    }

    startingRef.current = true;
    setStatus("starting");
    setMessage("");
    setDuplicateWarning("");
    decodeLockedRef.current = false;
    setOcrStatus("idle");
    setOcrNote("");
    setOcrNamePendingVerify(false);
    setOcrPhonePendingVerify(false);

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
          if (decodeLockedRef.current) {
            return;
          }

          const decodedValue = decodedText.trim();
          if (!decodedValue) {
            return;
          }

          decodeLockedRef.current = true;
          const frozenFrame = captureCurrentVideoFrame();
          console.info("[ParcelLog OCR] decode success, frame ready", {
            decodedValue,
            hasFrame: Boolean(frozenFrame),
            frameWidth: frozenFrame?.width,
            frameHeight: frozenFrame?.height,
          });
          setRawPayload(decodedValue);
          setTrackingNumber(decodedValue);
          setStatus("paused");
          setMessage("Barcode captured. Confirm the pickup details.");
          void runOcr(frozenFrame);
        },
        () => {},
      );

      setStatus("scanning");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Camera could not be started on this device.",
      );
    } finally {
      startingRef.current = false;
    }
  }, [runOcr]);

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

  async function checkDuplicate(nextTrackingNumber: string) {
    if (!nextTrackingNumber) {
      setDuplicateWarning("");
      return;
    }

    const { data } = await supabase
      .from("pickups")
      .select("tracking_number, scanned_at")
      .eq("org_id", orgId)
      .eq("tracking_number", nextTrackingNumber)
      .order("scanned_at", { ascending: false })
      .limit(1);

    if (data?.[0]) {
      setDuplicateWarning(
        `Already logged at ${formatPickupTimestamp(data[0].scanned_at)}. You can confirm again if this is intentional.`,
      );
    } else {
      setDuplicateWarning("");
    }
  }

  async function savePickup() {
    if (isSaving || saveJustSucceeded) {
      return;
    }

    const nextTrackingNumber = trackingNumber.trim();
    if (!nextTrackingNumber) {
      setMessage("Tracking number is required.");
      return;
    }

    setIsSaving(true);
    setMessage("");

    const { error } = await supabase.from("pickups").insert({
      org_id: orgId,
      tracking_number: nextTrackingNumber,
      recipient_name: recipientName.trim() || null,
      recipient_phone: recipientPhone.trim() || null,
      scanned_by: orgMemberId,
      raw_barcode_payload: rawPayload || nextTrackingNumber,
    });

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
    setTrackingNumber("");
    setRawPayload("");
    setRecipientName("");
    setRecipientPhone("");
    setRecipientNameTouched(false);
    setRecipientPhoneTouched(false);
    setOcrStatus("idle");
    setOcrNote("");
    setOcrNamePendingVerify(false);
    setOcrPhonePendingVerify(false);
    setDuplicateWarning("");
    setSaveJustSucceeded(false);
    decodeLockedRef.current = false;
    if (scannerRef.current?.isScanning) {
      setStatus("scanning");
      return;
    }

    await startScanner();
  }

  function scanNext() {
    setMessage("Ready for the next parcel.");
    setSaveJustSucceeded(false);
    setReceivedStamp(false);
    setTrackingNumber("");
    setRawPayload("");
    setRecipientName("");
    setRecipientPhone("");
    setRecipientNameTouched(false);
    setRecipientPhoneTouched(false);
    setOcrStatus("idle");
    setOcrNote("");
    setOcrNamePendingVerify(false);
    setOcrPhonePendingVerify(false);
    setDuplicateWarning("");
    decodeLockedRef.current = false;

    if (scannerRef.current?.isScanning) {
      setStatus("scanning");
      return;
    }

    void startScanner();
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
          <div className="h-[min(48vh,420px)] min-h-[260px] w-full sm:h-[430px]" id={readerId} />
          <span className="scan-viewfinder__corner left-4 top-4 border-l-4 border-t-4" />
          <span className="scan-viewfinder__corner right-4 top-4 border-r-4 border-t-4" />
          <span className="scan-viewfinder__corner bottom-4 left-4 border-b-4 border-l-4" />
          <span className="scan-viewfinder__corner bottom-4 right-4 border-b-4 border-r-4" />
          <div className="pointer-events-none absolute inset-x-5 top-1/2 border-t border-dashed border-manifest-amber/80" />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span
            className={`font-mono uppercase ${
              status === "error" ? "text-stamp-red" : "text-ledger-ink/75"
            }`}
          >
            {status === "scanning"
              ? "Camera active"
              : status === "starting"
                ? "Starting camera"
                : status === "paused"
                  ? "Barcode captured"
                  : status === "error"
                    ? "Camera issue"
                    : "Idle"}
          </span>
          <button
            className="rounded-[6px] border border-ledger-ink bg-paper-light px-3 py-2 font-semibold text-ledger-ink transition hover:bg-manifest-amber active:translate-y-px active:bg-[#b96f17] active:shadow-inner focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            disabled={status === "starting"}
            onClick={scanNext}
            type="button"
          >
            Resume scan
          </button>
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

        {duplicateWarning ? (
          <p className="mt-3 border border-manifest-amber bg-paper-light p-3 text-sm text-ledger-ink">
            {duplicateWarning}
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
              <span className="font-mono text-xs font-medium uppercase text-ledger-ink/70">
                Tracking no.
              </span>
              <input
                className="mt-0.5 w-full border-0 border-b border-dashed border-perforation-grey bg-transparent px-0 py-2 font-mono text-lg font-medium text-ledger-ink outline-none focus:border-manifest-amber focus-visible:outline-2 focus-visible:outline-offset-2"
                inputMode="text"
                onBlur={() => void checkDuplicate(trackingNumber.trim())}
                onChange={(event) => {
                  setTrackingNumber(event.target.value);
                  setDuplicateWarning("");
                }}
                value={trackingNumber}
                required
              />
            </label>

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
                : "Confirm Pickup"}
          </button>
        </form>
      </section>
    </main>
  );
}
