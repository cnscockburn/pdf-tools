# build-sidecar.ps1
#
# Build the Python backend into a standalone exe (pdftools-server.exe) and
# copy it into src-tauri\binaries\ with the Tauri-required target-triple suffix.
#
# Run this once before `npm run tauri:build`.  Re-run whenever you change Python code.
#
# Prerequisites:
#   - Python venv at backend\.venv (run `python -m venv backend\.venv` + pip install)
#   - Note: uses `python -m pip` rather than pip.exe (works with uv-created venvs)
#
# Usage:
#   .\build-sidecar.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# ── Step 1: install PyInstaller into the venv if not already present ──────────
Write-Host ""
Write-Host "Ensuring PyInstaller is installed in backend venv..." -ForegroundColor Cyan
$py = "$root\backend\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Host "Python venv not found at backend\.venv - run: python -m venv backend\.venv" -ForegroundColor Red
    exit 1
}
& $py -m pip install pyinstaller --quiet

# ── Step 2: run PyInstaller from the backend directory ───────────────────────
Write-Host ""
Write-Host "Building backend sidecar with PyInstaller..." -ForegroundColor Cyan
Set-Location "$root\backend"
& $py -m PyInstaller pdftools_server.spec --clean --noconfirm
$code = $LASTEXITCODE
Set-Location $root
if ($code -ne 0) {
    Write-Host "PyInstaller FAILED (exit $code)" -ForegroundColor Red
    exit $code
}
Write-Host "PyInstaller succeeded." -ForegroundColor Green

# ── Step 3: determine Rust target triple ─────────────────────────────────────
# `rustc -vV` prints something like:
#   host: x86_64-pc-windows-msvc
# Try PATH first, then fall back to the standard cargo bin directory.
$rustc = (Get-Command rustc -ErrorAction SilentlyContinue).Source
if (-not $rustc) {
    $rustc = "$env:USERPROFILE\.cargo\bin\rustc.exe"
    if (-not (Test-Path $rustc)) { $rustc = $null }
}
if (-not $rustc) {
    Write-Host "Could not find rustc. Install Rust via https://rustup.rs" -ForegroundColor Red
    exit 1
}
$triple = (& $rustc -vV) -match "^host:" | ForEach-Object { ($_ -split ":\s+")[1] }
if (-not $triple) {
    Write-Host "Could not determine Rust target triple from '$rustc -vV'." -ForegroundColor Red
    Write-Host "Set `$triple manually and re-run, e.g.: x86_64-pc-windows-msvc"
    exit 1
}
Write-Host "Rust target triple: $triple" -ForegroundColor Cyan

# ── Step 4: ensure cargo is on PATH for this session ─────────────────────────
$cargoBin = "$env:USERPROFILE\.cargo\bin"
if ($env:PATH -notlike "*$cargoBin*") {
    $env:PATH = "$cargoBin;$env:PATH"
    Write-Host "Added $cargoBin to PATH" -ForegroundColor Cyan
}

# ── Step 5: copy exe to src-tauri\binaries\ with triple suffix ───────────────
$dest = "$root\src-tauri\binaries"
if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest | Out-Null }

$src  = "$root\backend\dist\pdftools-server.exe"
$out  = "$dest\pdftools-server-$triple.exe"
Copy-Item -Path $src -Destination $out -Force

Write-Host ""
Write-Host "Sidecar copied to: $out" -ForegroundColor Green

# ── Step 6: build the Tauri installer ────────────────────────────────────────
Write-Host ""
Write-Host "Building Tauri installer..." -ForegroundColor Cyan
npm run tauri:build
$code = $LASTEXITCODE
if ($code -ne 0) {
    Write-Host "Tauri build FAILED (exit $code)" -ForegroundColor Red
    exit $code
}

Write-Host ""
Write-Host "Build complete. Installer is in src-tauri\target\release\bundle\" -ForegroundColor Green
