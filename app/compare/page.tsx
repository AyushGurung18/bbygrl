"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

type Change = {
  type: "added" | "removed" | "modified";
  before: string;
  after: string;
  summary: string;
  significance: "minor" | "moderate" | "major";
};

type CompareResult = {
  document_a: string;
  document_b: string;
  total_segments_a: number;
  total_segments_b: number;
  similarity_score?: number;
  relatedness?: "unrelated" | "partial" | "related";
  error?: string;
  changes: Change[];
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const green = "#1a6b3a";
const bg = "#e6e1d8";
const cardBg = "#f0ede7";
const borderCol = "rgba(0,0,0,0.08)";
const sansSerif = { fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" } as React.CSSProperties;

const SIG_COLOR: Record<string, string> = { major: "#c85050", moderate: "#b8832a", minor: "#4a8a5a" };
const SIG_BG: Record<string, string> = { major: "rgba(200,80,80,0.08)", moderate: "rgba(184,131,42,0.08)", minor: "rgba(74,138,90,0.08)" };
const TYPE_LABEL: Record<string, string> = { added: "Added", removed: "Removed", modified: "Modified" };
const TYPE_ICON: Record<string, string> = { added: "+", removed: "−", modified: "~" };

function ComparePageInner() {
  const params = useSearchParams();
  const a = params.get("a");
  const b = params.get("b");
  const { getToken, isLoading: authLoading } = useAuth();

  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sigFilter, setSigFilter] = useState<Set<string>>(new Set(["major", "moderate", "minor"]));

  const run = useCallback(async () => {
    if (!a || !b) {
      setError("Two document IDs are required. Go to your Library, select exactly 2 documents, then click Compare.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/documents/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ document_id_a: a, document_id_b: b }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || `Comparison failed (status ${res.status}).`);
      }
      setResult(await res.json());
    } catch (e: any) {
      setError(e?.message || "Comparison failed.");
    } finally {
      setLoading(false);
    }
  }, [a, b, getToken]);

  // Handle backend-level "unrelated" result (not an HTTP error but has .error)
  const backendError = result?.error ?? null;
  const isUnrelated = result?.relatedness === "unrelated";
  const isPartial = result?.relatedness === "partial";

  useEffect(() => {
    if (authLoading) return;
    run();
  }, [authLoading, run]);

  const toggleSig = (sig: string) => {
    setSigFilter((prev) => {
      const next = new Set(prev);
      if (next.has(sig)) next.delete(sig);
      else next.add(sig);
      return next;
    });
  };

  const visibleChanges = result?.changes.filter((c) => sigFilter.has(c.significance)) ?? [];

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100dvh", width: "100vw",
      background: bg, overflow: "hidden", ...sansSerif,
    }}>
      {/* TOP BAR */}
      <div style={{
        flexShrink: 0, borderBottom: `1px solid ${borderCol}`,
        background: "rgba(230,225,216,0.96)", backdropFilter: "blur(8px)",
        padding: "0.9rem 1.5rem", display: "flex", alignItems: "center", gap: "1rem", zIndex: 10,
      }}>
        <Link href="/library" style={{
          color: green, fontSize: "0.75rem", textDecoration: "none", fontWeight: 600,
          display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0,
        }}>
          ← Library
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
          {result ? (
            <>
              <span style={{
                fontSize: "0.78rem", fontWeight: 700, color: "#1a2a1a",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{result.document_a}</span>
              <span style={{ color: "#aaa", flexShrink: 0, fontSize: "0.85rem" }}>vs</span>
              <span style={{
                fontSize: "0.78rem", fontWeight: 700, color: "#1a2a1a",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{result.document_b}</span>
            </>
          ) : (
            <h1 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, color: "#1a2a1a" }}>Document Comparison</h1>
          )}
        </div>
        {result && (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {!isUnrelated && (
              <div style={{
                flexShrink: 0, fontSize: "0.7rem", color: "#777", background: "rgba(0,0,0,0.04)",
                padding: "0.3rem 0.7rem", borderRadius: 20, border: `1px solid ${borderCol}`,
              }}>
                {result.changes.length} change{result.changes.length !== 1 ? "s" : ""}
              </div>
            )}
            {result.similarity_score !== undefined && (
              <div style={{
                flexShrink: 0, fontSize: "0.7rem", fontWeight: 600,
                color: isUnrelated ? "#c85050" : isPartial ? "#b8832a" : "#4a8a5a",
                background: isUnrelated ? "rgba(200,80,80,0.06)" : isPartial ? "rgba(184,131,42,0.06)" : "rgba(74,138,90,0.06)",
                padding: "0.3rem 0.7rem", borderRadius: 20,
                border: `1px solid ${isUnrelated ? "rgba(200,80,80,0.2)" : isPartial ? "rgba(184,131,42,0.2)" : "rgba(74,138,90,0.2)"}`,
              }}>
                {Math.round((result.similarity_score ?? 0) * 100)}% overlap · {result.relatedness}
              </div>
            )}
          </div>
        )}
      </div>

      {/* SCROLLABLE BODY */}
      <div style={{ flex: 1, overflowY: "auto", padding: "1.4rem 1.5rem" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>

          {/* HOW TO USE — always visible until result loads */}
          {!result && !loading && !error && (
            <div style={{
              background: cardBg, border: `1px solid ${borderCol}`, borderRadius: 10,
              padding: "1.2rem 1.4rem", marginBottom: "1.2rem", fontSize: "0.8rem", color: "#555",
            }}>
              <div style={{ fontWeight: 700, color: "#1a2a1a", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
                How to compare documents
              </div>
              <ol style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 2 }}>
                <li>Go to <Link href="/library" style={{ color: green }}>Library</Link></li>
                <li>Click the checkbox on <strong>exactly 2</strong> documents</li>
                <li>Click the <strong>"Compare →"</strong> button that appears at the top</li>
              </ol>
            </div>
          )}

          {loading && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: "4rem", gap: "1rem" }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                border: `3px solid rgba(26,107,58,0.15)`, borderTopColor: green,
                animation: "spin 0.8s linear infinite",
              }} />
              <span style={{ fontSize: "0.8rem", color: "#777" }}>Analysing differences…</span>
              <span style={{ fontSize: "0.72rem", color: "#aaa", maxWidth: 340, textAlign: "center" }}>
                This uses AI to compare your documents clause-by-clause. May take 15–30 seconds.
              </span>
            </div>
          )}

          {error && (
            <div style={{
              background: "rgba(200,80,80,0.06)", border: "1px solid rgba(200,80,80,0.2)",
              borderRadius: 10, padding: "1rem 1.2rem", fontSize: "0.8rem", color: "#c85050",
              display: "flex", flexDirection: "column", gap: "0.5rem",
            }}>
              <strong>Unable to compare</strong>
              <span>{error}</span>
              {(!a || !b) && (
                <Link href="/library" style={{ color: green, fontSize: "0.75rem", marginTop: "0.25rem" }}>
                  → Go to Library to select documents
                </Link>
              )}
              {(a && b) && (
                <button onClick={run} style={{
                  alignSelf: "flex-start", marginTop: "0.25rem", background: "none",
                  border: `1px solid rgba(200,80,80,0.4)`, borderRadius: 5, padding: "0.35rem 0.8rem",
                  cursor: "pointer", color: "#c85050", fontSize: "0.72rem",
                }}>
                  Retry
                </button>
              )}
            </div>
          )}

          {/* BACKEND-LEVEL UNRELATED/PARTIAL WARNING */}
          {result && isUnrelated && (
            <div style={{
              background: "rgba(200,80,80,0.05)", border: "1px solid rgba(200,80,80,0.2)",
              borderRadius: 10, padding: "1.4rem 1.6rem", display: "flex", flexDirection: "column", gap: "0.7rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ fontSize: "1.3rem" }}>🚫</span>
                <strong style={{ color: "#c85050", fontSize: "0.9rem" }}>Documents are not related</strong>
              </div>
              <p style={{ fontSize: "0.8rem", color: "#555", margin: 0, lineHeight: 1.7 }}>
                {backendError}
              </p>
              <div style={{ fontSize: "0.75rem", color: "#888", background: "rgba(0,0,0,0.03)", borderRadius: 6, padding: "0.7rem 0.9rem", lineHeight: 1.7 }}>
                <strong style={{ color: "#555" }}>When does Compare work?</strong><br />
                Compare is designed for documents that are <em>different versions</em> of the same text — e.g. v1 vs v2 of a contract, two editions of the same policy document, or two employment agreements from the same template. It uses clause-level diffing and AI classification, which only produces meaningful results when documents share substantial content.
              </div>
              <Link href="/library" style={{ color: green, fontSize: "0.75rem", fontWeight: 600 }}>← Go back to Library and select different documents</Link>
            </div>
          )}

          {result && isPartial && (
            <div style={{
              background: "rgba(184,131,42,0.06)", border: "1px solid rgba(184,131,42,0.2)",
              borderRadius: 8, padding: "0.75rem 1rem", fontSize: "0.75rem", color: "#7a5a1a",
              marginBottom: "0.5rem", display: "flex", gap: "0.5rem", alignItems: "flex-start",
            }}>
              <span style={{ flexShrink: 0, marginTop: "0.05rem" }}>⚠️</span>
              <span>
                <strong>Partial overlap</strong> — these documents share {Math.round((result.similarity_score ?? 0) * 100)}% vocabulary.
                They may be from the same domain but different contexts. Changes shown below exist, but some may not represent meaningful edits.
              </span>
            </div>
          )}

          {result && !isUnrelated && (
            <>
              {/* DOC STATS */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem", marginBottom: "1.2rem",
              }}>
                {[
                  { label: result.document_a, segs: result.total_segments_a },
                  { label: result.document_b, segs: result.total_segments_b },
                ].map((doc, i) => (
                  <div key={i} style={{
                    background: cardBg, border: `1px solid ${borderCol}`, borderRadius: 8,
                    padding: "0.8rem 1rem", fontSize: "0.75rem",
                  }}>
                    <div style={{ fontWeight: 700, color: "#1a2a1a", marginBottom: "0.25rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.label}</div>
                    <div style={{ color: "#777" }}>{doc.segs} clause{doc.segs !== 1 ? "s" : ""} analysed</div>
                  </div>
                ))}
              </div>

              {/* FILTER PILLS */}
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                {(["major", "moderate", "minor"] as const).map((sig) => {
                  const count = result.changes.filter((c) => c.significance === sig).length;
                  const active = sigFilter.has(sig);
                  return (
                    <button key={sig} onClick={() => toggleSig(sig)} style={{
                      padding: "0.35rem 0.85rem", borderRadius: 20, fontSize: "0.7rem", cursor: "pointer",
                      fontWeight: 600, border: `1px solid ${active ? SIG_COLOR[sig] : borderCol}`,
                      background: active ? SIG_BG[sig] : "transparent",
                      color: active ? SIG_COLOR[sig] : "#aaa",
                      transition: "all 0.15s ease", ...sansSerif,
                    }}>
                      {sig} · {count}
                    </button>
                  );
                })}
                <span style={{ fontSize: "0.7rem", color: "#aaa", display: "flex", alignItems: "center", paddingLeft: "0.3rem" }}>
                  {visibleChanges.length} shown
                </span>
              </div>

              {/* CHANGES LIST */}
              {visibleChanges.length === 0 ? (
                <div style={{ fontSize: "0.78rem", color: "#aaa", padding: "2rem", textAlign: "center" }}>
                  No changes match the current filter.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", paddingBottom: "2rem" }}>
                  {visibleChanges.map((c, i) => (
                    <div key={i} style={{
                      background: cardBg, border: `1px solid ${borderCol}`, borderRadius: 10,
                      overflow: "hidden",
                    }}>
                      {/* Change header */}
                      <div style={{
                        padding: "0.65rem 1rem", display: "flex", alignItems: "center", gap: "0.6rem",
                        borderBottom: c.before || c.after ? `1px solid ${borderCol}` : "none",
                        background: "rgba(255,255,255,0.3)",
                      }}>
                        <span style={{
                          fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                          color: SIG_COLOR[c.significance], background: SIG_BG[c.significance],
                          padding: "0.15rem 0.5rem", borderRadius: 4,
                          border: `1px solid ${SIG_COLOR[c.significance]}40`,
                        }}>
                          {c.significance}
                        </span>
                        <span style={{ fontSize: "0.65rem", color: "#888", fontWeight: 600 }}>
                          {TYPE_ICON[c.type]} {TYPE_LABEL[c.type]}
                        </span>
                        <span style={{ fontSize: "0.78rem", color: "#1a2a1a", flex: 1, lineHeight: 1.5 }}>
                          {c.summary}
                        </span>
                      </div>

                      {/* Before / After columns */}
                      {(c.before || c.after) && (
                        <div style={{ display: "grid", gridTemplateColumns: c.before && c.after ? "1fr 1fr" : "1fr" }}>
                          {c.before && (
                            <div style={{
                              padding: "0.8rem 1rem", fontSize: "0.72rem", lineHeight: 1.7,
                              color: "#8a3a3a", background: "rgba(200,80,80,0.04)",
                              borderRight: c.after ? "1px solid rgba(200,80,80,0.12)" : "none",
                              whiteSpace: "pre-wrap", wordBreak: "break-word",
                            }}>
                              <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#c85050", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Before ({result.document_a})
                              </div>
                              {c.before}
                            </div>
                          )}
                          {c.after && (
                            <div style={{
                              padding: "0.8rem 1rem", fontSize: "0.72rem", lineHeight: 1.7,
                              color: "#2a5a3a", background: "rgba(40,140,60,0.04)",
                              whiteSpace: "pre-wrap", wordBreak: "break-word",
                            }}>
                              <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#2a7a3a", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                After ({result.document_b})
                              </div>
                              {c.after}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 4px; }
      `}</style>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", height: "100dvh", alignItems: "center", justifyContent: "center", background: "#e6e1d8" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2.5px solid rgba(26,107,58,0.2)", borderTopColor: "#1a6b3a", animation: "spin 0.8s linear infinite" }} />
      </div>
    }>
      <ComparePageInner />
    </Suspense>
  );
}
