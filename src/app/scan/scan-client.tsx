"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

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
    const scannerCanvas = document.querySelector<HTMLCanvasElement>(
      `#${readerId} canvas`,
    );
    if (!scannerCanvas?.width || !scannerCanvas.height) {
      console.info("[ParcelLog OCR] capture failed: no video or canvas frame");
      return null;
    }

    const fallbackCanvas = document.createElement("canvas");
    fallbackCanvas.width = scannerCanvas.width;
    fallbackCanvas.height = scannerCanvas.height;
    fallbackCanvas.getContext("2d")?.drawImage(scannerCanvas, 0, 0);
    console.info("[ParcelLog OCR] captured scanner canvas fallback", {
      width: fallbackCanvas.width,
      height: fallbackCanvas.height,
    });
    return fallbackCanvas;
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
        {
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
        `Already logged at ${new Date(data[0].scanned_at).toLocaleString()}. You can confirm again if this is intentional.`,
      );
    } else {
      setDuplicateWarning("");
    }
  }

  async function savePickup() {
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

    await startScanner();
  }

  function scanNext() {
    setMessage("Ready for the next parcel.");
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
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-4">
        <header className="flex items-center justify-between gap-3 pb-4">
          <div>
            <Link className="text-sm font-semibold text-emerald-300" href="/">
              ParcelLog
            </Link>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Scan pickup
            </h1>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              {orgName} - {displayName || userEmail}
            </p>
          </div>
          <Link
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
            href="/dashboard"
          >
            Dashboard
          </Link>
        </header>

        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-black">
          <div className="aspect-[4/3] w-full" id={readerId} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span className="text-zinc-300">
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
            className="rounded-md bg-white px-3 py-2 font-medium text-zinc-950 disabled:opacity-50"
            disabled={status === "starting"}
            onClick={scanNext}
            type="button"
          >
            Scan next
          </button>
        </div>

        {message ? (
          <p className="mt-3 rounded-md border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-100">
            {message}
          </p>
        ) : null}

        {duplicateWarning ? (
          <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            {duplicateWarning}
          </p>
        ) : null}

        {ocrNote ? (
          <p
            className={`mt-3 rounded-md border p-3 text-sm ${
              ocrStatus === "done"
                ? "border-sky-400/40 bg-sky-500/10 text-sky-100"
                : ocrStatus === "running"
                  ? "border-zinc-700 bg-zinc-900 text-zinc-100"
                  : "border-zinc-800 bg-zinc-900 text-zinc-300"
            }`}
          >
            {ocrNote}
          </p>
        ) : null}

        <form
          className="mt-4 space-y-4 pb-6"
          onSubmit={(event) => {
            event.preventDefault();
            void savePickup();
          }}
        >
          <label className="block">
            <span className="text-sm font-medium text-zinc-200">
              Tracking number
            </span>
            <input
              className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-4 text-lg text-white outline-none focus:border-emerald-400"
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
            <span className="flex items-center justify-between gap-3 text-sm font-medium text-zinc-200">
              Recipient name
              {ocrNamePendingVerify ? (
                <span className="text-xs font-normal text-sky-200">
                  Auto-filled, verify
                </span>
              ) : null}
            </span>
            <input
              className={`mt-2 w-full rounded-md border bg-zinc-900 px-4 py-4 text-lg text-white outline-none focus:border-emerald-400 ${
                ocrNamePendingVerify ? "border-sky-400" : "border-zinc-700"
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
            <span className="flex items-center justify-between gap-3 text-sm font-medium text-zinc-200">
              Recipient phone
              {ocrPhonePendingVerify ? (
                <span className="text-xs font-normal text-sky-200">
                  Auto-filled, verify
                </span>
              ) : null}
            </span>
            <input
              className={`mt-2 w-full rounded-md border bg-zinc-900 px-4 py-4 text-lg text-white outline-none focus:border-emerald-400 ${
                ocrPhonePendingVerify ? "border-sky-400" : "border-zinc-700"
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

          <button
            className="w-full rounded-md bg-emerald-500 px-4 py-4 text-base font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-60"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? "Saving..." : "Confirm Pickup"}
          </button>
        </form>
      </section>
    </main>
  );
}
