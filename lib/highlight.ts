/**
 * Whitespace-tolerant find-and-highlight across rendered DOM text nodes.
 *
 * Shared by the PDF viewer (react-pdf's text layer renders real, positioned
 * <span> text nodes) and the DOCX viewer (mammoth's HTML output) — citation
 * highlighting needs to locate the same quote text inside two structurally
 * very different renderings, so this works purely against the DOM text
 * content rather than either library's internal geometry.
 *
 * Mirrors the backend's matching rule (app/services/quote_verifier.py):
 * words must match exactly, in order; only whitespace is elastic.
 *
 * Deliberately avoids Range.surroundContents() — it throws whenever a match
 * spans more than one element (the common case here, since PDF text layers
 * split text into many small positioned spans). Instead each overlapping
 * text node is individually split and its matched portion wrapped in its
 * own <mark>, which works regardless of how many nodes a match spans.
 */

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function buildWhitespaceTolerantPattern(quote: string): RegExp | null {
  const tokens = quote.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const body = tokens.map(escapeRegExp).join("\\s+");
  try {
    return new RegExp(body);
  } catch {
    return null;
  }
}

export function clearHighlights(container: HTMLElement, markClassName: string) {
  const marks = container.querySelectorAll(`mark.${markClassName}`);
  marks.forEach((mark) => {
    const text = document.createTextNode(mark.textContent || "");
    mark.replaceWith(text);
  });
  container.normalize();
}

export function findAndHighlight(
  container: HTMLElement,
  quote: string,
  markClassName: string,
): HTMLElement | null {
  const pattern = buildWhitespaceTolerantPattern(quote);
  if (!pattern) return null;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodeRanges: { node: Text; start: number; end: number }[] = [];
  let full = "";
  let node: Node | null;
  let first = true;
  while ((node = walker.nextNode())) {
    const text = node as Text;
    // A single space between every pair of text nodes, not just within one —
    // confirmed live: react-pdf's text layer renders one <span> per line
    // with no trailing space, so naive concatenation glues adjacent lines
    // together ("payment.8. Governing Law", "State ofDelaware") and the
    // whitespace-tolerant pattern (which still requires *some* separator,
    // just not a specific amount) stops matching entirely. The inserted
    // space sits in the gap *between* node ranges below, never inside one,
    // so it can't corrupt a real match — \s+ already tolerates an extra
    // space where a genuine one already existed (e.g. normal flowing HTML).
    if (!first) full += " ";
    first = false;
    const start = full.length;
    full += text.textContent || "";
    nodeRanges.push({ node: text, start, end: full.length });
  }

  const match = pattern.exec(full);
  if (!match) return null;

  const matchStart = match.index;
  const matchEnd = match.index + match[0].length;

  let firstMark: HTMLElement | null = null;
  for (const { node: textNode, start, end } of nodeRanges) {
    if (end <= matchStart || start >= matchEnd) continue;
    const localStart = Math.max(0, matchStart - start);
    const localEnd = Math.min(end - start, matchEnd - start);
    if (localStart >= localEnd) continue;

    const parent = textNode.parentNode;
    if (!parent) continue;
    const fullText = textNode.textContent || "";
    const before = fullText.slice(0, localStart);
    const matched = fullText.slice(localStart, localEnd);
    const after = fullText.slice(localEnd);

    const mark = document.createElement("mark");
    mark.className = markClassName;
    mark.textContent = matched;

    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));
    frag.appendChild(mark);
    if (after) frag.appendChild(document.createTextNode(after));

    parent.replaceChild(frag, textNode);
    if (!firstMark) firstMark = mark;
  }

  return firstMark;
}
