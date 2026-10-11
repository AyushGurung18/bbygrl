"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./AuthProvider";

import { BrandLogo } from "./BrandLogo";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    linkEmailToAnon,
    isAnonymous,
  } = useAuth();

  useEffect(() => {
    if (isOpen) {
      setError("");
      setInfo("");
      setEmail("");
      setPassword("");
      setIsSignUp(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sans = { fontFamily: "'Inter', system-ui, -apple-system, sans-serif" } as React.CSSProperties;
  const green = "#1a6b3a";
  const greenDark = "#144f2c";

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");
    setInfo("Redirecting to Google…");
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to initialize Google sign-in.");
      setLoading(false);
      setInfo("");
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    setError("");
    setInfo("");
    try {
      if (isSignUp) {
        if (isAnonymous) {
          setInfo("Creating your account…");
          await linkEmailToAnon(email, password);
          setInfo("Account created successfully!");
        } else {
          setInfo("Creating your account…");
          await signUpWithEmail(email, password);
          setInfo("Account created! Check your email if verification is required.");
        }
      } else {
        setInfo("Signing you in…");
        await signInWithEmail(email, password);
        setInfo("Signed in successfully!");
      }
      setTimeout(() => {
        onClose();
        setLoading(false);
      }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed. Please try again.");
      setLoading(false);
      setInfo("");
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(10,16,10,0.6)",
          backdropFilter: "blur(6px)",
          animation: "amFadeIn 0.18s ease",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 201,
          transform: "translate(-50%,-50%)",
          width: "min(420px, 94vw)",
          background: "#fff",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)",
          animation: "amSlideUp 0.22s cubic-bezier(0.2,0.8,0.2,1)",
          ...sans,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "1.3rem 1.5rem",
          borderBottom: "1px solid rgba(0,0,0,0.07)",
          background: "#fafafa",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <BrandLogo size={28} />
            <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#111", letterSpacing: "-0.01em" }}>
              Folio
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: "1.1rem", lineHeight: 1, padding: "0.2rem", borderRadius: 4 }}
            aria-label="Close"
          >✕</button>
        </div>

        {/* Content Body */}
        <div style={{ padding: "1.6rem 1.5rem" }}>

          {/* Context banner */}
          <div style={{
            marginBottom: "1.4rem", padding: "0.85rem 1rem",
            background: isAnonymous ? "rgba(26,107,58,0.06)" : "rgba(0,0,0,0.02)",
            borderRadius: 8,
            border: `1px solid ${isAnonymous ? "rgba(26,107,58,0.15)" : "rgba(0,0,0,0.06)"}`,
            fontSize: "0.8rem", color: isAnonymous ? greenDark : "#555", lineHeight: 1.65,
          }}>
            {isAnonymous
              ? <><strong style={{ display: "block", marginBottom: "0.2rem", color: green }}>Guest session active</strong>Sign in to preserve your uploaded documents and chat history across devices.</>
              : "Sign in to access your private workspace and sync sessions across devices."
            }
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginBottom: "1rem", padding: "0.7rem 0.9rem",
              background: "rgba(180,30,30,0.06)", borderRadius: 8,
              border: "1px solid rgba(180,30,30,0.18)",
              fontSize: "0.78rem", color: "#b41e1e", lineHeight: 1.55,
            }}>
              {error}
            </div>
          )}

          {/* Info */}
          {info && (
            <div style={{
              marginBottom: "1rem", padding: "0.7rem 0.9rem",
              background: "rgba(26,107,58,0.07)", borderRadius: 8,
              border: `1px solid rgba(26,107,58,0.2)`,
              fontSize: "0.78rem", color: green, lineHeight: 1.55,
              display: "flex", alignItems: "center", gap: "0.5rem",
            }}>
              <span className="am-spinner" />
              {info}
            </div>
          )}

          {/* Google */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="am-google-btn"
            style={{
              width: "100%",
              padding: "0.8rem 1rem",
              background: "#fff",
              color: "#333",
              border: "1px solid rgba(0,0,0,0.15)",
              borderRadius: 8,
              fontSize: "0.85rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.75rem",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              transition: "all 0.18s ease",
              opacity: loading ? 0.65 : 1,
              ...sans,
            }}
          >
            {loading && !info.includes("Redirect") ? (
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                {[0, 0.18, 0.36].map((d, i) => (
                  <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: green, display: "inline-block", animation: `amBounce 0.9s ${d}s infinite ease-in-out` }} />
                ))}
              </span>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </>
            )}
          </button>

          <div style={{ display: "flex", alignItems: "center", margin: "1.2rem 0", gap: "0.6rem" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.07)" }} />
            <span style={{ fontSize: "0.72rem", color: "#bbb", letterSpacing: "0.04em" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.07)" }} />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label htmlFor="auth-email" style={{ fontSize: "0.72rem", fontWeight: 600, color: "#555", letterSpacing: "0.01em" }}>
                Email address
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@domain.com"
                style={{
                  padding: "0.65rem 0.85rem",
                  fontSize: "0.85rem",
                  background: "#fafafa",
                  border: "1px solid rgba(0,0,0,0.13)",
                  borderRadius: 8,
                  color: "#111",
                  outline: "none",
                  ...sans,
                  transition: "border-color 0.15s",
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label htmlFor="auth-password" style={{ fontSize: "0.72rem", fontWeight: 600, color: "#555", letterSpacing: "0.01em" }}>
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                style={{
                  padding: "0.65rem 0.85rem",
                  fontSize: "0.85rem",
                  background: "#fafafa",
                  border: "1px solid rgba(0,0,0,0.13)",
                  borderRadius: 8,
                  color: "#111",
                  outline: "none",
                  ...sans,
                  transition: "border-color 0.15s",
                }}
              />
              {isSignUp && (
                <span style={{ fontSize: "0.68rem", color: "#aaa", marginTop: 2 }}>Minimum 6 characters</span>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="am-submit-btn"
              style={{
                width: "100%",
                padding: "0.78rem 1rem",
                background: loading ? "rgba(26,107,58,0.6)" : green,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.18s ease",
                marginTop: "0.2rem",
                ...sans,
              }}
            >
              {loading ? "Please wait…" : isSignUp ? (isAnonymous ? "Create account" : "Create account") : "Sign in"}
            </button>
          </form>

          <div style={{ marginTop: "1rem", textAlign: "center" }}>
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(""); setInfo(""); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: "0.75rem", color: green, fontWeight: 600,
                textDecoration: "underline", textUnderlineOffset: "2px",
                ...sans,
              }}
            >
              {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
            </button>
          </div>

          <div style={{ marginTop: "1.2rem", textAlign: "center", borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: "1rem" }}>
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: "0.72rem", color: "#bbb",
                ...sans,
              }}
            >
              Continue as guest
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes amFadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes amSlideUp { from { opacity: 0; transform: translate(-50%,-47%) scale(0.97) } to { opacity: 1; transform: translate(-50%,-50%) scale(1) } }
        @keyframes amBounce  { 0%, 100% { transform: translateY(0) scale(1); opacity: 0.5 } 50% { transform: translateY(-4px) scale(1.1); opacity: 1 } }
        @keyframes amSpin    { to { transform: rotate(360deg) } }

        .am-spinner {
          display: inline-block;
          width: 10px; height: 10px;
          border-radius: 50%;
          border: 1.5px solid rgba(26,107,58,0.25);
          border-top-color: #1a6b3a;
          animation: amSpin 0.75s linear infinite;
          flex-shrink: 0;
        }

        .am-google-btn:hover:not(:disabled) {
          border-color: rgba(0,0,0,0.25) !important;
          box-shadow: 0 2px 12px rgba(0,0,0,0.1) !important;
          transform: translateY(-1px);
        }
        .am-google-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .am-submit-btn:hover:not(:disabled) {
          background: #144f2c !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(26,107,58,0.28) !important;
        }
        .am-submit-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        #auth-email:focus, #auth-password:focus {
          border-color: rgba(26,107,58,0.4) !important;
          box-shadow: 0 0 0 3px rgba(26,107,58,0.08);
        }
      `}</style>
    </>
  );
}
