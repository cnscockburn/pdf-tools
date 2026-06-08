/**
 * Shared viewer types — used by both Viewer.tsx and ContinuousCanvas.tsx.
 * Extracted here to break the import cycle that would arise if ContinuousCanvas
 * imported from Viewer (and Viewer imported from ContinuousCanvas).
 */

export type CanvasMode = "view" | "annotate" | "redact" | "crop";

export type RedactBox = {
  id: string;
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type CropSel = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

/**
 * A single word-level diff region (fractional page coordinates, 0–1).
 * Used by B6 — PDF comparison / diff view.
 */
export interface DiffRegion {
  /** "remove" = in doc A but not doc B; "add" = in doc B but not doc A. */
  type: "add" | "remove";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  text?: string;
}
