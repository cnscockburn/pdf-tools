use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // In release mode, spawn the bundled Python server sidecar.
    // In debug mode, the developer runs `uv run uvicorn main:app --port 7341` manually.
    let backend = if cfg!(not(debug_assertions)) {
        let exe = std::env::current_exe()
            .unwrap()
            .parent()
            .unwrap()
            .join("pdftools-server.exe");
        let child = Command::new(exe)
            .spawn()
            .expect("failed to start PDF backend server");
        wait_for_backend(7341, 15);
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
