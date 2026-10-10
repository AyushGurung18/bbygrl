"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import mammoth from "mammoth";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { findAndHighlight, clearHighlights } from "@/lib/highlight";

// Bundles the pdf.js worker with the app instead of pulling it from a CDN
// at runtime — the standard pattern for react-pdf under webpack/Next.js.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export type ViewerTarget = {
  documentId: string;
  docType: "pdf" | "docx";
  filename: string;
  quote?: string;         // text to locate & highlight, if any
  page?: number | null;   // PDF only — jump here before searching
  pageEnd?: number | null; // PDF only — set when the quote spans onto a later page; renders page..pageEnd together so the search can cross the page break
};

const HIGHLIGHT_CLASS = "cite-highlight";

export default function DocumentViewer({
  target,
  apiBase,
  authHeaders,
  onClose,
}: {
  target: ViewerTarget;
  apiBase: string;
  authHeaders: () => Promise<Record<string, string>>;
  onClose: () => void;
}) {
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(target.page || 1);
  // Set from target.pageEnd when a quote spans onto a later page; renders
  // pageNum..spanPageEnd stacked together so the text-layer search can
  // cross the page break, same whitespace-tolerant join as a line break
  // within one page. Cleared on manual prev/next navigation — once the
  // user is just browsing, go back to one page at a time.
  const [spanPageEnd, setSpanPageEnd] = useState<number | null>(target.pageEnd ?? null);
  const [notFound, setNotFound] = useState(false);
  const docxContainerRef = useRef<HTMLDivElement>(null);
  const pageWrapRef = useRef<HTMLDivElement>(null);
  const renderedTextLayersRef = useRef<Set<number>>(new Set());

  const pagesToRender = useMemo(() => {
    if (spanPageEnd && spanPageEnd > pageNum) {
      return Array.from({ length: spanPageEnd - pageNum + 1 }, (_, i) => pageNum + i);
    }
    return [pageNum];
  }, [pageNum, spanPageEnd]);

  useEffect(() => {
    setPageNum(target.page || 1);
    setSpanPageEnd(target.pageEnd ?? null);
    renderedTextLayersRef.current = new Set();
    setNotFound(false);
  }, [target.documentId, target.page, target.pageEnd]);

  const goToPage = useCallback((updater: (p: number) => number) => {
    setSpanPageEnd(null); // manual navigation: back to single-page browsing
    renderedTextLayersRef.current = new Set();
    setPageNum(updater);
  }, []);

  // Fetch the original file once per document
  useEffect(() => {
    let cancelled = false;
    setFileData(null);
    setHtmlContent("");
    setLoadError(null);
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`${apiBase}/documents/${target.documentId}/file`, { headers });
        if (!res.ok) throw new Error(`Couldn't load the document (status ${res.status}).`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        if (target.docType === "docx") {
          const result = await mammoth.convertToHtml({ arrayBuffer: buf });
          if (!cancelled) setHtmlContent(result.value);
        } else {
          setFileData(buf);
        }
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || "Could not load the document.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.documentId, target.docType]);

  // DOCX: highlight once the HTML is rendered into the DOM
  useEffect(() => {
    if (target.docType !== "docx" || !htmlContent) return;
    const container = docxContainerRef.current;
    if (!container) return;
    const timer = setTimeout(() => {
      clearHighlights(container, HIGHLIGHT_CLASS);
      if (!target.quote) return;
      const mark = findAndHighlight(container, target.quote, HIGHLIGHT_CLASS);
      if (mark) {
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
        setNotFound(false);
      } else {
        setNotFound(true);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [htmlContent, target.quote, target.docType]);

  // PDF: search once every page in pagesToRender has its text layer ready —
  // a single page when the quote doesn't cross a page break, or several
  // stacked together when it does (see spanPageEnd above). Searching the
  // whole wrapper (not one page's .react-pdf__Page__textContent) lets the
  // tree walker in findAndHighlight() flow across all of them as one
  // continuous text stream, inserting the same whitespace-tolerant gap
  // between pages that it already inserts between lines within one page.
  const handleTextLayerSuccess = useCallback((pageNumber: number) => {
    renderedTextLayersRef.current.add(pageNumber);
    if (!pagesToRender.every(p => renderedTextLayersRef.current.has(p))) return;

    const container = pageWrapRef.current;
    if (!container) return;
    clearHighlights(container, HIGHLIGHT_CLASS);
    if (!target.quote) return;
    const mark = findAndHighlight(container, target.quote, HIGHLIGHT_CLASS);
    if (mark) {
      mark.scrollIntoView({ behavior: "smooth", block: "center" });
      setNotFound(false);
    } else {
      setNotFound(true);
    }
  }, [target.quote, pagesToRender]);

  const mono = { fontFamily: "'Courier New', Courier, monospace" } as React.CSSProperties;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#e6e1d8", width: "min(900px, 100%)", height: "100%", maxHeight: "92vh",
          borderRadius: 6, display: "flex", flexDirection: "column", overflow: "hidden",
          border: "1px solid rgba(0,0,0,0.15)", boxShadow: "0 12px 48px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{
          padding: "0.8rem 1rem", borderBottom: "1px solid rgba(0,0,0,0.1)",
          display: "flex", alignItems: "center", gap: "0.8rem", ...mono,
        }}>
          <div style={{ flex: 1, fontSize: "0.78rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {target.filename}
          </div>
          {target.docType === "pdf" && numPages > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.72rem" }}>
              <button onClick={() => goToPage((p) => Math.max(1, p - 1))} style={navBtnStyle}>‹</button>
              <span>{pagesToRender.length > 1 ? `${pageNum}-${pagesToRender[pagesToRender.length - 1]}` : pageNum} / {numPages}</span>
              <button onClick={() => goToPage((p) => Math.min(numPages, p + 1))} style={navBtnStyle}>›</button>
            </div>
          )}
          <button onClick={onClose} style={{ ...navBtnStyle, fontSize: "0.9rem" }}>✕</button>
        </div>

        {notFound && target.quote && (
          <div style={{
            padding: "0.5rem 1rem", background: "rgba(200,150,50,0.12)", fontSize: "0.68rem",
            color: "#8a6a2a", borderBottom: "1px solid rgba(0,0,0,0.08)", ...mono,
          }}>
            Couldn't locate this exact passage in the rendered view{target.docType === "pdf" ? (pagesToRender.length > 1 ? ` across pages ${pageNum}-${pagesToRender[pagesToRender.length - 1]}` : " on this page") : ""} — it may be split across a layout element the renderer doesn't expose as plain text.
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto", padding: "1rem", background: "#fff" }}>
          {loadError && <div style={{ color: "#c85050", fontSize: "0.78rem", ...mono }}>{loadError}</div>}

          {target.docType === "docx" ? (
            <div
              ref={docxContainerRef}
              className="docx-viewer-content"
              style={{ maxWidth: 720, margin: "0 auto", fontSize: "0.85rem", lineHeight: 1.7, color: "#222" }}
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          ) : fileData ? (
            <Document
              file={fileData}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              onLoadError={(e) => setLoadError(e.message || "Could not render this PDF.")}
              loading={<div style={{ ...mono, fontSize: "0.75rem" }}>Loading PDF…</div>}
            >
              <div ref={pageWrapRef} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                {pagesToRender.map((p) => (
                  <Page
                    key={p}
                    pageNumber={p}
                    renderAnnotationLayer={false}
                    onRenderTextLayerSuccess={() => handleTextLayerSuccess(p)}
                    width={660}
                  />
                ))}
              </div>
            </Document>
          ) : (
            !loadError && <div style={{ ...mono, fontSize: "0.75rem" }}>Loading…</div>
          )}
        </div>
      </div>

      <style>{`
        mark.${HIGHLIGHT_CLASS} {
          background: #ffe066;
          color: #1a2a1a;
          border-radius: 2px;
          padding: 0 1px;
        }
        .docx-viewer-content p { margin: 0 0 0.9em; }
        .docx-viewer-content table { border-collapse: collapse; margin: 0.5em 0; }
        .docx-viewer-content td, .docx-viewer-content th { border: 1px solid #ccc; padding: 0.3em 0.6em; }
      `}</style>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: "transparent", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 3,
  cursor: "pointer", padding: "0.2rem 0.5rem", color: "#1a2a1a",
};
