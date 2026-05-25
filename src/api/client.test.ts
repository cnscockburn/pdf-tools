/**
 * Client API tests
 *
 * These verify the contract between the frontend client and the backend:
 * - The correct endpoints are targeted
 * - The correct FormData fields are sent
 * - Error responses surface as thrown Errors with the server detail message
 *
 * The actual fetch() calls are intercepted via vi.stubGlobal so no real
 * HTTP traffic is needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to import after setting up the fetch mock so we can intercept calls.
// Capture URL and init separately; avoid `new Request(url)` because jsdom
// rejects relative URLs (no window.location origin in the Node environment).
let capturedUrl: string = "";
let capturedInit: RequestInit | undefined = undefined;

function makeMockFetch(status: number, body: BodyInit | Blob = new Blob()) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = typeof input === "string" ? input : (input as Request).url ?? String(input);
    capturedInit = init;
    const blob = body instanceof Blob ? body : new Blob([body as string]);
    return new Response(blob, {
      status,
      headers: { "Content-Type": "application/pdf" },
    });
  });
}

function makeErrorFetch(status: number, detail: string) {
  return vi.fn(async () => {
    const body = JSON.stringify({ detail });
    return new Response(body, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
}

function makeFile(name = "test.pdf", content = "%PDF-1.4"): File {
  return new File([content], name, { type: "application/pdf" });
}

describe("API client: error handling", () => {
  it("throws an Error with the server detail message on 4xx", async () => {
    vi.stubGlobal("fetch", makeErrorFetch(400, "File is not a PDF"));
    const { annotatePDF } = await import("./client");
    await expect(annotatePDF(makeFile(), [])).rejects.toThrow("File is not a PDF");
    vi.unstubAllGlobals();
  });

  it("throws a generic error message when body has no detail field", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const { annotatePDF } = await import("./client");
    await expect(annotatePDF(makeFile(), [])).rejects.toThrow("Server error 500");
    vi.unstubAllGlobals();
  });

  it("throws a generic error message when body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad gateway", { status: 502 })));
    const { annotatePDF } = await import("./client");
    await expect(annotatePDF(makeFile(), [])).rejects.toThrow("Server error 502");
    vi.unstubAllGlobals();
  });
});

describe("API client: checkHealth", () => {
  it("returns true when health endpoint is 200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
    const { checkHealth } = await import("./client");
    expect(await checkHealth()).toBe(true);
    vi.unstubAllGlobals();
  });

  it("returns false when health endpoint is not 200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const { checkHealth } = await import("./client");
    expect(await checkHealth()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("returns false when fetch throws (backend down)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const { checkHealth } = await import("./client");
    expect(await checkHealth()).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("API client: endpoint URLs", () => {
  beforeEach(() => {
    capturedUrl = "";
    capturedInit = undefined;
    vi.stubGlobal("fetch", makeMockFetch(200, new Blob(["%PDF"], { type: "application/pdf" })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("annotatePDF posts to /api/annotate", async () => {
    const { annotatePDF } = await import("./client");
    await annotatePDF(makeFile(), []);
    expect(capturedUrl).toContain("/api/annotate");
  });

  it("mergePDFs posts to /api/merge", async () => {
    const { mergePDFs } = await import("./client");
    await mergePDFs([makeFile()]);
    expect(capturedUrl).toContain("/api/merge");
  });

  it("splitPDF posts to /api/split", async () => {
    const { splitPDF } = await import("./client");
    await splitPDF(makeFile(), [[1, 2]]);
    expect(capturedUrl).toContain("/api/split");
  });

  it("compressPDF posts to /api/compress", async () => {
    const { compressPDF } = await import("./client");
    await compressPDF(makeFile(), "ebook");
    expect(capturedUrl).toContain("/api/compress");
  });

  it("cropPDF posts to /api/crop", async () => {
    const { cropPDF } = await import("./client");
    await cropPDF(makeFile(), 0.1, 0.1, 0.9, 0.9);
    expect(capturedUrl).toContain("/api/crop");
  });

  it("redactPDF posts to /api/redact", async () => {
    const { redactPDF } = await import("./client");
    await redactPDF(makeFile(), [{ page: 1, x0: 0, y0: 0, x1: 0.5, y1: 0.1 }]);
    expect(capturedUrl).toContain("/api/redact");
  });

  it("encryptPDF posts to /api/encrypt", async () => {
    const { encryptPDF } = await import("./client");
    await encryptPDF(makeFile(), "secret");
    expect(capturedUrl).toContain("/api/encrypt");
  });

  it("decryptPDF posts to /api/decrypt", async () => {
    const { decryptPDF } = await import("./client");
    await decryptPDF(makeFile(), "secret");
    expect(capturedUrl).toContain("/api/decrypt");
  });

  it("pdfToImages posts to /api/to-images", async () => {
    const { pdfToImages } = await import("./client");
    await pdfToImages(makeFile(), 150, "png");
    expect(capturedUrl).toContain("/api/to-images");
  });

  it("watermarkPDF posts to /api/watermark", async () => {
    const { watermarkPDF } = await import("./client");
    await watermarkPDF(makeFile(), { text: "DRAFT", opacity: 0.3, angle: 45, fontsize: 60, color: "0.5,0.5,0.5" });
    expect(capturedUrl).toContain("/api/watermark");
  });
});

describe("API client: annotatePDF sends annotations JSON", () => {
  it("serializes annotations array as form field", async () => {
    vi.stubGlobal("fetch", makeMockFetch(200, new Blob(["%PDF"])));
    const { annotatePDF } = await import("./client");
    const ann = [{ type: "note" as const, page: 1, x: 0.5, y: 0.3, text: "hi" }];
    await annotatePDF(makeFile(), ann);
    // capturedInit.body is a FormData; extract and verify the annotations field
    const body = capturedInit?.body as FormData;
    const serialized = body.get("annotations");
    expect(JSON.parse(serialized as string)).toEqual(ann);
    vi.unstubAllGlobals();
  });

  it("sends method POST", async () => {
    vi.stubGlobal("fetch", makeMockFetch(200, new Blob(["%PDF"])));
    const { annotatePDF } = await import("./client");
    await annotatePDF(makeFile(), []);
    expect(capturedInit?.method).toBe("POST");
    vi.unstubAllGlobals();
  });
});
