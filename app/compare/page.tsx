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
  total_paragraphs_a: number;
  total_paragraphs_b: number;
  changes: Change[];
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const bg = "#e6e1d8";
const green = "#1a6b3a";
const cardBg = "#dedad0";
const borderCol = "rgba(0,0,0,0.10)";
const mono = { fontFamily: "'Courier New', Courier, monospace" } as React.CSSProperties;

const SIG_COLOR: Record<string, string> = { major: "#c85050", moderate: "#a87a2a", minor: "#6a8a6a" };
const TYPE_LABEL: Record<string, string> = { added: "+ added", removed: "− removed", modified: "~ modified" };

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
      setError("Two document ids are required to compare (pick exactly two in the library).");
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
    <div style={{ minHeight: "100vh", background: bg, ...mono, padding: "1.6rem 1.4rem" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", marginBottom: "1.4rem" }}>
          <Link href="/library" style={{ color: green, fontSize: "0.72rem", textDecoration: "none" }}>← back to library</Link>
          <h1 style={{ fontSize: "1.05rem", fontWeight: 900, margin: 0 }}>Document Comparison</h1>
        </div>

        {loading && <div style={{ fontSize: "0.78rem", color: "#8a9a7a" }}>Comparing documents…</div>}
        {error && <div style={{ fontSize: "0.78rem", color: "#c85050" }}>{error}</div>}

        {result && (
          <>
            <div style={{ fontSize: "0.72rem", color: "#5a7a5a", marginBottom: "1rem" }}>
              <strong>{result.document_a}</strong> → <strong>{result.document_b}</strong>
              {"  ·  "}{result.changes.length} change{result.changes.length === 1 ? "" : "s"} detected at paragraph level
            </div>

            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.2rem" }}>
              {(["major", "moderate", "minor"] as const).map((sig) => (
                <button
                  key={sig}
                  onClick={() => toggleSig(sig)}
                  style={{
                    padding: "0.35rem 0.75rem", borderRadius: 4, fontSize: "0.68rem", cursor: "pointer",
                    border: `1px solid ${sigFilter.has(sig) ? SIG_COLOR[sig] : borderCol}`,
                    background: sigFilter.has(sig) ? `${SIG_COLOR[sig]}22` : "transparent",
                    color: sigFilter.has(sig) ? SIG_COLOR[sig] : "#8a9a7a",
                    ...mono,
                  }}
                >
                  {sig} ({result.changes.filter((c) => c.significance === sig).length})
                </button>
              ))}
            </div>

            {visibleChanges.length === 0 ? (
              <div style={{ fontSize: "0.75rem", color: "#8a9a7a" }}>No changes match the current filter.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                {visibleChanges.map((c, i) => (
                  <div key={i} style={{ background: cardBg, border: `1px solid ${borderCol}`, borderRadius: 5, padding: "0.9rem 1.1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "0.63rem", color: SIG_COLOR[c.significance], border: `1px solid ${SIG_COLOR[c.significance]}`, borderRadius: 3, padding: "0.1rem 0.4rem", textTransform: "uppercase" }}>
                        {c.significance}
                      </span>
                      <span style={{ fontSize: "0.63rem", color: "#6a8a6a" }}>{TYPE_LABEL[c.type]}</span>
                    </div>
                    <div style={{ fontSize: "0.78rem", marginBottom: "0.6rem", color: "#1a2a1a" }}>{c.summary}</div>
                    {c.before && (
                      <div style={{ fontSize: "0.68rem", color: "#9a4a4a", background: "rgba(200,80,80,0.08)", padding: "0.4rem 0.6rem", borderRadius: 3, marginBottom: c.after ? "0.35rem" : 0, whiteSpace: "pre-wrap" }}>
                        − {c.before}
                      </div>
                    )}
                    {c.after && (
                      <div style={{ fontSize: "0.68rem", color: "#2a6a3a", background: "rgba(40,140,60,0.08)", padding: "0.4rem 0.6rem", borderRadius: 3, whiteSpace: "pre-wrap" }}>
                        + {c.after}
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
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", ...mono }}>Loading…</div>}>
      <ComparePageInner />
    </Suspense>
  );
}
