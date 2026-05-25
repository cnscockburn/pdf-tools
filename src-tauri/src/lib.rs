use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;

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
        .manage(BackendServer(Mutex::new(backend)))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
