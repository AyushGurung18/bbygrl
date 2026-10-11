"use client";

import React from "react";

/**
 * Folio Brand Emblem & Modern Icons
 * Designed to replace generic dog-eared document icons with a distinctive,
 * architectural, intelligence-driven visual identity.
 */

interface BrandLogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function BrandLogo({ size = 20, className = "", style }: BrandLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
    >
      <defs>
        <linearGradient id="folio-grad-primary" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2ec466" />
          <stop offset="50%" stopColor="#1a6b3a" />
          <stop offset="100%" stopColor="#0d3c1e" />
        </linearGradient>
        <linearGradient id="folio-grad-facet" x1="10" y1="6" x2="26" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      {/* Outer Folio Shield / Geometric Silhouette */}
      <rect x="3" y="3" width="26" height="26" rx="7" fill="url(#folio-grad-primary)" />

      {/* Layer 1: Left architectural spine / primary pillar */}
      <path
        d="M9 8.5C9 7.67 9.67 7 10.5 7H15.5C16.33 7 17 7.67 17 8.5V23.5C17 24.33 16.33 25 15.5 25H10.5C9.67 25 9 24.33 9 23.5V8.5Z"
        fill="url(#folio-grad-facet)"
      />

      {/* Layer 2: Precision interlocking crossbar forming modern 'F' + overlapping page folio */}
      <path
        d="M14 7H22C22.83 7 23.5 7.67 23.5 8.5V12C23.5 12.83 22.83 13.5 22 13.5H15.5"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 15.5H20C20.83 15.5 21.5 16.17 21.5 17V17C21.5 17.83 20.83 18.5 20 18.5H15.5"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.85"
      />

      {/* Micro intelligence beacon / diamond focal spark */}
      <circle cx="21.5" cy="23" r="1.75" fill="#52f28b" />
    </svg>
  );
}

/**
 * Sleek AI Intelligence spark avatar icon
 */
export function AiSparkIcon({ size = 16, color = "#ffffff" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    >
      <path
        d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z"
        fill={color}
        fillOpacity="0.9"
      />
      <circle cx="12" cy="12" r="2.2" fill="#144f2c" />
    </svg>
  );
}

/**
 * Refined Hero Emblem for Empty State
 */
export function HeroBrandEmblem({ size = 72 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Outer ambient glow ring */}
      <div
        style={{
          position: "absolute",
          inset: -6,
          borderRadius: 22,
          background: "radial-gradient(circle, rgba(46,196,102,0.25) 0%, rgba(26,107,58,0.05) 70%, transparent 100%)",
          filter: "blur(4px)",
          pointerEvents: "none",
        }}
      />
      {/* Concentric subtle orbit ring */}
      <div
        style={{
          position: "absolute",
          inset: -2,
          borderRadius: 19,
          border: "1px dashed rgba(26,107,58,0.3)",
          pointerEvents: "none",
        }}
      />
      {/* Core Mark */}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 16,
          background: "linear-gradient(135deg, #1e7a42 0%, #144f2c 60%, #0d381c 100%)",
          boxShadow: "0 8px 24px rgba(26,107,58,0.22), 0 2px 6px rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid rgba(255,255,255,0.18)",
        }}
      >
        <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 32 32" fill="none">
          {/* Layered Architectural Foliage / Document Folio */}
          <path
            d="M8 8C8 6.34 9.34 5 11 5H21C22.66 5 24 6.34 24 8V24C24 25.66 22.66 27 21 27H11C9.34 27 8 25.66 8 24V8Z"
            fill="rgba(255,255,255,0.12)"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="1.2"
          />
          {/* Central Stylized F / Prism Arcs */}
          <path
            d="M12 9.5H20C20.83 9.5 21.5 10.17 21.5 11V11C21.5 11.83 20.83 12.5 20 12.5H12"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M12 15H18C18.83 15 19.5 15.67 19.5 16.5V16.5C19.5 17.33 18.83 18 18 18H12"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeOpacity="0.8"
          />
          <path
            d="M12 9.5V22.5"
            stroke="#52f28b"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="19" cy="22" r="2" fill="#52f28b" />
        </svg>
      </div>
    </div>
  );
}

/**
 * Chat conversation thread icon for sidebar recent items
 */
export function ChatThreadIcon({ active = false }: { active?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, opacity: active ? 0.95 : 0.6 }}
    >
      <path
        d="M2.5 4C2.5 2.89543 3.39543 2 4.5 2H11.5C12.6046 2 13.5 2.89543 13.5 4V9C13.5 10.1046 12.6046 11 11.5 11H6.5L3.5 13.5V11C2.94772 11 2.5 10.5523 2.5 10V4Z"
        fill={active ? "rgba(26,107,58,0.18)" : "rgba(0,0,0,0.06)"}
        stroke={active ? "#1a6b3a" : "currentColor"}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="5.5" cy="6.5" r="0.8" fill={active ? "#1a6b3a" : "currentColor"} />
      <circle cx="8" cy="6.5" r="0.8" fill={active ? "#1a6b3a" : "currentColor"} />
      <circle cx="10.5" cy="6.5" r="0.8" fill={active ? "#1a6b3a" : "currentColor"} />
    </svg>
  );
}
