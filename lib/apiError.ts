/** Pull a human-readable message out of a FastAPI (or similar) error body. */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail)) {
      const parts = detail
        .map((item: unknown) => {
          if (typeof item === "string") return item;
          if (!item || typeof item !== "object") return "";
          const rec = item as { msg?: unknown; loc?: unknown[] };
          const msg = typeof rec.msg === "string" ? rec.msg : "";
          const field = Array.isArray(rec.loc)
            ? rec.loc.filter((x) => x !== "body").join(".")
            : "";
          if (field === "file" || field.endsWith(".file")) {
            return "No file was received. Attach a PDF or DOCX and try again.";
          }
          return msg;
        })
        .filter(Boolean);
      if (parts.length) return parts.join(" ");
    }
    if (typeof body?.message === "string" && body.message.trim()) return body.message;
  } catch {
    // Response wasn't JSON — fall through.
  }
  if (res.status === 422) {
    return "This file couldn't be processed. If it's a scanned PDF, upload a text-based or OCR'd version.";
  }
  return fallback;
}
