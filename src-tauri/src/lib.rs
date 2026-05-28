use std::net::TcpStream;
use std::path::Path;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager};

const BACKEND_PORT: u16 = 7342;

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

fn wait_for_backend(port: u16, timeout_secs: u64) -> bool {
    let addr = format!("127.0.0.1:{}", port);
    let deadline = std::time::Instant::now() + Duration::from_secs(timeout_secs);
    while std::time::Instant::now() < deadline {
        if TcpStream::connect(&addr).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

/// Resolve the bundled sidecar path.
/// Tauri names sidecars as `<name>-<target-triple>[.exe]` when bundling.
/// At runtime we look for the exe next to the Tauri binary.
fn sidecar_path() -> std::path::PathBuf {
    let base = std::env::current_exe()
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

/// Get the file path passed as a CLI argument (e.g. "Open with" from Explorer).
/// Returns None if no file argument was provided or if the path is invalid.
#[tauri::command]
fn get_cli_file_path() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    // The first arg is the exe itself; the second (if any) is the file path.
    // Skip args that look like flags (start with - or /).
    let raw = args.iter()
        .skip(1)
        .find(|a| !a.starts_with('-') && !a.starts_with('/'))
        .filter(|a| a.to_lowercase().ends_with(".pdf"))
        .cloned()?;

    // Validate before returning to the frontend.
    validate_pdf_path(&raw)
        .ok()
        .map(|p| p.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // In release mode, spawn the bundled Python sidecar server.
    // In debug mode, the developer starts the backend manually:
    //   cd backend && .venv\Scripts\uvicorn.exe main:app --port 7342 --reload
    let backend = if cfg!(not(debug_assertions)) {
        let exe = sidecar_path();
        let child = Command::new(&exe)
            .spawn()
            .unwrap_or_else(|e| panic!("failed to start backend sidecar {}: {e}", exe.display()));
        if !wait_for_backend(BACKEND_PORT, 20) {
            panic!("backend did not become ready on port {BACKEND_PORT} within 20 seconds");
        }
        Some(child)
    } else {
        None
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
        .invoke_handler(tauri::generate_handler![read_file_bytes, get_cli_file_path])
        .manage(BackendServer(Mutex::new(backend)))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
