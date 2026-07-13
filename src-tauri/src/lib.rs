use std::net::TcpListener;
use std::path::Path;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// Handle to the spawned Python sidecar. Killed when the app exits (Drop).
struct BackendServer(Mutex<Option<Child>>);

impl Drop for BackendServer {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.0.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

/// Per-launch random token shared with the sidecar and the WebView so only this
/// app's frontend can call the local API. See `api_token` and the backend's
/// `require_api_token` middleware.
struct ApiToken(String);

/// Per-launch port the sidecar is listening on (ephemeral; negotiated at startup
/// to eliminate the hardcoded-7342 port conflict failure mode).
struct ApiPort(u16);

/// Bind an ephemeral OS-assigned port and return its number.
/// If the OS cannot assign a port, fall back to a specific port as a last resort.
fn bind_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .map(|l| l.local_addr().map(|a| a.port()).unwrap_or(7342))
        .unwrap_or(7342)
}

/// Generate a 256-bit random token, hex-encoded.
fn generate_token() -> String {
    let mut buf = [0u8; 32];
    getrandom::getrandom(&mut buf).expect("failed to obtain OS randomness for API token");
    buf.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Expose the per-launch API token to the WebView. The frontend attaches it as
/// the `X-Stria-Token` header on every request to the sidecar.
#[tauri::command]
fn api_token(state: tauri::State<'_, ApiToken>) -> String {
    state.0.clone()
}

/// Expose the ephemeral port the sidecar is listening on to the WebView.
/// The frontend reads this once at startup instead of using a hardcoded port.
#[tauri::command]
fn api_port(state: tauri::State<'_, ApiPort>) -> u16 {
    state.0
}

/// Spawn the bundled Python sidecar. Never panics: on failure it logs and
/// returns, leaving the window up. The frontend polls `/api/health` and shows a
/// "backend offline" indicator, so a sidecar problem degrades gracefully instead
/// of taking down the whole app (which is what a panic here used to do).
fn start_backend(app: &AppHandle, token: String, port: u16) {
    use std::io::Write;
    use std::process::Stdio;

    // Rationale: temp_dir() is only a fallback location for the sidecar's
    // stderr log file when the OS app-log directory is unavailable. It holds
    // no secrets and is never used for a trust or authorization decision.
    let log_dir = app
        .path()
        .app_log_dir()
        .unwrap_or_else(|_| std::env::temp_dir()); // nosemgrep: rust.lang.security.temp-dir.temp-dir
    let _ = std::fs::create_dir_all(&log_dir);
    let log_path = log_dir.join("sidecar.log");

    let exe = sidecar_path();

    let mut cmd = Command::new(&exe);
    cmd.env("STRIA_API_TOKEN", &token);
    cmd.env("STRIA_API_PORT", port.to_string());
    cmd.stdout(Stdio::null());
    // Capture the sidecar's stderr to a log file so startup failures are
    // diagnosable in packaged builds (the exe is windowed / has no console).
    if let Ok(f) = std::fs::File::create(&log_path) {
        cmd.stderr(Stdio::from(f));
    }
    // Don't flash a console window on Windows.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    match cmd.spawn() {
        Ok(child) => {
            if let Some(state) = app.try_state::<BackendServer>() {
                if let Ok(mut guard) = state.0.lock() {
                    *guard = Some(child);
                }
            }
        }
        Err(e) => {
            if let Ok(mut f) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_path)
            {
                let _ = writeln!(
                    f,
                    "[launcher] failed to spawn sidecar {}: {e}",
                    exe.display()
                );
            }
        }
    }
}

/// Resolve the bundled sidecar path.
/// Tauri names sidecars as `<name>-<target-triple>[.exe]` when bundling.
/// At runtime we look for the exe next to the Tauri binary.
fn sidecar_path() -> std::path::PathBuf {
    // Rationale: current_exe() is used solely to locate the *directory* that
    // contains the bundled sidecar — not for authentication, authorisation, or
    // any trust decision.  This is the standard Tauri sidecar discovery pattern
    // and there is no alternative API.  A spoofed exe path would at most cause
    // the sidecar launch to fail at startup, not grant elevated access.
    let base = std::env::current_exe() // nosemgrep: rust.lang.security.current-exe.current-exe
        .expect("cannot resolve current exe")
        .parent()
        .expect("exe has no parent")
        .to_path_buf();

    // Tauri places sidecars alongside the main exe on Windows
    let name = if cfg!(target_os = "windows") {
        "pdftools-server.exe"
    } else {
        "pdftools-server"
    };

    base.join(name)
}

/// Validate that a path is a safe, accessible PDF file.
///
/// Checks:
///   1. Canonicalize to resolve `..` and symlinks.
///   2. Extension must be `.pdf` (case-insensitive) on the canonical path.
///   3. File must actually exist (canonicalize already confirms this).
///
/// Returns the canonical path string on success, or an error message.
fn validate_pdf_path(path: &str) -> Result<std::path::PathBuf, String> {
    let p = Path::new(path);

    // canonicalize resolves `..`, symlinks, and verifies the file exists.
    let canonical = p.canonicalize().map_err(|_| {
        // Deliberately vague — don't leak whether the path exists.
        "File not found or not accessible.".to_string()
    })?;

    // Extension check on the canonical path (prevents tricks like "foo.pdf/../secret").
    let ext = canonical
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    if ext.as_deref() != Some("pdf") {
        return Err("Only PDF files can be opened.".to_string());
    }

    Ok(canonical)
}

/// Read a PDF file from disk.
///
/// The path is validated before reading: canonicalized to prevent directory
/// traversal attacks, and checked to ensure the extension is `.pdf`.
/// Only existing, accessible PDF files can be read.
#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    let canonical = validate_pdf_path(&path)?;
    std::fs::read(&canonical).map_err(|_| "Failed to read file.".to_string())
}

/// Write an auto-save recovery snapshot for a document.
///
/// `slot` is a simple filename key (e.g. the tab ID). The file is written
/// atomically via a temp file to avoid partial writes. Reading back is done
/// via `read_file_bytes` once the recovery path is known. The recovery
/// directory sits in the OS app-data folder and is created if absent.
#[tauri::command]
fn write_recovery_file(app: tauri::AppHandle, slot: String, data: Vec<u8>) -> Result<String, String> {
    // Basic slot validation — must be a safe filename: alphanumeric + _ - .
    if !slot.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-' || c == '.') || slot.len() > 64 {
        return Err("Invalid recovery slot name.".to_string());
    }
    let dir = app.path().app_data_dir()
        .map_err(|_| "Could not resolve app data dir.".to_string())?
        .join("recovery");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{slot}.pdf"));
    // Write via a temp file then rename — atomic on Windows for same-directory moves.
    let tmp = dir.join(format!("{slot}.tmp"));
    std::fs::write(&tmp, &data).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Delete a recovery snapshot once the document has been cleanly saved/closed.
#[tauri::command]
fn delete_recovery_file(app: tauri::AppHandle, slot: String) -> Result<(), String> {
    if !slot.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-' || c == '.') || slot.len() > 64 {
        return Err("Invalid recovery slot name.".to_string());
    }
    let path = app.path().app_data_dir()
        .map_err(|_| "Could not resolve app data dir.".to_string())?
        .join("recovery")
        .join(format!("{slot}.pdf"));
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// List recovery snapshots present in the recovery directory.
/// Returns a list of `{ slot, path }` objects.
#[tauri::command]
fn list_recovery_files(app: tauri::AppHandle) -> Result<Vec<std::collections::HashMap<String, String>>, String> {
    let dir = app.path().app_data_dir()
        .map_err(|_| "Could not resolve app data dir.".to_string())?
        .join("recovery");
    if !dir.exists() { return Ok(vec![]); }
    let mut out = vec![];
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) == Some("pdf") {
            let mut map = std::collections::HashMap::new();
            let slot = p.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
            map.insert("slot".to_string(), slot);
            map.insert("path".to_string(), p.to_string_lossy().into_owned());
            out.push(map);
        }
    }
    Ok(out)
}

/// Get the file path passed as a CLI argument (e.g. "Open with" from Explorer).
/// Returns None if no file argument was provided or if the path is invalid.
#[tauri::command]
fn get_cli_file_path() -> Option<String> {
    // Rationale: we use args_os() (preferred for file paths — handles non-UTF-8
    // names on Windows) and unconditionally skip args[0] (the exe path, which the
    // semgrep rule warns can be spoofed).  Whatever path we extract is then passed
    // through validate_pdf_path(), which canonicalizes it, verifies the extension,
    // and confirms the file exists — so a spoofed or malicious argument cannot
    // escape to an arbitrary read.
    let raw = std::env::args_os() // nosemgrep: rust.lang.security.args-os.args-os
        .skip(1)                          // skip the exe path
        .filter_map(|a| a.into_string().ok())
        .find(|a| !a.starts_with('-') && !a.starts_with('/'))
        .filter(|a| a.to_lowercase().ends_with(".pdf"))?;

    // Validate before returning to the frontend.
    validate_pdf_path(&raw)
        .ok()
        .map(|p| p.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Per-launch token and ephemeral port shared with the sidecar (env) and
    // the WebView (commands). The port is bound, closed, then passed to the
    // sidecar via env so it binds the same number.
    let token = generate_token();
    let port  = bind_free_port();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // When a second instance is launched, find the PDF path in its args
            // and emit an event so the frontend can open it in a new tab.
            // validate_pdf_path is called here too so the emitted value is always canonical.
            let raw = args.iter()
                .skip(1)
                .find(|a| !a.starts_with('-') && !a.starts_with('/'))
                .filter(|a| a.to_lowercase().ends_with(".pdf"))
                .cloned();
            if let Some(path) = raw.and_then(|p| validate_pdf_path(&p).ok()) {
                let _ = app.emit("open-file", path.to_string_lossy().into_owned());
            }
            // Focus the existing window
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            read_file_bytes, get_cli_file_path, api_token, api_port,
            write_recovery_file, delete_recovery_file, list_recovery_files,
        ])
        .manage(ApiToken(token.clone()))
        .manage(ApiPort(port))
        .manage(BackendServer(Mutex::new(None)))
        .setup(move |app| {
            // Spawn the bundled sidecar only in release builds. In debug the
            // developer runs the backend manually:
            //   cd backend && .venv\Scripts\python.exe main.py
            // Spawn on a background thread so the window appears immediately and
            // a slow/failed backend never blocks or crashes startup.
            if cfg!(not(debug_assertions)) {
                let handle = app.handle().clone();
                let tok = token.clone();
                std::thread::spawn(move || start_backend(&handle, tok, port));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
