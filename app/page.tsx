"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";
import { useAuth } from "@/components/AuthProvider";
import AuthModal from "@/components/AuthModal";
import Link from "next/link";

gsap.registerPlugin(ScrollTrigger, CustomEase);

// ─── SCROLL REVEAL HOOK ───────────────────────────────────────────────────────
function useReveal(ref: React.RefObject<any>) {
  useEffect(() => {
    if (!ref.current) return;
    gsap.from(ref.current, {
      scrollTrigger: { trigger: ref.current, start: "top 88%" },
      y: 36, opacity: 0, duration: 0.7, ease: "power3.out",
    });
  }, []);
}

// ─── STAT COUNTER ─────────────────────────────────────────────────────────────
function StatCard({ value, label, suffix = "", mono, green }: { value: number; label: string; suffix?: string; mono: React.CSSProperties; green: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    ScrollTrigger.create({
      trigger: ref.current,
      start: "top 85%",
      onEnter: () => {
        gsap.to({ v: 0 }, {
          v: value, duration: 1.8, ease: "power2.out",
          onUpdate: function () { setCount(Math.floor(this.targets()[0].v)); },
        });
      },
      once: true,
    });
  }, [value]);

  return (
    <div ref={ref} style={{
      textAlign: "center", padding: "2rem 1.2rem",
      border: "1px solid rgba(0,0,0,0.12)",
      borderRadius: 8,
      background: "#dedad0",
    }}>
      <div style={{
        ...mono, fontSize: "clamp(2rem,5vw,3.4rem)",
        fontWeight: 900, color: green, letterSpacing: "-0.02em",
      }}>
        {count}{suffix}
      </div>
      <div style={{ fontSize: "0.72rem", color: "#5a7a5a", letterSpacing: "0.18em", marginTop: "0.4rem", textTransform: "uppercase" }}>
        {label}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const logosRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef(null);
  const statsRef = useRef(null);

  const [statusLabel, setStatusLabel] = useState("< tracking prey />");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const { isAnonymous, signOut, user } = useAuth();

  const mono: React.CSSProperties = { fontFamily: "'Courier New', Courier, monospace" };
  const green = "#1a6b3a";
  const bg = "#e6e1d8";

  useEffect(() => {
    CustomEase.create("snap", "M0,0 C0.19,1 0.22,1 1,1");

    gsap.from(navRef.current, { y: -20, opacity: 0, duration: 0.6, ease: "power2.out" });
    gsap.from(tagRef.current, { y: 20, opacity: 0, duration: 0.6, delay: 0.3, ease: "power2.out" });

    const words = headlineRef.current?.querySelectorAll(".word") ?? [];
    gsap.from(words, { y: 40, opacity: 0, duration: 0.7, stagger: 0.08, ease: "power3.out", delay: 0.45 });
    gsap.from(subRef.current, { y: 20, opacity: 0, duration: 0.6, ease: "power2.out", delay: 0.65 });
    gsap.from(ctaRef.current, { y: 20, opacity: 0, duration: 0.6, ease: "power2.out", delay: 0.8 });

    const logos = logosRef.current?.querySelectorAll(".logo-item") ?? [];
    gsap.from(logos, {
      scrollTrigger: { trigger: logosRef.current, start: "top 90%" },
      opacity: 0, y: 12, stagger: 0.05, duration: 0.5, ease: "power2.out",
    });

    // ── CHAMELEON CANVAS ──
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const W = 680, H = 420;
    canvas.width = W;
    canvas.height = H;

    let raf: number;
    let time = 0;
    type Phase = "idle" | "tracking" | "strike" | "retract" | "chew" | "reset";
    let phase: Phase = "idle";
    let phaseTimer = 0;
    let tongueProgress = 0;
    let jawOpen = 0;
    let bugAlive = true;
    let bugCaught = false;

    const bugHome = { x: 530, y: 190 };
    const bug = { x: bugHome.x, y: bugHome.y };
    let eyeTarget = { x: bugHome.x, y: bugHome.y };

    const halftone = (x: number, y: number, w: number, h: number, spacing: number, col: string, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = col;
      for (let dx = 0; dx <= w; dx += spacing) {
        for (let dy = 0; dy <= h; dy += spacing) {
          const nx = (dx / w - 0.5) * 2;
          const ny = (dy / h - 0.5) * 2;
          const dist = Math.sqrt(nx * nx + ny * ny);
          const r = Math.max(0.4, (1 - dist) * spacing * 0.38);
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    };

    const drawScene = () => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      for (let x = 0; x <= W; x += 9) {
        for (let y = 0; y <= H; y += 9) {
          const dx = x / W - 0.7, dy = y / H - 0.3;
          const d = Math.sqrt(dx * dx + dy * dy);
          const r = Math.max(0, (1 - d * 1.8)) * 1.6;
          if (r > 0.3) {
            ctx.globalAlpha = 0.09;
            ctx.fillStyle = "#6a8a3a";
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#5c4a2e";
      ctx.beginPath();
      ctx.moveTo(60, 315);
      ctx.bezierCurveTo(180, 300, 350, 285, 560, 275);
      ctx.lineTo(620, 275);
      ctx.lineTo(620, 304);
      ctx.bezierCurveTo(350, 315, 180, 330, 60, 345);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.strokeStyle = "#3a2e1a";
      ctx.lineWidth = 0.6;
      for (let bx = 80; bx < 610; bx += 24) {
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.moveTo(bx, 276 + Math.sin(bx * 0.12) * 2);
        ctx.lineTo(bx + 10, 310 + Math.sin(bx * 0.12) * 2);
        ctx.stroke();
      }
      ctx.restore();
      const leaf = (lx: number, ly: number, rot: number, sc: number) => {
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(rot);
        ctx.scale(sc, sc);
        ctx.fillStyle = "#4a6828";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-22, -32, -12, -58, 0, -64);
        ctx.bezierCurveTo(12, -58, 22, -32, 0, 0);
        ctx.fill();
        ctx.strokeStyle = "#2a4818";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.lineTo(0, -62);
        ctx.stroke();
        ctx.restore();
      };
      leaf(82, 276, -0.25, 1.1);
      leaf(120, 270, 0.12, 0.85);
      leaf(570, 270, -0.45, 0.9);
      leaf(598, 265, 0.3, 0.7);
    };

    const drawChameleon = () => {
      const bx = 160, by = 228;
      ctx.save();
      ctx.strokeStyle = "#3e4e22";
      ctx.lineWidth = 20;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(bx - 8, by + 28);
      ctx.bezierCurveTo(bx - 55, by + 65, bx - 115, by + 48, bx - 140, by + 8);
      ctx.bezierCurveTo(bx - 168, by - 28, bx - 148, by - 62, bx - 118, by - 56);
      ctx.bezierCurveTo(bx - 92, by - 50, bx - 86, by - 18, bx - 105, by - 8);
      ctx.stroke();
      ctx.restore();
      halftone(bx - 145, by - 65, 110, 115, 7, "#2a3a14", 0.16);
      ctx.fillStyle = "#4e6228";
      ctx.beginPath();
      ctx.ellipse(bx + 65, by + 8, 115, 54, -0.06, 0, Math.PI * 2);
      ctx.fill();
      halftone(bx - 5, by - 42, 160, 105, 8, "#2a3a14", 0.2);
      ctx.fillStyle = "#3a4e1a";
      for (let i = 0; i < 9; i++) {
        const sx = bx + 8 + i * 17;
        const sy = by - 42 + Math.sin(i * 0.55) * 4;
        const sh = 18 - i * 1.3;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - 5, sy + sh);
        ctx.lineTo(sx + 5, sy + sh);
        ctx.closePath();
        ctx.fill();
      }
      const leg = (lx: number, ly: number, ang: number) => {
        ctx.save();
        ctx.strokeStyle = "#3a4e1a";
        ctx.lineWidth = 11;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        const kx = lx + Math.cos(ang) * 38, ky = ly + 40;
        ctx.lineTo(kx, ky);
        ctx.lineTo(kx + Math.cos(ang) * 12, ky + 30);
        ctx.stroke();
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(kx + Math.cos(ang) * 12, ky + 30);
        ctx.lineTo(kx + Math.cos(ang) * 12 - 16, ky + 37);
        ctx.moveTo(kx + Math.cos(ang) * 12, ky + 30);
        ctx.lineTo(kx + Math.cos(ang) * 12 + 12, ky + 37);
        ctx.stroke();
        ctx.restore();
      };
      leg(bx + 22, by + 42, 0.28);
      leg(bx + 65, by + 52, -0.1);
      leg(bx + 108, by + 44, 0.35);
      leg(bx + 148, by + 30, -0.18);
      ctx.fillStyle = "#4e6228";
      ctx.beginPath();
      ctx.moveTo(bx + 160, by - 18);
      ctx.bezierCurveTo(bx + 182, by - 52, bx + 202, by - 74, bx + 218, by - 84);
      ctx.bezierCurveTo(bx + 224, by - 58, bx + 212, by - 32, bx + 180, by - 10);
      ctx.closePath();
      ctx.fill();
      const hx = bx + 234, hy = by - 98;
      ctx.fillStyle = "#4e6228";
      ctx.beginPath();
      ctx.ellipse(hx, hy, 58, 40, 0.14, 0, Math.PI * 2);
      ctx.fill();
      halftone(hx - 54, hy - 36, 108, 74, 7, "#2a3a14", 0.22);
      ctx.fillStyle = "#3a4e1a";
      ctx.beginPath();
      ctx.moveTo(hx - 34, hy - 32);
      ctx.bezierCurveTo(hx - 12, hy - 75, hx + 22, hy - 68, hx + 44, hy - 36);
      ctx.bezierCurveTo(hx + 22, hy - 28, hx - 10, hy - 24, hx - 34, hy - 32);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.translate(hx + 18, hy + 8);
      ctx.rotate(jawOpen * 0.25);
      ctx.fillStyle = "#385218";
      ctx.beginPath();
      ctx.moveTo(-44, 0);
      ctx.bezierCurveTo(-22, 22, 22, 24, 48, 14);
      ctx.bezierCurveTo(22, 30, -22, 30, -44, 14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      const ex = hx + 18, ey = hy - 12;
      ctx.fillStyle = "#2a3a14";
      ctx.beginPath();
      ctx.arc(ex, ey, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c0d848";
      ctx.beginPath();
      ctx.arc(ex, ey, 14, 0, Math.PI * 2);
      ctx.fill();
      const ang = Math.atan2(eyeTarget.y - ey, eyeTarget.x - ex);
      const px = ex + Math.cos(ang) * 5, py = ey + Math.sin(ang) * 4;
      ctx.fillStyle = "#181810";
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,240,0.75)";
      ctx.beginPath();
      ctx.arc(px - 2, py - 2.5, 2.5, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawBug = (bx: number, by: number, alive: boolean) => {
      ctx.save();
      ctx.translate(bx, by);
      if (!alive) ctx.rotate(Math.PI * 0.5);
      const flap = alive ? Math.sin(time * 0.38) * 9 : 0;
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = "#c8dcf4";
      ctx.beginPath();
      ctx.ellipse(-9, -7 + flap, 12, 6, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(9, -7 + flap, 12, 6, 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#1e1e12";
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#141410";
      ctx.beginPath();
      ctx.arc(0, -10, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1e1e12";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-2, -13); ctx.lineTo(-9, -22);
      ctx.moveTo(2, -13); ctx.lineTo(9, -22);
      ctx.stroke();
      ctx.lineWidth = 0.8;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-4, i * 3.5); ctx.lineTo(-14, i * 3.5 + 5);
        ctx.moveTo(4, i * 3.5); ctx.lineTo(14, i * 3.5 + 5);
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawTongue = (prog: number, caught: boolean) => {
      if (prog <= 0) return;
      const sx = 408, sy = 132;
      const tx = bugHome.x + 4, ty = bugHome.y;
      const cx = sx + (tx - sx) * prog;
      const cy = sy + (ty - sy) * prog;
      const midX = sx + (cx - sx) * 0.5;
      const midY = sy + (cy - sy) * 0.5 - 12 * Math.sin(prog * Math.PI);
      ctx.save();
      ctx.strokeStyle = "#d04858";
      ctx.lineWidth = prog < 0.6 ? 11 : 9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(midX, midY, cx, cy);
      ctx.stroke();
      ctx.fillStyle = "#b03040";
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();
      if (caught) {
        ctx.strokeStyle = "rgba(200,80,60,0.35)";
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    };

    const tick = () => {
      time++;
      phaseTimer++;
      if (bugAlive && phase !== "strike" && phase !== "retract") {
        bug.x = bugHome.x + Math.sin(time * 0.022) * 14 + Math.cos(time * 0.038) * 6;
        bug.y = bugHome.y + Math.sin(time * 0.035) * 8 + Math.cos(time * 0.019) * 5;
        eyeTarget = { x: bug.x, y: bug.y };
      }
      switch (phase) {
        case "idle":
          if (phaseTimer > 100) { phase = "tracking"; phaseTimer = 0; }
          break;
        case "tracking":
          if (phaseTimer > 65) { phase = "strike"; phaseTimer = 0; tongueProgress = 0; }
          break;
        case "strike":
          tongueProgress = Math.min(1, tongueProgress + 0.065);
          jawOpen = tongueProgress * 0.55;
          if (tongueProgress >= 1) { bugCaught = true; bugAlive = false; phase = "retract"; phaseTimer = 0; setStatusLabel("< bug caught />"); }
          break;
        case "retract":
          tongueProgress = Math.max(0, tongueProgress - 0.085);
          if (tongueProgress < 0.5) bugCaught = false;
          if (tongueProgress <= 0) { phase = "chew"; phaseTimer = 0; setStatusLabel("< processing... />"); }
          break;
        case "chew":
          jawOpen = Math.abs(Math.sin(phaseTimer * 0.28)) * 0.75;
          if (phaseTimer > 90) { jawOpen = 0; phase = "reset"; phaseTimer = 0; }
          break;
        case "reset":
          if (phaseTimer > 70) { bug.x = bugHome.x; bug.y = bugHome.y; bugAlive = true; phase = "idle"; phaseTimer = 0; setStatusLabel("< tracking prey />"); }
          break;
      }
      ctx.clearRect(0, 0, W, H);
      drawScene();
      drawChameleon();
      const showBug = bugAlive || (phase === "retract" && tongueProgress > 0.15);
      if (showBug) drawBug(bug.x, bug.y, bugAlive);
      drawTongue(tongueProgress, bugCaught);
      raf = requestAnimationFrame(tick);
    };
    tick();

    gsap.utils.toArray<HTMLElement>(".reveal-up").forEach((el) => {
      gsap.from(el, {
        scrollTrigger: { trigger: el, start: "top 86%" },
        y: 28, opacity: 0, duration: 0.65, ease: "power3.out",
      });
    });

    return () => {
      cancelAnimationFrame(raf);
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  const LOGOS = ["Next.js", "FastAPI", "LangChain", "Groq", "Cloudflare", "Supabase", "pgvector", "Docker", "Hugging Face", "Vercel"];

  const FEATURES = [
    { label: "Dual-layer edge cache", desc: "KV for chat history + semantic cache at the Cloudflare edge. TTFT under 200ms." },
    { label: "Semantic deduplication", desc: "BGE embeddings catch paraphrased questions. Same intent = same cached answer, zero LLM tokens spent." },
    { label: "Origin shielding", desc: "X-Internal-Secret header on every proxied request. Direct hits to the FastAPI origin return 403 instantly." },
    { label: "Swappable inference", desc: "One param swap routes between Groq LPU, Ollama local, or any OpenAI-compatible endpoint." },
  ];

  const STEPS = [
    { label: "Upload your documents", detail: "PDF, markdown, or plain text — extracted clean via pymupdf4llm and chunked with configurable overlap." },
    { label: "Edge embedding at request time", detail: "Cloudflare Worker runs @cf/baai/bge-small-en-v1.5 serverlessly. 384-dim vectors generated before the backend even wakes up." },
    { label: "Semantic cache lookup", detail: "pgvector cosine distance query runs against the cache table. Similarity > 0.96 short-circuits the entire LLM pipeline." },
    { label: "Groq LLM + RAG fallback", detail: "Cache miss? Top-K chunks from pgvector feed a history-aware LangChain prompt routed to Llama 3 on Groq LPUs." },
  ];

  return (
    <div style={{ background: bg, minHeight: "100vh", color: "#1a2a1a", ...mono, overflowX: "hidden" }}>

      {/* ── NOISE OVERLAY ── */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E\")",
        opacity: 0.4,
      }} />

      {/* ── NAV ── */}
      <nav ref={navRef} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "1.1rem 2rem", borderBottom: "1px solid rgba(0,0,0,0.09)",
        background: bg, position: "sticky", top: 0, zIndex: 100,
        flexWrap: "wrap", gap: "0.5rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8.5" stroke={green} strokeWidth="1.5" />
            <path d="M6 10 Q10 4.5 14 10 Q10 15.5 6 10Z" fill={green} />
          </svg>
          <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "#1a2e1a", letterSpacing: "0.02em" }}>octo</span>
          <span style={{
            fontSize: "0.55rem", letterSpacing: "0.2em", color: "#166534",
            border: "1px solid #166534", borderRadius: 2, padding: "0.1rem 0.4rem", marginLeft: "0.3rem",
          }}>BETA</span>
        </div>

        <div className="nav-links" style={{ display: "flex", gap: "1.8rem", fontSize: "0.78rem", color: "#3a5a3a" }}>
          {["$ Architecture", "How it works", "Edge Cache", "GitHub", "Blog"].map((l) => (
            <span key={l} style={{ cursor: "pointer" }}>{l}</span>
          ))}
        </div>

        <div className="nav-ctas" style={{ display: "flex", gap: "0.6rem" }}>
          {isAnonymous ? (
            <>
              <button
                onClick={() => setAuthModalOpen(true)}
                style={{ padding: "0.4rem 1rem", border: `1px solid ${green}`, borderRadius: 3, background: "transparent", color: green, fontSize: "0.78rem", cursor: "pointer", ...mono }}>Sign In</button>
              <button
                onClick={() => setAuthModalOpen(true)}
                style={{ padding: "0.4rem 1rem", border: "none", borderRadius: 3, background: green, color: "#fff", fontSize: "0.78rem", cursor: "pointer", ...mono }}>Start Now</button>
            </>
          ) : (
            <>
              <Link href="/upload" style={{ textDecoration: "none" }}>
                <button style={{ padding: "0.4rem 1rem", border: `1px solid ${green}`, borderRadius: 3, background: "transparent", color: green, fontSize: "0.78rem", cursor: "pointer", ...mono }}>Dashboard</button>
              </Link>
              <button
                onClick={() => signOut()}
                style={{ padding: "0.4rem 1rem", border: "none", borderRadius: 3, background: green, color: "#fff", fontSize: "0.78rem", cursor: "pointer", ...mono }}>Sign Out</button>
            </>
          )}
        </div>

        <button
          className="nav-hamburger"
          onClick={() => setMobileNavOpen(v => !v)}
          style={{ display: "none", background: "none", border: `1px solid rgba(0,0,0,0.15)`, borderRadius: 3, cursor: "pointer", padding: "0.35rem 0.6rem", color: green, fontSize: "1rem", lineHeight: 1, ...mono }}
          aria-label="Toggle menu"
        >
          {mobileNavOpen ? "✕" : "☰"}
        </button>

        {mobileNavOpen && (
          <div style={{ width: "100%", borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: "0.8rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {["$ Architecture", "How it works", "Edge Cache", "GitHub", "Blog"].map((l) => (
              <span key={l} style={{ fontSize: "0.82rem", color: "#3a5a3a", cursor: "pointer", padding: "0.15rem 0" }}>{l}</span>
            ))}
            <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.3rem" }}>
              {isAnonymous ? (
                <>
                  <button onClick={() => { setAuthModalOpen(true); setMobileNavOpen(false); }} style={{ flex: 1, padding: "0.5rem 1rem", border: `1px solid ${green}`, borderRadius: 3, background: "transparent", color: green, fontSize: "0.78rem", cursor: "pointer", ...mono }}>Sign In</button>
                  <button onClick={() => { setAuthModalOpen(true); setMobileNavOpen(false); }} style={{ flex: 1, padding: "0.5rem 1rem", border: "none", borderRadius: 3, background: green, color: "#fff", fontSize: "0.78rem", cursor: "pointer", ...mono }}>Start Now</button>
                </>
              ) : (
                <>
                  <Link href="/upload" style={{ flex: 1, textDecoration: "none" }}>
                    <button style={{ width: "100%", padding: "0.5rem 1rem", border: `1px solid ${green}`, borderRadius: 3, background: "transparent", color: green, fontSize: "0.78rem", cursor: "pointer", ...mono }}>Dashboard</button>
                  </Link>
                  <button onClick={() => { signOut(); setMobileNavOpen(false); }} style={{ flex: 1, padding: "0.5rem 1rem", border: "none", borderRadius: 3, background: green, color: "#fff", fontSize: "0.78rem", cursor: "pointer", ...mono }}>Sign Out</button>
                </>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section ref={heroRef} className="hero-section" style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        minHeight: "87vh", maxWidth: 1140, margin: "0 auto",
        padding: "2rem 2rem 0", alignItems: "center", gap: "1rem",
        position: "relative", zIndex: 1,
      }}>
        <div style={{ paddingTop: "1rem" }}>
          <div ref={tagRef} style={{
            display: "inline-flex", alignItems: "center", gap: "0.5rem",
            fontSize: "0.62rem", letterSpacing: "0.2em", color: green,
            border: "1px solid rgba(74,222,128,0.25)", borderRadius: 20,
            padding: "0.3rem 0.9rem", marginBottom: "2rem",
            background: "rgba(74,222,128,0.05)",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: green, display: "inline-block", boxShadow: `0 0 6px ${green}` }} />
            RAG · EDGE CACHE · GROQ · PGVECTOR
          </div>

          <h1 ref={headlineRef} style={{
            fontSize: "clamp(2rem,5vw,4rem)", fontWeight: 900,
            lineHeight: 1.06, color: "#1a2a1a", margin: "0 0 1.6rem", ...mono,
          }}>
            {["Your", "docs,", "finally"].map((w, i) => (
              <span key={i} className="word" style={{ display: "inline-block", marginRight: "0.22em" }}>{w}</span>
            ))}
            <br />
            <span style={{ color: green }}>
              {["able", "to", "think."].map((w, i) => (
                <span key={i} className="word" style={{ display: "inline-block", marginRight: "0.22em" }}>{w}</span>
              ))}
            </span>
          </h1>

          <p ref={subRef} style={{
            fontSize: "0.76rem", letterSpacing: "0.09em", color: green,
            lineHeight: 2, maxWidth: 360, marginBottom: "2rem", textTransform: "uppercase",
          }}>
            Drop any PDF. Ask anything.<br />
            Edge-cached RAG with semantic dedup,<br />
            Groq LPU inference, and pgvector.
          </p>

          <div ref={ctaRef} style={{ display: "flex", flexDirection: "column", gap: "0.6rem", alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: "0.8rem" }}>
              <Link href="/upload" style={{ textDecoration: "none" }}>
                <button
                  onMouseEnter={e => gsap.to(e.currentTarget, { scale: 1.05, duration: 0.18 })}
                  onMouseLeave={e => gsap.to(e.currentTarget, { scale: 1, duration: 0.25 })}
                  style={{
                    padding: "0.85rem 2rem", background: "#22c55e", border: "none",
                    borderRadius: 5, color: "#050e06", fontSize: "0.84rem", fontWeight: 800,
                    cursor: "pointer", ...mono, letterSpacing: "0.03em",
                    boxShadow: "0 0 24px rgba(34,197,94,0.35)",
                  }}>
                  {isAnonymous ? "Deploy free →" : "Go to Dashboard →"}
                </button>
              </Link>
              <button
                onMouseEnter={e => gsap.to(e.currentTarget, { scale: 1.03, duration: 0.18 })}
                onMouseLeave={e => gsap.to(e.currentTarget, { scale: 1, duration: 0.25 })}
                style={{
                  padding: "0.85rem 1.6rem", background: "transparent",
                  border: "1px solid rgba(74,222,128,0.3)", borderRadius: 5,
                  color: green, fontSize: "0.84rem", cursor: "pointer", ...mono,
                }}>
                View on GitHub
              </button>
            </div>
            <span style={{ fontSize: "0.65rem", color: "#166534", letterSpacing: "0.08em" }}>
              {isAnonymous ? "self-hosted · no credit card · MIT license" : `signed in as ${user?.email}`}
            </span>
          </div>
        </div>

        <div className="hero-canvas-wrap" style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <canvas ref={canvasRef} style={{ width: "100%", maxWidth: 560, height: "auto", display: "block", borderRadius: 12 }} />
          <div style={{ fontSize: "0.65rem", letterSpacing: "0.12em", color: green, opacity: 0.55, marginTop: "0.5rem", ...mono }}>
            {statusLabel}
          </div>
        </div>
      </section>

      {/* ── LOGOS ── */}
      <div ref={logosRef} style={{ borderTop: "1px solid rgba(0,0,0,0.09)", borderBottom: "1px solid rgba(0,0,0,0.09)", padding: "1.6rem 1.5rem", position: "relative", zIndex: 1 }}>
        <p style={{ textAlign: "center", fontSize: "0.65rem", letterSpacing: "0.16em", color: "#6a8a6a", marginBottom: "1.1rem" }}>
          PRODUCTION STACK · EVERY LAYER BATTLE-TESTED.{" "}
          <span style={{ color: green, textDecoration: "underline", cursor: "pointer" }}>READ THE ARCHITECTURE BREAKDOWN →</span>
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center" }}>
          {LOGOS.map((logo, i) => (
            <div key={i} className="logo-item" style={{ padding: "0.55rem 1.4rem", border: "0.5px solid rgba(0,0,0,0.12)", fontSize: "0.76rem", color: "#3a4a3a", letterSpacing: "0.04em", fontWeight: 700 }}>
              {logo}
            </div>
          ))}
        </div>
      </div>

      {/* ── STATS ── */}
      <section ref={statsRef} style={{
        borderBottom: "1px solid rgba(74,222,128,0.1)",
        padding: "3.5rem 2.5rem", position: "relative", zIndex: 1,
      }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
          <StatCard value={200} label="TTFT at edge (ms)" suffix="ms" mono={mono} green={green} />
          <StatCard value={96} label="Semantic cache threshold" suffix="%" mono={mono} green={green} />
          <StatCard value={384} label="Embedding dimensions" suffix="" mono={mono} green={green} />
          <StatCard value={3} label="Chunks retrieved per query" suffix="x" mono={mono} green={green} />
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "6rem 2.5rem", position: "relative", zIndex: 1 }}>
        {(() => {
          const r = useRef<HTMLDivElement>(null);
          useReveal(r);
          return (
            <div ref={r} style={{ marginBottom: "4rem" }}>
              <div style={{ fontSize: "0.66rem", letterSpacing: "0.2em", color: green, marginBottom: "0.7rem" }}>[ HOW IT WORKS ]</div>
              <h2 style={{ fontSize: "clamp(1.4rem,3.5vw,2.6rem)", fontWeight: 900, color: "#1a2a1a", margin: 0, ...mono }}>
                Four layers of<br /><span style={{ color: green }}>zero-waste inference.</span>
              </h2>
            </div>
          );
        })()}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.2rem" }}>
          {STEPS.map((s, i) => {
            const r = useRef(null);
            useEffect(() => {
              gsap.from(r.current, {
                scrollTrigger: { trigger: r.current, start: "top 88%" },
                y: 40, opacity: 0, duration: 0.6, delay: i * 0.12, ease: "power3.out",
              });
            }, []);
            return (
              <div key={i} ref={r} style={{
                padding: "1.6rem 1.4rem", border: "1px solid rgba(0,0,0,0.1)",
                borderRadius: 4, background: "#dedad0",
                position: "relative", overflow: "hidden", cursor: "default",
              }}
                onMouseEnter={e => gsap.to(e.currentTarget, { y: -5, duration: 0.22, ease: "power2.out" })}
                onMouseLeave={e => gsap.to(e.currentTarget, { y: 0, duration: 0.32, ease: "power2.out" })}
              >
                <div style={{ width: 26, height: 26, background: green, borderRadius: 3, marginBottom: "0.9rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M1.5 6L5 9.5L10.5 2.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1a2a1a", marginBottom: "0.4rem", ...mono }}>{s.label}</div>
                <div style={{ fontSize: "0.76rem", color: "#5a7a5a", lineHeight: 1.75 }}>{s.detail}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "0 2.5rem 7rem", position: "relative", zIndex: 1 }}>
        <div className="reveal-up" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "3.5rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ fontSize: "0.66rem", letterSpacing: "0.2em", color: green, marginBottom: "0.7rem" }}>[ WHAT MAKES IT FAST ]</div>
            <h2 style={{ fontSize: "clamp(1.4rem,3.5vw,2.6rem)", fontWeight: 900, color: "#1a2a1a", margin: 0, ...mono }}>Built for engineers<br />who hate wasted tokens.</h2>
          </div>
          <button
            onMouseEnter={e => gsap.to(e.currentTarget, { scale: 1.04, duration: 0.18 })}
            onMouseLeave={e => gsap.to(e.currentTarget, { scale: 1, duration: 0.28 })}
            style={{ padding: "0.7rem 1.4rem", border: "none", background: green, color: "#fff", borderRadius: 3, fontSize: "0.78rem", cursor: "pointer", ...mono }}>
            Read the full architecture →
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.2rem" }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="reveal-up"
              onMouseEnter={e => gsap.to(e.currentTarget, { y: -5, duration: 0.22, ease: "power2.out" })}
              onMouseLeave={e => gsap.to(e.currentTarget, { y: 0, duration: 0.32, ease: "power2.out" })}
              style={{ padding: "1.6rem 1.4rem", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 4, background: "#dedad0", cursor: "default" }}>
              <div style={{ width: 26, height: 26, background: green, borderRadius: 3, marginBottom: "0.9rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1.5 6L5 9.5L10.5 2.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1a2a1a", marginBottom: "0.4rem", ...mono }}>{f.label}</div>
              <div style={{ fontSize: "0.76rem", color: "#5a7a5a", lineHeight: 1.75 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── ARCHITECTURE CALLOUT ── */}
      <section style={{ background: "rgba(74,222,128,0.04)", borderTop: "1px solid rgba(0,0,0,0.08)", borderBottom: "1px solid rgba(0,0,0,0.08)", padding: "4rem 2.5rem", position: "relative", zIndex: 1 }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          {(() => {
            const r = useRef<HTMLDivElement>(null); useReveal(r);
            return (
              <div ref={r} style={{ marginBottom: "3rem", textAlign: "center" }}>
                <div style={{ fontSize: "0.62rem", letterSpacing: "0.2em", color: green, marginBottom: "0.6rem" }}>[ ARCHITECTURE ]</div>
                <h2 style={{ fontSize: "clamp(1.4rem,3.5vw,2.4rem)", fontWeight: 900, color: "#1a2a1a", margin: 0, ...mono }}>
                  Boring stack. Boring reliability.
                </h2>
              </div>
            );
          })()}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.8rem" }}>
            {[
              ["Next.js + Vercel", "frontend layer"],
              ["Cloudflare Workers", "edge gateway"],
              ["Cloudflare KV + R2", "chat cache + file storage"],
              ["FastAPI + LangChain", "backend orchestration"],
              ["Groq LPU", "llama 3 inference"],
              ["Supabase pgvector", "vector store + semantic cache"],
            ].map(([tech, role], i) => {
              const r = useRef(null);
              useEffect(() => {
                gsap.from(r.current, {
                  scrollTrigger: { trigger: r.current, start: "top 90%" },
                  scale: 0.92, opacity: 0, duration: 0.5, delay: i * 0.08, ease: "back.out(1.4)",
                });
              }, []);
              return (
                <div key={i} ref={r}
                  style={{ padding: "1.2rem", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, textAlign: "center", background: "#dedad0" }}
                  onMouseEnter={e => gsap.to(e.currentTarget, { background: "rgba(74,222,128,0.1)", duration: 0.2 })}
                  onMouseLeave={e => gsap.to(e.currentTarget, { background: "#dedad0", duration: 0.25 })}
                >
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#1a2a1a", marginBottom: "0.25rem", ...mono }}>{tech}</div>
                  <div style={{ fontSize: "0.65rem", color: green, letterSpacing: "0.1em" }}>{role}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section style={{ maxWidth: 800, margin: "0 auto", padding: "7rem 2.5rem", textAlign: "center", position: "relative", zIndex: 1 }}>
        {(() => {
          const r = useRef<HTMLDivElement>(null); useReveal(r);
          return (
            <div ref={r}>
              <div style={{
                width: 60, height: 60, borderRadius: "50%",
                background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.8rem", margin: "0 auto 2rem",
              }}>
                <svg width="26" height="26" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8.5" stroke={green} strokeWidth="1.5" />
                  <path d="M6 10 Q10 4.5 14 10 Q10 15.5 6 10Z" fill={green} />
                </svg>
              </div>
              <h2 style={{ fontSize: "clamp(1.8rem,5vw,3.2rem)", fontWeight: 900, color: "#1a2a1a", margin: "0 0 1.2rem", ...mono }}>
                Your documents are waiting<br /><span style={{ color: green }}>to be understood.</span>
              </h2>
              <p style={{ color: "#5a7a5a", fontSize: "0.88rem", lineHeight: 1.85, maxWidth: 480, margin: "0 auto 2.5rem" }}>
                Self-host in minutes. Edge-cached from request one. Swap any LLM. The chameleon never misses — neither will your inference pipeline.
              </p>
              <button
                onMouseEnter={e => gsap.to(e.currentTarget, { scale: 1.06, boxShadow: "0 0 40px rgba(34,197,94,0.4)", duration: 0.2 })}
                onMouseLeave={e => gsap.to(e.currentTarget, { scale: 1, boxShadow: "0 0 24px rgba(34,197,94,0.2)", duration: 0.28 })}
                style={{
                  padding: "1rem 2.8rem", background: green, border: "none",
                  borderRadius: 6, color: "#fff", fontSize: "0.92rem", fontWeight: 900,
                  cursor: "pointer", ...mono, letterSpacing: "0.04em",
                  boxShadow: "0 0 24px rgba(34,197,94,0.2)",
                }}>
                Start for free →
              </button>
            </div>
          );
        })()}
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        borderTop: "1px solid rgba(0,0,0,0.08)",
        padding: "1.8rem", display: "flex",
        justifyContent: "space-between", alignItems: "center",
        fontSize: "0.65rem", color: "#6a8a6a", letterSpacing: "0.1em",
        flexWrap: "wrap", gap: "0.5rem", position: "relative", zIndex: 1,
      }}>
        <span>octo · EDGE-CACHED RAG ENGINE</span>
        <span>© 2025 · FASTAPI + LANGCHAIN + GROQ + CLOUDFLARE</span>
        <span>MIT LICENSE · SELF-HOSTED · BUILT WITH 🌿</span>
      </footer>

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      <style>{`
        * { box-sizing: border-box; }
        @media (max-width: 860px) {
          .hero-section {
            grid-template-columns: 1fr !important;
            min-height: unset !important;
            padding-bottom: 2.5rem !important;
          }
          .hero-canvas-wrap {
            align-items: center !important;
            order: -1;
          }
          .hero-canvas-wrap canvas {
            max-width: 100% !important;
          }
          .nav-links { display: none !important; }
          .nav-ctas { display: none !important; }
          .nav-hamburger { display: block !important; }
        }
        @media (max-width: 540px) {
          .hero-section { padding: 1.2rem 1rem 2rem !important; }
          section { padding-left: 1rem !important; padding-right: 1rem !important; }
        }
      `}</style>
    </div>
  );
}