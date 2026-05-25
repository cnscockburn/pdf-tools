# Start PDF Tools in development mode
# Usage: .\dev.ps1
# Starts the Python backend (with auto-reload) + the Vite frontend in parallel.
# Press Ctrl+C to stop both.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "Starting PDF Tools dev environment..." -ForegroundColor Cyan

# ── Backend ────────────────────────────────────────────────────────────────
$backendJob = Start-Job -Name "backend" -ScriptBlock {
    param($dir)
    Set-Location $dir
    & ".venv\Scripts\uvicorn.exe" main:app --host 127.0.0.1 --port 7342 --reload
} -ArgumentList "$root\backend"

Write-Host "[backend] Started on http://127.0.0.1:7342" -ForegroundColor Green

# ── Frontend ───────────────────────────────────────────────────────────────
$frontendJob = Start-Job -Name "frontend" -ScriptBlock {
    param($dir)
    Set-Location $dir
    npm run dev
} -ArgumentList $root

Write-Host "[frontend] Starting Vite on http://localhost:5173..." -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop both services." -ForegroundColor Yellow
Write-Host ""

try {
    while ($true) {
        # Stream output from both jobs
        Receive-Job -Job $backendJob  -ErrorAction SilentlyContinue |
            ForEach-Object { Write-Host "[backend]  $_" -ForegroundColor DarkCyan }
        Receive-Job -Job $frontendJob -ErrorAction SilentlyContinue |
            ForEach-Object { Write-Host "[frontend] $_" -ForegroundColor DarkYellow }
        Start-Sleep -Milliseconds 500
    }
} finally {
    Write-Host ""
    Write-Host "Stopping..." -ForegroundColor Yellow
    Stop-Job  -Job $backendJob, $frontendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $backendJob, $frontendJob -ErrorAction SilentlyContinue
    # Kill any leftover process on 7341
    Get-NetTCPConnection -LocalPort 7342 -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Write-Host "Done." -ForegroundColor Green
}
