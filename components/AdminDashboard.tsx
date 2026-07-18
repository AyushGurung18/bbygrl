"use client";

import React, { useEffect, useState, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

type Trace = {
  id: string;
  name: string;
  status: "success" | "error";
  latency_ms: number;
  tokens: number;
  start_time: string;
};

type PipelineNode = {
  name: string;
  run_type: string;
  status: "success" | "error";
  latency_ms: number;
};

type Metrics = {
  total_runs: number;
  success_rate: number;
  avg_latency_ms: number;
  total_tokens: number;
};

const NODE_COLORS: Record<string, string> = {
  input_guardrail: "#38bdf8",
  hyde_generator: "#a78bfa",
  retrieve: "#22d3ee",
  rerank_documents: "#f59e0b",
  grade_documents: "#fb923c",
  web_search: "#f472b6",
  rewrite_query: "#facc15",
  generate: "#22c55e",
  grade_generation: "#2dd4bf",
};

const nodeColor = (name: string) => NODE_COLORS[name] || "#94a3b8";

function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

function StatCard({ label, value, unit, decimals = 0, accent }: { label: string; value: number; unit: string; decimals?: number; accent: string }) {
  const animated = useCountUp(value);
  return (
    <div className="stagger-el group relative overflow-hidden bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 hover:bg-white/[0.05] hover:border-white/[0.15] transition-all duration-300">
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: `radial-gradient(circle at 20% 0%, ${accent}22, transparent 60%)` }}
      />
      <div className="absolute top-0 left-0 h-[2px] w-full" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <p className="text-white/40 text-xs tracking-wider uppercase mb-2">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-light tracking-tight text-white/90 tabular-nums">
          {decimals > 0 ? animated.toFixed(decimals) : Math.round(animated).toLocaleString()}
        </span>
        <span className="text-white/30 text-sm">{unit}</span>
      </div>
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) {
    return <div className="h-16 flex items-center text-white/20 text-xs">Not enough data yet for a trend line</div>;
  }
  const w = 100, h = 100;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p - min) / range) * h;
    return `${x},${y}`;
  });
  const path = `M${coords.join(" L")}`;
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-16">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkFill)" stroke="none" />
      <path d={path} fill="none" stroke="#22c55e" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function PipelineWaterfall({ nodes }: { nodes: PipelineNode[] }) {
  if (nodes.length === 0) {
    return <div className="py-8 text-center text-white/30 text-sm">No pipeline runs traced yet. Ask a question to populate this.</div>;
  }
  const maxLatency = Math.max(...nodes.map(n => n.latency_ms), 1);
  const total = nodes.reduce((s, n) => s + n.latency_ms, 0);
  return (
    <div className="space-y-3">
      {nodes.map((n, i) => {
        const pct = Math.max(2, (n.latency_ms / maxLatency) * 100);
        const color = nodeColor(n.name);
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-36 shrink-0 text-xs text-white/60 font-medium truncate">{n.name}</div>
            <div className="flex-1 h-6 bg-white/[0.03] rounded-md overflow-hidden relative">
              <div
                className="h-full rounded-md flex items-center justify-end px-2 transition-all duration-700 ease-out"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${color}55, ${color})`,
                  boxShadow: `0 0 12px ${color}55`,
                }}
              >
                <span className="text-[10px] text-white/90 font-semibold tabular-nums">{n.latency_ms.toLocaleString()}ms</span>
              </div>
            </div>
            {n.status === "error" && <span className="text-red-400 text-xs">✕</span>}
          </div>
        );
      })}
      <div className="pt-2 mt-2 border-t border-white/[0.05] text-xs text-white/40 flex justify-between">
        <span>{nodes.length} traced nodes</span>
        <span>{total.toLocaleString()}ms summed node time</span>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);
  const [pipelineBreakdown, setPipelineBreakdown] = useState<PipelineNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const fetchMetrics = async () => {
    try {
      const res = await fetch(`${API}/api/admin/metrics`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Failed to fetch metrics (status ${res.status})`);
      }
      const data = await res.json();
      setMetrics(data.metrics);
      setTraces(data.recent_activity ?? []);
      setLatencyHistory(data.latency_history ?? []);
      setPipelineBreakdown(data.pipeline_breakdown ?? []);
      setError(null);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message || "Error loading metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  useGSAP(() => {
    if (!loading && containerRef.current) {
      gsap.fromTo(
        ".stagger-el",
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6, stagger: 0.08, ease: "power3.out" }
      );
    }
  }, [loading]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0a0a0a] text-[#c8e8d8] font-mono">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-t-2 border-[#c8e8d8] rounded-full animate-spin"></div>
          <p className="text-sm tracking-widest uppercase">Connecting to LangSmith...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="min-h-screen w-full bg-[#0a0a0a] text-white p-8 md:p-12 font-mono selection:bg-[#1a6b3a] selection:text-white"
    >
      <div className="max-w-6xl mx-auto">
        <header className="mb-12 stagger-el">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-3 h-3 rounded-full bg-[#1a6b3a] animate-pulse shadow-[0_0_10px_#1a6b3a]"></div>
                <h1 className="text-3xl font-bold tracking-tight text-white/90">LangSmith Telemetry</h1>
              </div>
              <p className="text-white/40 text-sm tracking-widest uppercase">Live LLM Observability & Evaluation</p>
            </div>
            {lastUpdated && !error && (
              <div className="text-[11px] text-white/30 uppercase tracking-widest">
                Synced {lastUpdated.toLocaleTimeString()}
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30 text-red-400 rounded-md text-sm">
              {error}
              {error.toLowerCase().includes("not configured") && (
                <div className="mt-1 text-red-400/70 text-xs">
                  Set LANGSMITH_API_KEY (and LANGSMITH_TRACING=true) in this deployment's environment — a local .env change alone won't reach a deployed backend.
                </div>
              )}
            </div>
          )}
        </header>

        {/* METRIC CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard label="Total Traces" value={metrics?.total_runs || 0} unit="runs" accent="#38bdf8" />
          <StatCard label="Success Rate" value={metrics?.success_rate || 0} unit="%" decimals={1} accent="#22c55e" />
          <StatCard label="Avg Latency" value={metrics?.avg_latency_ms || 0} unit="ms" accent="#f59e0b" />
          <StatCard label="Total Tokens" value={metrics?.total_tokens || 0} unit="tokens" accent="#a78bfa" />
        </div>

        {/* LATENCY TREND */}
        <div className="stagger-el bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider">Latency Trend</h2>
            <span className="text-[11px] text-white/30">last {latencyHistory.length} traces, oldest → newest</span>
          </div>
          <Sparkline points={latencyHistory} />
        </div>

        {/* PIPELINE WATERFALL */}
        <div className="stagger-el bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider">Latest Pipeline Trace — Node Breakdown</h2>
            <span className="text-[11px] text-white/30">input_guardrail → hyde → retrieve → rerank → grade → generate → grade</span>
          </div>
          <PipelineWaterfall nodes={pipelineBreakdown} />
        </div>

        {/* LIVE ACTIVITY FEED */}
        <div className="stagger-el">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-white/70">Live Activity Feed</h2>
            <div className="text-xs text-white/30 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500/50 animate-pulse"></span> Auto-syncing every 5s
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden backdrop-blur-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-white/[0.05] text-white/30 text-xs uppercase tracking-wider">
                    <th className="py-4 px-6 font-medium">Status</th>
                    <th className="py-4 px-6 font-medium">Trace Name</th>
                    <th className="py-4 px-6 font-medium">Latency</th>
                    <th className="py-4 px-6 font-medium">Tokens</th>
                    <th className="py-4 px-6 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {traces.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-white/30">No recent traces found. Run a query!</td>
                    </tr>
                  ) : (
                    traces.map((trace, i) => (
                      <tr
                        key={trace.id}
                        className="hover:bg-white/[0.02] transition-colors"
                        style={{ animation: `fadeIn 0.5s ease-out ${i * 0.05}s both` }}
                      >
                        <td className="py-4 px-6">
                          <div className={`inline-flex items-center justify-center w-6 h-6 rounded-full border ${trace.status === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                            {trace.status === 'success' ? '✓' : '✕'}
                          </div>
                        </td>
                        <td className="py-4 px-6 font-medium text-white/80">
                          <span className="inline-flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: nodeColor(trace.name) }} />
                            {trace.name}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-white/60">
                          <span className={trace.latency_ms > 5000 ? 'text-amber-400/80' : ''}>
                            {trace.latency_ms.toLocaleString()}ms
                          </span>
                        </td>
                        <td className="py-4 px-6 text-white/60">{trace.tokens.toLocaleString()}</td>
                        <td className="py-4 px-6 text-white/40">{new Date(trace.start_time).toLocaleTimeString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
