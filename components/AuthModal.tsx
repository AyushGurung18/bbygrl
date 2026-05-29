"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./AuthProvider";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const { signInWithGoogle, isAnonymous } = useAuth();

  useEffect(() => {
    if (isOpen) {
      setError("");
      setInfo("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const mono = { fontFamily: "'Courier New', Courier, monospace" } as React.CSSProperties;
  const green = "#1a6b3a";
  const bg = "#e6e1d8";
  const card = "#dedad0";

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");
    setInfo("");
    try {
      if (isAnonymous) {
        setInfo("Connecting to Google to save your guest session...");
      } else {
        setInfo("Connecting to Google Sign-In...");
      }
      await signInWithGoogle();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to initialize Google sign-in.");
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(15,20,15,0.55)",
          backdropFilter: "blur(4px)",
          animation: "fadeIn 0.18s ease",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 201,
          transform: "translate(-50%,-50%)",
          width: "min(400px, 92vw)",
          background: card, borderRadius: 6,
          border: `1px solid rgba(0,0,0,0.12)`,
          boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
          animation: "slideUp 0.22s ease",
          ...mono,
          padding: 0,
          boxSizing: "border-box"
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "1.2rem 1.4rem", borderBottom: `1px solid rgba(0,0,0,0.09)`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8.5" stroke={green} strokeWidth="1.5" />
              <path d="M6 10 Q10 4.5 14 10 Q10 15.5 6 10Z" fill={green} />
            </svg>
            <span style={{ fontWeight: 900, fontSize: "0.88rem", color: "#1a2a1a", letterSpacing: "0.02em" }}>
              greptile
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#8a9a7a", fontSize: "1rem", lineHeight: 1, padding: "0.2rem" }}
            aria-label="Close"
          >✕</button>
        </div>

        {/* Content Body */}
        <div style={{ padding: "1.6rem 1.4rem" }}>
          {isAnonymous ? (
            <div style={{
              marginBottom: "1.4rem", padding: "0.85rem 1rem",
              background: "rgba(26,107,58,0.07)", borderRadius: 4,
              border: `1px solid rgba(26,107,58,0.15)`,
              fontSize: "0.74rem", color: green, lineHeight: 1.6, letterSpacing: "0.02em",
            }}>
              <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>✦ GUEST SESSION ACTIVE</div>
              Sign in with Google to preserve all your uploaded PDFs and chat sessions. Your guest history will automatically link to your Google account!
            </div>
          ) : (
            <div style={{
              marginBottom: "1.4rem", padding: "0.85rem 1rem",
              background: "rgba(0,0,0,0.02)", borderRadius: 4,
              border: `1px solid rgba(0,0,0,0.06)`,
              fontSize: "0.74rem", color: "#4a5a4a", lineHeight: 1.6, letterSpacing: "0.02em",
            }}>
              Welcome! Sign in with Google to access your private workspace, index custom PDFs, and sync your sessions.
            </div>
          )}

          {error && (
            <div style={{
              marginBottom: "1.2rem", padding: "0.7rem 0.9rem",
              background: "rgba(180,30,30,0.07)", borderRadius: 4,
              border: "1px solid rgba(180,30,30,0.2)",
              fontSize: "0.74rem", color: "#b41e1e", lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          {info && (
            <div style={{
              marginBottom: "1.2rem", padding: "0.7rem 0.9rem",
              background: "rgba(26,107,58,0.08)", borderRadius: 4,
              border: `1px solid rgba(26,107,58,0.25)`,
              fontSize: "0.74rem", color: green, lineHeight: 1.5,
            }}>
              {info}
            </div>
          )}

          {/* Premium Google Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="google-signin-btn"
            style={{
              width: "100%",
              padding: "0.85rem 1rem",
              background: "#fff",
              color: "#374151",
              border: "1px solid rgba(0,0,0,0.15)",
              borderRadius: 4,
              fontSize: "0.8rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              opacity: loading ? 0.7 : 1,
              ...mono,
            }}
          >
            {loading ? (
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                {[0, 0.2, 0.4].map((d, i) => (
                  <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: green, display: "inline-block", animation: `bounce 1s ${d}s infinite ease-in-out` }} />
                ))}
              </span>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" style={{ marginRight: "0.75rem", flexShrink: 0 }}>
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                [ sign in with google ]
              </>
            )}
          </button>

          <div style={{ marginTop: "1.4rem", textAlign: "center" }}>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: "0.68rem", color: "#8a9a7a",
                letterSpacing: "0.1em", textDecoration: "underline", ...mono,
              }}
            >
              continue as guest →
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translate(-50%,-46%) } to { opacity: 1; transform: translate(-50%,-50%) } }
        @keyframes bounce  { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
        
        .google-signin-btn:hover {
          background: #f9f9f9 !important;
          border-color: ${green} !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(26,107,58,0.12) !important;
        }
        .google-signin-btn:active {
          transform: translateY(0);
          box-shadow: 0 2px 4px rgba(0,0,0,0.05) !important;
        }
      `}</style>
    </>
  );
}
