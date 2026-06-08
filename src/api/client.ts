/**
 * In dev mode, Vite's proxy forwards /api → http://localhost:7342/api.
 * In production Tauri builds, the frontend is served from tauri://localhost
 * so we need to hit the sidecar server directly.
 */
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ── Dynamic port (A6) ─────────────────────────────────────────────────────────
// In packaged Tauri builds the Rust launcher negotiates an ephemeral port and
// exposes it via the api_port command, eliminating the hardcoded-7342 failure
// mode. The promise is created once and shared across all callers.
let apiPortPromise: Promise<number> | null = null;

async function getApiPort(): Promise<number> {
  if (!isTauri || !import.meta.env.PROD) return 7342;
  if (!apiPortPromise) {
    apiPortPromise = (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        return await invoke<number>("api_port");
      } catch {
        return 7342; // fallback
      }
    })();
  }
  return apiPortPromise;
}

// In dev mode we always use the Vite-proxied /api path.
// In prod Tauri the BASE is resolved lazily from the negotiated port.
const BASE_DEV = "/api";
async function getBase(): Promise<string> {
  if (!isTauri || !import.meta.env.PROD) return BASE_DEV;
  const port = await getApiPort();
  return `http://127.0.0.1:${port}/api`;
}

// ── Per-launch API token ──────────────────────────────────────────────────────
// In packaged Tauri builds the Rust launcher generates a random token, passes it
// to the sidecar (env) and exposes it to the WebView via the `api_token` command.
// Every request must carry it in `X-Stria-Token`, which both blocks malicious web
// pages (a custom header forces a CORS preflight the sidecar rejects) and other
// local processes (they don't know the token). In dev we talk to the Vite proxy
// and no token is configured, so this is skipped.
const tokenEnabled = isTauri && import.meta.env.PROD;
let apiTokenPromise: Promise<string> | null = null;

async function getApiToken(): Promise<string> {
  if (!tokenEnabled) return "";
  if (!apiTokenPromise) {
    apiTokenPromise = (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        return await invoke<string>("api_token");
      } catch {
        return "";
      }
    })();
  }
  return apiTokenPromise;
}

/** Build a full API URL for the given path (e.g. "/health" → "http://127.0.0.1:PORT/api/health") */
async function apiUrl(path: string): Promise<string> {
  const base = await getBase();
  return `${base}${path}`;
}

/** fetch wrapper that attaches the API token header when one is configured. */
async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getApiToken();
  if (!token) return fetch(input, init);
  const headers = new Headers(init.headers);
  headers.set("X-Stria-Token", token);
  return fetch(input, { ...init, headers });
}

async function handleResponse(res: Response): Promise<Blob> {
  if (!res.ok) {
    let msg = `Server error ${res.status}`;
    try {
      const body = await res.json();
      msg = body.detail ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.blob();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await apiFetch(await apiUrl("/health"));
    return res.ok;
  } catch {
    return false;
  }
}

export async function mergePDFs(files: File[]): Promise<Blob> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return handleResponse(await apiFetch(await apiUrl("/merge"), { method: "POST", body: form }));
}

export async function splitPDF(
  file: File,
  ranges: [number, number][]
): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("ranges", JSON.stringify(ranges));
  return handleResponse(await apiFetch(await apiUrl("/split"), { method: "POST", body: form }));
}

export async function rotatePages(
  file: File,
  pages: number[],
  angle: number
): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("pages", JSON.stringify(pages));
  form.append("angle", String(angle));
  return handleResponse(await apiFetch(await apiUrl("/rotate"), { method: "POST", body: form }));
}

export async function deletePages(file: File, pages: number[]): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("pages", JSON.stringify(pages));
  return handleResponse(await apiFetch(await apiUrl("/delete-pages"), { method: "POST", body: form }));
}

export async function reorderPages(file: File, order: number[]): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("order", JSON.stringify(order));
  return handleResponse(await apiFetch(await apiUrl("/reorder"), { method: "POST", body: form }));
}

export async function extractPages(file: File, pages: number[]): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("pages", JSON.stringify(pages));
  return handleResponse(await apiFetch(await apiUrl("/extract"), { method: "POST", body: form }));
}

/** A single page in an Organise plan: source page (1-indexed) + added rotation. */
export interface OrganisePlanItem { src: number; rotate: number }

export async function organisePdf(file: File, plan: OrganisePlanItem[]): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("plan", JSON.stringify(plan));
  return handleResponse(await apiFetch(await apiUrl("/organise"), { method: "POST", body: form }));
}

export async function imagesToPDF(images: File[]): Promise<Blob> {
  const form = new FormData();
  images.forEach((f) => form.append("files", f));
  return handleResponse(await apiFetch(await apiUrl("/images-to-pdf"), { method: "POST", body: form }));
}

export async function compressPDF(file: File, quality: string): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("quality", quality);
  return handleResponse(await apiFetch(await apiUrl("/compress"), { method: "POST", body: form }));
}

export interface WatermarkOptions {
  text: string;
  opacity: number;
  angle: number;
  fontsize: number;
  color: string; // "r,g,b" e.g. "0.5,0.5,0.5"
}
export async function watermarkPDF(file: File, opts: WatermarkOptions): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("text", opts.text);
  form.append("opacity", String(opts.opacity));
  form.append("angle", String(opts.angle));
  form.append("fontsize", String(opts.fontsize));
  form.append("color", opts.color);
  return handleResponse(await apiFetch(await apiUrl("/watermark"), { method: "POST", body: form }));
}

export async function cropPDF(
  file: File,
  x0: number, y0: number, x1: number, y1: number,
  pages: number[] | "all" = "all",
): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("x0", String(x0));
  form.append("y0", String(y0));
  form.append("x1", String(x1));
  form.append("y1", String(y1));
  form.append("pages", pages === "all" ? "all" : JSON.stringify(pages));
  return handleResponse(await apiFetch(await apiUrl("/crop"), { method: "POST", body: form }));
}

export interface RedactRegion {
  page: number;
  x0: number; y0: number; x1: number; y1: number;
}
export async function redactPDF(file: File, regions: RedactRegion[]): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("regions", JSON.stringify(regions));
  return handleResponse(await apiFetch(await apiUrl("/redact"), { method: "POST", body: form }));
}

/** Common metadata shared by every annotation variant. `author` is written into
 *  the PDF annotation's /T field by the backend so it survives the round-trip. */
type AnnotMeta = { author?: string };

export type Annotation =
  | ({ type: "note";          page: number; x: number; y: number; text: string } & AnnotMeta)
  | ({ type: "highlight";     page: number; x0: number; y0: number; x1: number; y1: number; color: [number, number, number];
      rects?: Array<{ x0: number; y0: number; x1: number; y1: number }> } & AnnotMeta)
  | ({ type: "freetext";      page: number; x0: number; y0: number; x1: number; y1: number; text: string; fontsize?: number } & AnnotMeta)
  | ({ type: "underline";     page: number; x0: number; y0: number; x1: number; y1: number;
      rects?: Array<{ x0: number; y0: number; x1: number; y1: number }>;
      color?: [number, number, number]; text?: string } & AnnotMeta)
  | ({ type: "strikethrough"; page: number; x0: number; y0: number; x1: number; y1: number;
      rects?: Array<{ x0: number; y0: number; x1: number; y1: number }>;
      color?: [number, number, number]; text?: string } & AnnotMeta)
  | ({ type: "ink";           page: number;
      strokes: Array<Array<{ x: number; y: number }>>;
      color?: [number, number, number]; strokeWidth?: number } & AnnotMeta)
  | ({ type: "shape";         page: number; x0: number; y0: number; x1: number; y1: number;
      shape: "rect" | "ellipse" | "line" | "arrow" | "arrowOpen";
      color?: [number, number, number]; strokeWidth?: number; fill?: boolean; text?: string } & AnnotMeta)
  | ({ type: "stamp";         page: number; x0: number; y0: number; x1: number; y1: number;
      label: string; color?: [number, number, number] } & AnnotMeta);

export async function annotatePDF(file: File, annotations: Annotation[]): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("annotations", JSON.stringify(annotations));
  return handleResponse(await apiFetch(await apiUrl("/annotate"), { method: "POST", body: form }));
}

export async function encryptPDF(file: File, password: string, ownerPassword?: string): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("password", password);
  form.append("owner_password", ownerPassword ?? "");
  return handleResponse(await apiFetch(await apiUrl("/encrypt"), { method: "POST", body: form }));
}

export async function decryptPDF(file: File, password: string): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("password", password);
  return handleResponse(await apiFetch(await apiUrl("/decrypt"), { method: "POST", body: form }));
}

export async function pdfToImages(file: File, dpi: number, fmt: "png" | "jpg"): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("dpi", String(dpi));
  form.append("fmt", fmt);
  return handleResponse(await apiFetch(await apiUrl("/to-images"), { method: "POST", body: form }));
}

// ── Form fields (5.3) ────────────────────────────────────────────────────────

export interface FormField {
  name: string;
  type: "text" | "checkbox" | "radio" | "combobox" | "listbox" | "button" | "signature" | "unknown";
  value: string;
  page: number;
  options: string[];
}

export async function getFormFields(file: File): Promise<FormField[]> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch(await apiUrl("/form-fields"), { method: "POST", body: form });
  if (!res.ok) {
    let msg = `Server error ${res.status}`;
    try { msg = (await res.json()).detail ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = await res.json();
  return (data.fields ?? []) as FormField[];
}

export async function fillForm(file: File, values: Record<string, string>): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("values", JSON.stringify(values));
  return handleResponse(await apiFetch(await apiUrl("/fill-form"), { method: "POST", body: form }));
}

/** Generate a formatted PDF annotation report for the given document + annotations. */
export async function annotationReportPdf(
  file: File,
  annotations: Annotation[],
): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("annotations", JSON.stringify(annotations));
  return handleResponse(await apiFetch(await apiUrl("/annotation-report"), { method: "POST", body: form }));
}
