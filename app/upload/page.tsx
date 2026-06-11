"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import AuthModal from "@/components/AuthModal";

type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  isStreaming?: boolean;
};

type Session = {
  id: string;
  title: string | null;
  created_at: string;
};

type CrocState = "idle" | "thinking" | "streaming" | "done";

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [isAnswering, setIsAnswering] = useState(false);
  const [crocState, setCrocState] = useState<CrocState>("idle");
  const [statusLabel, setStatusLabel] = useState("< lurking... />");
  const [selectedModel, setSelectedModel] = useState("resume-brain");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const MODELS = [
    { id: "resume-brain", label: "Local Ollama (schema context)" },
    { id: "llama-3.1-8b-instant", label: "Groq LLaMA 3.1 8B" },
    { id: "llama-3.3-70b-versatile", label: "Groq LLaMA 3.3 70B" },
    { id: "qwen/qwen3-32b", label: "Groq Qwen 3 32B" },
    { id: "openai/gpt-oss-120b", label: "Groq GPT-OSS 120B" }
  ];

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const { user, signOut, getToken, isAnonymous } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number>(0);
  const crocStateRef = useRef<CrocState>("idle");
  const deletingSessionsRef = useRef<Set<string>>(new Set());

  const handleNewChat = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setUploadSuccess(false);
  }, []);

  // --- Fetch Sessions ---
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API}/sessions`, {
        headers: await authHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch { }
  }, [API, authHeaders]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setUploadSuccess(false);
      return;
    }

    let mounted = true;

    // Instantly clear messages of the previous session to make switching responsive
    setMessages([]);
    setUploadSuccess(false);

    const loadMessages = async () => {
      // Don't fetch if we're in the middle of sending a message for a new session
      if (isAnswering) return;

      try {
        const res = await fetch(`${API}/sessions/${activeId}/messages`, {
          headers: await authHeaders(),
        });
        if (!res.ok) throw new Error("Failed");

        const data = await res.json();
        if (!mounted) return;

        const msgs: Message[] = (data.messages ?? []).map((m: any) => ({
          id: String(m.id),
          role: m.role === "assistant" ? "ai" : "user",
          content: m.content,
        }));

        setMessages(msgs);
        setUploadSuccess(msgs.length > 0);
      } catch (err) {
        if (mounted) {
          console.error("Error loading messages:", err);
          setMessages([]);
        }
      }
    };

    loadMessages();
    return () => { mounted = false; };
  }, [activeId, API, getToken, isAnswering]); // Added isAnswering to dependency to help avoid races

  const createSession = useCallback(async (title?: string) => {
    const res = await fetch(`${API}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...await authHeaders(),
      },
      body: JSON.stringify({ title: title ?? "New Chat" }),
    });
    if (!res.ok) throw new Error("Failed");
    const session = await res.json();

    // Update list first
    setSessions(prev => [session, ...prev]);

    // Set active ID but we DON'T clear messages here if we're about to populate them in handleSend
    setActiveId(session.id);
    setUploadSuccess(false);
    return session;
  }, [API, getToken]);

  const deleteSession = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (deletingSessionsRef.current.has(id)) {
      return;
    }
    deletingSessionsRef.current.add(id);

    // Optimistically update UI
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
      setUploadSuccess(false);
    }

    try {
      await fetch(`${API}/sessions/${id}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
    } catch (err) {
      console.error("Error deleting session:", err);
      fetchSessions();
    } finally {
      deletingSessionsRef.current.delete(id);
    }
  }, [API, activeId, authHeaders, fetchSessions]);

  // --- Croc status and autoscroll ---
  useEffect(() => {
    crocStateRef.current = crocState;
    if (crocState === "idle") setStatusLabel("< lurking... />");
    else if (crocState === "thinking") setStatusLabel("< processing... />");
    else if (crocState === "streaming") setStatusLabel("< responding... />");
    else if (crocState === "done") setStatusLabel("< ready />");
  }, [crocState]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAnswering]);

  // --- Canvas Animation ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = 280, H = 180;
    canvas.width = W;
    canvas.height = H;

    let time = 0;
    let bubbleTimer = 0;
    let bubbles: { x: number; y: number; r: number; alpha: number; vy: number }[] = [];
    let ripples: { x: number; y: number; r: number; alpha: number }[] = [];
    let eyeBlink = 0;
    let tailWag = 0;
    let jawPhase = 0;
    let jawOpen = 0;
    let splashParticles: { x: number; y: number; vx: number; vy: number; alpha: number }[] = [];
    let lastState: CrocState = "idle";

    const spawnSplash = (x: number, y: number) => {
      for (let i = 0; i < 10; i++) {
        splashParticles.push({
          x, y,
          vx: (Math.random() - 0.5) * 3.5,
          vy: -1.5 - Math.random() * 2,
          alpha: 0.85,
        });
      }
    };

    const drawWater = () => {
      ctx.fillStyle = "#8ab8a0";
      ctx.fillRect(0, 82, W, H - 82);
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = "#c8e8d8";
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const y = 92 + i * 13 + Math.sin(time * 0.04 + i * 1.1) * 2.5;
        ctx.beginPath();
        ctx.moveTo(8, y);
        ctx.bezierCurveTo(70, y - 3, 180, y + 3, W - 8, y);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = "#5e8f6e";
      ctx.fillRect(0, 80, W, 4);
      ctx.fillStyle = "#c8d8b0";
      ctx.fillRect(0, 0, W, 82);
      const reed = (rx: number) => {
        ctx.save();
        ctx.strokeStyle = "#3a5a28";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(rx, 84);
        ctx.bezierCurveTo(rx + Math.sin(time * 0.03) * 2.5, 65, rx, 50, rx + Math.sin(time * 0.025 + rx) * 3.5, 40);
        ctx.stroke();
        ctx.fillStyle = "#2a4a1a";
        ctx.beginPath();
        ctx.ellipse(rx + Math.sin(time * 0.025 + rx) * 3.5, 38, 2.5, 7, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };
      reed(14); reed(24); reed(252); reed(266);
    };

    const drawBubbles = () => {
      bubbleTimer++;
      const state = crocStateRef.current;
      const rate = state === "thinking" ? 5 : state === "streaming" ? 3 : 25;
      if (bubbleTimer % rate === 0) {
        bubbles.push({ x: 85 + Math.random() * 70, y: 128, r: 2 + Math.random() * 2.5, alpha: 0.65, vy: -0.55 - Math.random() * 0.35 });
      }
      bubbles = bubbles.filter(b => b.alpha > 0.05);
      bubbles.forEach(b => {
        b.y += b.vy;
        b.x += Math.sin(time * 0.1 + b.r) * 0.28;
        b.alpha -= 0.007;
        ctx.save();
        ctx.globalAlpha = b.alpha;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });
    };

    const drawRipples = () => {
      const state = crocStateRef.current;
      if (state === "streaming" && Math.random() < 0.07) {
        ripples.push({ x: 70 + Math.random() * 120, y: 110, r: 2, alpha: 0.45 });
      }
      ripples = ripples.filter(r => r.alpha > 0.02);
      ripples.forEach(r => {
        r.r += 1.1;
        r.alpha -= 0.013;
        ctx.save();
        ctx.globalAlpha = r.alpha;
        ctx.strokeStyle = "#b8d8c0";
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.r, r.r * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });
    };

    const drawSplash = () => {
      splashParticles = splashParticles.filter(p => p.alpha > 0.05);
      splashParticles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.14;
        p.alpha -= 0.022;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = "#c8e8d8";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    };

    const drawCroc = () => {
      const state = crocStateRef.current;
      if (state !== lastState) {
        if (state === "thinking") spawnSplash(135, 108);
        if (state === "streaming") spawnSplash(150, 105);
        lastState = state;
      }

      const subY = state === "idle" ? 3 : state === "thinking" ? 5 : 1;
      const bx = 44, by = 100 + subY;

      ctx.save();
      ctx.strokeStyle = "#3a5228";
      ctx.lineWidth = 12;
      ctx.lineCap = "round";
      tailWag = state === "streaming" ? Math.sin(time * 0.13) * 7 : Math.sin(time * 0.04) * 2.5;
      ctx.beginPath();
      ctx.moveTo(bx, by + 5);
      ctx.bezierCurveTo(bx - 25, by + 17 + tailWag, bx - 52, by + 13 + tailWag, bx - 70, by + tailWag * 1.3);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(bx - 70, by + tailWag * 1.3);
      ctx.bezierCurveTo(bx - 82, by + tailWag * 1.6, bx - 90, by + tailWag * 0.4, bx - 86, by - 7 + tailWag);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = "#4a6a38";
      ctx.beginPath();
      ctx.ellipse(bx + 60, by + 3, 72, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#3a5228";
      for (let i = 0; i < 7; i++) {
        const sx = bx + 16 + i * 16;
        ctx.beginPath();
        ctx.moveTo(sx, by - 2);
        ctx.lineTo(sx - 4, by + 5);
        ctx.lineTo(sx + 4, by + 5);
        ctx.closePath();
        ctx.fill();
      }

      ctx.save();
      ctx.strokeStyle = "#3a5228";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      [[bx + 22, by + 12], [bx + 88, by + 12]].forEach(([lx, ly]) => {
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + 5, ly + 9);
        ctx.stroke();
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(lx + 5, ly + 9);
        ctx.lineTo(lx + 1, ly + 14);
        ctx.moveTo(lx + 5, ly + 9);
        ctx.lineTo(lx + 9, ly + 14);
        ctx.stroke();
        ctx.lineWidth = 6;
      });
      ctx.restore();

      const hx = bx + 130, hy = by - 3;

      ctx.fillStyle = "#4a6a38";
      ctx.beginPath();
      ctx.ellipse(hx + 17, hy + 3, 33, 10, 0.08, 0, Math.PI * 2);
      ctx.fill();

      if (state === "thinking") {
        jawPhase += 0.04;
        jawOpen = Math.abs(Math.sin(jawPhase)) * 0.22;
      } else if (state === "streaming") {
        jawPhase += 0.13;
        jawOpen = Math.abs(Math.sin(jawPhase)) * 0.38;
      } else {
        jawOpen = Math.max(0, jawOpen - 0.018);
      }

      ctx.save();
      ctx.translate(hx + 15, hy + 9);
      ctx.rotate(jawOpen);
      ctx.fillStyle = "#385028";
      ctx.beginPath();
      ctx.moveTo(-28, 0);
      ctx.bezierCurveTo(-8, 10, 16, 12, 33, 7);
      ctx.bezierCurveTo(16, 18, -8, 16, -28, 9);
      ctx.closePath();
      ctx.fill();
      if (jawOpen > 0.05) {
        ctx.fillStyle = "#e8e0c0";
        for (let t = 0; t < 5; t++) {
          ctx.beginPath();
          ctx.moveTo(-20 + t * 10, 0);
          ctx.lineTo(-23 + t * 10, -5);
          ctx.lineTo(-17 + t * 10, -5);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();

      if (jawOpen > 0.05) {
        ctx.fillStyle = "#e8e0c0";
        for (let t = 0; t < 5; t++) {
          const tx = hx - 12 + t * 10;
          ctx.beginPath();
          ctx.moveTo(tx, hy + 10);
          ctx.lineTo(tx - 2.5, hy + 15);
          ctx.lineTo(tx + 2.5, hy + 15);
          ctx.closePath();
          ctx.fill();
        }
      }

      ctx.fillStyle = "#2a3a18";
      ctx.beginPath();
      ctx.ellipse(hx + 44, hy - 1, 2.5, 1.8, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hx + 49, hy - 1, 2.5, 1.8, -0.3, 0, Math.PI * 2);
      ctx.fill();

      const ex = hx + 10, ey = hy - 8;
      ctx.fillStyle = "#2a3a18";
      ctx.beginPath();
      ctx.arc(ex, ey, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c8b840";
      ctx.beginPath();
      ctx.arc(ex, ey, 5.5, 0, Math.PI * 2);
      ctx.fill();
      const pupilH = state === "thinking" ? 9 : state === "streaming" ? 7 : 5;
      ctx.fillStyle = "#181810";
      ctx.beginPath();
      ctx.ellipse(ex, ey, 1.8, pupilH / 2, 0, 0, Math.PI * 2);
      ctx.fill();

      eyeBlink = Math.max(0, eyeBlink - 0.07);
      if (Math.random() < 0.003) eyeBlink = 1;
      if (eyeBlink > 0.3) {
        ctx.fillStyle = "#3a5228";
        ctx.beginPath();
        ctx.arc(ex, ey, 8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(255,255,230,0.7)";
      ctx.beginPath();
      ctx.arc(ex - 1.5, ey - 2, 2, 0, Math.PI * 2);
      ctx.fill();

      if (state === "thinking") {
        ctx.save();
        ctx.globalAlpha = 0.13 + 0.08 * Math.sin(time * 0.1);
        ctx.strokeStyle = "#c8b840";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ex, ey, 13 + Math.sin(time * 0.08) * 2.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (state === "streaming" && time % 9 === 0) {
        spawnSplash(hx + 50, hy + 1);
      }
    };

    const tick = () => {
      time++;
      ctx.clearRect(0, 0, W, H);
      drawWater();
      drawRipples();
      drawBubbles();
      drawSplash();
      drawCroc();
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // --- Upload Handlers ---
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const f = e.target.files[0];
      if (f.type !== "application/pdf") {
        alert("Only PDF files are supported!");
        return;
      }
      setPendingFile(f);
    }
    e.target.value = "";
  };

  const uploadFile = async (uploadedFile: File, sessionId: string) => {
    setIsUploading(true);
    setUploadSuccess(false);
    try {
      const formData = new FormData();
      formData.append("file", uploadedFile);
      const res = await fetch(`${API}/upload?session_id=${sessionId}`, {
        method: "POST",
        headers: await authHeaders(),
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();

      setUploadSuccess(true);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "ai",
        content: `Document **${uploadedFile.name}** indexed successfully. What would you like to know about it?`,
      }]);
    } catch (err) {
      alert("Upload failed. Ensure the server is running.");
    } finally {
      setIsUploading(false);
      setPendingFile(null);
    }
  };

  // --- Chat Handlers ---
  const handleSend = async () => {
    if ((!inputVal.trim() && !pendingFile) || isAnswering || isUploading) return;
    setIsAnswering(true);

    let sid = activeId;
    let aiId = "";
    try {
      if (!sid) {
        const newSession = await createSession(inputVal.slice(0, 40) || "New Chat");
        sid = newSession.id;
      } else {
        const session = sessions.find(s => s.id === sid);
        if (session && (!session.title || session.title === "New Chat") && messages.length === 0) {
          const newTitle = inputVal.slice(0, 40);
          fetch(`${API}/sessions/${sid}/title?title=${encodeURIComponent(newTitle)}`, {
            method: "PATCH",
            headers: await authHeaders(),
          });
          setSessions(prev => prev.map(s => s.id === sid ? { ...s, title: newTitle } : s));
        }
      }

      if (pendingFile) {
        await uploadFile(pendingFile, sid!);
        if (!inputVal.trim()) return;
      }

      const q = inputVal.trim();
      setInputVal("");

      const userMsg: Message = { id: Date.now().toString(), role: "user", content: q };
      aiId = (Date.now() + 1).toString();
      const aiMsg: Message = { id: aiId, role: "ai", content: "", isStreaming: true };

      setMessages(prev => [...prev, userMsg, aiMsg]);
      setCrocState("thinking");

      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...await authHeaders(),
        },
        body: JSON.stringify({ q, session_id: sid, model: selectedModel }),
      });
      if (!res.ok) throw new Error("Failed");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      if (!reader) throw new Error("No stream");

      let started = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!started) {
          started = true;
          setCrocState("streaming");
        }
        setMessages(prev => prev.map(m =>
          m.id === aiId ? { ...m, content: m.content + chunk, isStreaming: true } : m
        ));
      }

      setMessages(prev => prev.map(m => m.id === aiId ? { ...m, isStreaming: false } : m));
      setCrocState("done");
      setTimeout(() => setCrocState("idle"), 2200);
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === aiId ? { ...m, content: m.content + "\n\n[Error: Connection Failed]", isStreaming: false } : m
      ));
      setCrocState("idle");
    } finally {
      setIsAnswering(false);
    }
  };

  const mono = { fontFamily: "'Courier New', Courier, monospace" } as React.CSSProperties;
  const bg = "#e6e1d8";
  const green = "#1a6b3a";
  const cardBg = "#dedad0";
  const borderCol = "rgba(0,0,0,0.10)";

  return (
    <div style={{ display: "flex", height: "100dvh", width: "100%", background: bg, overflow: "hidden", position: "relative", ...mono }}>

      {/* MOBILE OVERLAY */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 40 }}
          className="sidebar-overlay"
        />
      )}

      {/* SIDEBAR */}
      <aside className={`app-sidebar${sidebarOpen ? " sidebar-open" : ""}`} style={{
        width: 296, flexShrink: 0, background: bg, borderRight: `1px solid ${borderCol}`,
        display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden",
      }}>

        <div style={{ padding: "1.4rem 1.6rem", borderBottom: `1px solid ${borderCol}`, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8.5" stroke={green} strokeWidth="1.5" />
            <path d="M6 10 Q10 4.5 14 10 Q10 15.5 6 10Z" fill={green} />
          </svg>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: "0.92rem", color: "#1a2a1a", letterSpacing: "0.02em" }}>greptile</div>
            <div style={{ fontSize: "0.58rem", letterSpacing: "0.18em", color: green, textTransform: "uppercase", opacity: 0.7, marginTop: 1 }}>knowledge engine</div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="sidebar-close-btn"
            style={{ display: "none", background: "none", border: "none", cursor: "pointer", color: green, fontSize: "1.1rem", padding: "0.2rem", lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Croc */}
        <div style={{ padding: "0.8rem 0.8rem 0", borderBottom: `1px solid ${borderCol}` }}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "auto", display: "block", borderRadius: 3 }} />
          <div style={{ fontSize: "0.58rem", letterSpacing: "0.12em", color: green, opacity: 0.5, margin: "0.3rem 0.4rem 0.6rem", ...mono }}>
            {statusLabel}
          </div>
        </div>

        {/* ChatGPT Style History */}
        <div style={{ padding: "1.1rem 1.4rem", flex: 1, overflowY: "auto" }}>
          <button
            onClick={handleNewChat}
            style={{ width: "100%", padding: "0.6rem 0", background: "transparent", border: `1px solid ${green}`, borderRadius: 4, color: green, cursor: "pointer", marginBottom: "1rem", fontSize: "0.75rem", ...mono }}
          >
            + New Chat
          </button>

          <div style={{ fontSize: "0.58rem", letterSpacing: "0.2em", color: green, textTransform: "uppercase", marginBottom: "0.75rem", opacity: 0.75 }}>
            [ recent sessions ]
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {sessions.map(s => (
              <div
                key={s.id}
                onClick={() => setActiveId(s.id)}
                style={{
                  padding: "0.6rem 0.8rem", borderRadius: 4, cursor: "pointer",
                  background: activeId === s.id ? cardBg : "transparent",
                  border: `1px solid ${activeId === s.id ? borderCol : "transparent"}`,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontSize: "0.75rem", color: "#1a2a1a"
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.title || "Untitled"}
                </span>
                <button
                  onClick={(e) => deleteSession(s.id, e)}
                  style={{ background: "none", border: "none", color: "#8a9a7a", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "0.85rem 1.4rem", borderTop: `1px solid ${borderCol}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.8rem" }}>
            <div style={{
              width: 32, height: 32, borderRadius: 3, background: green,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.75rem", color: "#fff", fontWeight: 900
            }}>
              {user?.email?.[0].toUpperCase() || "?"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: "0.72rem", color: "#1a2a1a", fontWeight: 700,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
              }}>
                {isAnonymous ? "Guest User" : user?.email?.split("@")[0]}
              </div>
              <button
                onClick={isAnonymous ? () => setAuthModalOpen(true) : () => signOut()}
                style={{
                  background: "none", border: "none", padding: 0,
                  color: green, fontSize: "0.6rem", cursor: "pointer",
                  letterSpacing: "0.1em", textTransform: "uppercase", ...mono
                }}
              >
                {isAnonymous ? "[ sign in ]" : "[ sign out ]"}
              </button>
            </div>
          </div>
          <div style={{ fontSize: "0.57rem", color: "#8a9a7a", letterSpacing: "0.08em" }}>
            © 2025 greptile · ai knowledge engine
          </div>
        </div>
      </aside>

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      {/* MAIN */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", minWidth: 0 }}>

        <div style={{ padding: "1.1rem 1.2rem", borderBottom: `1px solid ${borderCol}`, display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0, flexWrap: "wrap" }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="hamburger-btn"
            style={{ display: "none", background: "none", border: `1px solid ${borderCol}`, borderRadius: 3, cursor: "pointer", padding: "0.3rem 0.5rem", color: green, fontSize: "1rem", lineHeight: 1, flexShrink: 0 }}
          >☰</button>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: "0.62rem", letterSpacing: "0.2em", color: green, opacity: 0.65, flexShrink: 0 }}>[ ai copilot ]</div>
            {uploadSuccess && (
              <>
                <div style={{ width: 1, height: 12, background: borderCol, margin: "0 0.4rem", flexShrink: 0 }} />
                <div style={{ fontSize: "0.63rem", color: "#5a7a5a", letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Context Loaded</div>
              </>
            )}
          </div>

          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            style={{ padding: "0.3rem", fontSize: "0.65rem", background: cardBg, border: `1px solid ${borderCol}`, borderRadius: 3, color: "#1a2a1a", outline: "none", cursor: "pointer", maxWidth: "100%", ...mono }}
          >
            {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "1.4rem 1.2rem", display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          {messages.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: "3rem" }}>
              <div style={{ width: 50, height: 50, border: `1px solid ${borderCol}`, borderRadius: 4, background: cardBg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.2rem" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={green} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h2 style={{ fontSize: "clamp(1.2rem,3vw,1.9rem)", fontWeight: 900, color: "#1a2a1a", margin: "0 0 0.5rem", textAlign: "center", ...mono }}>
                how can i help you?
              </h2>
              <p style={{ fontSize: "0.7rem", color: "#6a8a6a", letterSpacing: "0.07em", textAlign: "center", maxWidth: 300, lineHeight: 2, textTransform: "uppercase", margin: 0 }}>
                Attach a PDF with the paperclip to provide context, or just ask me anything.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "85%", padding: "0.9rem 1.1rem", borderRadius: 4,
                  border: `1px solid ${borderCol}`,
                  background: msg.role === "user" ? green : cardBg,
                  color: msg.role === "user" ? "#fff" : "#1a2a1a",
                }}>
                  <div style={{ fontSize: "0.56rem", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: "0.45rem", opacity: 0.5, color: msg.role === "user" ? "#c8dfc8" : green }}>
                    {msg.role === "ai" ? "[ ai copilot ]" : "you"}
                  </div>
                  <div style={{ fontSize: "0.81rem", lineHeight: 1.8, whiteSpace: "pre-wrap", minHeight: msg.isStreaming && msg.content === "" ? "2.5em" : undefined, display: "flex", alignItems: "center" }}>
                    {msg.isStreaming && msg.content === "" ? (
                      <span style={{ display: "inline-flex", gap: 5, alignItems: "center", minHeight: "1.4em" }}>
                        {[0, 0.2, 0.4].map((d, i) => (
                          <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: green, display: "inline-block", animation: `bounce 1s ${d}s infinite ease-in-out` }} />
                        ))}
                      </span>
                    ) : (
                      <>
                        {msg.content.split("**").map((part, i) =>
                          i % 2 === 1 ? <span key={i} style={{ fontWeight: 900 }}>{part}</span> : part
                        )}
                        {msg.isStreaming && msg.content !== "" && (
                          <span style={{ display: "inline-block", width: 7, height: 13, background: green, marginLeft: 2, verticalAlign: "text-bottom", animation: "cursorBlink 0.65s infinite" }} />
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* INPUT AREA */}
        <div style={{ borderTop: `1px solid ${borderCol}`, padding: "0.9rem 1.2rem", background: bg, flexShrink: 0 }}>

          {/* File Pill */}
          {pendingFile && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.8rem", background: cardBg, border: `1px solid ${borderCol}`, borderRadius: 4, width: "fit-content", marginBottom: "0.6rem", fontSize: "0.7rem", color: green }}>
              <span>📎</span>
              <span>{pendingFile.name}</span>
              <button onClick={() => setPendingFile(null)} style={{ background: "none", border: "none", color: "#8a9a7a", cursor: "pointer", marginLeft: "0.4rem" }}>✕</button>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.65rem", alignItems: "flex-end" }}>
            {/* Paperclip Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: "0.8rem 0.8rem", background: cardBg, border: `1px solid ${borderCol}`, borderRadius: 3, cursor: "pointer", color: green, display: "flex", alignItems: "center", justifyContent: "center"
              }}
            >
              📎
            </button>
            <input type="file" accept="application/pdf" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} />

            <textarea
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={"ask me anything or attach a pdf..."}
              rows={1}
              style={{
                flex: 1, background: cardBg, border: `1px solid ${borderCol}`, borderRadius: 3,
                padding: "0.8rem 0.9rem", resize: "none", outline: "none", color: "#1a2a1a",
                fontSize: "0.78rem", lineHeight: 1.6, minHeight: 46, maxHeight: 160,
                ...mono,
              }}
            />
            <button
              onClick={handleSend}
              disabled={(!inputVal.trim() && !pendingFile) || isAnswering || isUploading}
              style={{
                padding: "0.8rem 1.2rem",
                background: ((!inputVal.trim() && !pendingFile) || isAnswering || isUploading) ? "rgba(0,0,0,0.08)" : green,
                color: ((!inputVal.trim() && !pendingFile) || isAnswering || isUploading) ? "#8a9a7a" : "#fff",
                border: "none", borderRadius: 3, fontSize: "0.73rem",
                cursor: ((!inputVal.trim() && !pendingFile) || isAnswering || isUploading) ? "not-allowed" : "pointer",
                letterSpacing: "0.06em", transition: "all 0.2s ease", flexShrink: 0, ...mono,
              }}
            >
              {isUploading ? "uploading..." : "send →"}
            </button>
          </div>
          <div style={{ textAlign: "center", marginTop: "0.65rem", fontSize: "0.58rem", color: "#8a9a7a", letterSpacing: "0.1em" }}>
            AI can make mistakes. Always verify the source material.
          </div>
        </div>
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes cursorBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.13); border-radius: 3px; }

        @media (max-width: 900px) {
          .app-sidebar {
            position: fixed !important;
            top: 0;
            left: 0;
            z-index: 50;
            transform: translateX(-100%);
            transition: transform 0.28s ease;
            box-shadow: 4px 0 24px rgba(0,0,0,0.12);
          }
          .app-sidebar.sidebar-open {
            transform: translateX(0);
          }
          .sidebar-overlay {
            display: block !important;
          }
          .hamburger-btn {
            display: flex !important;
            align-items: center;
            justify-content: center;
          }
          .sidebar-close-btn {
            display: flex !important;
            align-items: center;
            justify-content: center;
          }
        }

        @media (max-width: 600px) {
          .app-sidebar {
            width: 88vw !important;
            max-width: 320px;
          }
        }
      `}</style>
    </div>
  );
}