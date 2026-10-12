"use client";

import React, { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useAuth } from "@/components/AuthProvider";
import AuthModal from "@/components/AuthModal";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import DocumentViewer, { ViewerTarget } from "@/components/DocumentViewer";
import { parseQuoteSegments, QuoteMeta, QUOTE_MARK } from "@/lib/quotes";
import { BrandLogo, HeroBrandEmblem } from "@/components/BrandLogo";
import { readApiError } from "@/lib/apiError";

type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  isStreaming?: boolean;
  statusText?: string;
  quoteMeta?: QuoteMeta[];
  // Upload progress / "indexed successfully" notices — never saved to the
  // backend, client-only. Shown as a lighter-weight strip while they're
  // still the newest thing on screen; once a real question has been sent,
  // they'd otherwise sit above the actual conversation looking like an
  // unanswered leftover prompt, so they're hidden from then on (see
  // visibleMessages below) rather than rendered as a permanent chat turn.
  isSystemNotice?: boolean;
};

type Session = {
  id: string;
  title: string | null;
  created_at: string;
};

type SessionDoc = {
  id: string;
  filename: string;
  doc_type: "pdf" | "docx";
};

function UploadPageInner() {
  const searchParams = useSearchParams();
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

  const [sessionDocs, setSessionDocs] = useState<SessionDoc[]>([]);
  const [viewerTarget, setViewerTarget] = useState<ViewerTarget | null>(null);
  const [agenticMode, setAgenticMode] = useState(false);
  const [anonymizePii, setAnonymizePii] = useState(false);
  const [inputExpanded, setInputExpanded] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const appliedUrlSessionRef = useRef(false);

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

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
  const EMPTY_STATE_TEXT = "Attach a PDF or DOCX and I'll retrieve, verify, and cite the source before answering.";
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
      // Deduplicate by ID — the optimistic prepend in createSession
      // and the subsequent fetchSessions can otherwise briefly show
      // the same session twice.
      const seen = new Set<string>();
      const unique = (data.sessions ?? []).filter((s: Session) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
      setSessions(unique);
    } catch { }
  }, [API, authHeaders]);

  // Opening a document from the library ("/upload?session=<id>") jumps
  // straight into that chat instead of landing on the empty state.
  // Also immediately fetch sessions so the sidebar shows it without
  // waiting for the regular auth-ready fetch.
  useEffect(() => {
    if (authLoading || appliedUrlSessionRef.current) return;
    const urlSession = searchParams.get("session");
    if (urlSession) {
      appliedUrlSessionRef.current = true;
      setActiveId(urlSession);
      // Ensure this session appears in the sidebar even if the sidebar
      // list hasn't loaded yet (e.g. navigated here via library link).
      fetchSessions();
    }
  }, [authLoading, searchParams, fetchSessions]);

  // Which document(s) the active session is grounded in — drives the
  // agentic-mode toggle (single doc only) and citation-click targets.
  useEffect(() => {
    if (!activeId) {
      setSessionDocs([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/sessions/${activeId}/documents`, { headers: await authHeaders() });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setSessionDocs((data.documents ?? []).map((d: any) => ({ id: d.id, filename: d.filename, doc_type: d.doc_type })));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [activeId, authHeaders]);

  useEffect(() => {
    if (sessionDocs.length !== 1) setAgenticMode(false);
  }, [sessionDocs]);

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

  useEffect(() => {
    // The sidebar's session list otherwise only ever changes via targeted
    // local edits (prepend on create, filter on delete) — a tab left open
    // across a backend-side change (e.g. the DB getting cleared) keeps
    // showing whatever was in memory, and any later local edit (like
    // attaching a file, which prepends onto that stale array) makes the
    // old entries visibly reappear alongside the new one. Refetching the
    // real list whenever the tab regains focus keeps it honest without
    // needing to poll continuously.
    const onFocus = () => { if (!authLoading) fetchSessions(); };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") onFocus(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [authLoading, fetchSessions]);

  const loadMessagesForSession = useCallback(async (sessionId: string, mountedCheck: () => boolean) => {
    setIsLoadingMessages(true);
    setMessagesLoadError(null);

    // Auto-retry up to 3x with 2s delay to handle cold-start backend timeouts
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000;
    let lastErr: any;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (!mountedCheck()) return;
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAY));
        if (!mountedCheck()) return;
      }
      try {
        const res = await fetch(`${API}/sessions/${sessionId}/messages`, {
          headers: await authHeaders(),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (!mountedCheck()) return;

        const msgs: Message[] = (data.messages ?? []).map((m: any) => ({
          id: String(m.id),
          role: m.role === "assistant" ? "ai" : "user",
          content: m.content,
          quoteMeta: m.quotes ?? undefined,
        }));

        setMessages(msgs);
        setUploadSuccess(msgs.length > 0);
        if (mountedCheck()) setIsLoadingMessages(false);
        return; // success — stop retrying
      } catch (err) {
        lastErr = err;
        console.warn(`[loadMessages] attempt ${attempt + 1} failed:`, err);
      }
    }

    // All retries exhausted
    if (mountedCheck()) {
      console.error("Error loading messages after retries:", lastErr);
      setMessagesLoadError("Couldn't load this conversation — the server may be waking up. Try again in a moment.");
      setIsLoadingMessages(false);
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

    // Optimistically prepend — deduplicate in case fetchSessions below
    // returns before this state update is flushed (avoid double-entry).
    setSessions(prev => {
      const already = prev.some(s => s.id === session.id);
      return already ? prev : [session, ...prev];
    });
    fetchSessions();

    setActiveId(session.id);
    setUploadSuccess(false);
    return session;
  }, [API, authHeaders, fetchSessions]);

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
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isAnswering]);

  // --- Auto-resize input when collapsing ---
  useEffect(() => {
    if (!inputExpanded && inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [inputExpanded]);

  // --- Upload Handlers ---
  const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const f = e.target.files[0];
      const ext = ACCEPTED_EXTENSIONS.find((x) => f.name.toLowerCase().endsWith(x));
      if (!ext) {
        alert(`Unsupported file type. Only ${ACCEPTED_EXTENSIONS.join(", ")} files are supported.`);
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
      formData.append("file", uploadedFile, uploadedFile.name);
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
        throw new Error(await readApiError(res, `Upload failed (status ${res.status}).`));
      }

      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new Error("Received an unexpected response from the server.");
      }

      // /upload only queues the job (status: "queued") — the actual
      // chunking/embedding happens asynchronously via Celery. This used to
      // declare success and invite a question the instant the file was
      // *queued*, not indexed — a real "summarize it" sent right after
      // upload could easily race ahead of indexing actually finishing
      // (worse for bigger documents), hit an empty vector store, and burn
      // through the whole CRAG/Self-RAG retry loop for a document that
      // simply wasn't there yet. Now polls the real job status and only
      // declares success once indexing has actually completed.
      if (!data.job_id) {
        throw new Error("Upload succeeded but no job was returned to track indexing.");
      }

      const progressId = Date.now().toString();
      if (!isMountedRef.current) return true;
      setMessages(prev => [...prev, {
        id: progressId,
        role: "ai",
        content: `Indexing **${uploadedFile.name}**...`,
        isSystemNotice: true,
      }]);

      const POLL_INTERVAL_MS = 1500;
      const POLL_TIMEOUT_MS = 180_000;
      const pollStart = Date.now();
      let finalStatus: any = null;
      while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
        if (!isMountedRef.current) return true;
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        const statusRes = await fetch(`${API}/upload/status/${data.job_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!statusRes.ok) continue; // transient — keep polling until timeout
        const statusData = await statusRes.json();
        if (statusData.status === "done") {
          finalStatus = statusData;
          break;
        }
        if (statusData.status === "failed") {
          finalStatus = statusData;
          break;
        }
        const pct = typeof statusData.progress_percent === "number" ? ` (${statusData.progress_percent}%)` : "";
        setMessages(prev => prev.map(m =>
          m.id === progressId ? { ...m, content: `Indexing **${uploadedFile.name}**...${pct}` } : m
        ));
      }

      if (!isMountedRef.current) return true;

      if (!finalStatus) {
        setMessages(prev => prev.map(m =>
          m.id === progressId
            ? { ...m, content: `Indexing **${uploadedFile.name}** is taking longer than expected. It may still finish in the background — try asking about it again shortly.` }
            : m
        ));
        return false;
      }

      if (finalStatus.status === "failed") {
        setMessages(prev => prev.map(m =>
          m.id === progressId
            ? { ...m, content: `Failed to index **${uploadedFile.name}**${finalStatus.error ? `: ${finalStatus.error}` : "."}` }
            : m
        ));
        return false;
      }

      setUploadSuccess(true);
      setMessages(prev => prev.map(m =>
        m.id === progressId
          ? { ...m, content: `**${uploadedFile.name}** has been indexed and is ready for analysis.`, isSystemNotice: true }
          : m
      ));
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

    const userMsgId = Date.now().toString();
    const aiId = (Date.now() + 1).toString();

    // Show the user's message AND an immediate AI loader bubble with zero delay.
    // The user feels prioritized immediately, then sees gradual real-time progress.
    if (q) {
      const initialStatus = pendingFile
        ? `Preparing ${pendingFile.name}…`
        : (!activeId
            ? "Initializing workspace session…"
            : (agenticMode ? "Agent initializing research workflow…" : "Analyzing prompt & consulting knowledge…"));

      setMessages(prev => [
        ...prev,
        { id: userMsgId, role: "user", content: q },
        { id: aiId, role: "ai", content: "", isStreaming: true, statusText: initialStatus }
      ]);
      // Scrolling itself is handled by the [messages, isAnswering] effect on
      // chatContainerRef (scoped to the message list) — this used to also
      // call chatBottomRef.scrollIntoView() here, which native-scrolls every
      // scrollable ancestor to bring its target into view, including <main>
      // (overflow: hidden, no visible scrollbar, but still programmatically
      // scrollable) — confirmed live: it pushed the header div above <main>'s
      // clipped viewport instead of just scrolling the message list.
    }

    let sid = activeId;
    try {
      if (!sid) {
        if (q) {
          setMessages(prev => prev.map(m => m.id === aiId ? { ...m, statusText: "Setting up workspace session…" } : m));
        }
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
        if (q) {
          setMessages(prev => prev.map(m => m.id === aiId ? { ...m, statusText: `Uploading and indexing ${pendingFile.name}…` } : m));
        }
        const uploaded = await uploadFile(pendingFile, sid!);
        if (!uploaded) {
          if (q) setMessages(prev => prev.filter(m => m.id !== aiId));
          return;
        }
        if (!q) {
          if (aiId) setMessages(prev => prev.filter(m => m.id !== aiId));
          return;
        }
      }

      if (!q) return;

      // Update status before hitting the chat API
      setMessages(prev => prev.map(m => m.id === aiId ? {
        ...m,
        statusText: agenticMode
          ? "Agent reasoning & dispatching search tools…"
          : "Checking semantic cache & document embeddings…"
      } : m));

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...await authHeaders(),
        },
        body: JSON.stringify({
          q,
          session_id: sid,
          model: selectedModel,
          mode: agenticMode ? "agentic" : "standard",
          anonymize: anonymizePii
        }),
        signal: controller.signal,
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

        // The backend interleaves real per-stage status updates into the
        // stream, each wrapped in \x1e (ASCII Record Separator) — a
        // character that never occurs in normal generated text, so it's a
        // safe, simple delimiter without needing a bigger protocol change.
        // rawTail holds anything not yet resolved into either "definitely
        // plain text" or "a complete status marker" — a marker can arrive
        // split across two chunk reads, so a lone \x1e at the end of a
        // chunk has to be held back until the next read might complete it.
        let rawTail = "";
        const STATUS_MARKER = /\x1e([^\x1e]*)\x1e/g;
        let receivedAnything = false;

        // A proxy or the backend can close a stream cleanly (a normal
        // done:true, no thrown error) without ever having sent a single
        // byte — the fetch API doesn't always surface that as a network
        // error. Left unguarded, the AI bubble stays on isStreaming+empty
        // forever (the bouncing-dots fallback), with no error ever shown.
        // This bounds the gap between reads: no data for this long means
        // treat it as stuck rather than wait indefinitely.
        const STALL_TIMEOUT_MS = 35_000;
        const readWithStallTimeout = (): Promise<ReadableStreamReadResult<Uint8Array>> =>
          Promise.race([
            reader.read(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("STALL_TIMEOUT")), STALL_TIMEOUT_MS)
            ),
          ]);

        while (true) {
          let readResult: ReadableStreamReadResult<Uint8Array>;
          try {
            readResult = await readWithStallTimeout();
          } catch {
            reader.cancel().catch(() => {});
            throw new Error("The server took too long to respond. Please try again.");
          }
          const { done, value } = readResult;
          if (done) break;
          receivedAnything = true;
          rawTail += decoder.decode(value, { stream: true });

          let cleaned = "";
          let lastIndex = 0;
          let match: RegExpExecArray | null;
          STATUS_MARKER.lastIndex = 0;
          while ((match = STATUS_MARKER.exec(rawTail)) !== null) {
            cleaned += rawTail.slice(lastIndex, match.index);
            const label = match[1];
            if (label.startsWith("__QUOTES__:")) {
              // Quote verification metadata — one entry per QUOTE_MARK pair
              // in the answer, sent once generation + verification finish.
              // Not a status line to display.
              try {
                const quoteMeta = JSON.parse(label.slice("__QUOTES__:".length));
                setMessages(prev => prev.map(m => m.id === aiId ? { ...m, quoteMeta } : m));
              } catch {}
            } else {
              setMessages(prev => prev.map(m => m.id === aiId ? { ...m, statusText: label } : m));
            }
            lastIndex = STATUS_MARKER.lastIndex;
          }
          rawTail = rawTail.slice(lastIndex);

          const openIdx = rawTail.indexOf("\x1e");
          if (openIdx === -1) {
            cleaned += rawTail;
            rawTail = "";
          } else {
            cleaned += rawTail.slice(0, openIdx);
            rawTail = rawTail.slice(openIdx);
          }

          if (cleaned) {
            streamingBufferRef.current += cleaned;
            // Real content has started — the status line has done its job.
            setMessages(prev => prev.map(m => m.id === aiId && m.statusText ? { ...m, statusText: undefined } : m));
          }
        }

        streamingActiveRef.current = false;

        // The connection closed "cleanly" (done:true, no thrown error) but
        // never delivered a single byte — same silent-hang risk as the
        // stall timeout above, just via the other exit path (a fast clean
        // close instead of a slow one). Surface it instead of quietly
        // finishing with an empty bubble.
        if (!receivedAnything) {
          throw new Error("The connection closed before a response arrived. Please try again.");
        }

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
      if (err instanceof DOMException && err.name === "AbortError") {
        // User-initiated stop (handleStop already finalized the message
        // and kept whatever had been generated) — not an error to report.
        return;
      }
      const errText = err instanceof Error && err.message ? err.message : "Connection Failed";
      setMessages(prev => {
        // aiId is only set once the chat request actually starts — a failure
        // before that (session creation, upload) has no message to attach
        // the error to, so it needs its own bubble instead of silently
        // vanishing (which is what happened before this check existed).
        if (!aiId || !prev.some(m => m.id === aiId)) {
          return [...prev, {
            id: Date.now().toString(),
            role: "ai",
            content: `[Error: ${errText}]`,
          }];
        }
        return prev.map(m =>
          m.id === aiId
            ? { ...m, content: m.content + (m.content ? "\n\n" : "") + `[Error: ${errText}]`, isStreaming: false, statusText: undefined }
            : m
        );
      });
    } finally {
      setIsAnswering(false);
    }
  };

  // Stops the answer while it's being written — whatever has already been
  // typed out stays on screen, nothing further is shown or generated.
  //
  // The backend already generated, quote-verified, and saved the FULL
  // answer to the DB before a single byte streamed to the client (quote
  // verification needs the complete text) — so stopping here is purely a
  // client-side display cutoff unless told otherwise. Without the
  // truncate-last-answer call below, reopening this chat later would show
  // the complete, never-actually-stopped answer again, not what the user
  // saw and stopped at.
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    streamingActiveRef.current = false;
    streamingBufferRef.current = "";
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    setMessages(prev => {
      const stopped = prev.find(m => m.isStreaming);
      if (stopped && activeId) {
        authHeaders().then(headers =>
          fetch(`${API}/sessions/${activeId}/truncate-last-answer`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({ content: stopped.content }),
          })
        ).catch(() => {
          // Best-effort persistence — the visible stop already happened;
          // a reopen just won't reflect the truncation if this fails.
        });
      }
      return prev.map(m =>
        m.isStreaming ? { ...m, isStreaming: false, statusText: undefined } : m
      );
    });
    setIsAnswering(false);
  }, [activeId, API, authHeaders]);

  const mono = { fontFamily: "'Courier New', Courier, monospace" } as React.CSSProperties;
  const sansSerif = { fontFamily: "'Inter', system-ui, -apple-system, sans-serif" } as React.CSSProperties;
  const bg = "#edeae3";
  const green = "#1a6b3a";
  const greenDark = "#144f2c";
  const cardBg = "#e4e0d6";
  const borderCol = "rgba(0,0,0,0.09)";

  // Was a hand-rolled regex that only caught **bold**/*italic* — every
  // list, code block, link, and heading the LLM actually outputs rendered
  // as flat unstyled text. react-markdown + remark-gfm handles the full
  // surface (lists, tables, code, blockquotes, links) properly; these
  // overrides just keep every element on-theme with the rest of the app
  // instead of using react-markdown's unstyled defaults.
  // inline=true: used for the text segments *around* a verified-quote span
  // (see renderAiContent below) — each segment is re-parsed through its own
  // ReactMarkdown call, and a real <p> there forces a block-level break
  // ─── Per-message action state ─────────────────────────────────────────────
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const copyMessage = useCallback((id: string, text: string) => {
    // Strip quote markers for clean copy
    const clean = text.replace(/\u{201C}|\u{201D}|\u{00AB}|\u{00BB}/gu, '"').trim();
    navigator.clipboard.writeText(clean).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(prev => prev === id ? null : prev), 1800);
    }).catch(() => {
      // Fallback for insecure contexts
      const ta = document.createElement('textarea');
      ta.value = clean;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedId(id);
      setTimeout(() => setCopiedId(prev => prev === id ? null : prev), 1800);
    });
  }, []);

  const shareMessage = useCallback(async (text: string) => {
    const clean = text.replace(/\u{201C}|\u{201D}/gu, '"').trim();
    if (navigator.share) {
      try {
        await navigator.share({ text: clean, title: 'Folio — Document Analysis' });
      } catch { /* user dismissed */ }
    }
  }, []);

  const toggleSpeak = useCallback((id: string, text: string) => {
    if (!('speechSynthesis' in window)) return;
    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    // Strip markdown syntax for clean reading
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/#+\s/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[\u{201C}\u{201D}\u{AB}\u{BB}]/gu, '"')
      .trim();
    const utt = new SpeechSynthesisUtterance(clean);
    
    // Attempt to pick a higher quality voice if available
    const voices = window.speechSynthesis.getVoices();
    const bestVoice = voices.find(v => v.name.includes("Google US English") || v.name.includes("Google UK English Female") || v.name.includes("Samantha"))
      || voices.find(v => v.lang.startsWith("en-US"))
      || voices.find(v => v.lang.startsWith("en-GB"))
      || voices[0];
    if (bestVoice) utt.voice = bestVoice;
    
    utt.rate = 0.95;
    utt.onend = () => setSpeakingId(null);
    utt.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utt);
  }, [speakingId]);

  // Stop speech when switching sessions
  useEffect(() => {
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
  }, [activeId]);

  const exportMessage = (id: string, text: string) => {
    const docNames = sessionDocs.map(d => d.filename).join(", ") || "Contract Document";
    const report = `# Contract Copilot — Analysis Report
Date: ${new Date().toLocaleString()}
Document(s): ${docNames}

---

## Response
${text}

---
Verified quotes located and cross-referenced server-side against source contracts.
Report generated with Contract Copilot
`;
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contract-analysis-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleVoiceInput = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }
    if (isListening) {
      try { recognitionRef.current?.stop(); } catch {}
      setIsListening(false);
    } else {
      try {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = true;
        rec.lang = "en-US";
        rec.onstart = () => setIsListening(true);
        rec.onresult = (e: any) => {
          const transcript = Array.from(e.results)
            .map((r: any) => r[0].transcript)
            .join("");
          setInputVal(transcript);
        };
        rec.onerror = () => setIsListening(false);
        rec.onend = () => setIsListening(false);
        recognitionRef.current = rec;
        rec.start();
      } catch {
        setIsListening(false);
      }
    }
  };

  const MessageActions = ({ id, text, isUser }: { id: string; text: string; isUser: boolean }) => {
    const isCopied = copiedId === id;
    const isSpeaking = speakingId === id;
    const btnBase: React.CSSProperties = {
      background: 'transparent', border: 'none', cursor: 'pointer',
      padding: '0.25rem 0.35rem', borderRadius: 5, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      color: isUser ? 'rgba(255,255,255,0.65)' : '#888',
      transition: 'all 0.15s ease',
    };
    return (
      <div className="msg-actions" style={{
        display: 'flex', gap: 2, marginTop: '0.35rem',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        opacity: 0, transition: 'opacity 0.15s ease',
      }}>
        {/* Copy */}
        <button
          title={isCopied ? 'Copied!' : 'Copy'}
          onClick={() => copyMessage(id, text)}
          style={{ ...btnBase, color: isCopied ? (isUser ? '#a8ffca' : green) : btnBase.color }}
        >
          {isCopied ? (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="5" y="2" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M2 5h2v8.5a.5.5 0 0 0 .5.5H11v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          )}
        </button>

        {/* Export answer (AI answers only) */}
        {!isUser && (
          <button
            title="Export answer (.md)"
            onClick={() => exportMessage(id, text)}
            style={btnBase}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v8m0 0l-2.5-2.5M8 10l2.5-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2.5 12.5h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        )}

        {/* Share (Only if supported by browser natively) */}
        {'share' in navigator && (
          <button title="Share" onClick={() => shareMessage(text)} style={btnBase}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="12" cy="3" r="1.8" stroke="currentColor" strokeWidth="1.4"/>
              <circle cx="12" cy="13" r="1.8" stroke="currentColor" strokeWidth="1.4"/>
              <circle cx="4" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.4"/>
              <line x1="5.7" y1="7.1" x2="10.3" y2="4.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <line x1="5.7" y1="8.9" x2="10.3" y2="11.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>
        )}

        {/* Read Aloud */}
        {'speechSynthesis' in (typeof window !== 'undefined' ? window : {}) && (
          <button
            title={isSpeaking ? 'Stop reading' : 'Read aloud'}
            onClick={() => toggleSpeak(id, text)}
            style={{ ...btnBase, color: isSpeaking ? (isUser ? '#a8ffca' : green) : btnBase.color }}
          >
            {isSpeaking ? (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="3" width="3.5" height="10" rx="1" fill="currentColor"/>
                <rect x="9.5" y="3" width="3.5" height="10" rx="1" fill="currentColor"/>
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M3 5.5h2l3-3v11l-3-3H3a.5.5 0 0 1-.5-.5v-4A.5.5 0 0 1 3 5.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                <path d="M10.5 5.5a3 3 0 0 1 0 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M12.5 3.5a5.5 5.5 0 0 1 0 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        )}
      </div>
    );
  };

  // before/after every single quote, shattering one continuous sentence
  // like "The cap is X (<quote>) and applies to Y" into three stacked
  // blocks instead of one flowing line. A message with no quotes at all
  // still gets real <p>/<ul>/<li> block structure (the only-text branch in
  // renderAiContent doesn't go through per-segment rendering).
  const getMarkdownComponents = (isUser: boolean, inline = false): React.ComponentProps<typeof ReactMarkdown>["components"] => {
    const linkColor = isUser ? "rgba(255,255,255,0.9)" : green;
    const subtleBorder = isUser ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.08)";
    const inlineCodeBg = isUser ? "rgba(255,255,255,0.15)" : "rgba(26,107,58,0.08)";
    const textColor = isUser ? "rgba(255,255,255,0.95)" : "#1c2b1c";
    return {
      p: inline
        ? ({ children }) => <>{children}</>
        : ({ children }) => <p style={{ margin: "0 0 0.8em 0", lineHeight: 1.75, color: textColor, ...sansSerif }}>{children}</p>,
      strong: ({ children }) => <strong style={{ fontWeight: 700, color: isUser ? "#fff" : greenDark }}>{children}</strong>,
      em: ({ children }) => <em style={{ color: textColor, opacity: 0.85 }}>{children}</em>,
      ul: ({ children }) => <ul style={{ margin: "0.5em 0 0.9em", paddingLeft: "1.5em", display: "flex", flexDirection: "column", gap: "0.4em", ...sansSerif }}>{children}</ul>,
      ol: ({ children }) => <ol style={{ margin: "0.5em 0 0.9em", paddingLeft: "1.6em", display: "flex", flexDirection: "column", gap: "0.4em", ...sansSerif }}>{children}</ol>,
      li: ({ children }) => <li style={{ lineHeight: 1.75, color: textColor, paddingLeft: "0.2em" }}>{children}</li>,
      a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: linkColor, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "3px" }}>
          {children}
        </a>
      ),
      blockquote: ({ children }) => (
        <blockquote style={{
          borderLeft: `3px solid ${isUser ? "rgba(255,255,255,0.4)" : green}`,
          paddingLeft: "1em", margin: "0.7em 0",
          background: isUser ? "rgba(255,255,255,0.06)" : "rgba(26,107,58,0.05)",
          borderRadius: "0 4px 4px 0", padding: "0.6em 0.9em",
          fontStyle: "italic", opacity: 0.88,
        }}>
          {children}
        </blockquote>
      ),
      h1: ({ children }) => <div style={{ fontWeight: 800, fontSize: "1.08em", margin: "1em 0 0.45em", letterSpacing: "-0.01em", color: isUser ? "#fff" : greenDark, borderBottom: `1px solid ${subtleBorder}`, paddingBottom: "0.3em", ...sansSerif }}>{children}</div>,
      h2: ({ children }) => <div style={{ fontWeight: 700, fontSize: "1.02em", margin: "0.9em 0 0.4em", color: isUser ? "#fff" : greenDark, ...sansSerif }}>{children}</div>,
      h3: ({ children }) => <div style={{ fontWeight: 700, fontSize: "0.96em", letterSpacing: "0.01em", margin: "0.7em 0 0.3em", color: isUser ? "rgba(255,255,255,0.9)" : green, ...sansSerif }}>{children}</div>,
      hr: () => <hr style={{ border: "none", borderTop: `1px solid ${subtleBorder}`, margin: "1em 0" }} />,
      code: ({ className, children }) => {
        const isBlock = Boolean(className);
        if (!isBlock) {
          return (
            <code style={{ background: inlineCodeBg, padding: "0.12em 0.45em", borderRadius: 4, fontSize: "0.84em", border: `1px solid ${subtleBorder}`, fontFamily: "'Courier New', monospace" }}>
              {children}
            </code>
          );
        }
        return <code>{children}</code>;
      },
      pre: ({ children }) => (
        <pre style={{
          background: "#111d11", color: "#d4edda", padding: "0.9em 1.1em", borderRadius: 6,
          overflowX: "auto", margin: "0.6em 0", fontSize: "0.78em", lineHeight: 1.65,
          border: `1px solid rgba(26,107,58,0.25)`,
        }}>
          {children}
        </pre>
      ),
      table: ({ children }) => (
        <div style={{ overflowX: "auto", margin: "0.6em 0", borderRadius: 4, border: `1px solid ${subtleBorder}` }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.83em", ...sansSerif }}>{children}</table>
        </div>
      ),
      th: ({ children }) => (
        <th style={{ border: `1px solid ${subtleBorder}`, padding: "0.45em 0.75em", textAlign: "left", background: isUser ? "rgba(255,255,255,0.1)" : "rgba(26,107,58,0.06)", fontWeight: 700, letterSpacing: "0.02em" }}>
          {children}
        </th>
      ),
      td: ({ children }) => <td style={{ border: `1px solid ${subtleBorder}`, padding: "0.4em 0.75em", lineHeight: 1.6 }}>{children}</td>,
    };
  };

  // Renders an AI message's content, resolving QUOTE_MARK-delimited spans
  // into verified (clickable, opens the source document highlighted) or
  // unverified (flagged, never shown as if it were genuine) styling. Only
  // resolved once the message has fully arrived — mid-stream a chunk
  // boundary can leave a quote mark temporarily unmatched, and the
  // verification metadata only arrives at the very end anyway.
  const openQuoteInViewer = useCallback((meta: QuoteMeta, quoteText: string) => {
    const doc = sessionDocs.find(d => d.id === meta.document_id);
    if (!doc) return;
    setViewerTarget({
      documentId: meta.document_id,
      docType: doc.doc_type,
      filename: doc.filename,
      quote: quoteText,
      page: meta.page,
      pageEnd: meta.page_end,
    });
  }, [sessionDocs]);

  const renderAiContent = (msg: Message) => {
    if (msg.isStreaming) {
      // Strip raw control markers during live typing rather than resolving
      // them — segment metadata isn't available yet, so a premature render
      // would briefly (and wrongly) show every quote as "unverified".
      const plain = msg.content.split(QUOTE_MARK).join("");
      return <ReactMarkdown remarkPlugins={[remarkGfm]} components={getMarkdownComponents(false)}>{plain}</ReactMarkdown>;
    }

    const segments = parseQuoteSegments(msg.content, msg.quoteMeta || []);
    if (!segments.some(s => s.type === "quote")) {
      return <ReactMarkdown remarkPlugins={[remarkGfm]} components={getMarkdownComponents(false)}>{msg.content}</ReactMarkdown>;
    }

    return (
      <>
        {segments.map((seg, i) => {
          if (seg.type === "text") {
            return <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={getMarkdownComponents(false, true)}>{seg.content}</ReactMarkdown>;
          }
          const verified = seg.meta.verified;
          return (
            <span
              key={i}
              className={`quote-span ${verified ? "quote-verified" : "quote-unverified"}`}
              onClick={verified ? () => openQuoteInViewer(seg.meta, seg.content) : undefined}
              title={verified
                ? `Verified from ${seg.meta.filename}${seg.meta.page ? ` (p.${seg.meta.page})` : ""} — click to inspect source`
                : "Unverified — text could not be verified in the source document"}
              style={{
                display: "inline",
                color: "inherit",
                borderBottom: verified ? `1.5px dotted rgba(26,107,58,0.45)` : "1.5px dashed rgba(200,80,80,0.4)",
                cursor: verified ? "pointer" : "help",
                borderRadius: 2,
                padding: "0 1px",
              }}
            >
              {seg.content}
              {verified ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    marginLeft: "0.25rem",
                    padding: "0 0.35rem",
                    borderRadius: 3,
                    background: "rgba(26,107,58,0.08)",
                    color: "#144f2c",
                    fontSize: "0.68rem",
                    fontWeight: 600,
                    verticalAlign: "baseline",
                    border: "1px solid rgba(26,107,58,0.16)",
                    lineHeight: 1.35,
                  }}
                >
                  {seg.meta.page ? `p.${seg.meta.page}` : "cite"}
                </span>
              ) : (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    marginLeft: "0.25rem",
                    padding: "0 0.35rem",
                    borderRadius: 3,
                    background: "rgba(200,80,80,0.08)",
                    color: "#b42828",
                    fontSize: "0.68rem",
                    fontWeight: 600,
                    verticalAlign: "baseline",
                    border: "1px solid rgba(200,80,80,0.16)",
                    lineHeight: 1.35,
                  }}
                >
                  ?
                </span>
              )}
            </span>
          );
        })}
      </>
    );
  };

  // Once a real question has been sent, an upload/indexing notice sitting
  // above it just looks like an unanswered leftover prompt — hide it from
  // here on rather than let it linger as a permanent part of the thread.
  const visibleMessages = messages.filter(m => !m.isSystemNotice || !messages.some(x => x.role === "user"));

  return (
    <div style={{ display: "flex", height: "100dvh", width: "100vw", background: bg, overflow: "hidden", ...sansSerif }}>

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
        width: 292, flexShrink: 0, background: "#e8e4dc", borderRight: `1px solid ${borderCol}`,
        display: "flex", flexDirection: "column", height: "100%", overflow: "hidden",
      }}>

        <div style={{ padding: "1.2rem 1.4rem", borderBottom: `1px solid ${borderCol}`, display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <BrandLogo size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#111", letterSpacing: "0.01em", ...sansSerif }}>Folio</div>
            <div style={{ fontSize: "0.62rem", color: green, opacity: 0.85, fontWeight: 500, ...sansSerif }}>Document Intelligence</div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="sidebar-close-btn"
            style={{ display: "none", background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: "1.1rem", padding: "0.2rem", lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Session History */}
        <div className="sidebar-scroll-container" style={{ padding: "1rem 1.1rem", flex: 1, minHeight: 0, overflowY: "auto" }}>
          <button
            onClick={handleNewChat}
            style={{
              width: "100%", padding: "0.6rem 0.8rem", background: green,
              border: "none", borderRadius: 6, color: "#fff",
              cursor: "pointer", marginBottom: "1.1rem", fontSize: "0.78rem",
              fontWeight: 600, letterSpacing: "0.01em", display: "flex",
              alignItems: "center", justifyContent: "center", gap: "0.4rem",
              ...sansSerif, transition: "all 0.15s ease",
              boxShadow: "0 1px 3px rgba(26,107,58,0.2)"
            }}
          >
            <span style={{ fontSize: "1.1em", lineHeight: 1 }}>+</span> New Chat
          </button>

          <div style={{ fontSize: "0.62rem", letterSpacing: "0.12em", color: "#888", textTransform: "uppercase", marginBottom: "0.6rem", fontWeight: 600, ...sansSerif }}>
            Recent
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {sessions.map(s => (
              <div
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={`sidebar-chat-item ${activeId === s.id ? "active" : ""}`}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {s.title || "Untitled"}
                </span>
                <button
                  onClick={(e) => deleteSession(s.id, e)}
                  className="sidebar-chat-delete"
                  title="Delete chat"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "1rem 1.2rem", borderTop: `1px solid ${borderCol}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.7rem" }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", background: green,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.78rem", color: "#fff", fontWeight: 700, flexShrink: 0, ...sansSerif
            }}>
              {user?.email?.[0]?.toUpperCase() || "G"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: "0.78rem", color: "#111", fontWeight: 600,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...sansSerif
              }}>
                {isAnonymous ? "Guest" : user?.email?.split("@")[0]}
              </div>
              <button
                onClick={isAnonymous ? () => setAuthModalOpen(true) : () => signOut()}
                style={{
                  background: "none", border: "none", padding: 0,
                  color: green, fontSize: "0.68rem", cursor: "pointer",
                  letterSpacing: "0", ...sansSerif,
                }}
              >
                {isAnonymous ? "Sign in" : "Sign out"}
              </button>
            </div>
          </div>
          <div style={{ fontSize: "0.62rem", color: "#aaa", letterSpacing: "0", ...sansSerif }}>
            © 2026 Folio
          </div>
        </div>
      </aside>

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      {/* MAIN */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden", minWidth: 0, position: "relative" }}>

        <div className="bg-blob blob-1" />
        <div className="bg-blob blob-2" />

        <div style={{ padding: "0.85rem 1.2rem", borderBottom: `1px solid rgba(0,0,0,0.06)`, display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0, flexWrap: "wrap", position: "relative", zIndex: 10, background: "rgba(237,234,227,0.96)", backdropFilter: "blur(8px)" }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="hamburger-btn"
            style={{ display: "none", background: "none", border: `1px solid ${borderCol}`, borderRadius: 4, cursor: "pointer", padding: "0.3rem 0.5rem", color: green, fontSize: "1rem", lineHeight: 1, flexShrink: 0 }}
          >☰</button>

          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0, flex: 1 }}>
            <BrandLogo size={22} />
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: greenDark, flexShrink: 0, ...sansSerif }}>Folio</span>
            {sessionDocs.length > 0 && (
              <>
                <span style={{ width: 1, height: 14, background: borderCol, flexShrink: 0 }} />
                <span style={{ fontSize: "0.75rem", color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500, ...sansSerif }}>
                  {sessionDocs.length === 1 ? sessionDocs[0].filename : `${sessionDocs.length} documents`}
                </span>
              </>
            )}
            {isLoadingMessages && (
              <div style={{ fontSize: "0.72rem", color: "#888", display: "flex", alignItems: "center", gap: "0.35rem", ...sansSerif }}>
                <span className="mini-spinner" />
                Loading…
              </div>
            )}
          </div>
          {sessionDocs.length === 2 && (
            <Link
              href={`/compare?a=${sessionDocs[0].id}&b=${sessionDocs[1].id}`}
              style={{ fontSize: "0.72rem", color: green, textDecoration: "none", border: `1px solid rgba(26,107,58,0.3)`, borderRadius: 5, padding: "0.3rem 0.7rem", fontWeight: 600, ...sansSerif }}
            >
              Compare →
            </Link>
          )}
          <Link href="/library" style={{ fontSize: "0.72rem", color: "#555", textDecoration: "none", border: `1px solid rgba(0,0,0,0.1)`, borderRadius: 5, padding: "0.3rem 0.7rem", fontWeight: 500, transition: "background 0.15s", ...sansSerif }} onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            Library
          </Link>
        </div>

        <div ref={chatContainerRef} style={{
          flex: 1, minHeight: 0, overflowY: "auto", padding: "1.6rem 1.5rem", display: "flex", flexDirection: "column", gap: "1.2rem",
          position: "relative", zIndex: 1,
          opacity: isLoadingMessages ? 0.45 : 1, transition: "opacity 0.25s ease",
        }}>
          {/* Agentic mode banner — shown at top of chat when agent mode is on */}
          {agenticMode && !isLoadingMessages && (
            <div style={{
              display: "flex", alignItems: "center", gap: "0.55rem",
              padding: "0.55rem 0.85rem", background: "rgba(26,107,58,0.07)",
              border: "1px solid rgba(26,107,58,0.18)", borderRadius: 8,
              fontSize: "0.73rem", color: greenDark, fontWeight: 500, ...sansSerif,
              alignSelf: "center", maxWidth: 520, width: "100%"
            }}>
              <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: green, flexShrink: 0, animation: "agenticPulse 1.5s ease-in-out infinite" }} />
              <span><strong style={{ fontWeight: 700 }}>Agent mode active.</strong> The AI will autonomously search, extract sections, and list clauses before answering. Each step streams live.</span>
            </div>
          )}
          {messagesLoadError ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: "3rem", gap: "0.9rem" }}>
              <div style={{ fontSize: "0.8rem", color: "#c85050", textAlign: "center", maxWidth: 340, lineHeight: 1.75, ...sansSerif }}>
                {messagesLoadError}
              </div>
              <button
                onClick={retryLoadMessages}
                style={{ padding: "0.5rem 1.2rem", background: "transparent", border: `1px solid ${green}`, borderRadius: 6, color: green, cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, ...sansSerif }}
              >
                Retry
              </button>
            </div>
          ) : visibleMessages.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.2rem" }}>
              <HeroBrandEmblem size={52} />
              <div style={{ textAlign: "center" }}>
                <h2 style={{ fontSize: "clamp(1.1rem,2.5vw,1.6rem)", fontWeight: 700, color: "#1a2a1a", margin: "0 0 0.4rem", letterSpacing: "-0.01em", ...sansSerif }}>
                  Ask your documents anything
                </h2>
                <p style={{ fontSize: "0.82rem", color: "#777", textAlign: "center", maxWidth: 340, lineHeight: 1.75, margin: "0 auto", minHeight: "3.5em", ...sansSerif }}>
                  {typedHint}
                  {typedHint.length < EMPTY_STATE_TEXT.length && (
                    <span style={{ display: "inline-block", width: 5, height: 12, background: green, marginLeft: 2, verticalAlign: "text-bottom", animation: "cursorBlink 0.65s infinite" }} />
                  )}
                </p>
              </div>
              <div style={{ fontSize: "0.7rem", color: "#aaa", ...sansSerif }}>
                Every quote verified against the source
              </div>
            </div>
          ) : (
            visibleMessages.map((msg) => {
              const isArabic = /[\u0600-\u06FF]/.test(msg.content);
              return (
              <div key={msg.id} className="msg-row" style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", width: "100%" }}>
                {/* Bubble + action buttons stacked vertically */}
                <div style={{ display: "flex", flexDirection: "column", maxWidth: msg.role === "user" ? "78%" : "85%", alignItems: msg.role === "user" ? "flex-end" : "flex-start", width: "auto" }}>
                  <div 
                    dir={isArabic ? "rtl" : "ltr"}
                    style={{
                      width: "100%",
                      padding: msg.role === "user" ? "0.75rem 1rem" : "1rem 1.25rem",
                      borderRadius: msg.role === "user" ? "14px 14px 3px 14px" : "3px 14px 14px 14px",
                      border: msg.role === "user" ? "none" : `1px solid ${borderCol}`,
                      background: msg.role === "user" ? green : "#fff",
                      color: msg.role === "user" ? "#fff" : "#1c2b1c",
                      boxShadow: msg.role === "user" ? "0 1px 8px rgba(26,107,58,0.25)" : "0 1px 4px rgba(0,0,0,0.06)",
                      textAlign: isArabic ? "right" : "left",
                    }}
                  >
                  {msg.role === "ai" && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "0.62rem", fontWeight: 700, color: green, letterSpacing: "0.06em", textTransform: "uppercase", ...sansSerif }}>Assistant</span>
                      {msg.statusText?.includes("Agent") || msg.statusText?.includes("tool") || msg.statusText?.includes("search") || (agenticMode && msg.isStreaming) ? (
                        <span style={{ 
                          fontSize: "0.56rem", fontWeight: 700, color: "#fff",
                          background: green, borderRadius: 3, padding: "0.08rem 0.35rem",
                          letterSpacing: "0.04em", textTransform: "uppercase", ...sansSerif
                        }}>Agent</span>
                      ) : null}
                    </div>
                  )}
                  <div style={{ fontSize: "0.83rem", lineHeight: 1.75, minHeight: msg.isStreaming && msg.content === "" ? "2.5em" : undefined, display: msg.isStreaming && msg.content === "" ? "flex" : "block", alignItems: "center", ...sansSerif }}>
                    {msg.isStreaming && msg.content === "" ? (
                      msg.statusText ? (
                        <span key={msg.statusText} className="status-line-anim" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.78rem", color: green, fontWeight: 500, ...sansSerif }}>
                            <span style={{ display: "inline-flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                              {[0, 0.15, 0.3].map((d, i) => (
                                <span key={i} className="status-wave-dot" style={{ width: 4, height: 4, borderRadius: "50%", background: green, display: "inline-block", animationDelay: `${d}s` }} />
                              ))}
                            </span>
                            {msg.statusText}
                          </span>
                          <span className="status-progress-track">
                            <span className="status-progress-fill" />
                          </span>
                        </span>
                      ) : (
                        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.78rem", color: green, fontWeight: 500, minHeight: "1.4em", ...sansSerif }}>
                          <span style={{ display: "inline-flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                            {[0, 0.2, 0.4].map((d, i) => (
                              <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: green, display: "inline-block", animation: `bounce 1s ${d}s infinite ease-in-out` }} />
                            ))}
                          </span>
                          Preparing response…
                        </span>
                      )
                    ) : (
                      <>
                        {msg.role === "ai" ? (
                          renderAiContent(msg)
                        ) : (
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={getMarkdownComponents(true)}>
                            {msg.content}
                          </ReactMarkdown>
                        )}
                        {msg.isStreaming && msg.content !== "" && (
                          <span style={{ display: "inline-block", width: 6, height: 12, background: green, marginLeft: 2, verticalAlign: "text-bottom", animation: "cursorBlink 0.65s infinite" }} />
                        )}
                      </>
                    )}
                  </div>
                  </div>
                  {/* Message action buttons — copy, export, share, read aloud */}
                  {!msg.isStreaming && msg.content && (
                    <MessageActions id={msg.id} text={msg.content} isUser={msg.role === 'user'} />
                  )}
                </div>
              </div>
            );
            })
          )}
        </div>

        {/* INPUT AREA - DOCKED BOTTOM, zero bottom gap */}
        <div style={{ 
          borderTop: `1px solid rgba(0,0,0,0.06)`,
          padding: "0.6rem 1.5rem 0",
          background: "#edeae3", flexShrink: 0, position: "relative", zIndex: 1,
          display: "flex", flexDirection: "column", alignItems: "center"
        }}>
          <div style={{ width: "100%", maxWidth: "760px", display: "flex", flexDirection: "column" }}>
            
            {/* Upload Error Banner */}
            {uploadError && (
              <div style={{ padding: "0.55rem 0.9rem", background: "rgba(200,50,50,0.07)", border: "1px solid rgba(200,50,50,0.2)", borderRadius: 8, marginBottom: "0.5rem", fontSize: "0.75rem", color: "#b84040", ...sansSerif }}>
                {uploadError}
              </div>
            )}

            {/* File Pill */}
            {pendingFile && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.35rem 0.7rem", background: "#fff", border: `1px solid rgba(26,107,58,0.2)`, borderRadius: 20, marginBottom: "0.4rem", fontSize: "0.73rem", color: greenDark, fontWeight: 500, ...sansSerif, alignSelf: "flex-start" }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 8 L7 13 L14 3" stroke={green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {pendingFile.name}
                <button onClick={() => setPendingFile(null)} style={{ background: "none", border: "none", color: "#999", cursor: "pointer", fontSize: "0.8rem", padding: 0, lineHeight: 1, marginLeft: 4 }}>✕</button>
              </div>
            )}

            {/* Input Pill */}
            <div style={{ 
              display: "flex", gap: "0.4rem", alignItems: "flex-end", 
              background: "#fff", borderRadius: inputExpanded ? 16 : 24, padding: "0.4rem", 
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
              position: "relative"
            }}>
              
              {/* Expand/Collapse Button (Floats above the pill to avoid send button) */}
              {(inputExpanded || inputVal.length > 100 || inputVal.split('\n').length > 2) && (
                <button
                  onClick={() => setInputExpanded(!inputExpanded)}
                  title={inputExpanded ? "Collapse input" : "Expand input"}
                  style={{
                    position: "absolute", top: "-2.2rem", right: "1rem",
                    background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12,
                    padding: "0.3rem 0.6rem", cursor: "pointer", color: "#555",
                    display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.68rem", fontWeight: 500,
                    boxShadow: "0 2px 6px rgba(0,0,0,0.04)", transition: "all 0.15s ease", zIndex: 10, ...sansSerif
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#faf9f7"; e.currentTarget.style.color = "#111"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#555"; }}
                >
                  {inputExpanded ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l8-8M4 4v8h8"/></svg>
                      Collapse
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4L4 12M12 12V4H4"/></svg>
                      Expand
                    </>
                  )}
                </button>
              )}

              <button
                onClick={() => fileInputRef.current?.click()}
                title="Attach PDF or DOCX"
                style={{
                  width: 36, height: 36, background: "transparent", border: "none",
                  borderRadius: "50%", cursor: "pointer", color: "#777",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, transition: "background 0.15s ease",
                  marginBottom: 2, marginLeft: 2
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.04)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
              <input type="file" accept=".pdf,.docx" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} />

              <textarea
                ref={inputRef}
                value={inputVal}
                onChange={(e) => {
                  setInputVal(e.target.value);
                  // Auto-expand height dynamically up to 120px
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => { 
                  if (e.key === "Enter" && !e.shiftKey) { 
                    e.preventDefault(); 
                    if (e.currentTarget) e.currentTarget.style.height = "auto";
                    handleSend(); 
                  } 
                }}
                placeholder="Ask anything about your document…"
                rows={1}
                style={{
                  flex: 1, background: "transparent", border: "none",
                  padding: "0.55rem 0.5rem", resize: "none", outline: "none", color: "#1c2b1c",
                  fontSize: "0.85rem", lineHeight: 1.5, 
                  minHeight: 36, 
                  height: inputExpanded ? "55vh" : undefined,
                  maxHeight: inputExpanded ? "55vh" : 120,
                  transition: "max-height 0.2s ease",
                  ...sansSerif,
                }}
              />
              
              {/* Voice input button */}
              <button
                type="button"
                onClick={toggleVoiceInput}
                title={isListening ? "Listening... click to stop" : "Voice input (speak question)"}
                style={{
                  width: 36, height: 36,
                  background: isListening ? "rgba(220, 38, 38, 0.12)" : "transparent",
                  color: isListening ? "#dc2626" : "#666",
                  border: isListening ? "1px solid rgba(220, 38, 38, 0.4)" : "none",
                  borderRadius: "50%", cursor: "pointer",
                  flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.18s ease", marginBottom: 2, marginRight: 4,
                  animation: isListening ? "agenticPulse 1.2s infinite" : "none"
                }}
                onMouseEnter={e => { if (!isListening) e.currentTarget.style.background = "rgba(0,0,0,0.05)"; }}
                onMouseLeave={e => { if (!isListening) e.currentTarget.style.background = "transparent"; }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </button>

              {isAnswering ? (
                <button
                  onClick={handleStop}
                  style={{
                    width: 36, height: 36, background: "#333", color: "#fff",
                    border: "none", borderRadius: "50%", cursor: "pointer",
                    flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.15)", marginBottom: 2, marginRight: 2
                  }}
                  title="Stop generating"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor"><rect width="12" height="12" rx="2"/></svg>
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={(!inputVal.trim() && !pendingFile) || isUploading}
                  style={{
                    width: 36, height: 36,
                    background: ((!inputVal.trim() && !pendingFile) || isUploading) ? "rgba(0,0,0,0.04)" : green,
                    color: ((!inputVal.trim() && !pendingFile) || isUploading) ? "#bbb" : "#fff",
                    border: "none", borderRadius: "50%",
                    cursor: ((!inputVal.trim() && !pendingFile) || isUploading) ? "not-allowed" : "pointer",
                    transition: "all 0.2s ease", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: ((!inputVal.trim() && !pendingFile) || isUploading) ? "none" : "0 2px 8px rgba(26,107,58,0.3)",
                    marginBottom: 2, marginRight: 2
                  }}
                  title={isUploading ? "Uploading…" : "Send"}
                >
                  {isUploading ? (
                    <span className="mini-spinner" style={{ borderTopColor: "#aaa", borderColor: "rgba(0,0,0,0.1)" }} />
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "translateX(-1px) translateY(1px)" }}>
                      <line x1="22" y1="2" x2="11" y2="13"/>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                  )}
                </button>
              )}
            </div>

            {/* Footer row — tightly packed, no bottom margin */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.3rem 0.4rem 0.4rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", userSelect: "none" }}>
                <div style={{ 
                  width: 30, height: 16, borderRadius: 10, background: agenticMode ? green : "rgba(0,0,0,0.15)", 
                  position: "relative", transition: "background 0.25s ease", flexShrink: 0,
                  boxShadow: agenticMode ? `0 0 0 3px rgba(26,107,58,0.15)` : "none"
                }}>
                  <div style={{ 
                    width: 12, height: 12, borderRadius: "50%", background: "#fff", 
                    position: "absolute", top: 2, left: agenticMode ? 16 : 2, 
                    transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
                  }} />
                </div>
                {/* Agentic badge with animated pulse when ON */}
                <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", transition: "all 0.25s" }}>
                  {agenticMode && (
                    <span style={{ 
                      display: "inline-block", width: 6, height: 6, borderRadius: "50%", 
                      background: green, flexShrink: 0,
                      animation: "agenticPulse 1.5s ease-in-out infinite"
                    }} />
                  )}
                  <span style={{ fontSize: "0.7rem", color: agenticMode ? green : "#888", fontWeight: 700, letterSpacing: "0.01em", transition: "color 0.25s", ...sansSerif }}>
                    {agenticMode ? "Agent mode" : "Standard mode"}
                  </span>
                </span>
                <input type="checkbox" checked={agenticMode} onChange={(e) => setAgenticMode(e.target.checked)} style={{ display: "none" }} />
              </label>

              {/* Anonymise PII Toggle */}
              <label 
                style={{ display: "flex", alignItems: "center", gap: "0.45rem", cursor: "pointer", userSelect: "none" }} 
                title="Consistently masks names, emails, phones, and company entities before AI processing with reversible mapping"
              >
                <div style={{
                  width: 28, height: 16, borderRadius: 10,
                  background: anonymizePii ? "#1e40af" : "rgba(0,0,0,0.12)",
                  position: "relative", transition: "background 0.25s ease",
                }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: "50%", background: "#fff",
                    position: "absolute", top: 2, left: anonymizePii ? 14 : 2,
                    transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
                  }} />
                </div>
                <span style={{ fontSize: "0.7rem", color: anonymizePii ? "#1e40af" : "#888", fontWeight: 700, letterSpacing: "0.01em", transition: "color 0.25s", ...sansSerif }}>
                  {anonymizePii ? "PII Masked" : "Anonymise"}
                </span>
                <input type="checkbox" checked={anonymizePii} onChange={(e) => setAnonymizePii(e.target.checked)} style={{ display: "none" }} />
              </label>

              <div style={{ fontSize: "0.62rem", color: "#bbb", ...sansSerif }}>AI may make errors · verify sources</div>
            </div>
          </div>
        </div>
      </main>

      {sessionToDelete && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          backdropFilter: "blur(6px)"
        }}>
          <div style={{
            background: "#fff",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            padding: "1.8rem",
            maxWidth: 380,
            width: "90%",
            boxShadow: "0 20px 60px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.1)",
          }}>
            {/* Warning icon */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(180,40,40,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b42828" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div style={{ fontWeight: 700, fontSize: "0.98rem", color: "#111", letterSpacing: "-0.01em", ...sansSerif }}>Delete chat session?</div>
            </div>
            <div style={{ fontSize: "0.82rem", lineHeight: 1.7, color: "#444", marginBottom: "1.6rem", paddingLeft: "3rem", ...sansSerif }}>
              This chat and all its message history will be permanently deleted. This cannot be undone.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
              <button
                onClick={() => setSessionToDelete(null)}
                style={{
                  padding: "0.55rem 1.1rem",
                  background: "transparent",
                  border: "1px solid rgba(0,0,0,0.15)",
                  borderRadius: 8,
                  color: "#333",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  ...sansSerif
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.04)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
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
                  padding: "0.55rem 1.1rem",
                  background: "#c0392b",
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  ...sansSerif,
                  boxShadow: "0 2px 8px rgba(180,40,40,0.25)"
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#a93226"}
                onMouseLeave={e => e.currentTarget.style.background = "#c0392b"}
              >
                Delete session
              </button>
            </div>
          </div>
        </div>
      )}

      {viewerTarget && (
        <DocumentViewer
          target={viewerTarget}
          apiBase={API}
          authHeaders={authHeaders}
          onClose={() => setViewerTarget(null)}
        />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%, 100% { transform: translateY(0) scale(1); opacity: 0.5; } 50% { transform: translateY(-4px) scale(1.1); opacity: 1; } }
        @keyframes cursorBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes statusWave { 0%, 60%, 100% { opacity: 0.3; transform: translateY(0) scale(0.8); } 30% { opacity: 1; transform: translateY(-3px) scale(1); } }
        .status-wave-dot { animation: statusWave 1.1s ease-in-out infinite; }
        @keyframes statusLineIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .status-line-anim { animation: statusLineIn 0.28s cubic-bezier(0.2, 0.8, 0.2, 1); }
        @keyframes statusProgressSweep { 0% { left: -45%; width: 40%; } 50% { left: 60%; width: 20%; } 100% { left: 110%; width: 40%; } }
        @keyframes agenticPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }
        .status-progress-track {
          position: relative;
          width: 120px;
          max-width: 100%;
          height: 2px;
          border-radius: 2px;
          background: rgba(26,107,58,0.15);
          overflow: hidden;
          display: block;
          flex-shrink: 0;
        }
        .status-progress-fill {
          position: absolute;
          top: 0;
          height: 100%;
          border-radius: 2px;
          background: ${green};
          animation: statusProgressSweep 1.6s cubic-bezier(0.4,0,0.6,1) infinite;
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }

        .bg-blob {
          position: absolute; border-radius: 50%; filter: blur(80px);
          opacity: 0.07; pointer-events: none; z-index: 0; background: ${green};
        }
        .blob-1 { width: 300px; height: 300px; top: -100px; left: -80px; animation: drift1 22s ease-in-out infinite; }
        .blob-2 { width: 240px; height: 240px; bottom: -80px; right: -60px; animation: drift2 26s ease-in-out infinite; }
        @keyframes drift1 { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(35px, 28px); } }
        @keyframes drift2 { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(-28px, -22px); } }

        @keyframes msgEnter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .msg-row { animation: msgEnter 0.22s ease-out; }

        .mini-spinner {
          width: 10px; height: 10px; border-radius: 50%;
          border: 1.5px solid rgba(26,107,58,0.2); border-top-color: ${green};
          animation: spin 0.75s linear infinite; display: inline-block; flex-shrink: 0;
        }

        /* Sidebar Scrolling Container */
        .sidebar-scroll-container {
          overflow-y: auto !important;
          overflow-x: hidden !important;
          min-height: 0 !important;
          scrollbar-width: thin;
          scrollbar-color: rgba(26, 107, 58, 0.28) transparent;
        }
        .sidebar-scroll-container::-webkit-scrollbar {
          width: 5px;
        }
        .sidebar-scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .sidebar-scroll-container::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.12);
          border-radius: 6px;
        }
        .sidebar-scroll-container::-webkit-scrollbar-thumb:hover {
          background: rgba(26, 107, 58, 0.4);
        }

        /* Sidebar Chat Items - Clean Hover Box */
        .sidebar-chat-item {
          padding: 0.55rem 0.75rem;
          border-radius: 7px;
          cursor: pointer;
          background: transparent;
          border: 1px solid transparent;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.78rem;
          color: #2e3d2e;
          font-weight: 500;
          transition: all 0.16s cubic-bezier(0.2, 0, 0, 1);
          position: relative;
          user-select: none;
        }
        .sidebar-chat-item:hover {
          background: #dfdacd !important;
          border-color: rgba(0, 0, 0, 0.14) !important;
          color: #111 !important;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
          transform: translateY(-1px);
        }
        .sidebar-chat-item.active {
          background: rgba(26, 107, 58, 0.12) !important;
          border-color: rgba(26, 107, 58, 0.28) !important;
          color: #144f2c !important;
          font-weight: 600;
          box-shadow: 0 1px 4px rgba(26, 107, 58, 0.08);
        }
        .sidebar-chat-item.active:hover {
          background: rgba(26, 107, 58, 0.18) !important;
          border-color: rgba(26, 107, 58, 0.36) !important;
        }

        /* Sidebar Chat Delete Button */
        .sidebar-chat-delete {
          background: none;
          border: none;
          color: #999;
          cursor: pointer;
          font-size: 0.72rem;
          padding: 2px 5px;
          border-radius: 4px;
          flex-shrink: 0;
          margin-left: 0.4rem;
          opacity: 0;
          transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
        }
        .sidebar-chat-item:hover .sidebar-chat-delete,
        .sidebar-chat-item.active .sidebar-chat-delete {
          opacity: 0.7;
        }
        .sidebar-chat-delete:hover {
          opacity: 1 !important;
          background: rgba(200, 50, 50, 0.12) !important;
          color: #c84040 !important;
        }
        
        /* Show message action buttons on row hover */
        .msg-row:hover .msg-actions {
          opacity: 1 !important;
        }
        .msg-row:focus-within .msg-actions {
          opacity: 1 !important;
        }
        /* Hover colour for action buttons */
        .msg-actions button:hover {
          background: rgba(0,0,0,0.06) !important;
          color: #333 !important;
        }

        @media (max-width: 900px) {
          .app-sidebar {
            position: fixed !important;
            top: 0; left: 0;
            z-index: 50;
            transform: translateX(-100%);
            transition: transform 0.28s cubic-bezier(0.4,0,0.2,1);
            box-shadow: 4px 0 32px rgba(0,0,0,0.15);
          }
          .app-sidebar.sidebar-open { transform: translateX(0); }
          .sidebar-overlay { display: block !important; }
          .hamburger-btn { display: flex !important; align-items: center; justify-content: center; }
          .sidebar-close-btn { display: flex !important; align-items: center; justify-content: center; }
        }

        @media (max-width: 600px) {
          .app-sidebar { width: 88vw !important; max-width: 320px; }
        }
      `}</style>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", fontFamily: "'Courier New', monospace" }}>Loading…</div>}>
      <UploadPageInner />
    </Suspense>
  );
}