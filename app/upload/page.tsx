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

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [isAnswering, setIsAnswering] = useState(false);
  const [selectedModel, setSelectedModel] = useState("resume-brain");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesLoadError, setMessagesLoadError] = useState<string | null>(null);

  const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

  const MODELS = [
    { id: "resume-brain", label: "Self-hosted (vLLM)" },
    { id: "llama-3.1-8b-instant", label: "Groq LLaMA 3.1 8B" },
    { id: "llama-3.3-70b-versatile", label: "Groq LLaMA 3.3 70B" },
    { id: "qwen/qwen3-32b", label: "Groq Qwen 3 32B" },
    { id: "openai/gpt-oss-120b", label: "Groq GPT-OSS 120B" }
  ];

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const { user, signOut, getToken, isAnonymous, isLoading: authLoading } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deletingSessionsRef = useRef<Set<string>>(new Set());

  const lastLoadedSessionIdRef = useRef<string | null>(null);
  const isAnsweringRef = useRef(isAnswering);
  useEffect(() => {
    isAnsweringRef.current = isAnswering;
  }, [isAnswering]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // --- One-time typewriter for the empty-state hint ---
  const EMPTY_STATE_TEXT = "Attach a PDF and I'll retrieve, verify, and cite the source before answering.";
  const [typedHint, setTypedHint] = useState("");
  const typewriterPlayedRef = useRef(false);

  useEffect(() => {
    if (typewriterPlayedRef.current) return;
    typewriterPlayedRef.current = true;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setTypedHint(EMPTY_STATE_TEXT.slice(0, i));
      if (i >= EMPTY_STATE_TEXT.length) clearInterval(timer);
    }, 18);
    return () => clearInterval(timer);
  }, []);

  const streamingBufferRef = useRef("");
  const streamingActiveRef = useRef(false);
  const typingTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  const startTyping = useCallback((msgId: string) => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    const tick = () => {
      const buf = streamingBufferRef.current;
      const active = streamingActiveRef.current;

      if (buf.length === 0 && !active) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isStreaming: false } : m));
        typingTimerRef.current = null;
        return;
      }

      if (buf.length > 0) {
        let consumeCount = 1;
        if (buf.length > 200) consumeCount = 12;
        else if (buf.length > 100) consumeCount = 8;
        else if (buf.length > 50) consumeCount = 4;
        else if (buf.length > 20) consumeCount = 2;

        const nextPart = buf.slice(0, consumeCount);
        streamingBufferRef.current = buf.slice(consumeCount);

        setMessages(prev => prev.map(m =>
          m.id === msgId ? { ...m, content: m.content + nextPart, isStreaming: true } : m
        ));
      }

      typingTimerRef.current = setTimeout(tick, 15);
    };

    tick();
  }, []);

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

  useEffect(() => {
    // Wait for the auth bootstrap (session restore, or anonymous sign-in for
    // a first-time visitor) to actually finish before fetching. Firing this
    // immediately on mount raced ahead of that — getToken() came back empty,
    // the request went out with no Authorization header, and the backend
    // silently fell back to a shared dev identity with no sessions of its
    // own. Nothing ever re-fetched afterward, so the sidebar looked empty
    // until some other action (e.g. sending a message) happened to trigger
    // a re-render that coincided with auth finally being ready.
    if (authLoading) return;
    fetchSessions();
  }, [authLoading, fetchSessions]);

  const loadMessagesForSession = useCallback(async (sessionId: string, mountedCheck: () => boolean) => {
    setIsLoadingMessages(true);
    setMessagesLoadError(null);
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/messages`, {
        headers: await authHeaders(),
      });
      if (!res.ok) throw new Error("Failed");

      const data = await res.json();
      if (!mountedCheck()) return;

      const msgs: Message[] = (data.messages ?? []).map((m: any) => ({
        id: String(m.id),
        role: m.role === "assistant" ? "ai" : "user",
        content: m.content,
      }));

      setMessages(msgs);
      setUploadSuccess(msgs.length > 0);
    } catch (err) {
      if (mountedCheck()) {
        console.error("Error loading messages:", err);
        setMessagesLoadError("Couldn't load this conversation. Check your connection and try again.");
      }
    } finally {
      if (mountedCheck()) setIsLoadingMessages(false);
    }
  }, [API, authHeaders]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setUploadSuccess(false);
      setMessagesLoadError(null);
      lastLoadedSessionIdRef.current = null;
      return;
    }

    if (activeId === lastLoadedSessionIdRef.current) {
      return;
    }

    if (isAnsweringRef.current) {
      // If we are currently sending/streaming a message (e.g. creating a new session),
      // do not clear or reload messages to avoid wiping out the local state.
      lastLoadedSessionIdRef.current = activeId;
      return;
    }

    let mounted = true;
    lastLoadedSessionIdRef.current = activeId;

    // Keep the previous session's messages on screen (dimmed via isLoadingMessages)
    // instead of instantly blanking to empty — an abrupt blank reads as the chat
    // having vanished rather than as a page transitioning.
    loadMessagesForSession(activeId, () => mounted);
    return () => { mounted = false; };
  }, [activeId, loadMessagesForSession]);

  const retryLoadMessages = useCallback(() => {
    if (!activeId) return;
    loadMessagesForSession(activeId, () => true);
  }, [activeId, loadMessagesForSession]);

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

  const confirmDeleteSession = useCallback(async (id: string) => {
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

  const deleteSession = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionToDelete(id);
  }, []);

  // --- Autoscroll ---
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAnswering]);

  // --- Upload Handlers ---
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const f = e.target.files[0];
      if (f.type !== "application/pdf") {
        alert("Only PDF files are supported!");
        e.target.value = "";
        return;
      }
      if (f.size > MAX_UPLOAD_SIZE_BYTES) {
        alert(`That file is too large (max ${Math.floor(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))}MB).`);
        e.target.value = "";
        return;
      }
      setUploadError(null);
      setPendingFile(f);
    }
    e.target.value = "";
  };

  // Returns true on success, false on failure — callers must check this before
  // proceeding (e.g. handleSend shouldn't send a chat message about a doc that
  // never actually got indexed).
  const uploadFile = async (uploadedFile: File, sessionId: string): Promise<boolean> => {
    setIsUploading(true);
    setUploadSuccess(false);
    setUploadError(null);
    try {
      const token = await getToken();
      if (!token) {
        setUploadError("Your session isn't ready yet. Please wait a moment and try again.");
        return false;
      }

      const formData = new FormData();
      formData.append("file", uploadedFile);
      const res = await fetch(`${API}/upload?session_id=${sessionId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error("Your session has expired. Please sign in again.");
        }
        if (res.status === 413) {
          throw new Error("That file is too large for the server to accept.");
        }
        if (res.status >= 500) {
          throw new Error("The server hit an error processing that file. Please try again.");
        }
        throw new Error(`Upload failed (status ${res.status}).`);
      }

      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new Error("Received an unexpected response from the server.");
      }

      if (!isMountedRef.current) return true;
      setUploadSuccess(true);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "ai",
        content: `Document **${uploadedFile.name}** indexed successfully. What would you like to know about it?`,
      }]);
      return true;
    } catch (err: any) {
      if (isMountedRef.current) {
        const message = err instanceof TypeError
          ? "Could not reach the server. Please check your connection and try again."
          : (err?.message || "Upload failed. Please try again.");
        setUploadError(message);
      }
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsUploading(false);
        setPendingFile(null);
      }
    }
  };

  // --- Chat Handlers ---
  const handleSend = async () => {
    if ((!inputVal.trim() && !pendingFile) || isAnswering || isUploading) return;
    setIsAnswering(true);

    const q = inputVal.trim();
    setInputVal("");

    // Show the user's own message immediately, before any network round-trip
    // (session creation, upload) — previously this waited until after both
    // of those resolved, so the screen sat on the empty state with zero
    // feedback, then the upload's own "indexed successfully" AI message
    // would appear before the user's message ever showed up. Nothing should
    // ever delay the user seeing their own message.
    if (q) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: q }]);
    }

    let sid = activeId;
    let aiId = "";
    try {
      if (!sid) {
        const newSession = await createSession(q.slice(0, 40) || "New Chat");
        sid = newSession.id;
      } else {
        const session = sessions.find(s => s.id === sid);
        if (session && (!session.title || session.title === "New Chat") && messages.length === 0) {
          const newTitle = q.slice(0, 40);
          fetch(`${API}/sessions/${sid}/title?title=${encodeURIComponent(newTitle)}`, {
            method: "PATCH",
            headers: await authHeaders(),
          });
          setSessions(prev => prev.map(s => s.id === sid ? { ...s, title: newTitle } : s));
        }
      }

      if (pendingFile) {
        const uploaded = await uploadFile(pendingFile, sid!);
        if (!uploaded) return;
        if (!q) return;
      }

      if (!q) return;

      aiId = (Date.now() + 1).toString();
      const aiMsg: Message = { id: aiId, role: "ai", content: "", isStreaming: true };

      setMessages(prev => [...prev, aiMsg]);

      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...await authHeaders(),
        },
        body: JSON.stringify({ q, session_id: sid, model: selectedModel }),
      });
      if (!res.ok) throw new Error("Failed");

      // Check if the response is streaming (or plain text cache hit, which we also stream)
      const contentType = res.headers.get("Content-Type");
      if (contentType && (contentType.includes("text/event-stream") || contentType.includes("text/plain"))) {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        if (!reader) throw new Error("No stream reader available for streaming response");

        // Initialize typewriter refs
        streamingBufferRef.current = "";
        streamingActiveRef.current = true;

        startTyping(aiId);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          streamingBufferRef.current += chunk;
        }

        streamingActiveRef.current = false;

        // Wait for typewriter loop to catch up and fully output the buffered text
        while (streamingBufferRef.current.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 30));
        }
      } else {
        // Fallback for JSON responses
        const data = await res.json();
        const content = data.content || data.cached_answer || "";

        setMessages(prev => prev.map(m =>
          m.id === aiId ? { ...m, content: content, isStreaming: false } : m
        ));
      }

    } catch (err) {
      setMessages(prev => {
        // aiId is only set once the chat request actually starts — a failure
        // before that (session creation, upload) has no message to attach
        // the error to, so it needs its own bubble instead of silently
        // vanishing (which is what happened before this check existed).
        if (!aiId || !prev.some(m => m.id === aiId)) {
          return [...prev, {
            id: Date.now().toString(),
            role: "ai",
            content: "[Error: Connection Failed]",
          }];
        }
        return prev.map(m =>
          m.id === aiId ? { ...m, content: m.content + "\n\n[Error: Connection Failed]", isStreaming: false } : m
        );
      });
    } finally {
      setIsAnswering(false);
    }
  };

  const renderFormattedContent = (content: string) => {
    const regex = /(\*?_?\*\*[^*_]+\*\*_?\*?|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;
    const parts = content.split(regex);
    return parts.map((part, i) => {
      if (!part) return null;
      if (
        (part.startsWith('*_**') && part.endsWith('**_*')) ||
        (part.startsWith('**_*') && part.endsWith('*_**')) ||
        (part.startsWith('***') && part.endsWith('***')) ||
        (part.startsWith('**_') && part.endsWith('_**')) ||
        (part.startsWith('_**') && part.endsWith('**_'))
      ) {
        const clean = part
          .replace(/^(\*_*\*|\*\*_\*|\*\*\*|_\*\*|\*\*_\*?)/, "")
          .replace(/(\*_\*\*|\*\*_\*|\*\*\*|_\*\*|\*\*_\*?)$/, "");
        return <strong key={i}><em>{clean}</em></strong>;
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        const clean = part.slice(2, -2);
        return <strong key={i}>{clean}</strong>;
      }
      if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
        const clean = part.slice(1, -1);
        return <em key={i}>{clean}</em>;
      }
      return part;
    });
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
            <div style={{ fontWeight: 900, fontSize: "0.92rem", color: "#1a2a1a", letterSpacing: "0.02em" }}>Thotqen</div>
            <div style={{ fontSize: "0.58rem", letterSpacing: "0.18em", color: green, textTransform: "uppercase", opacity: 0.7, marginTop: 1 }}>agentic document intelligence</div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="sidebar-close-btn"
            style={{ display: "none", background: "none", border: "none", cursor: "pointer", color: green, fontSize: "1.1rem", padding: "0.2rem", lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Session History */}
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
            © 2026 Thotqen · agentic RAG engine
          </div>
        </div>
      </aside>

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      {/* MAIN */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", minWidth: 0, position: "relative" }}>

        <div className="bg-blob blob-1" />
        <div className="bg-blob blob-2" />

        <div style={{ padding: "1.1rem 1.2rem", borderBottom: `1px solid ${borderCol}`, display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0, flexWrap: "wrap", position: "relative", zIndex: 1 }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="hamburger-btn"
            style={{ display: "none", background: "none", border: `1px solid ${borderCol}`, borderRadius: 3, cursor: "pointer", padding: "0.3rem 0.5rem", color: green, fontSize: "1rem", lineHeight: 1, flexShrink: 0 }}
          >☰</button>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: "0.62rem", letterSpacing: "0.2em", color: green, opacity: 0.65, flexShrink: 0 }}>[ thotqen ]</div>
            {uploadSuccess && (
              <>
                <div style={{ width: 1, height: 12, background: borderCol, margin: "0 0.4rem", flexShrink: 0 }} />
                <div style={{ fontSize: "0.63rem", color: "#5a7a5a", letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Context Loaded</div>
              </>
            )}
            {isLoadingMessages && (
              <div style={{ fontSize: "0.6rem", color: "#8a9a7a", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span className="mini-spinner" />
                loading…
              </div>
            )}
          </div>
          {/* Model selection dropdown removed: routing handled by intent router on the backend */}
        </div>

        <div style={{
          flex: 1, overflowY: "auto", padding: "1.4rem 1.2rem", display: "flex", flexDirection: "column", gap: "1.1rem",
          position: "relative", zIndex: 1,
          opacity: isLoadingMessages ? 0.45 : 1, transition: "opacity 0.25s ease",
        }}>
          {messagesLoadError ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: "3rem", gap: "0.9rem" }}>
              <div style={{ fontSize: "0.75rem", color: "#c85050", textAlign: "center", maxWidth: 320, lineHeight: 1.7 }}>
                {messagesLoadError}
              </div>
              <button
                onClick={retryLoadMessages}
                style={{ padding: "0.5rem 1rem", background: "transparent", border: `1px solid ${green}`, borderRadius: 4, color: green, cursor: "pointer", fontSize: "0.7rem", letterSpacing: "0.06em", ...mono }}
              >
                retry
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: "3rem" }}>
              <div style={{ width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.2rem" }}>
                <svg width="72" height="72" viewBox="0 0 64 64" fill="none">
                  <ellipse cx="32" cy="27" rx="17" ry="15" fill={cardBg} stroke={green} strokeWidth="1.5" />
                  <circle cx="26" cy="25" r="2" fill={green} />
                  <circle cx="38" cy="25" r="2" fill={green} />
                  <path d="M26 32 Q32 36 38 32" stroke={green} strokeWidth="1.3" strokeLinecap="round" fill="none" />
                  {[0, 1, 2, 3, 4, 5].map((i) => {
                    const baseX = 13 + i * 7.6;
                    return (
                      <path
                        key={i}
                        className={`tentacle tentacle-${i}`}
                        d={`M${baseX} 39 Q${baseX - 2} 48 ${baseX + 2} 54 T${baseX + 3} 60`}
                        stroke={green}
                        strokeWidth="2"
                        strokeLinecap="round"
                        fill="none"
                        style={{ transformOrigin: `${baseX}px 39px` } as React.CSSProperties}
                      />
                    );
                  })}
                </svg>
              </div>
              <h2 style={{ fontSize: "clamp(1.2rem,3vw,1.9rem)", fontWeight: 900, color: "#1a2a1a", margin: "0 0 0.5rem", textAlign: "center", ...mono }}>
                ask your documents anything
              </h2>
              <p style={{ fontSize: "0.7rem", color: "#6a8a6a", letterSpacing: "0.07em", textAlign: "center", maxWidth: 300, lineHeight: 2, textTransform: "uppercase", margin: 0, minHeight: "2.6em" }}>
                {typedHint}
                {typedHint.length < EMPTY_STATE_TEXT.length && (
                  <span style={{ display: "inline-block", width: 5, height: 10, background: green, marginLeft: 2, verticalAlign: "text-bottom", animation: "cursorBlink 0.65s infinite" }} />
                )}
              </p>
              <div style={{ fontSize: "0.56rem", color: "#8a9a7a", letterSpacing: "0.14em", textTransform: "uppercase", marginTop: "0.9rem", opacity: 0.7 }}>
                octo · one tentacle per agentic step
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="msg-row" style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "85%", padding: "0.9rem 1.1rem", borderRadius: 4,
                  border: `1px solid ${borderCol}`,
                  background: msg.role === "user" ? green : cardBg,
                  color: msg.role === "user" ? "#fff" : "#1a2a1a",
                }}>
                  <div style={{ fontSize: "0.56rem", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: "0.45rem", opacity: 0.5, color: msg.role === "user" ? "#c8dfc8" : green }}>
                    {msg.role === "ai" ? "[ thotqen ]" : "you"}
                  </div>
                  <div style={{ fontSize: "0.81rem", lineHeight: 1.8, whiteSpace: "pre-wrap", minHeight: msg.isStreaming && msg.content === "" ? "2.5em" : undefined, display: msg.isStreaming && msg.content === "" ? "flex" : "block", alignItems: "center" }}>
                    {msg.isStreaming && msg.content === "" ? (
                      <span style={{ display: "inline-flex", gap: 5, alignItems: "center", minHeight: "1.4em" }}>
                        {[0, 0.2, 0.4].map((d, i) => (
                          <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: green, display: "inline-block", animation: `bounce 1s ${d}s infinite ease-in-out` }} />
                        ))}
                      </span>
                    ) : (
                      <>
                        {renderFormattedContent(msg.content)}
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
        <div style={{ borderTop: `1px solid ${borderCol}`, padding: "0.9rem 1.2rem", background: bg, flexShrink: 0, position: "relative", zIndex: 1 }}>

          {/* Upload Error Banner */}
          {uploadError && (
            <div style={{ padding: "0.5rem 0.8rem", background: "rgba(200,50,50,0.08)", border: "1px solid rgba(200,50,50,0.3)", borderRadius: 4, marginBottom: "0.6rem", fontSize: "0.7rem", color: "#c85050" }}>
              {uploadError}
            </div>
          )}

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

      {sessionToDelete && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          backdropFilter: "blur(4px)"
        }}>
          <div style={{
            background: bg,
            border: `1px solid ${green}`,
            borderRadius: 4,
            padding: "1.6rem",
            maxWidth: 360,
            width: "90%",
            boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            ...mono
          }}>
            <div style={{ fontWeight: 900, fontSize: "0.95rem", color: "#1a2a1a", marginBottom: "0.8rem", letterSpacing: "0.02em" }}>
              [ DELETE SESSION ]
            </div>
            <div style={{ fontSize: "0.74rem", lineHeight: 1.6, color: "#5a7a5a", marginBottom: "1.5rem" }}>
              Are you sure you want to delete this chat session? All message history will be permanently deleted.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                onClick={() => setSessionToDelete(null)}
                style={{
                  padding: "0.5rem 1rem",
                  background: "transparent",
                  border: `1px solid ${borderCol}`,
                  borderRadius: 3,
                  color: "#1a2a1a",
                  cursor: "pointer",
                  fontSize: "0.68rem",
                  letterSpacing: "0.04em",
                  ...mono
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const id = sessionToDelete;
                  setSessionToDelete(null);
                  await confirmDeleteSession(id);
                }}
                style={{
                  padding: "0.5rem 1rem",
                  background: "#b33939",
                  border: "none",
                  borderRadius: 3,
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "0.68rem",
                  letterSpacing: "0.04em",
                  ...mono
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes cursorBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.13); border-radius: 3px; }

        .bg-blob {
          position: absolute; border-radius: 50%; filter: blur(60px);
          opacity: 0.13; pointer-events: none; z-index: 0; background: ${green};
        }
        .blob-1 { width: 280px; height: 280px; top: -90px; left: -70px; animation: drift1 19s ease-in-out infinite; }
        .blob-2 { width: 220px; height: 220px; bottom: -70px; right: -50px; animation: drift2 23s ease-in-out infinite; }
        @keyframes drift1 { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(40px, 30px); } }
        @keyframes drift2 { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(-30px, -25px); } }

        @keyframes tentacleWiggle { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }
        .tentacle { animation: tentacleWiggle 2.2s ease-in-out infinite; }
        .tentacle-0 { animation-delay: 0s; }
        .tentacle-1 { animation-delay: 0.12s; }
        .tentacle-2 { animation-delay: 0.24s; }
        .tentacle-3 { animation-delay: 0.36s; }
        .tentacle-4 { animation-delay: 0.48s; }
        .tentacle-5 { animation-delay: 0.6s; }

        @keyframes msgEnter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .msg-row { animation: msgEnter 0.22s ease-out; }

        .mini-spinner {
          width: 8px; height: 8px; border-radius: 50%;
          border: 1.5px solid rgba(26,107,58,0.25); border-top-color: ${green};
          animation: spin 0.7s linear infinite; display: inline-block;
        }

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