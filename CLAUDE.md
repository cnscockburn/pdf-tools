# Stria PDF Toolkit — Claude Code Guidelines

## Tech Stack

This project is primarily TypeScript with secondary Python, Rust, and YAML (CI) components; prefer TypeScript idioms and strict typing for app code.

- **Frontend:** React + TypeScript (Vite, Vitest, Tailwind CSS)
- **Desktop shell:** Rust + Tauri v2
- **Backend sidecar:** Python + FastAPI (PyMuPDF, pikepdf, Pillow)
- **CI:** GitHub Actions YAML

## CI & Security

After fixing CI/security findings, always run the full test suite and re-run semgrep to confirm no regressions before declaring the task complete.

- Run `npm run test:run` for frontend tests.
- Run `python smoke_test.py` (with the venv Python) for the backend smoke test.
- Run `cargo audit` inside `src-tauri/` for Rust dependency audits.
- Run `bandit -r backend --exclude backend/.venv` for Python SAST.
- The full automated suite is at `.github/workflows/security.yml` and locally via `scripts/security-audit.ps1`.

## Python / PDF Tooling

When working with PyMuPDF (fitz), verify the correct Python-layer API guards before applying changes, since color/annotation setters may differ from C-layer expectations.

- `Annot.set_colors()` raises `ValueError` on FreeText annotations — use `border_color=` in `add_freetext_annot()` instead, or write the PDF `"C"` array directly via `page.parent.xref_set_key(annot.xref, "C", "[r g b]")`.
- `border_color=` in `add_freetext_annot()` is only accepted when `rich_text=True` — if rich text is not needed, use `xref_set_key` directly.
- Always test annotation changes with `backend/smoke_test.py` which covers all 8 annotation types end-to-end.
