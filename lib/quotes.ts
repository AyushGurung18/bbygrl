/**
 * Parses the backend's verified-quote wire protocol (app/services/quote_annotator.py):
 *
 *   - Answer text wraps every quote span in QUOTE_MARK (\x1d) pairs.
 *   - A trailing status-channel marker "__QUOTES__:<json array>" (sent over
 *     the existing \x1e status-line channel — see app/upload/page.tsx's
 *     stream reader) carries one metadata object per QUOTE_MARK pair, in
 *     the same order they appear in the text.
 *
 * Rendering only resolves verified/unverified styling once the full answer
 * (and its metadata) has arrived — while a message is still streaming, a
 * mid-quote chunk boundary can leave an odd, temporarily-unmatched QUOTE_MARK
 * in the buffer, and the metadata array isn't sent until the end anyway.
 */

export const QUOTE_MARK = "\x1d";

export type QuoteMeta = {
  verified: boolean;
  document_id: string;
  filename: string;
  page: number | null;
  page_end: number | null;  // set only when the quote spans onto a later page
  occurrences: number;
  char_start: number | null;
  char_end: number | null;
  case_mismatch: boolean;
};

export type MessageSegment =
  | { type: "text"; content: string }
  | { type: "quote"; content: string; meta: QuoteMeta; index: number };

const EMPTY_META: QuoteMeta = {
  verified: false, document_id: "", filename: "", page: null, page_end: null,
  occurrences: 0, char_start: null, char_end: null, case_mismatch: false,
};

/**
 * Cleans up LLM repetition artifacts where a sentence is written in plain text
 * (e.g. in quotation marks or on a bullet line) and then immediately repeated
 * in quote sentinels.
 */
function cleanPrecedingDuplicate(text: string, quote: string): string {
  if (!text || !quote) return text;
  const qTrim = quote.trim();
  if (qTrim.length < 3) return text;

  const escapeRegex = (s: string) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const qEscaped = escapeRegex(qTrim);

  // 1. Quoted duplicate right before quote: e.g. `marketed as "India's first..." `
  const quotedPattern = new RegExp(`[("']\\s*${qEscaped}[.,;!?]?\\s*['")]\\s*$`, "i");
  if (quotedPattern.test(text.trimEnd())) {
    return text.trimEnd().replace(quotedPattern, "").trimEnd() + " ";
  }

  // 2. Bullet point line duplicate: e.g. `"Superior power of 73.5 kW..."\n\n• `
  const bulletPattern = new RegExp(`[("']?\\s*${qEscaped}[.,;!?]?\\s*['")]?\\s*\\n+\\s*([•\\-*]\\s*)?$`, "i");
  const bulletMatch = text.match(bulletPattern);
  if (bulletMatch) {
    const bulletPrefix = bulletMatch[1] || "";
    return text.slice(0, bulletMatch.index).trimEnd() + (bulletPrefix ? "\n" + bulletPrefix : " ");
  }

  // 3. Parenthesized duplicate right before quote: e.g. `... ( `
  const parenPattern = new RegExp(`\\(\\s*${qEscaped}[.,;!?]?\\s*\\)?\\s*$`, "i");
  if (parenPattern.test(text.trimEnd())) {
    return text.trimEnd().replace(parenPattern, "").trimEnd() + " ";
  }

  // 4. Exact raw duplicate at the end of the text
  const rawPattern = new RegExp(`${qEscaped}[.,;!?]?\\s*$`, "i");
  if (rawPattern.test(text.trimEnd())) {
    return text.trimEnd().replace(rawPattern, "").trimEnd() + " ";
  }

  return text;
}

export function parseQuoteSegments(content: string, quoteMeta: QuoteMeta[]): MessageSegment[] {
  const parts = content.split(QUOTE_MARK);
  const segments: MessageSegment[] = [];
  let quoteIndex = 0;
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      let textPart = parts[i];
      // Clean duplicate preceding text if next segment is a quote
      if (i + 1 < parts.length && parts[i + 1]) {
        textPart = cleanPrecedingDuplicate(textPart, parts[i + 1]);
      }
      if (textPart) segments.push({ type: "text", content: textPart });
    } else {
      const meta = quoteMeta[quoteIndex] ?? EMPTY_META;
      segments.push({ type: "quote", content: parts[i], meta, index: quoteIndex });
      quoteIndex += 1;
    }
  }
  return segments;
}
