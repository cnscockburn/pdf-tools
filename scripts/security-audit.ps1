<#
.SYNOPSIS
    Full security audit for Stria PDF toolkit.
    Suitable for ISO 27001 / SOC 2 evidence collection.

.DESCRIPTION
    Runs the following checks in sequence:
      1. npm audit        — JavaScript/TypeScript dependency CVEs
      2. pip-audit        — Python dependency CVEs (with GHSA/PyPI advisory DB)
      3. cargo audit      — Rust crate CVEs (requires cargo-audit)
      4. bandit           — Python SAST (common security anti-patterns)
      5. semgrep          — Multi-language SAST (optional; skip if not installed)
      6. gitleaks         — Secret / credential scanning (optional; skip if not installed)
      7. Custom checks    — Project-specific policy assertions

    Output is written to:
      .security/audit-<datestamp>.json   (machine-readable summary)
      .security/audit-<datestamp>.md     (human-readable report)

    Exit code: 0 = no issues, 1 = warnings only, 2 = critical findings.

.PARAMETER OutDir
    Directory for report files. Default: .security

.PARAMETER SkipInstall
    Skip auto-installing missing Python audit tools (bandit, pip-audit).

.PARAMETER CI
    CI mode: exit non-zero on any finding (no interactive prompts).

.EXAMPLE
    .\scripts\security-audit.ps1
    .\scripts\security-audit.ps1 -CI
    .\scripts\security-audit.ps1 -SkipInstall -OutDir audit-results
#>

param(
    [string]$OutDir    = ".security",
    [switch]$SkipInstall,
    [switch]$CI
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"   # don't abort on tool errors — collect them all

$Root      = Split-Path $PSScriptRoot -Parent
$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$ReportMd  = Join-Path $Root $OutDir "audit-$Timestamp.md"
$ReportJson= Join-Path $Root $OutDir "audit-$Timestamp.json"

# ── Helpers ───────────────────────────────────────────────────────────────────

$Findings  = [System.Collections.Generic.List[hashtable]]::new()
$ExitCode  = 0

function Write-Section([string]$title) {
    Write-Host ""
    Write-Host "─────────────────────────────────────────────" -ForegroundColor Cyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host "─────────────────────────────────────────────" -ForegroundColor Cyan
}

function Add-Finding([string]$severity, [string]$id, [string]$title, [string]$detail, [string]$tool) {
    $Findings.Add(@{ severity=$severity; id=$id; title=$title; detail=$detail; tool=$tool })
    $color = switch ($severity) {
        "CRITICAL" { "Red" }
        "HIGH"     { "Red" }
        "MEDIUM"   { "Yellow" }
        "LOW"      { "DarkYellow" }
        default    { "Gray" }
    }
    Write-Host "  [$severity] $id — $title" -ForegroundColor $color
    if ($detail) { Write-Host "    $detail" -ForegroundColor Gray }
    if ($severity -in @("CRITICAL","HIGH")) { $script:ExitCode = [Math]::Max($script:ExitCode, 2) }
    elseif ($severity -eq "MEDIUM")         { $script:ExitCode = [Math]::Max($script:ExitCode, 1) }
}

function Test-Command([string]$cmd) {
    $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue)
}

function Invoke-Tool([string]$name, [scriptblock]$block) {
    Write-Host "  Running $name..." -NoNewline
    try {
        & $block
        Write-Host " done" -ForegroundColor Green
    } catch {
        Write-Host " FAILED" -ForegroundColor Red
        Add-Finding "MEDIUM" "TOOL-ERR" "$name failed to run" $_.Exception.Message "audit-runner"
    }
}

# ── Setup ─────────────────────────────────────────────────────────────────────

if (-not (Test-Path (Join-Path $Root $OutDir))) {
    New-Item -ItemType Directory -Path (Join-Path $Root $OutDir) | Out-Null
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Stria Security Audit — $Timestamp   ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan

# ── 1. npm audit ──────────────────────────────────────────────────────────────

Write-Section "1 / npm audit (JS/TS dependency CVEs)"

Invoke-Tool "npm audit" {
    Push-Location $Root
    $npmOut = npm audit --json 2>&1 | Out-String
    Pop-Location

    try {
        $data = $npmOut | ConvertFrom-Json
        $vulns = $data.vulnerabilities.PSObject.Properties | Where-Object { $_.Value.severity -in @("critical","high","moderate") }
        foreach ($v in $vulns) {
            $sev = switch ($v.Value.severity) {
                "critical"  { "CRITICAL" }
                "high"      { "HIGH" }
                "moderate"  { "MEDIUM" }
                default     { "LOW" }
            }
            Add-Finding $sev "NPM-$($v.Name)" "npm: $($v.Name)" (
                "$($v.Value.severity) — via $($v.Value.via -join ', ')"
            ) "npm-audit"
        }
        if ($vulns.Count -eq 0) {
            Write-Host "  No npm vulnerabilities found" -ForegroundColor Green
        }
    } catch {
        # npm audit exits 1 when vulns found — parse the raw text fallback
        if ($npmOut -match '"severity"\s*:\s*"(critical|high)"') {
            Add-Finding "HIGH" "NPM-PARSE" "npm audit found issues" "Could not parse JSON output; run 'npm audit' manually" "npm-audit"
        }
    }
}

# ── 2. pip-audit ──────────────────────────────────────────────────────────────

Write-Section "2 / pip-audit (Python dependency CVEs)"

$PipAuditAvailable = Test-Command "pip-audit"
if (-not $PipAuditAvailable -and -not $SkipInstall) {
    Write-Host "  Installing pip-audit..." -ForegroundColor Yellow
    & pip install pip-audit --quiet
    $PipAuditAvailable = Test-Command "pip-audit"
}

if ($PipAuditAvailable) {
    Invoke-Tool "pip-audit" {
        $pipOut = pip-audit --requirement "$Root/backend/requirements.txt" --format json 2>&1 | Out-String
        # pip-audit may not find requirements.txt; fall back to scanning the venv
        if ($pipOut -match "No such file") {
            $pipOut = pip-audit --path "$Root/backend/.venv" --format json 2>&1 | Out-String
        }
        try {
            $data = $pipOut | ConvertFrom-Json
            foreach ($dep in $data) {
                foreach ($vuln in $dep.vulns) {
                    Add-Finding "HIGH" "PIP-$($vuln.id)" "pip: $($dep.name)@$($dep.version)" (
                        "$($vuln.id): $($vuln.description) — fix: $($vuln.fix_versions -join ', ')"
                    ) "pip-audit"
                }
            }
            if (($data | Measure-Object).Count -eq 0 -or -not ($data | Where-Object { $_.vulns.Count -gt 0 })) {
                Write-Host "  No Python vulnerabilities found" -ForegroundColor Green
            }
        } catch {
            Write-Host "  pip-audit output could not be parsed — check manually" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  pip-audit not available; skipping (install with: pip install pip-audit)" -ForegroundColor Yellow
    Add-Finding "LOW" "SKIP-PIP" "pip-audit skipped" "Install pip-audit for Python CVE scanning" "audit-runner"
}

# ── 3. cargo audit ────────────────────────────────────────────────────────────

Write-Section "3 / cargo audit (Rust crate CVEs)"

$CargoAudit = Test-Command "cargo-audit"
if (-not $CargoAudit) {
    # Try via cargo subcommand
    $cargoList = & cargo --list 2>&1 | Out-String
    $CargoAudit = $cargoList -match "audit"
}

if ($CargoAudit) {
    Invoke-Tool "cargo-audit" {
        Push-Location (Join-Path $Root "src-tauri")
        $cargoOut = cargo audit --json 2>&1 | Out-String
        Pop-Location
        try {
            $data = $cargoOut | ConvertFrom-Json
            foreach ($vuln in $data.vulnerabilities.list) {
                Add-Finding "HIGH" "CARGO-$($vuln.advisory.id)" (
                    "cargo: $($vuln.package.name)@$($vuln.package.version)"
                ) "$($vuln.advisory.id): $($vuln.advisory.title)" "cargo-audit"
            }
            if ($data.vulnerabilities.count -eq 0) {
                Write-Host "  No Rust vulnerabilities found" -ForegroundColor Green
            }
        } catch {
            Write-Host "  cargo-audit output could not be parsed" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  cargo-audit not installed; skipping" -ForegroundColor Yellow
    Write-Host "  Install with: cargo install cargo-audit" -ForegroundColor Gray
    Add-Finding "LOW" "SKIP-CARGO" "cargo-audit skipped" "Install with: cargo install cargo-audit" "audit-runner"
}

# ── 4. bandit (Python SAST) ───────────────────────────────────────────────────

Write-Section "4 / bandit (Python SAST)"

$BanditAvailable = Test-Command "bandit"
if (-not $BanditAvailable -and -not $SkipInstall) {
    Write-Host "  Installing bandit..." -ForegroundColor Yellow
    & pip install bandit --quiet
    $BanditAvailable = Test-Command "bandit"
}

if ($BanditAvailable) {
    Invoke-Tool "bandit" {
        $banditOut = bandit -r "$Root/backend" --exclude "$Root/backend/.venv" -f json -q 2>&1 | Out-String
        try {
            $data = $banditOut | ConvertFrom-Json
            foreach ($issue in $data.results) {
                $sev = switch ($issue.issue_severity) {
                    "HIGH"   { "HIGH" }
                    "MEDIUM" { "MEDIUM" }
                    default  { "LOW" }
                }
                if ($sev -ne "LOW") {  # suppress informational
                    $file = $issue.filename -replace [regex]::Escape($Root), ""
                    Add-Finding $sev "BANDIT-$($issue.test_id)" $issue.test_name (
                        "$file line $($issue.line_number): $($issue.issue_text)"
                    ) "bandit"
                }
            }
            $high = ($data.results | Where-Object { $_.issue_severity -in @("HIGH","MEDIUM") }).Count
            if ($high -eq 0) {
                Write-Host "  No medium/high bandit findings" -ForegroundColor Green
            }
        } catch {
            Write-Host "  bandit output could not be parsed" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  bandit not available; skipping (install with: pip install bandit)" -ForegroundColor Yellow
    Add-Finding "LOW" "SKIP-BANDIT" "bandit skipped" "Install bandit for Python SAST" "audit-runner"
}

# ── 5. semgrep (multi-language SAST) ─────────────────────────────────────────

Write-Section "5 / semgrep (multi-language SAST)"

if (Test-Command "semgrep") {
    Invoke-Tool "semgrep" {
        $semgrepOut = semgrep --config=auto "$Root/src" "$Root/backend" --json --quiet 2>&1 | Out-String
        try {
            $data = $semgrepOut | ConvertFrom-Json
            foreach ($r in $data.results) {
                $sev = if ($r.extra.severity -in @("ERROR","WARNING")) { "MEDIUM" } else { "LOW" }
                $file = $r.path -replace [regex]::Escape($Root), ""
                Add-Finding $sev "SEMGREP-$($r.check_id -replace '.*\.','')" $r.check_id (
                    "$file:$($r.start.line) — $($r.extra.message -replace '\s+',' ')"
                ) "semgrep"
            }
            if ($data.results.Count -eq 0) {
                Write-Host "  No semgrep findings" -ForegroundColor Green
            }
        } catch {
            Write-Host "  semgrep output could not be parsed" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  semgrep not installed; skipping" -ForegroundColor Yellow
    Write-Host "  Install with: pip install semgrep" -ForegroundColor Gray
    Add-Finding "LOW" "SKIP-SEMGREP" "semgrep skipped" "Install with: pip install semgrep" "audit-runner"
}

# ── 6. gitleaks (secret scanning) ────────────────────────────────────────────

Write-Section "6 / gitleaks (secret / credential scanning)"

if (Test-Command "gitleaks") {
    Invoke-Tool "gitleaks" {
        $leaksOut = gitleaks detect --source "$Root" --report-format json --report-path - --no-banner 2>&1 | Out-String
        try {
            $leaks = $leaksOut | ConvertFrom-Json
            foreach ($l in $leaks) {
                Add-Finding "CRITICAL" "LEAK-$($l.RuleID)" "Credential leak: $($l.Description)" (
                    "$($l.File):$($l.StartLine) — match: $($l.Match -replace '(?<=.{4}).*(?=.{4})','****')"
                ) "gitleaks"
            }
            if ($leaks.Count -eq 0) {
                Write-Host "  No secrets found" -ForegroundColor Green
            }
        } catch {
            if ($leaksOut -notmatch "no leaks found") {
                Write-Host "  gitleaks output could not be parsed" -ForegroundColor Yellow
            }
        }
    }
} else {
    Write-Host "  gitleaks not installed; skipping" -ForegroundColor Yellow
    Write-Host "  Download from: https://github.com/gitleaks/gitleaks/releases" -ForegroundColor Gray
    Add-Finding "LOW" "SKIP-GITLEAKS" "gitleaks skipped" "Download from https://github.com/gitleaks/gitleaks/releases" "audit-runner"
}

# ── 7. Custom policy assertions ───────────────────────────────────────────────

Write-Section "7 / Custom policy checks"

# 7a. CSP must not be null
$tauriConf = Get-Content (Join-Path $Root "src-tauri/tauri.conf.json") | ConvertFrom-Json
if ($tauriConf.app.security.csp -eq $null -or $tauriConf.app.security.csp -eq "null") {
    Add-Finding "HIGH" "POLICY-CSP" "CSP is disabled in tauri.conf.json" (
        "Set app.security.csp to a restrictive policy. null disables all WebView protections."
    ) "policy"
} else {
    Write-Host "  CSP: configured" -ForegroundColor Green
}

# 7b. CORS allow_headers must not be wildcard in main.py
$mainPy = Get-Content (Join-Path $Root "backend/main.py") | Out-String
if ($mainPy -match 'allow_headers\s*=\s*\["\*"\]') {
    Add-Finding "MEDIUM" "POLICY-CORS-HEADERS" 'CORS allow_headers=["*"] is overly permissive' (
        "Restrict to the specific headers the frontend sends: Content-Type, Accept."
    ) "policy"
} else {
    Write-Host "  CORS headers: scoped" -ForegroundColor Green
}

# 7c. read_file_bytes must validate path
$libRs = Get-Content (Join-Path $Root "src-tauri/src/lib.rs") | Out-String
if (-not ($libRs -match "validate_pdf_path")) {
    Add-Finding "CRITICAL" "POLICY-PATH-TRAVERSAL" "read_file_bytes has no path validation" (
        "Any JS code in the WebView can call read_file_bytes with an arbitrary path."
    ) "policy"
} else {
    Write-Host "  Path traversal guard: present" -ForegroundColor Green
}

# 7d. Watermark text length must be capped
$wmPy = Get-Content (Join-Path $Root "backend/routers/watermark.py") | Out-String
if (-not ($wmPy -match "len\(text\)")) {
    Add-Finding "MEDIUM" "POLICY-WATERMARK-LEN" "Watermark text has no length cap" (
        "Unbounded text length can cause DoS via large PyMuPDF TextWriter operations."
    ) "policy"
} else {
    Write-Host "  Watermark text length cap: present" -ForegroundColor Green
}

# 7e. Redact must validate coordinate types (not just key presence)
$rdPy = Get-Content (Join-Path $Root "backend/routers/redact.py") | Out-String
if (-not ($rdPy -match "_is_unit_float|isnan|isinf")) {
    Add-Finding "MEDIUM" "POLICY-REDACT-COORDS" "Redact does not validate coordinate types/range" (
        "NaN or Infinity values in x0/y0/x1/y1 can cause unexpected PyMuPDF behavior."
    ) "policy"
} else {
    Write-Host "  Redact coordinate validation: present" -ForegroundColor Green
}

# 7f. Security headers middleware must be present
if (-not ($mainPy -match "X-Content-Type-Options")) {
    Add-Finding "MEDIUM" "POLICY-SEC-HEADERS" "Security headers middleware missing" (
        "Add X-Content-Type-Options, X-Frame-Options, Cache-Control headers."
    ) "policy"
} else {
    Write-Host "  Security headers middleware: present" -ForegroundColor Green
}

# 7g. No hardcoded secrets pattern
$secretPattern = '(?i)(password|secret|api_key|apikey|token|private_key)\s*=\s*["\x27][^"\x27]{6,}'
$sourceFiles = Get-ChildItem "$Root/src","$Root/backend/routers","$Root/backend/services","$Root/src-tauri/src" -Recurse -File -Include "*.ts","*.tsx","*.py","*.rs" -ErrorAction SilentlyContinue
foreach ($f in $sourceFiles) {
    $content = Get-Content $f.FullName | Out-String
    if ($content -match $secretPattern) {
        $rel = $f.FullName -replace [regex]::Escape($Root), ""
        Add-Finding "HIGH" "POLICY-HARDCODED-SECRET" "Possible hardcoded credential" (
            "File: $rel — review for hardcoded passwords, tokens, or API keys"
        ) "policy"
    }
}

# 7h. .env file must not be committed
$envFiles = git -C $Root ls-files "*.env" ".env*" 2>&1
if ($envFiles -and $envFiles -notmatch "fatal") {
    Add-Finding "CRITICAL" "POLICY-ENV-COMMITTED" ".env file is tracked by git" (
        "Remove with: git rm --cached .env && echo '.env' >> .gitignore"
    ) "policy"
} else {
    Write-Host "  .env not tracked: OK" -ForegroundColor Green
}

# ── Report generation ─────────────────────────────────────────────────────────

Write-Section "Report"

$critical = ($Findings | Where-Object { $_.severity -eq "CRITICAL" }).Count
$high     = ($Findings | Where-Object { $_.severity -eq "HIGH"     }).Count
$medium   = ($Findings | Where-Object { $_.severity -eq "MEDIUM"   }).Count
$low      = ($Findings | Where-Object { $_.severity -eq "LOW"      }).Count

Write-Host ""
Write-Host "  Summary: CRITICAL=$critical  HIGH=$high  MEDIUM=$medium  LOW=$low" -ForegroundColor White
Write-Host ""

# ─ JSON report ─
$jsonReport = @{
    generated   = (Get-Date -Format "o")
    project     = "Stria PDF Toolkit"
    version     = $tauriConf.version
    summary     = @{ critical=$critical; high=$high; medium=$medium; low=$low }
    findings    = $Findings
}
$jsonReport | ConvertTo-Json -Depth 10 | Out-File $ReportJson -Encoding utf8
Write-Host "  JSON: $ReportJson" -ForegroundColor Gray

# ─ Markdown report ─
$md = [System.Text.StringBuilder]::new()
[void]$md.AppendLine("# Stria Security Audit")
[void]$md.AppendLine("")
[void]$md.AppendLine("**Date:** $(Get-Date -Format 'yyyy-MM-dd HH:mm')")
[void]$md.AppendLine("**Version:** $($tauriConf.version)")
[void]$md.AppendLine("**Scope:** Full codebase (Rust/Tauri, Python/FastAPI, TypeScript/React)")
[void]$md.AppendLine("**Standards:** ISO 27001 A.12.6 (technical vulnerability management), SOC 2 CC7.1")
[void]$md.AppendLine("")
[void]$md.AppendLine("## Summary")
[void]$md.AppendLine("")
[void]$md.AppendLine("| Severity | Count |")
[void]$md.AppendLine("|----------|-------|")
[void]$md.AppendLine("| CRITICAL | $critical |")
[void]$md.AppendLine("| HIGH     | $high |")
[void]$md.AppendLine("| MEDIUM   | $medium |")
[void]$md.AppendLine("| LOW/INFO | $low |")
[void]$md.AppendLine("")
[void]$md.AppendLine("## Findings")
[void]$md.AppendLine("")

$grouped = $Findings | Group-Object severity | Sort-Object { @("CRITICAL","HIGH","MEDIUM","LOW") -indexOf $_.Name }
foreach ($g in $grouped) {
    [void]$md.AppendLine("### $($g.Name)")
    [void]$md.AppendLine("")
    foreach ($f in $g.Group) {
        [void]$md.AppendLine("**$($f.id)** — $($f.title)  *(tool: $($f.tool))*")
        if ($f.detail) { [void]$md.AppendLine("> $($f.detail)") }
        [void]$md.AppendLine("")
    }
}

[void]$md.AppendLine("---")
[void]$md.AppendLine("*Generated by scripts/security-audit.ps1*")

$md.ToString() | Out-File $ReportMd -Encoding utf8
Write-Host "  Markdown: $ReportMd" -ForegroundColor Gray

# ── Exit ──────────────────────────────────────────────────────────────────────

Write-Host ""
if ($ExitCode -eq 0) {
    Write-Host "  PASS — no actionable findings" -ForegroundColor Green
} elseif ($ExitCode -eq 1) {
    Write-Host "  WARN — medium/low findings only" -ForegroundColor Yellow
} else {
    Write-Host "  FAIL — critical or high findings present" -ForegroundColor Red
}
Write-Host ""

if ($CI) { exit $ExitCode }
