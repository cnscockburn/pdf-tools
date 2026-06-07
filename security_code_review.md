# Comprehensive Security & Code Quality Review

The following report outlines the vulnerabilities, design flaws, and performance bottlenecks identified in the `pdf-tools` codebase. Issues are formally prioritized by severity (High, Medium, Low) and include technical descriptions and specific locations of occurrence within the project. 

As requested, this report focuses purely on identifying and explaining the issues and their impacts, omitting any implementation or mitigation suggestions.

---

## Resolution Status (2026-06-07)

Each finding was assessed and actioned. Summary:

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Unauthenticated local CSRF / API access | High | **Fixed** — per-launch token |
| 2 | Permissive CSP (`unsafe-inline`) | High | **Fixed (script-src)** — style-src retained w/ rationale |
| 3 | Image decompression bomb | High | **Fixed** — pixel cap + DPI clamp |
| 4 | Sidecar path hijacking | High | **Mitigated** — perMachine install; signing recommended |
| 5 | Arbitrary local PDF read via IPC | Medium | **Accepted** — gated by #2; by-design file access |
| 6 | Sync CPU-bound work on event loop | Medium | **Fixed** — offloaded to bounded threadpool |
| 7 | In-memory ZIP construction (OOM) | Medium | **Partially mitigated** — DPI clamp; streaming deferred |
| 8 | Unbounded concurrent uploads | Medium | **Mitigated** — concurrency limiter + size caps |
| 9 | Hardcoded port 7342 | Low | **Accepted** — documented; dynamic port deferred |
| 10 | Broad DOMPurify allowlist | Low | **Fixed** — removed `foreignObject` |
| 11 | Error masking leaks class names | Low | **Fixed** — generic client message |

Details per finding are appended under each section below as **➤ Resolution**.

---

## 🔴 High Priority

### 1. Unauthenticated Local CSRF & Unrestricted API Access (CWE-352 / CWE-306)
**Description:** 
The Python FastAPI sidecar bounds to `127.0.0.1:7342` and accepts incoming `POST` requests without requiring any authentication tokens, anti-CSRF tokens, or custom headers. While CORS is configured to restrict unauthorized origins from reading responses, it does not prevent the browser from executing "simple" cross-origin requests (such as `multipart/form-data` uploads). 

**Impact:** 
A malicious website visited by the user can issue blind `POST` requests to `http://127.0.0.1:7342/api/merge` or other intensive endpoints. The backend will fully process these requests, allowing the malicious site to launch a Denial-of-Service (DoS) attack by exhausting the user's CPU and memory. Furthermore, any local process on the machine can interact with and manipulate the API without restriction.

**Locations:**
* `backend/main.py` (CORS middleware allows `POST` methods globally).
* `backend/routers/*` (No custom header or token validation).
* `src/api/client.ts` (API client issues standard `fetch` requests without custom headers).

**➤ Resolution — Fixed.** The Rust launcher now generates a 256-bit random token per launch (`generate_token`), passes it to the sidecar via the `STRIA_API_TOKEN` env var, and exposes it to the WebView through the `api_token` Tauri command. The backend (`require_api_token` middleware in `main.py`) rejects any `/api` request lacking the matching `X-Stria-Token` header with 403; the client (`apiFetch` in `client.ts`) attaches it to every request. This defeats both attack vectors: a malicious web page cannot read the token, and sending a custom header forces a CORS preflight that the origin allowlist rejects; other local processes don't know the per-launch token. Enforcement auto-disables in dev (no env var) so the Vite proxy still works. Verified over HTTP: request with token → 200, without/wrong token → 403.

### 2. Permissive Content Security Policy (CWE-79 / CWE-1021)
**Description:** 
The application configures a highly permissive Content Security Policy (CSP) for the Tauri webview. Specifically, it permits `'unsafe-inline'` for both `script-src` and `style-src`.

**Impact:** 
This significantly lowers the barrier for Cross-Site Scripting (XSS). If user-controlled data (e.g., extracted PDF metadata, form fields, or mathematical annotations) is rendered without perfect sanitization, an attacker can trivially execute arbitrary JavaScript within the context of the application.

**Locations:**
* `src-tauri/tauri.conf.json` (Inside the `app.security.csp` configuration string).

**➤ Resolution — Fixed (script-src).** Removed `'unsafe-inline'` from `script-src` (now `script-src 'self'`). The production bundle uses only an external module script, and Tauri v2 auto-injects nonces for its own IPC scripts when a CSP is set, so this is safe and closes the script-execution XSS path. `'unsafe-inline'` is intentionally retained on `style-src` only: it is a much lower-severity concern (no code execution), and some runtime-injected styles depend on it; removing it risks breaking the packaged build for little gain. *Needs a launch test of the packaged app to confirm the WebView renders (see build notes).*

### 3. Uncapped Image Decompression Bomb (CWE-400)
**Description:** 
During the PDF compression routine, the backend utilizes the Pillow library to recompress embedded images. The code opens image streams directly without configuring or checking `Image.MAX_IMAGE_PIXELS`. 

**Impact:** 
An attacker can craft a malicious PDF containing an image with a small compressed file size but extreme pixel dimensions (a "decompression bomb" or "zip bomb"). When PyMuPDF extracts the image and Pillow attempts to decompress it, the backend will attempt to allocate gigabytes of RAM, resulting in an Out-of-Memory (OOM) crash that kills the sidecar server.

**Locations:**
* `backend/services/pdf_engine.py` (In the `compress()` function: `pil = Image.open(io.BytesIO(base["image"]))`).

**➤ Resolution — Fixed.** `compress()` now sets `Image.MAX_IMAGE_PIXELS = 64_000_000` (≈8000×8000) before decoding embedded images; Pillow raises `DecompressionBombError` above that, which the existing per-image `try/except` catches and leaves the image untouched. Separately, `pdf_to_images()` now clamps DPI to `[36, 600]` so a request can't force a multi-gigapixel page render.

### 4. Predictable Sidecar Path Resolution & Hijacking Risk (CWE-426)
**Description:** 
The Rust launcher resolves the path of the backend sidecar by traversing relative to `std::env::current_exe()`. It then spawns the process using the standard `std::process::Command` instead of utilizing Tauri's built-in secure sidecar API (`tauri::api::process::Command::new_sidecar`).

**Impact:** 
If the application is installed in a user-writable directory (such as `AppData\Local` on Windows), a local attacker or malware can drop or overwrite the `pdftools-server.exe` executable. When the user legitimately launches the application, the malicious binary will be executed with the user's privileges, achieving persistence and privilege escalation.

**Locations:**
* `src-tauri/src/lib.rs` (In the `sidecar_path()` and `run()` functions).

**➤ Resolution — Mitigated (residual accepted).** The NSIS installer is configured `installMode: perMachine`, so the app installs under `Program Files`, which is not user-writable without elevation; this removes the drop/overwrite vector for unprivileged malware. (If a user force-installs per-user, that protection is reduced.) The launcher still uses `std::process::Command` rather than the shell-plugin sidecar API — switching is a larger refactor with its own risk and was deferred to avoid destabilising this build. The genuine fix for tamper-resistance is **Authenticode code-signing** of both the main exe and the sidecar, which is recommended as a release step. Spawn failures are now logged to `sidecar.log` for auditability.

---

## 🟡 Medium Priority

### 5. Arbitrary Local PDF Exfiltration via IPC (CWE-200)
**Description:** 
The application exposes a Tauri IPC command (`read_file_bytes`) that accepts a string path, canonicalizes it, checks that the extension is `.pdf`, and returns the raw bytes to the frontend. 

**Impact:** 
While it successfully prevents the reading of non-PDF files, it allows unrestricted access to *any* `.pdf` file on the filesystem. If an attacker successfully exploits an XSS vulnerability in the frontend (facilitated by Issue #2), they can programmatically invoke this command to read and exfiltrate highly sensitive local PDF documents belonging to the user.

**Locations:**
* `src-tauri/src/lib.rs` (The `read_file_bytes` Tauri command and `validate_pdf_path` helper).

**➤ Resolution — Accepted (risk reduced by #2).** Reading arbitrary `.pdf` files is the intended behaviour of a local PDF tool (open-from-anywhere, recent files, "Open with"). The command already canonicalises the path (blocking traversal) and restricts to the `.pdf` extension. The exfiltration scenario requires an XSS foothold, which the CSP hardening in #2 and the token gating in #1 substantially reduce. No further restriction applied, as it would break legitimate functionality.

### 6. Synchronous CPU-Bound Operations in Async Routes (CWE-1041)
**Description:** 
The FastAPI routes are defined using asynchronous functions (`async def`). However, the `run_engine` wrapper executes synchronous, CPU-bound tasks (PyMuPDF operations) directly on the asyncio event loop instead of dispatching them to a separate thread pool.

**Impact:** 
Processing a large, complex PDF completely blocks the Python event loop. While the operation runs, the Uvicorn server becomes entirely unresponsive to concurrent API requests, health checks, or application lifecycle events.

**Locations:**
* `backend/routers/_deps.py` (`run_engine` execution flow).
* All route handlers in `backend/routers/*.py` (e.g., `compress_pdf`, `images_to_pdf`).

**➤ Resolution — Fixed.** `run_engine` in `backend/routers/_deps.py` is now `async` and offloads the synchronous engine call to a worker thread via `anyio.to_thread.run_sync`, so the asyncio event loop stays responsive (health checks and other requests no longer block behind a long PDF operation). All 18 router call sites were updated to `await run_engine(...)`; verified all sites are inside `async def` handlers. Smoke tests and an end-to-end HTTP merge confirm the path works.

### 7. In-Memory Archive Construction Leading to OOM (CWE-400)
**Description:** 
Operations that return multiple files generate ZIP archives. These archives are constructed entirely in memory using Python's `io.BytesIO()`. 

**Impact:** 
When processing operations that generate massive outputs—such as splitting a 1,000-page PDF into single pages, or rendering high-DPI images for every page—the application must hold the entire resulting ZIP archive in memory before sending the HTTP response. This easily exhausts available RAM on standard desktop machines, leading to application crashes.

**Locations:**
* `backend/services/pdf_engine.py` (In the `split()` and `pdf_to_images()` functions).

**➤ Resolution — Partially mitigated; full fix deferred.** The new `_ENGINE_LIMITER` (capacity 4) bounds how many heavy operations run concurrently, and the `pdf_to_images` DPI clamp caps per-page bitmap size, which together cut peak memory substantially. The archives are still assembled in `io.BytesIO`; converting `split()`/`pdf_to_images()` to stream into a `SpooledTemporaryFile`/`tempfile` and return a `FileResponse` is the complete fix and is **deferred** (contained change, but touches the response contract and warrants its own test pass). Tracked as follow-up.

### 8. Unbounded Concurrent Upload Allocations (CWE-770)
**Description:** 
The application enforces a `MAX_UPLOAD_BYTES` limit (100MB per file) and streams the upload into a byte array in memory. However, there is no concurrency limit or rate limiting applied to the upload endpoints.

**Impact:** 
A client can open dozens of simultaneous connections, each uploading a 100MB file. The backend will attempt to allocate memory for all these chunks simultaneously, leading to rapid memory exhaustion and system freezing.

**Locations:**
* `backend/routers/_deps.py` (`_read_capped` function reads chunks continuously into memory).

**➤ Resolution — Mitigated.** The `_ENGINE_LIMITER` (capacity 4) bounds concurrent CPU/RAM-heavy processing, and the existing per-file (100 MB) and per-request total (300 MB) caps remain. Combined with the token gating from #1 (only this app's WebView can reach the API at all), the practical exposure for a single-user desktop app is low. A strict cap on total concurrent in-flight *upload bytes* (a global byte semaphore around `_read_capped`) is a reasonable further hardening and is noted as follow-up.

---

## 🟢 Low Priority

### 9. Hardcoded and Conflict-Prone Port Assignment (CWE-1104)
**Description:** 
The application relies on a hardcoded networking port (`7342`) to bridge the Rust launcher, the Python backend, and the TypeScript frontend client.

**Impact:** 
If the user already has a service occupying port `7342`, or if the user attempts to open two instances of the application simultaneously, the sidecar server will fail to bind, rendering the application entirely non-functional.

**Locations:**
* `backend/main.py` (`run_kwargs` port assignment).
* `src-tauri/src/lib.rs` (`BACKEND_PORT` constant).
* `src/api/client.ts` (`BASE` URL definition).

**➤ Resolution — Accepted (Low); deferred.** Documented. A robust fix is dynamic-port negotiation: the Rust launcher binds a free port, passes it to the sidecar and to the WebView (alongside the existing token handshake), and the client reads it instead of hardcoding 7342. This is deferred to avoid expanding the change surface of this build-stabilisation pass. (Note: an orphaned dev `uvicorn --reload` child occupying 7342 was observed during testing — a real instance of this failure mode — but the production sidecar runs without the reloader, single-process.)

### 10. Broad HTML Allowlist in DOMPurify (CWE-79)
**Description:** 
The `MathText.tsx` component relies on `DOMPurify` to sanitize KaTeX output before injecting it via `dangerouslySetInnerHTML`. The allowlist of permitted tags includes complex elements such as `foreignObject`, `math`, and `annotation-xml`.

**Impact:** 
While `DOMPurify` is robust, allowing tags like `foreignObject` increases the risk of Mutation XSS (mXSS), as these tags can exhibit unpredictable parsing behaviors and context-switching across different browser engines.

**Locations:**
* `src/components/MathText.tsx` (`KATEX_ALLOWED_TAGS` configuration).

**➤ Resolution — Fixed.** Removed `foreignObject` from `KATEX_ALLOWED_TAGS`. KaTeX's HTML+MathML output does not emit it, and it is the primary mXSS vector among the allowed tags (it switches the parser back into HTML context). The remaining SVG/MathML tags are required for KaTeX rendering.

### 11. Opaque Error Masking Leaks Implementation Details (CWE-209)
**Description:** 
The `run_engine` decorator intercepts all unexpected exceptions generated by PyMuPDF or Pillow and translates them into an HTTP 422 response. The response detail string includes the exact Python exception class name (e.g., `ValueError`, `RuntimeError`, `KeyError`).

**Impact:** 
This behavior obscures the stack trace from backend terminal logs (making legitimate debugging difficult) while simultaneously leaking internal backend implementation structures to the frontend client.

**Locations:**
* `backend/routers/_deps.py` (Exception handling block in `run_engine`).

**➤ Resolution — Fixed.** The unexpected-exception branch in `run_engine` now returns a generic `"PDF processing failed."` (no `type(e).__name__`) to the client, while the full exception and traceback are still printed to stderr (captured to `sidecar.log` in packaged builds) for debugging.
