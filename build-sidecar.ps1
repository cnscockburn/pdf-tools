# build-sidecar.ps1
#
# Build the Python backend into a standalone exe (pdftools-server.exe) and
# copy it into src-tauri\binaries\ with the Tauri-required target-triple suffix.
#
# Run this once before `npm run tauri:build`.  Re-run whenever you change Python code.
#
# Prerequisites:
#   - Python venv at backend\.venv (run `python -m venv backend\.venv` + pip install)
#   - pyinstaller in the venv: backend\.venv\Scripts\pip install pyinstaller
#
# Usage:
#   .\build-sidecar.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# ── Step 1: install PyInstaller into the venv if not already present ──────────
Write-Host ""
Write-Host "Ensuring PyInstaller is installed in backend venv..." -ForegroundColor Cyan
& "$root\backend\.venv\Scripts\pip.exe" install pyinstaller --quiet

# ── Step 2: run PyInstaller from the backend directory ───────────────────────
Write-Host ""
Write-Host "Building backend sidecar with PyInstaller..." -ForegroundColor Cyan
Set-Location "$root\backend"
& "$root\backend\.venv\Scripts\pyinstaller.exe" pdftools_server.spec --clean --noconfirm
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
$triple = (rustc -vV) -match "^host:" | ForEach-Object { ($_ -split ":\s+")[1] }
if (-not $triple) {
    Write-Host "Could not determine Rust target triple from 'rustc -vV'." -ForegroundColor Red
    Write-Host "Set `$triple manually and re-run, e.g.: x86_64-pc-windows-msvc"
    exit 1
}
Write-Host "Rust target triple: $triple" -ForegroundColor Cyan

# ── Step 4: copy exe to src-tauri\binaries\ with triple suffix ───────────────
$dest = "$root\src-tauri\binaries"
if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest | Out-Null }

$src  = "$root\backend\dist\pdftools-server.exe"
$out  = "$dest\pdftools-server-$triple.exe"
Copy-Item -Path $src -Destination $out -Force

Write-Host ""
Write-Host "Sidecar copied to: $out" -ForegroundColor Green
Write-Host ""
Write-Host "Next step: run   npm run tauri:build" -ForegroundColor Yellow
