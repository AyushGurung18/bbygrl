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
  occurrences: number;
  char_start: number | null;
  char_end: number | null;
  case_mismatch: boolean;
};

export type MessageSegment =
  | { type: "text"; content: string }
  | { type: "quote"; content: string; meta: QuoteMeta; index: number };

const EMPTY_META: QuoteMeta = {
  verified: false, document_id: "", filename: "", page: null,
  occurrences: 0, char_start: null, char_end: null, case_mismatch: false,
};

export function parseQuoteSegments(content: string, quoteMeta: QuoteMeta[]): MessageSegment[] {
  const parts = content.split(QUOTE_MARK);
  const segments: MessageSegment[] = [];
  let quoteIndex = 0;
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (parts[i]) segments.push({ type: "text", content: parts[i] });
    } else {
      const meta = quoteMeta[quoteIndex] ?? EMPTY_META;
      segments.push({ type: "quote", content: parts[i], meta, index: quoteIndex });
      quoteIndex += 1;
    }
  }
  return segments;
}
