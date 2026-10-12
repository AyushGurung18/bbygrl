"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import AuthModal from "@/components/AuthModal";
import { readApiError } from "@/lib/apiError";

type DocumentRow = {
  id: string;
  filename: string;
  doc_type: "pdf" | "docx";
  status: "ready" | "empty" | "failed" | "processing";
  page_count: number | null;
  char_count: number | null;
  created_at: string;
  home_session_id: string | null;
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];

const bg = "#e6e1d8";
const green = "#1a6b3a";
const cardBg = "#d4cfc4";        /* darker card for better contrast */
const borderCol = "rgba(0,0,0,0.18)";
const textPrimary = "#1a2a1a";
const textMuted = "#4a6a4a";
const mono = { fontFamily: "'Courier New', Courier, monospace" } as React.CSSProperties;

export default function LibraryPage() {
  const router = useRouter();
  const { user, isAnonymous, getToken, isLoading: authLoading } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // A document row only exists once ingestion finishes — /upload just
  // queues a background job and returns a job_id. Until that job reaches
  // done/failed there's nothing in GET /documents to show yet, so an
  // in-flight upload is tracked separately and rendered as its own
  // "indexing…" row instead of silently showing nothing.
  type PendingUpload = { key: string; filename: string; progress: number };
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch(`${API}/documents`, { headers: await authHeaders() });
      if (!res.ok) throw new Error(`Failed to load library (status ${res.status}).`);
      const data = await res.json();
      setDocs(data.documents ?? []);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.message || "Could not load your documents.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (authLoading) return;
    fetchDocs();
  }, [authLoading, fetchDocs]);

  // Poll while anything is still processing so status/page counts settle
  // without the user having to manually refresh.
  useEffect(() => {
    if (!docs.some((d) => d.status === "processing")) return;
    const t = setInterval(fetchDocs, 2500);
    return () => clearInterval(t);
  }, [docs, fetchDocs]);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;

    const ext = ACCEPTED_EXTENSIONS.find((x) => f.name.toLowerCase().endsWith(x));
    if (!ext) {
      setUploadError(`Unsupported file type. Only ${ACCEPTED_EXTENSIONS.join(", ")} files are supported.`);
      return;
    }
    if (f.size > MAX_UPLOAD_SIZE_BYTES) {
      setUploadError(`That file is too large (max ${Math.floor(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))}MB).`);
      return;
    }

    setUploading(true);
    setUploadError(null);
    const pendingKey = `${f.name}-${Date.now()}`;
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session isn't ready yet. Please wait a moment and try again.");

      // Create a fresh session for this upload up front, so the library
      // card's "home" chat exists the moment the upload is queued.
      const sessionRes = await fetch(`${API}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: f.name.slice(0, 40) }),
      });
      if (!sessionRes.ok) throw new Error("Could not start a chat session for this upload.");
      const session = await sessionRes.json();

      const formData = new FormData();
      formData.append("file", f, f.name);
      const res = await fetch(`${API}/upload?session_id=${session.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, `Upload failed (status ${res.status}).`));
      }
      const { job_id } = await res.json();
      if (!job_id) throw new Error("Upload succeeded but no job was returned to track indexing.");

      // /upload only queues the job — the document row doesn't exist until
      // the Celery worker finishes chunking/embedding, so GET /documents
      // has nothing to show yet. Poll job status and render a synthetic
      // "indexing…" row in the meantime instead of silently showing nothing
      // until the user happens to refresh.
      setPendingUploads((prev) => [...prev, { key: pendingKey, filename: f.name, progress: 0 }]);
      setUploading(false); // let the button free up; progress now shows via the pending row

      const POLL_INTERVAL_MS = 1500;
      const POLL_TIMEOUT_MS = 180_000;
      const pollStart = Date.now();
      let finalStatus: any = null;
      while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const statusRes = await fetch(`${API}/upload/status/${job_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!statusRes.ok) continue;
        const statusData = await statusRes.json();
        if (statusData.status === "done" || statusData.status === "failed") {
          finalStatus = statusData;
          break;
        }
        const pct = typeof statusData.progress_percent === "number" ? statusData.progress_percent : 0;
        setPendingUploads((prev) => prev.map((p) => (p.key === pendingKey ? { ...p, progress: pct } : p)));
      }

      if (!finalStatus) {
        setUploadError(`Indexing "${f.name}" is taking longer than expected. It may still finish in the background — refresh shortly.`);
      } else if (finalStatus.status === "failed") {
        setUploadError(`Failed to index "${f.name}"${finalStatus.error ? `: ${finalStatus.error}` : "."}`);
      } else {
        await fetchDocs();
      }
    } catch (e: any) {
      setUploadError(e?.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      setPendingUploads((prev) => prev.filter((p) => p.key !== pendingKey));
    }
  };

  const openDocument = async (doc: DocumentRow) => {
    if (doc.home_session_id) {
      router.push(`/upload?session=${doc.home_session_id}`);
      return;
    }
    setBusyAction(true);
    try {
      const res = await fetch(`${API}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ title: doc.filename.slice(0, 40), document_ids: [doc.id] }),
      });
      const session = await res.json();
      router.push(`/upload?session=${session.id}`);
    } finally {
      setBusyAction(false);
    }
  };

  const askAcrossSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length < 2) return;
    setBusyAction(true);
    try {
      const names = docs.filter((d) => ids.includes(d.id)).map((d) => d.filename);
      const res = await fetch(`${API}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ title: `Compare: ${names.join(", ")}`.slice(0, 60), document_ids: ids }),
      });
      const session = await res.json();
      router.push(`/upload?session=${session.id}`);
    } finally {
      setBusyAction(false);
    }
  };

  const compareSelected = () => {
    const ids = Array.from(selected);
    if (ids.length !== 2) return;
    router.push(`/compare?a=${ids[0]}&b=${ids[1]}`);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    setDocs((prev) => prev.filter((d) => d.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      await fetch(`${API}/documents/${id}`, { method: "DELETE", headers: await authHeaders() });
    } catch {
      fetchDocs();
    }
  };

  const downloadDocument = async (doc: DocumentRow) => {
    setBusyAction(true);
    try {
      const res = await fetch(`${API}/documents/${doc.id}/file`, {
        headers: await authHeaders(),
      });
      if (!res.ok) throw new Error("Could not fetch the raw file.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setUploadError(e?.message || "Failed to download document.");
    } finally {
      setBusyAction(false);
    }
  };

  const statusLabel = (d: DocumentRow) => {
    if (d.status === "processing") return "indexing…";
    if (d.status === "failed") return "failed";
    if (d.status === "empty") return "no readable text";
    return "ready";
  };

  const statusColor = (d: DocumentRow) => {
    if (d.status === "ready") return green;
    if (d.status === "processing") return "#8a7a2a";
    return "#c85050";
  };

  return (
    <div style={{ minHeight: "100vh", background: bg, ...mono, padding: "1.6rem 1.4rem" }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", marginBottom: "1.6rem", flexWrap: "wrap" }}>
          <Link href="/upload" style={{ color: green, fontSize: "0.72rem", textDecoration: "none", letterSpacing: "0.08em", fontWeight: 700 }}>
            ← back to chat
          </Link>
          <h1 style={{ fontSize: "1.2rem", fontWeight: 900, margin: 0, flex: 1, color: textPrimary, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.3rem" }}>📚</span> Document Library
          </h1>

          <input type="file" accept=".pdf,.docx" ref={fileInputRef} onChange={handleFilePicked} style={{ display: "none" }} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              padding: "0.55rem 1rem", background: uploading ? "rgba(0,0,0,0.08)" : green,
              color: uploading ? "#8a9a7a" : "#fff", border: "none", borderRadius: 4,
              fontSize: "0.72rem", cursor: uploading ? "not-allowed" : "pointer", ...mono,
            }}
          >
            {uploading ? "uploading…" : "+ upload document"}
          </button>

          {isAnonymous ? (
            <button onClick={() => setAuthModalOpen(true)} style={{ fontSize: "0.65rem", color: green, background: "none", border: "none", cursor: "pointer" }}>
              [ sign in ]
            </button>
          ) : (
            <span style={{ fontSize: "0.65rem", color: "#5a7a5a" }}>{user?.email}</span>
          )}
        </div>

        {uploadError && (
          <div style={{ padding: "0.6rem 0.9rem", background: "rgba(200,50,50,0.08)", border: "1px solid rgba(200,50,50,0.3)", borderRadius: 4, marginBottom: "1rem", fontSize: "0.72rem", color: "#c85050" }}>
            {uploadError}
          </div>
        )}

        {/* Selection action bar */}
        {selected.size > 0 ? (
          <div style={{
            display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem", flexWrap: "wrap",
            padding: "0.65rem 1rem", background: `rgba(26,107,58,0.06)`,
            border: `1px solid rgba(26,107,58,0.2)`, borderRadius: 6, fontSize: "0.72rem",
          }}>
            <span style={{ fontWeight: 700, color: green }}>
              {selected.size} document{selected.size !== 1 ? "s" : ""} selected
            </span>
            {selected.size === 1 && (
              <span style={{ color: "#8a9a7a", fontSize: "0.68rem" }}>— select 1 more to compare or ask across</span>
            )}
            <div style={{ display: "flex", gap: "0.5rem", marginLeft: "auto", flexWrap: "wrap" }}>
              <button
                onClick={askAcrossSelected}
                disabled={selected.size < 2 || busyAction}
                style={{ ...pillBtn, opacity: selected.size < 2 ? 0.35 : 1 }}
              >
                Ask across {selected.size} docs →
              </button>
              <button
                onClick={compareSelected}
                disabled={selected.size !== 2 || busyAction}
                title={selected.size !== 2 ? "Select exactly 2 documents to compare" : "Compare these 2 documents"}
                style={{
                  ...pillBtn,
                  background: selected.size === 2 ? green : "rgba(0,0,0,0.06)",
                  color: selected.size === 2 ? "#fff" : "#aaa",
                  border: selected.size === 2 ? `1px solid ${green}` : `1px solid ${borderCol}`,
                  cursor: selected.size !== 2 ? "not-allowed" : "pointer",
                }}
              >
                {selected.size === 2 ? "Compare side-by-side →" : `Compare (need exactly 2)`}
              </button>
              <button onClick={() => setSelected(new Set())} style={{ ...pillBtn, color: "#888" }}>Clear</button>
            </div>
          </div>
        ) : (
          docs.length > 0 && (
            <div style={{
              fontSize: "0.7rem", color: "#8a9a7a", marginBottom: "0.8rem",
              padding: "0.45rem 0.7rem", background: "rgba(0,0,0,0.03)",
              borderRadius: 5, border: `1px solid ${borderCol}`,
            }}>
              Tip: Click the checkbox on documents to select them, then compare or ask across multiple at once.
            </div>
          )
        )}

        {loading ? (
          <div style={{ fontSize: "0.75rem", color: "#8a9a7a" }}>Loading…</div>
        ) : loadError ? (
          <div style={{ fontSize: "0.75rem", color: "#c85050" }}>{loadError}</div>
        ) : docs.length === 0 && pendingUploads.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 1rem", color: "#8a9a7a", fontSize: "0.78rem" }}>
            No documents yet. Upload a PDF or DOCX contract to get started.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {pendingUploads.map((p) => (
              <div
                key={p.key}
                style={{
                  display: "flex", alignItems: "center", gap: "0.9rem", padding: "0.8rem 1rem",
                  background: cardBg, border: `1px dashed ${borderCol}`, borderRadius: 5, opacity: 0.8,
                }}
              >
                <span className="mini-spinner" style={{
                  width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
                  border: "2px solid rgba(26,107,58,0.25)", borderTopColor: green,
                  animation: "spin 0.7s linear infinite",
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.filename}
                  </div>
                  <div style={{ fontSize: "0.63rem", color: "#8a7a2a" }}>indexing… {p.progress}%</div>
                </div>
              </div>
            ))}
            {docs.map((d) => (
              <div
                key={d.id}
                className="doc-row"
                style={{
                  display: "flex", alignItems: "center", gap: "0.9rem", padding: "1rem 1.2rem",
                  background: cardBg, border: `1.5px solid ${selected.has(d.id) ? green : borderCol}`, borderRadius: 8,
                  boxShadow: selected.has(d.id) ? `0 4px 12px rgba(26,107,58,0.15)` : `0 2px 5px rgba(0,0,0,0.05)`,
                  transition: "all 0.2s ease"
                }}
              >
                <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelected(d.id)} style={{ cursor: "pointer", accentColor: green, width: 16, height: 16 }} />
                <div style={{
                  fontSize: "0.65rem", padding: "0.15rem 0.45rem",
                  border: `1.5px solid ${green}`,
                  borderRadius: 3, color: green,
                  background: "rgba(26,107,58,0.08)",
                  textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em",
                }}>
                  {d.doc_type}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: textPrimary }}>
                    {d.filename}
                  </div>
                  <div style={{ fontSize: "0.63rem", color: textMuted, marginTop: 2 }}>
                    {d.page_count ? `${d.page_count} page${d.page_count === 1 ? "" : "s"}` : d.char_count ? `${Math.round(d.char_count / 1000)}k chars` : ""}
                    {"  ·  "}
                    <span style={{ color: statusColor(d), fontWeight: 600 }}>{statusLabel(d)}</span>
                  </div>
                </div>
                <button onClick={() => downloadDocument(d)} disabled={busyAction || d.status !== "ready"} style={{
                  ...pillBtn,
                  opacity: (busyAction || d.status !== "ready") ? 0.5 : 1,
                  cursor: (busyAction || d.status !== "ready") ? "not-allowed" : "pointer",
                }}>
                  view raw ⬇
                </button>
                <button onClick={() => openDocument(d)} disabled={busyAction || d.status !== "ready"} style={{
                  ...pillBtn,
                  background: green,
                  color: "#fff",
                  borderColor: green,
                  opacity: (busyAction || d.status !== "ready") ? 0.5 : 1,
                  cursor: (busyAction || d.status !== "ready") ? "not-allowed" : "pointer",
                }}>
                  chat →
                </button>
                <button onClick={() => setDeleteTarget(d)} style={{ ...pillBtn, color: "#b83030", borderColor: "rgba(200,60,60,0.55)", fontWeight: 700 }}>
                  delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      {deleteTarget && (
        <div
          onClick={() => setDeleteTarget(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: bg, border: `1px solid ${green}`, borderRadius: 4, padding: "1.5rem", maxWidth: 360 }}>
            <div style={{ fontWeight: 900, fontSize: "0.9rem", marginBottom: "0.7rem" }}>[ DELETE DOCUMENT ]</div>
            <div style={{ fontSize: "0.72rem", color: "#5a7a5a", lineHeight: 1.6, marginBottom: "1.2rem" }}>
              Delete "{deleteTarget.filename}"? This removes it and its chat context permanently.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
              <button onClick={() => setDeleteTarget(null)} style={pillBtn}>cancel</button>
              <button onClick={confirmDelete} style={{ ...pillBtn, background: "#b33939", color: "#fff", border: "none" }}>delete</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .doc-row:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.08) !important;
          border-color: rgba(26,107,58,0.4) !important;
        }
      `}</style>
    </div>
  );
}

const pillBtn: React.CSSProperties = {
  padding: "0.38rem 0.8rem",
  background: "transparent",
  border: `1.5px solid ${borderCol}`,
  borderRadius: 3,
  color: green,
  cursor: "pointer",
  fontSize: "0.68rem",
  fontWeight: 600,
  ...mono,
};
