use std::net::TcpStream;
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

/// Read a file from disk and return it as a Tauri response.
/// Used by the frontend to load files passed via CLI args or file associations.
#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

/// Get the file path passed as a CLI argument (e.g. "Open with" from Explorer).
/// Returns None if no file argument was provided.
#[tauri::command]
fn get_cli_file_path() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    // The first arg is the exe itself; the second (if any) is the file path.
    // Skip args that look like flags (start with - or /).
    args.iter()
        .skip(1)
        .find(|a| !a.starts_with('-') && !a.starts_with('/'))
        .filter(|a| {
            let lower = a.to_lowercase();
            lower.ends_with(".pdf")
        })
        .cloned()
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
            if let Some(path) = args.iter()
                .skip(1)
                .find(|a| !a.starts_with('-') && !a.starts_with('/'))
                .filter(|a| a.to_lowercase().ends_with(".pdf"))
            {
                let _ = app.emit("open-file", path.clone());
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
