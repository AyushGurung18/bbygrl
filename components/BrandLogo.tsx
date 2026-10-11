"use client";

import React from "react";

/**
 * Folio Minimalist Brand & Monogram Elements
 * Clean, restrained, editorial identity — no AI-generated gradients or clipart.
 */

interface BrandLogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function BrandLogo({ size = 26, className = "", style }: BrandLogoProps) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(4, Math.round(size * 0.2)),
        background: "#144f2c",
        color: "#ffffff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        fontWeight: 700,
        fontSize: Math.round(size * 0.54),
        lineHeight: 1,
        letterSpacing: "-0.03em",
        flexShrink: 0,
        userSelect: "none",
        ...style,
      }}
    >
      F
    </div>
  );
}

/**
 * Clean AI Message Monogram Avatar
 */
export function AiAvatarIcon({ size = 26 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(4, Math.round(size * 0.2)),
        background: "#1c2e1f",
        color: "#e8f5ec",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        fontWeight: 700,
        fontSize: Math.round(size * 0.52),
        lineHeight: 1,
        flexShrink: 0,
        userSelect: "none",
        border: "1px solid rgba(26,107,58,0.25)",
      }}
    >
      F
    </div>
  );
}

/**
 * Editorial Hero Mark for Empty State
 */
export function HeroBrandEmblem({ size = 56 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        background: "#144f2c",
        color: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        fontWeight: 800,
        fontSize: Math.round(size * 0.52),
        lineHeight: 1,
        letterSpacing: "-0.04em",
        boxShadow: "0 4px 16px rgba(20,79,44,0.18)",
        userSelect: "none",
      }}
    >
      F
    </div>
  );
}
