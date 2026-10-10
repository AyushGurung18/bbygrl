"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import AuthModal from "@/components/AuthModal";

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
const cardBg = "#dedad0";
const borderCol = "rgba(0,0,0,0.10)";
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
      formData.append("file", f);
      const res = await fetch(`${API}/upload?session_id=${session.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        let detail = `Upload failed (status ${res.status}).`;
        try {
          const body = await res.json();
          if (body?.detail) detail = body.detail;
        } catch {}
        throw new Error(detail);
      }
      await fetchDocs();
    } catch (e: any) {
      setUploadError(e?.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
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
          <Link href="/upload" style={{ color: green, fontSize: "0.72rem", textDecoration: "none", letterSpacing: "0.08em" }}>
            ← back to chat
          </Link>
          <h1 style={{ fontSize: "1.1rem", fontWeight: 900, margin: 0, flex: 1 }}>Document Library</h1>

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

        {selected.size > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: "0.8rem", marginBottom: "1rem",
            padding: "0.6rem 0.9rem", background: cardBg, border: `1px solid ${borderCol}`, borderRadius: 4, fontSize: "0.72rem",
          }}>
            <span>{selected.size} selected</span>
            <button
              onClick={askAcrossSelected}
              disabled={selected.size < 2 || busyAction}
              style={{ ...pillBtn, opacity: selected.size < 2 ? 0.4 : 1 }}
            >
              ask across selected →
            </button>
            <button
              onClick={compareSelected}
              disabled={selected.size !== 2 || busyAction}
              style={{ ...pillBtn, opacity: selected.size !== 2 ? 0.4 : 1 }}
            >
              compare (needs exactly 2) →
            </button>
            <button onClick={() => setSelected(new Set())} style={{ ...pillBtn, marginLeft: "auto" }}>
              clear
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ fontSize: "0.75rem", color: "#8a9a7a" }}>Loading…</div>
        ) : loadError ? (
          <div style={{ fontSize: "0.75rem", color: "#c85050" }}>{loadError}</div>
        ) : docs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 1rem", color: "#8a9a7a", fontSize: "0.78rem" }}>
            No documents yet. Upload a PDF or DOCX contract to get started.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {docs.map((d) => (
              <div
                key={d.id}
                style={{
                  display: "flex", alignItems: "center", gap: "0.9rem", padding: "0.8rem 1rem",
                  background: cardBg, border: `1px solid ${selected.has(d.id) ? green : borderCol}`, borderRadius: 5,
                }}
              >
                <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelected(d.id)} style={{ cursor: "pointer" }} />
                <div style={{ fontSize: "0.65rem", padding: "0.15rem 0.4rem", border: `1px solid ${borderCol}`, borderRadius: 3, color: green, textTransform: "uppercase" }}>
                  {d.doc_type}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.filename}
                  </div>
                  <div style={{ fontSize: "0.63rem", color: "#6a8a6a" }}>
                    {d.page_count ? `${d.page_count} page${d.page_count === 1 ? "" : "s"}` : d.char_count ? `${Math.round(d.char_count / 1000)}k chars` : ""}
                    {"  ·  "}
                    <span style={{ color: statusColor(d) }}>{statusLabel(d)}</span>
                  </div>
                </div>
                <button onClick={() => openDocument(d)} disabled={busyAction || d.status !== "ready"} style={pillBtn}>
                  open →
                </button>
                <button onClick={() => setDeleteTarget(d)} style={{ ...pillBtn, color: "#c85050", borderColor: "rgba(200,80,80,0.4)" }}>
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
    </div>
  );
}

const pillBtn: React.CSSProperties = {
  padding: "0.35rem 0.7rem", background: "transparent", border: `1px solid ${borderCol}`,
  borderRadius: 3, color: green, cursor: "pointer", fontSize: "0.68rem", ...mono,
};
