# verify.ps1 — Run all checks before saying "done".
#
# Usage:  .\verify.ps1
# Exit code 0 = all checks passed; non-zero = at least one failed.
#
# Checks run (in order):
#   1. TypeScript typecheck   (tsc --noEmit)
#   2. Vite production build  (catches CSS / import errors)
#   3. Frontend unit tests    (vitest run)
#   4. Backend smoke test     (exercises every pdf_engine code path)
#
# The backend HTTP integration test (http_test.py) is intentionally NOT run
# here because it requires a live server at localhost:7341.  Run it manually:
#   cd backend && .venv\Scripts\python.exe http_test.py

$failures = @()

function Run-Check {
    param([string]$label, [scriptblock]$cmd)
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host "  $label" -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan

    & $cmd
    $code = $LASTEXITCODE

    if ($code -ne 0) {
        $script:failures += $label
        Write-Host "FAILED: $label (exit $code)" -ForegroundColor Red
    } else {
        Write-Host "PASSED: $label" -ForegroundColor Green
    }
}

$root = $PSScriptRoot

# ── 1. TypeScript typecheck ──────────────────────────────────────────────────
Run-Check "TypeScript typecheck" {
    npx tsc --noEmit
}

# ── 2. Vite production build ─────────────────────────────────────────────────
Run-Check "Vite production build" {
    npx vite build
}

# ── 3. Frontend unit tests (vitest) ─────────────────────────────────────────
Run-Check "Frontend unit tests" {
    npx vitest run
}

# ── 4. Backend smoke test ────────────────────────────────────────────────────
Run-Check "Backend smoke test" {
    Set-Location (Join-Path $root "backend")
    .\.venv\Scripts\python.exe smoke_test.py
    $code = $LASTEXITCODE
    Set-Location $root
    exit $code
}

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host ("=" * 60) -ForegroundColor Cyan
if ($failures.Count -eq 0) {
    Write-Host "  ALL CHECKS PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "  FAILED CHECKS:" -ForegroundColor Red
    foreach ($f in $failures) {
        Write-Host "    - $f" -ForegroundColor Red
    }
    exit 1
}
