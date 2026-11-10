"use client";

import { useRef, type ReactNode } from "react";
import Button from "@/components/ui/Button";

type PrintPreviewProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  paperSize?: "A4";
  orientation?: "portrait" | "landscape";
};

export default function PrintPreview({
  open,
  onClose,
  title = "Pratinjau cetak · A4 Portrait",
  subtitle = "Periksa dokumen sebelum mencetak.",
  children,
  actions,
  paperSize = "A4",
  orientation = "portrait",
}: PrintPreviewProps) {
  const pageWidth = orientation === "landscape" ? "297mm" : "210mm";
  const pageHeight = orientation === "landscape" ? "210mm" : "297mm";
  const paperRef = useRef<HTMLElement>(null);

  function handlePrint() {
    const paper = paperRef.current;
    if (!paper) return;

    // Iframe tersembunyi mencegah tab/jendela baru saat mencetak.
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.title = "Dokumen untuk dicetak";
    Object.assign(frame.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "1px",
      height: "1px",
      border: "0",
      opacity: "0",
    });
    document.body.appendChild(frame);

    const printDocument = frame.contentDocument;
    const printWindow = frame.contentWindow;
    if (!printDocument || !printWindow) {
      frame.remove();
      return;
    }

    const links = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
    )
      .map((link) => link.href)
      .filter(Boolean)
      .map((href) => `<link rel="stylesheet" href="${href}">`)
      .join("");
    const styles = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent || "")
      .join("\\n");

    printDocument.open();
    printDocument.write(`<!doctype html>
      <html lang="id">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${title}</title>
          ${links}
          <style>
            ${styles}
            @page {
              size: ${paperSize} ${orientation};
              margin: 0;
              @bottom-right {
                content: "hal " counter(page) "/" counter(pages);
                margin-right: 13mm;
                margin-bottom: 6mm;
                color: #64748b;
                font-family: Arial, sans-serif;
                font-size: 9pt;
                font-style: italic;
              }
            }
            html, body {
              width: ${pageWidth} !important;
              min-height: ${pageHeight} !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
            }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .print-preview-paper {
              box-sizing: border-box !important;
              display: flex !important;
              flex-direction: column !important;
              width: ${pageWidth} !important;
              min-height: ${pageHeight} !important;
              margin: 0 auto !important;
              padding: 12mm 13mm !important;
              zoom: 1 !important;
              transform: none !important;
              background: #fff !important;
              color: #0f172a !important;
              box-shadow: none !important;
            }
            .print-preview-bottom {
              display: flex !important;
              align-items: flex-end !important;
              justify-content: space-between !important;
              gap: 12px !important;
              margin-top: auto !important;
              padding-top: 18px !important;
              font-style: italic !important;
            }
            .print-preview-date, .print-preview-document-note {
              margin: 0 !important;
              font-style: italic !important;
            }
            .print-preview-date { text-align: left !important; }
            .print-preview-document-note { text-align: right !important; }
            @media print {
              html, body { width: ${pageWidth} !important; }
              .print-preview-paper { margin: 0 !important; }
              tr { break-inside: avoid; }
            }
          </style>
        </head>
        <body></body>
      </html>`);
    const clonedPaper = paper.cloneNode(true) as HTMLElement;
    clonedPaper.classList.add("print-preview-paper");
    printDocument.body.appendChild(clonedPaper);
    printDocument.close();

    const cleanup = () => frame.remove();
    printWindow.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      window.setTimeout(cleanup, 60000);
    }, 700);
  }

  if (!open) return null;

  return (
    <div className="print-preview-overlay fixed inset-0 z-[90] flex flex-col bg-slate-900/80 p-2 backdrop-blur-sm sm:p-4">
      <div className="print-preview-toolbar mx-auto mb-3 flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/15 bg-slate-950/90 px-3 py-3 text-white shadow-xl">
        <div>
          <p className="text-sm font-bold">{title}</p>
          <p className="text-xs text-slate-300">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onClose}>Tutup</Button>
          <Button onClick={handlePrint}>Cetak</Button>
          {actions}
        </div>
      </div>
      <div className="print-preview-scroll min-h-0 flex-1 overflow-auto pb-6">
        <article ref={paperRef} className="print-preview-paper mx-auto bg-white text-slate-900 shadow-2xl" style={{ width: pageWidth, minHeight: pageHeight }}>
          {children}
        </article>
      </div>
      <style jsx global>{`
        .print-preview-paper {
          box-sizing: border-box;
          width: 210mm;
          display: flex;
          flex-direction: column;
          min-height: 297mm;
          padding: 12mm 13mm;
          color: #0f172a;
        }
        .print-preview-bottom {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          margin-top: auto;
          padding-top: 18px;
          font-size: 9px;
          font-style: italic;
          color: #64748b;
        }
        .print-preview-date, .print-preview-document-note {
          margin: 0;
          font-style: italic;
        }
        .print-preview-document-note { text-align: right; }
        @media (max-width: 480px) {
          .print-preview-scroll { overflow: auto; padding-bottom: 16px; }
          .print-preview-paper { zoom: 0.46; }
          .print-preview-toolbar { flex-direction: column; align-items: stretch; }
          .print-preview-toolbar > div:last-child {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 6px;
          }
        }
        @media (min-width: 481px) and (max-width: 600px) {
          .print-preview-paper { zoom: 0.56; }
        }
        @media (min-width: 601px) and (max-width: 900px) {
          .print-preview-paper { zoom: 0.72; }
        }
      `}</style>
    </div>
  );
}
