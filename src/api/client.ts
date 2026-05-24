const BASE = "/api";

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
    const res = await fetch(`${BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function mergePDFs(files: File[]): Promise<Blob> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return handleResponse(await fetch(`${BASE}/merge`, { method: "POST", body: form }));
}

export async function splitPDF(
  file: File,
  ranges: [number, number][]
): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("ranges", JSON.stringify(ranges));
  return handleResponse(await fetch(`${BASE}/split`, { method: "POST", body: form }));
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
  return handleResponse(await fetch(`${BASE}/rotate`, { method: "POST", body: form }));
}

export async function deletePages(file: File, pages: number[]): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("pages", JSON.stringify(pages));
  return handleResponse(await fetch(`${BASE}/delete-pages`, { method: "POST", body: form }));
}

export async function reorderPages(file: File, order: number[]): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("order", JSON.stringify(order));
  return handleResponse(await fetch(`${BASE}/reorder`, { method: "POST", body: form }));
}

export async function extractPages(file: File, pages: number[]): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("pages", JSON.stringify(pages));
  return handleResponse(await fetch(`${BASE}/extract`, { method: "POST", body: form }));
}

export async function imagesToPDF(images: File[]): Promise<Blob> {
  const form = new FormData();
  images.forEach((f) => form.append("files", f));
  return handleResponse(await fetch(`${BASE}/images-to-pdf`, { method: "POST", body: form }));
}

export async function compressPDF(file: File, quality: string): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("quality", quality);
  return handleResponse(await fetch(`${BASE}/compress`, { method: "POST", body: form }));
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
  return handleResponse(await fetch(`${BASE}/watermark`, { method: "POST", body: form }));
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
  return handleResponse(await fetch(`${BASE}/crop`, { method: "POST", body: form }));
}

export interface RedactRegion {
  page: number;
  x0: number; y0: number; x1: number; y1: number;
}
export async function redactPDF(file: File, regions: RedactRegion[]): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("regions", JSON.stringify(regions));
  return handleResponse(await fetch(`${BASE}/redact`, { method: "POST", body: form }));
}

export type Annotation =
  | { type: "note";          page: number; x: number; y: number; text: string }
  | { type: "highlight";     page: number; x0: number; y0: number; x1: number; y1: number; color: [number, number, number];
      rects?: Array<{ x0: number; y0: number; x1: number; y1: number }> }
  | { type: "freetext";      page: number; x0: number; y0: number; x1: number; y1: number; text: string; fontsize?: number }
  | { type: "underline";     page: number; x0: number; y0: number; x1: number; y1: number;
      rects?: Array<{ x0: number; y0: number; x1: number; y1: number }>;
      color?: [number, number, number]; text?: string }
  | { type: "strikethrough"; page: number; x0: number; y0: number; x1: number; y1: number;
      rects?: Array<{ x0: number; y0: number; x1: number; y1: number }>;
      color?: [number, number, number]; text?: string }
  | { type: "ink";           page: number;
      strokes: Array<Array<{ x: number; y: number }>>;
      color?: [number, number, number]; strokeWidth?: number }
  | { type: "shape";         page: number; x0: number; y0: number; x1: number; y1: number;
      shape: "rect" | "ellipse" | "line" | "arrow";
      color?: [number, number, number]; strokeWidth?: number; fill?: boolean; text?: string }
  | { type: "stamp";         page: number; x0: number; y0: number; x1: number; y1: number;
      label: string; color?: [number, number, number] };

export async function annotatePDF(file: File, annotations: Annotation[]): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("annotations", JSON.stringify(annotations));
  return handleResponse(await fetch(`${BASE}/annotate`, { method: "POST", body: form }));
}

export async function encryptPDF(file: File, password: string, ownerPassword?: string): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("password", password);
  form.append("owner_password", ownerPassword ?? "");
  return handleResponse(await fetch(`${BASE}/encrypt`, { method: "POST", body: form }));
}

export async function decryptPDF(file: File, password: string): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("password", password);
  return handleResponse(await fetch(`${BASE}/decrypt`, { method: "POST", body: form }));
}

export async function pdfToImages(file: File, dpi: number, fmt: "png" | "jpg"): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("dpi", String(dpi));
  form.append("fmt", fmt);
  return handleResponse(await fetch(`${BASE}/to-images`, { method: "POST", body: form }));
}
