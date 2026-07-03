"use client";

import { useState } from "react";
import { formatPickupTimestamp } from "@/lib/format";

export type PdfPickup = {
  tracking_number: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  scanned_at: string;
};

type DownloadPdfButtonProps = {
  orgName: string;
  pickups: PdfPickup[];
};

export function DownloadPdfButton({
  orgName,
  pickups,
}: DownloadPdfButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function downloadPdf() {
    setIsGenerating(true);

    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 44;
      const manifestGreen = "#3F6B4E";
      const perforationGrey = "#C7BCA0";
      let y = 52;

      doc.setTextColor(63, 107, 78);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("PARCELLOG", margin, y);

      y += 30;
      doc.setTextColor(20, 32, 43);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(24);
      doc.text(orgName.toUpperCase(), margin, y, {
        maxWidth: pageWidth - margin * 2,
      });

      y += 28;
      doc.setFont("courier", "normal");
      doc.setFontSize(9);
      doc.text(`${pickups.length} visible records`, margin, y);
      doc.setDrawColor(perforationGrey);
      doc.line(margin, y + 16, pageWidth - margin, y + 16);
      y += 44;

      const columns = [
        { label: "TRACKING #", x: margin, width: 150 },
        { label: "RECIPIENT", x: margin + 166, width: 126 },
        { label: "PHONE", x: margin + 306, width: 92 },
        { label: "SCANNED AT", x: margin + 414, width: 96 },
      ];

      function drawHeader() {
        doc.setTextColor(20, 32, 43);
        doc.setFont("courier", "bold");
        doc.setFontSize(8);
        columns.forEach((column) => doc.text(column.label, column.x, y));
        doc.setDrawColor(20, 32, 43);
        doc.line(margin, y + 10, pageWidth - margin, y + 10);
        y += 28;
      }

      drawHeader();

      if (!pickups.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.text("No pickups logged yet today.", margin, y);
      }

      pickups.forEach((pickup) => {
        if (y > pageHeight - 72) {
          doc.addPage();
          y = 52;
          drawHeader();
        }

        doc.setTextColor(20, 32, 43);
        doc.setFontSize(9);
        doc.setFont("courier", "normal");
        doc.text(pickup.tracking_number, columns[0].x, y, {
          maxWidth: columns[0].width,
        });
        doc.setFont("helvetica", "normal");
        doc.text(pickup.recipient_name || "Unverified", columns[1].x, y, {
          maxWidth: columns[1].width,
        });
        doc.setFont("courier", "normal");
        doc.text(pickup.recipient_phone || "-", columns[2].x, y, {
          maxWidth: columns[2].width,
        });
        doc.text(formatPickupTimestamp(pickup.scanned_at), columns[3].x, y, {
          maxWidth: columns[3].width,
        });
        doc.setDrawColor(perforationGrey);
        doc.line(margin, y + 13, pageWidth - margin, y + 13);
        y += 26;
      });

      doc.setTextColor(manifestGreen);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("RECEIVED", pageWidth - 166, pageHeight - 44, {
        angle: -8,
      });

      doc.save(`parcellog-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <button
      className="rounded-[6px] border border-ledger-ink bg-paper-light px-3 py-2 font-semibold text-ledger-ink transition hover:bg-manifest-amber active:translate-y-px active:bg-[#b96f17] active:shadow-inner focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
      disabled={isGenerating}
      onClick={downloadPdf}
      type="button"
    >
      {isGenerating ? "Preparing PDF..." : "Download PDF"}
    </button>
  );
}
