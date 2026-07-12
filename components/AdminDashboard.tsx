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

type Metrics = {
  total_runs: number;
  success_rate: number;
  avg_latency_ms: number;
  total_tokens: number;
};

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const fetchMetrics = async () => {
    try {
      const res = await fetch(`${API}/api/admin/metrics`);
      if (!res.ok) {
        throw new Error("Failed to fetch metrics");
      }
      const data = await res.json();
      setMetrics(data.metrics);
      setTraces(data.recent_activity);
      setError(null);
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
        { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power3.out" }
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
          <div className="flex items-center gap-3 mb-2">
            <div className="w-3 h-3 rounded-full bg-[#1a6b3a] animate-pulse shadow-[0_0_10px_#1a6b3a]"></div>
            <h1 className="text-3xl font-bold tracking-tight text-white/90">LangSmith Telemetry</h1>
          </div>
          <p className="text-white/40 text-sm tracking-widest uppercase">Live LLM Observability & Evaluation</p>
          
          {error && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30 text-red-400 rounded-md text-sm">
              {error}
            </div>
          )}
        </header>

        {/* METRIC CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {[
            { label: "Total Traces", value: metrics?.total_runs || 0, unit: "runs" },
            { label: "Success Rate", value: metrics?.success_rate || 0, unit: "%" },
            { label: "Avg Latency", value: metrics?.avg_latency_ms || 0, unit: "ms" },
            { label: "Total Tokens", value: (metrics?.total_tokens || 0).toLocaleString(), unit: "tokens" },
          ].map((stat, i) => (
            <div 
              key={i} 
              className="stagger-el group relative overflow-hidden bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 hover:bg-white/[0.05] hover:border-white/[0.15] transition-all duration-300"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#1a6b3a]/0 via-transparent to-[#1a6b3a]/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <p className="text-white/40 text-xs tracking-wider uppercase mb-2">{stat.label}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-light tracking-tight text-white/90">{stat.value}</span>
                <span className="text-white/30 text-sm">{stat.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* LIVE ACTIVITY FEED */}
        <div className="stagger-el">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-white/70">Live Activity Feed</h2>
            <div className="text-xs text-white/30 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500/50"></span> Auto-syncing
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
                        <td className="py-4 px-6 font-medium text-white/80">{trace.name}</td>
                        <td className="py-4 px-6 text-white/60">
                          <span className={trace.latency_ms > 5000 ? 'text-amber-400/80' : ''}>
                            {trace.latency_ms}ms
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
